/**
 * Regression coverage for a live production incident: a user asked the AI
 * Assistant to create a single task ("Lisa mulle ülesanne ...") and got NO
 * visible response at all, and the task was never created.
 *
 * Investigation traced the chat bubble render path (AIAssistantPage.tsx):
 * once a message is no longer `pending`, its bubble ALWAYS renders — there
 * is no "hide the bubble if content is empty" branch. So whenever
 * composeFinalReply() (aiActions.ts) returns an empty string, the user sees
 * a visually blank bubble, which reads exactly as "no response at all".
 *
 * composeFinalReply COULD legitimately return '' before this fix: two
 * actions (preview_plan_creation, preview_bank_import) intentionally return
 * `message: ''` on success because a dedicated UI card renders instead of
 * chat text. If every executed action's message was empty AND the model's
 * own free-text reply also came back empty (e.g. a truncated/malformed
 * completion, or a bank/plan-preview success with an empty reply text
 * despite the system prompt asking for one short sentence), the composed
 * result was '' — a genuinely blank bubble — even for actions with real,
 * non-empty results in a batch (defensive-in-depth: normally every non-
 * silent result has a non-empty message already, but nothing enforced it).
 *
 * Fix: AIActionResult gained a `silent` flag, set ONLY by the two
 * card-rendering actions. composeFinalReply now falls back to a generic
 * acknowledgement whenever the composed result is empty AND not every
 * result is `silent` (i.e. a card is NOT expected to carry the message
 * instead) — so a create_task success (never silent) can never render as
 * a blank bubble, while preview_plan_creation/preview_bank_import's
 * intentional card-only UX is unchanged.
 *
 * This file drives the REAL production call chain — real tasksStore
 * (Firestore-mocked), real aiClient.fetchAIReply through a mocked network
 * boundary that returns an actual create_task action (shaped exactly like
 * a real /api/ai/chat response), real aiActions.executeActionsAsync, real
 * composeFinalReply — end to end, per this investigation's explicit
 * instruction not to assume unit tests alone prove the real app wiring.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiActionFlowRegression.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null
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
const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))
// verifyDoc() reads back the doc that was just written — default "found",
// matching a real write that actually landed.
const getDocMock = vi.fn(() => Promise.resolve({ exists: () => true }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
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

import { initTasksStore, getAllTasks } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import {
  executeActionsAsync,
  composeFinalReply,
  __resetDestructiveActionGateForTests,
  type AIActionResult,
} from '@/lib/aiActions'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes() { onSnapshotMock.mock.calls[1][1]({ docs: [] }) }
function seedHabits() { onSnapshotMock.mock.calls[2][1]({ docs: [] }) }
function seedGoals() { onSnapshotMock.mock.calls[3][1]({ docs: [] }) }
function seedEvents() { onSnapshotMock.mock.calls[4][1]({ docs: [] }) }
function seedPlans() { onSnapshotMock.mock.calls[5][1]({ docs: [] }) }

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function mockApiReply(body: { reply: string; actions: unknown[] }) {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  )
}

beforeEach(() => {
  initTasksStore(null)
  initNotesStore(null)
  initHabitsStore(null)
  initGoalsStore(null)
  initCalendarStore(null)
  initPlansStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  setDocMock.mockImplementation(() => Promise.resolve())
  deleteDocMock.mockClear()
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchMock.mockClear()
  getDocMock.mockClear()
  getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true }))

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

  __resetDestructiveActionGateForTests()

  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: UID,
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

describe('1-6. the exact live-incident flow: create a task from an AI turn', () => {
  it('a create_task action from the API results in exactly one task and a non-empty, non-duplicated success bubble', async () => {
    // 2. API returns a create_task action, shaped like a real response.
    mockApiReply({
      reply: 'Lisasin selle ülesande sinu jaoks!',
      actions: [
        {
          type: 'create_task',
          data: {
            title: 'Osta nädalavahetuseks snäkke',
            date: '2026-08-29',
            time: '16:00',
            category: 'Kodu',
            priority: 'medium',
          },
        },
      ],
    })

    // 1. user asks the AI to create one task.
    const res = await fetchAIReply(
      [{ role: 'user', content: 'Lisa mulle ülesanne „Osta nädalavahetuseks snäkke", tähtajaga 29.08.2026 kell 16:00, kategooria Kodu ja prioriteet keskmine.' }],
      'et',
    )
    expect(res.actions).toHaveLength(1)

    // 3. action executes successfully.
    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const results = await executeActionsAsync(res.actions, actionCtx)
    expect(results).toHaveLength(1)
    expect(results[0]!.success).toBe(true)
    expect(setDocMock).toHaveBeenCalledTimes(1)

    // 3b. the explicitly requested category ("Kodu") and priority ("medium")
    // are preserved verbatim in the actual Firestore write — the live bug
    // was that create_task ignored action.data.category/priority entirely
    // and always overwrote them with a title-keyword guess (here, the title
    // contains "osta", so the old code silently produced "Ostud" instead).
    const writtenTask = setDocMock.mock.calls[0]![1] as Task
    expect(writtenTask.category).toBe('Kodu')
    expect(writtenTask.priority).toBe('medium')

    // 4. exactly one task is created — reflect the write via onSnapshot,
    // the same way a real Firestore listener would.
    seedTasks([{
      id: 'task-synthetic-1',
      title: 'Osta nädalavahetuseks snäkke',
      priority: 'medium',
      completed: false,
      date: '2026-08-29',
      time: '16:00',
      category: 'Kodu',
    } as Task])
    expect(getAllTasks()).toHaveLength(1)
    expect(getAllTasks()[0]!.title).toBe('Osta nädalavahetuseks snäkke')

    // 5. assistant renders a non-empty success response.
    const finalReply = composeFinalReply(results, res.reply)
    expect(finalReply.trim().length).toBeGreaterThan(0)
    expect(finalReply).toContain('lisatud')

    // 6. no duplicate narration: the success confirmation appears exactly
    // once, not twice (once from the code-verified summary, once more
    // from the model's own reply repeating it).
    const occurrences = finalReply.split('lisatud').length - 1
    expect(occurrences).toBe(1)
  })
})

describe('a failed create produces a visible error, never an empty response', () => {
  it('a rejected write (post-write verification fails) shows the real failure text, not a blank bubble', async () => {
    getDocMock.mockImplementationOnce(() => Promise.resolve({ exists: () => false }))
    mockApiReply({
      reply: 'Lisasin selle ülesande!',
      actions: [{ type: 'create_task', data: { title: 'Kaduv ülesanne' } }],
    })

    const res = await fetchAIReply([{ role: 'user', content: 'Loo ülesanne Kaduv ülesanne' }], 'et')
    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const results = await executeActionsAsync(res.actions, actionCtx)
    expect(results[0]!.success).toBe(false)

    const finalReply = composeFinalReply(results, res.reply)
    expect(finalReply.trim().length).toBeGreaterThan(0)
    expect(finalReply).not.toBe('')
    // The model's optimistic "lisasin" narrative must never appear next to
    // a failure — composeFinalReply already suppresses it on hasFailure.
    expect(finalReply).not.toContain('Lisasin selle ülesande!')
  })
})

describe("model reply + successful action can't produce duplicate success text", () => {
  it('composeFinalReply suppresses the model\'s own free-text reply entirely on a visible success — exactly one authoritative message, never two', () => {
    const results: AIActionResult[] = [{ success: true, message: 'Ülesanne "Osta piima" lisatud.' }]
    const finalReply = composeFinalReply(results, 'Ülesanne "Osta piima" lisatud. Anna teada, kui vajad veel midagi.')
    // Live bug: the model's own reply (written before the action result is
    // known) redundantly repeated or re-asked about the very thing that
    // just succeeded. The fix is to show ONLY the code-verified summary —
    // the model's reply text (even a legitimate follow-up remark) never
    // appears at all once an action has visibly succeeded.
    expect(finalReply).toBe('Ülesanne "Osta piima" lisatud.')
    const summaryOccurrences = finalReply.split('Ülesanne "Osta piima" lisatud.').length - 1
    expect(summaryOccurrences).toBe(1)
  })
})

describe('a response containing no actions still renders normally', () => {
  it('a plain Q&A turn (no actions) with a normal reply is untouched', () => {
    const finalReply = composeFinalReply([], 'Sul on 3 ülesannet täna.')
    expect(finalReply).toBe('Sul on 3 ülesannet täna.')
  })

  it('a plain Q&A turn with NO actions and an (unexpectedly) empty reply still renders something, never a blank bubble', () => {
    const finalReply = composeFinalReply([], '')
    expect(finalReply.trim().length).toBeGreaterThan(0)
  })
})

describe('silent (card-rendering) actions are unaffected by the never-blank fallback', () => {
  it('a genuine preview_plan_creation success with no model reply text still renders as an intentionally empty bubble (the draft card carries the message)', () => {
    const results: AIActionResult[] = [{ success: true, message: '', silent: true }]
    expect(composeFinalReply(results, '')).toBe('')
  })

  it('a genuine preview_plan_creation success WITH the model\'s short reply text renders that text normally', () => {
    const results: AIActionResult[] = [{ success: true, message: '', silent: true }]
    expect(composeFinalReply(results, 'Vaata üle ja muuda allolevat mustandit.')).toBe(
      'Vaata üle ja muuda allolevat mustandit.',
    )
  })
})

describe('same-conversation CURRENT_KIVORA_STATE freshness remains intact after this fix', () => {
  it('the request payload sent for a create_task turn still carries the live, fresh context — untouched by the composeFinalReply change', async () => {
    mockApiReply({ reply: 'ok', actions: [] })
    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')
    const call = fetchMock.mock.calls[0]!
    const body = JSON.parse((call[1] as RequestInit).body as string) as { context: string }
    expect(body.context).toContain('Ülesanded')
  })
})
