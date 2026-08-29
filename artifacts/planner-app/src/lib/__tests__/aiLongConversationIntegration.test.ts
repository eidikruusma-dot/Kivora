/**
 * Integration-level regression coverage for the TOO_MANY_MESSAGES production
 * incident, driving the REAL production call chain (real tasksStore through
 * mocked Firestore listeners, real buildAIContext(), real fetchAIReply()
 * through a mocked network boundary, real executeActionsAsync, real
 * composeFinalReply) with a conversation LONG ENOUGH that sending it
 * unbounded would itself trigger the server's TOO_MANY_MESSAGES rejection —
 * proving the fix (windowConversationHistory, wired into fetchAIReply) holds
 * for the actual app wiring, not just the pure function in isolation (see
 * aiHistoryWindowing.test.ts for that).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiLongConversationIntegration.test.ts
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
// Also backs aiClient.ts's loadSettingsStrict() privacy-settings read —
// empty data() means its defaults ({aiData: true, ...}) apply.
const getDocMock = vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) }))

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

import { initTasksStore, getAllTasks, deleteTask } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import { describeAIError } from '@/views/AIAssistantPage'
import {
  executeActionsAsync,
  composeFinalReply,
  __resetDestructiveActionGateForTests,
} from '@/lib/aiActions'
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

/** A conversation with far more than 50 messages — sending it unbounded would trigger TOO_MANY_MESSAGES. */
function makeLongConversation(turnCount: number): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  for (let i = 0; i < turnCount; i++) {
    messages.push({ role: 'user', content: `Küsimus number ${i} vestluse alguses` })
    messages.push({ role: 'assistant', content: `Vastus number ${i}` })
  }
  return messages
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function lastSentMessageCount(): number {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!
  const body = JSON.parse((call[1] as RequestInit).body as string) as { messages: unknown[] }
  return body.messages.length
}
function lastSentBody(): { context: string; messages: { role: string; content: string }[] } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!
  return JSON.parse((call[1] as RequestInit).body as string)
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
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()
  getDocMock.mockClear()
  getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({}) }))

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

describe('7. a very long real conversation never sends a TOO_MANY_MESSAGES-triggering payload', () => {
  it('a 200-message stored conversation results in a bounded outgoing request', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
    )
    const longHistory = makeLongConversation(100) // 200 messages
    await fetchAIReply([...longHistory, { role: 'user', content: 'Viimane küsimus' }], 'et')

    expect(lastSentMessageCount()).toBeLessThan(50) // the server's real limit
  })
})

describe('4 & 5. create_task works, and fresh Kivora state still overrides stale history, in a very long existing conversation', () => {
  it('a create_task action succeeds and the response is non-empty even with 200+ prior messages', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({
        reply: 'Lisasin selle ülesande sinu jaoks!',
        actions: [{ type: 'create_task', data: { title: 'Osta piima', category: 'Kodu', priority: 'medium' } }],
      }), { status: 200 })),
    )

    const longHistory = makeLongConversation(100)
    const res = await fetchAIReply(
      [...longHistory, { role: 'user', content: 'Lisa ülesanne "Osta piima"' }],
      'et',
    )
    expect(res.actions).toHaveLength(1)

    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const results = await executeActionsAsync(res.actions, actionCtx)
    expect(results[0]!.success).toBe(true)
    expect(setDocMock).toHaveBeenCalledTimes(1)

    const finalReply = composeFinalReply(results, res.reply)
    expect(finalReply.trim().length).toBeGreaterThan(0)
    expect(finalReply).toContain('lisatud')
  })

  it('fresh CURRENT_KIVORA_STATE still overrides a stale historical claim, even 100+ turns deep', async () => {
    const deletedTask = makeTask({ id: 'task-old', title: 'Ammu kustutatud ülesanne' })
    seedTasks([deletedTask])

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
    )
    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')
    expect(lastSentBody().context).toContain(deletedTask.title)

    // The task is deleted OUTSIDE this conversation turn (e.g. Tasks page).
    await deleteTask(deletedTask.id)
    seedTasks([])

    // A long conversation accumulates — including a stale assistant claim
    // that the task still exists, deep in the history.
    const longHistory = makeLongConversation(100)
    longHistory.push({ role: 'assistant', content: `Praegu on sul üks ülesanne: "${deletedTask.title}".` })

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
    )
    await fetchAIReply([...longHistory, { role: 'user', content: 'Kas see ülesanne on ikka olemas?' }], 'et')

    const payload = lastSentBody()
    // Fresh state wins regardless of history length or windowing.
    expect(payload.context).not.toContain(deletedTask.title)
  })
})

describe('6. destructive confirmation still resolves correctly deep inside (and after windowing of) a long conversation', () => {
  it('the confirm-then-execute code gate works identically regardless of how much prior history exists', async () => {
    const task = makeTask({ id: 'task-confirm', title: 'Kustutatav ülesanne' })
    seedTasks([task])

    const longHistory = makeLongConversation(100) // 200 filler messages ahead of the confirm exchange

    // Turn 1 (deep in a long conversation): propose the delete — code gate
    // requires a second, later round-trip before executing.
    const [propose] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(propose.needsConfirmation).toBe(true)
    expect(propose.message).toContain(task.title)

    // The client would send the confirm question + user's "Jah, kustuta."
    // as part of the next request — verify that exchange survives windowing
    // even with 200 prior messages ahead of it.
    const conversationWithConfirm = [
      ...longHistory,
      { role: 'assistant' as const, content: propose.message },
      { role: 'user' as const, content: 'Jah, kustuta.' },
    ]
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
    )
    await fetchAIReply(conversationWithConfirm, 'et')
    const sentMessages = lastSentBody().messages
    expect(sentMessages[sentMessages.length - 1]!.content).toBe('Jah, kustuta.')
    expect(sentMessages[sentMessages.length - 2]!.content).toContain(task.title)

    // Turn 2: the model re-proposes the same delete (matching entity id) —
    // the code-level gate (independent of conversation history/windowing)
    // now executes it.
    const [confirmed] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(confirmed.success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)
  })
})

describe('the client surfaces a useful error if validation ever rejects a request (defense-in-depth beyond windowing itself)', () => {
  it('a TOO_MANY_MESSAGES rejection from the server is shown to the user, never a silent empty response', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({
        error: 'Too many messages (max 50).',
        code: 'TOO_MANY_MESSAGES',
      }), { status: 400 })),
    )
    let caught: unknown
    try {
      await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const rendered = describeAIError(caught, 'et')
    expect(rendered.trim().length).toBeGreaterThan(0)
    expect(rendered).toContain('Too many messages (max 50).')
  })
})
