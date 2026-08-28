/**
 * Regression coverage for a live production incident: POST /api/ai/chat
 * returned a bare HTTP 400 for a valid, authenticated create-task request
 * once the account's real data (the incident report specifically named
 * "substantially more real School/Task data") made the request body large
 * enough to exceed express.json()'s default 100kb limit (api-server had no
 * `limit` configured at all). The client showed no assistant response and
 * created no task.
 *
 * Two client-side gaps this file locks in, alongside the server-side fix
 * (api-server: app.ts raises the body limit to 2mb + registers a JSON
 * error-handling middleware; validateChatRequest.ts caps `context` itself
 * with a specific CONTEXT_TOO_LARGE code — see that package's own tests):
 *
 * 1. buildAIContext() itself performs no truncation or size limiting on
 *    the client — a realistically large account's data (hundreds of real
 *    Tasks, mirroring the incident's "substantially more real ... Task
 *    data") must reach the request payload in full, unmodified. This is
 *    proven end-to-end through the real production call chain (the real
 *    tasksStore singleton through a mocked Firestore listener, real
 *    buildAIContext(), real fetchAIReply() through a mocked network
 *    boundary), not just with tiny fixtures.
 *
 * 2. Previously, AIAssistantPage's fetchAIReply().catch() handler ignored
 *    the actual caught error entirely and always rendered the same generic
 *    translated apology, regardless of cause — so even once the server
 *    started returning a specific, useful `error` message (e.g. "context
 *    exceeds the maximum length of 500000 characters."), the user would
 *    never see it. describeAIError() (exported from AIAssistantPage.tsx)
 *    now appends the real reason whenever the error carries a real message,
 *    while still falling back to the plain apology for a genuinely
 *    uninformative error (an empty message, or the internal
 *    AuthRequiredError sentinel).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiChatRequestSizeLimit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'

type MockAuthUser = { getIdToken: () => Promise<string> } | null
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/moneyStore', () => ({
  getAllTransactions: vi.fn(() => []),
  getAllBills: vi.fn(() => []),
  getMonthSummary: vi.fn(() => ({
    totalIncome: 0, totalExpenses: 0, totalSavings: 0,
    currentAccountBalance: null, monthlyNetCashFlow: 0,
    availableMoney: null, upcomingBillsTotal: 0,
  })),
}))
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolTasks: vi.fn(() => []),
  getAllSchoolExams: vi.fn(() => []),
  getAllSchoolSubjects: vi.fn(() => []),
}))
vi.mock('@/lib/notificationItemsStore', () => ({ getAll: vi.fn(() => []) }))
vi.mock('@/lib/modulesStore', () => ({
  getModuleSettings: vi.fn(() => ({
    calendar: true, tasks: true, notes: true, habits: true, goals: true,
    plans: true, finance: true, school: true, assistant: true, onboardingComplete: true,
  })),
}))

import { initTasksStore } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import { describeAIError } from '@/views/AIAssistantPage'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) { onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) }) }
function seedNotes() { onSnapshotMock.mock.calls[1][1]({ docs: [] }) }
function seedHabits() { onSnapshotMock.mock.calls[2][1]({ docs: [] }) }
function seedGoals() { onSnapshotMock.mock.calls[3][1]({ docs: [] }) }
function seedEvents() { onSnapshotMock.mock.calls[4][1]({ docs: [] }) }
function seedPlans() { onSnapshotMock.mock.calls[5][1]({ docs: [] }) }

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 'task-1', title: 'Ülesanne', priority: 'medium', completed: false, ...overrides }
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  initTasksStore(null)
  initNotesStore(null)
  initHabitsStore(null)
  initGoalsStore(null)
  initCalendarStore(null)
  initPlansStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()

  initTasksStore(UID)    // onSnapshot call index 0
  initNotesStore(UID)    // 1
  initHabitsStore(UID)   // 2
  initGoalsStore(UID)    // 3
  initCalendarStore(UID) // 4
  initPlansStore(UID)    // 5
  seedTasks([])
  seedNotes()
  seedHabits()
  seedGoals()
  seedEvents()
  seedPlans()

  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

describe('a realistically large Kivora context (hundreds of real Tasks) reaches the request payload in full', () => {
  it('every task, from the first to the last, is present in the sent context, uncut', async () => {
    const tasks: Task[] = Array.from({ length: 800 }, (_, i) =>
      makeTask({
        id: `task-${i}`,
        title: `Kodune ülesanne number ${i} pikema kirjeldusega, mis simuleerib päris kasutaja andmemahtu`,
        date: '2026-09-01',
        category: 'Kodu',
      }),
    )
    seedTasks(tasks)

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
    )
    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')

    const call = fetchMock.mock.calls[0]!
    const body = JSON.parse((call[1] as RequestInit).body as string) as { context: string }

    // Not a tiny fixture: this really is a large payload — well over what
    // the OLD express.json() 100kb default would have accepted.
    expect(body.context.length).toBeGreaterThan(100_000)

    // Spot-check the first, a middle, and the last entry — proves nothing
    // was silently truncated partway through building the section.
    expect(body.context).toContain('Kodune ülesanne number 0 ')
    expect(body.context).toContain('Kodune ülesanne number 400 ')
    expect(body.context).toContain('Kodune ülesanne number 799 ')
  })
})

describe('describeAIError: a failed AI request always surfaces something more useful than a bare generic apology when a real reason exists', () => {
  it('appends the server-provided reason (e.g. an oversized-context rejection) to the generic apology', () => {
    const result = describeAIError(new Error('context exceeds the maximum length of 500000 characters.'), 'et')
    expect(result).toContain('context exceeds the maximum length of 500000 characters.')
    // The generic apology is still the lead sentence — this augments it, doesn't replace it.
    expect(result.length).toBeGreaterThan('context exceeds the maximum length of 500000 characters.'.length)
  })

  it('falls back to the plain apology for AuthRequiredError\'s internal, non-user-facing sentinel', () => {
    const err = new Error('AUTH_REQUIRED')
    err.name = 'AuthRequiredError'
    const result = describeAIError(err, 'et')
    expect(result).not.toContain('AUTH_REQUIRED')
  })

  it('falls back to the plain apology for a non-Error thrown value', () => {
    const result = describeAIError('a raw string, not an Error', 'et')
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toContain('a raw string, not an Error')
  })

  it('a valid authenticated AI request that fails server-side never renders truly empty text — describeAIError always returns something visible', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'context exceeds the maximum length of 500000 characters.', code: 'CONTEXT_TOO_LARGE' }), { status: 400 })),
    )
    let caught: unknown
    try {
      await fetchAIReply([{ role: 'user', content: 'Lisa ülesanne' }], 'et')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const rendered = describeAIError(caught, 'et')
    expect(rendered.trim().length).toBeGreaterThan(0)
    expect(rendered).toContain('context exceeds the maximum length of 500000 characters.')
  })
})
