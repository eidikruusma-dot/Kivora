/**
 * Regression coverage for the confirmed live root cause: a stale AI answer
 * came from conversation-history dominance, not from a stale store/context
 * read (that layer was already proven fresh in aiContextFreshness.test.ts
 * and aiRequestPayloadIntegration.test.ts — those tests kept passing even
 * while the live bug reproduced, which is exactly why this file exists).
 *
 * Live evidence that pinned this down:
 *   - An OLD, long-running AI conversation kept claiming a deleted task
 *     ("Pane Matiase kooliasjad valmis") still existed.
 *   - A brand-new conversation (empty/short history) answered correctly
 *     immediately.
 *   - In the old conversation, telling the AI "it's deleted" made it
 *     "recover" — not because the data had changed, but because that
 *     correction became the newest, closest statement in the prompt.
 *
 * Root cause: CURRENT_KIVORA_STATE (the freshly-built module-data block)
 * was positioned BEFORE conversation history in the request sent to the
 * model. For a long-running conversation, that put it farther from the
 * point of generation than the conversation's own (possibly stale)
 * assertions — a positional/recency problem, not a data-freshness problem.
 * Fixed in api-server: buildChatMessages.ts (see its tests for the exact
 * payload-order proof) now places CURRENT_KIVORA_STATE immediately before
 * the current turn, after all history.
 *
 * This file proves the CLIENT half of that fix holds throughout a single,
 * continuously-growing conversation: no matter how long the accumulated
 * `messages` history gets, or what it asserts, the fresh `context` string
 * sent on every turn always reflects the CURRENT store state — changes
 * made entirely outside the AI conversation (direct store writes, exactly
 * like the Tasks/Plans pages make) included. Walks through the full
 * regression scenario as ONE continuous conversation, turn by turn,
 * exactly like a user returning to an old chat and asking follow-up
 * questions without restarting anything.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiSameConversationFreshness.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'
import type { Plan } from '@/lib/plansStore'

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
const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))
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
vi.mock('@/lib/notificationItemsStore', () => ({
  getAll: vi.fn(() => []),
}))
vi.mock('@/lib/modulesStore', () => ({
  getModuleSettings: vi.fn(() => ({
    calendar: true, tasks: true, notes: true, habits: true, goals: true,
    plans: true, finance: true, school: true, assistant: true, onboardingComplete: true,
  })),
}))

import { initTasksStore, addTask, deleteTask } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore, addPlan, deletePlan } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes() { onSnapshotMock.mock.calls[1][1]({ docs: [] }) }
function seedHabits() { onSnapshotMock.mock.calls[2][1]({ docs: [] }) }
function seedGoals() { onSnapshotMock.mock.calls[3][1]({ docs: [] }) }
function seedEvents() { onSnapshotMock.mock.calls[4][1]({ docs: [] }) }
function seedPlans(plans: Plan[]) {
  onSnapshotMock.mock.calls[5][1]({ docs: plans.map((p) => ({ data: () => p })) })
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 'task-1', title: 'Pane Matiase kooliasjad valmis', priority: 'medium', completed: false, ...overrides }
}
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1', type: 'workout', title: 'Kalendri seose test', color: '#6F5AE8',
    items: [], createdAt: Date.now(), updatedAt: Date.now(), ...overrides,
  }
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function lastRequestBody(): { context: string; messages: { role: string; content: string }[] } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string)
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
  seedPlans([])

  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

describe('1-24. one continuous, long-running conversation must never fall back on its own history for current Kivora facts', () => {
  it('walks the full regression scenario turn by turn in a single growing conversation', async () => {
    // A running "conversation" — mirrors AIAssistantPage's fullHistory:
    // grows with every user message and every assistant reply, never reset.
    const history: { role: 'user' | 'assistant'; content: string }[] = []

    // ── 1-2. Task A exists, and the AI turn lists it ────────────────────────
    const taskA = makeTask()
    seedTasks([taskA])
    history.push({ role: 'user', content: 'Millised ülesanded mul on?' })
    await fetchAIReply(history, 'et')
    expect(lastRequestBody().context).toContain(taskA.title)
    // Simulate the assistant's (now-historical) reply being appended, the
    // same way AIAssistantPage appends res.reply to the running chat.
    history.push({ role: 'assistant', content: `Praegu on sul üks ülesanne: "${taskA.title}".` })

    // ── 21. conversational continuity: the growing history is actually sent ──
    expect(lastRequestBody().messages.length).toBeGreaterThanOrEqual(1)

    // ── 3. Delete Task A OUTSIDE the conversation (e.g. the Tasks page UI,
    // not an AI action in this chat) ─────────────────────────────────────
    await deleteTask(taskA.id)
    seedTasks([])

    // ── 4-6. Send another message in the SAME (now long) conversation ──────
    history.push({ role: 'user', content: 'Millised ülesanded mul praegu on?' })
    await fetchAIReply(history, 'et')
    const afterDelete = lastRequestBody()
    // 5. current-state block does NOT contain Task A.
    expect(afterDelete.context).not.toContain(taskA.title)
    // 6. Task A must not be resolvable as existing — the ONLY place the
    // model could get "Task A exists" from now is its own history, which
    // CURRENT_KIVORA_STATE authority (buildChatMessages.ts, tested
    // server-side) explicitly overrides; the data layer gives it nothing
    // to work with — same request, same conversation, no restart.
    history.push({ role: 'assistant', content: 'Praegu ei ole sul ühtegi ülesannet.' })

    // ── 7. Create Task B OUTSIDE the conversation ───────────────────────────
    const taskB = makeTask({ id: 'task-2', title: 'AI kustutamise test' })
    await addTask(taskB)
    seedTasks([taskB])

    // ── 8-10. Send another message in the SAME conversation ────────────────
    history.push({ role: 'user', content: 'Kas mul on nüüd mõni ülesanne?' })
    await fetchAIReply(history, 'et')
    const afterCreate = lastRequestBody()
    // 9. current-state block contains Task B.
    expect(afterCreate.context).toContain(taskB.title)
    // 10. Task B is available even though the growing history array never
    // mentions it anywhere.
    expect(afterCreate.messages.some((m) => m.content.includes(taskB.title))).toBe(false)
    expect(afterCreate.context).toContain(taskB.title)
    history.push({ role: 'assistant', content: `Jah, sul on üks ülesanne: "${taskB.title}".` })

    // ── 11. Conversation initially has no Plans ─────────────────────────────
    // (already true so far — every context above never mentioned a plan)
    expect(afterCreate.context).not.toContain('Kalendri seose test')

    // ── 12-13. Create Plan P OUTSIDE the AI, next turn in the SAME
    // conversation includes it ──────────────────────────────────────────────
    const planP = makePlan()
    await addPlan(planP)
    seedPlans([planP])
    history.push({ role: 'user', content: 'Millised plaanid mul on?' })
    await fetchAIReply(history, 'et')
    const afterPlanCreate = lastRequestBody()
    expect(afterPlanCreate.context).toContain(planP.title)
    history.push({ role: 'assistant', content: `Sul on üks plaan: "${planP.title}".` })

    // ── 14-15. Delete Plan P; the FOLLOWING turn in the SAME conversation
    // no longer includes it ─────────────────────────────────────────────────
    await deletePlan(planP.id)
    seedPlans([])
    history.push({ role: 'user', content: 'Kas plaan on ikka olemas?' })
    await fetchAIReply(history, 'et')
    const afterPlanDelete = lastRequestBody()
    expect(afterPlanDelete.context).not.toContain(planP.title)

    // ── 21. conversational continuity, still holding after many turns ──────
    // The full accumulated history (every user + assistant turn above,
    // including the now-stale "Praegu on sul üks ülesanne" claim) is still
    // present in the request — nothing was wiped to make freshness work.
    expect(afterPlanDelete.messages.length).toBe(history.length)
    expect(afterPlanDelete.messages.some((m) => m.content.includes(taskA.title))).toBe(true)

    // ── 24. no duplicate subscriptions were opened across this whole,
    // many-turn conversation ────────────────────────────────────────────────
    expect(onSnapshotMock).toHaveBeenCalledTimes(6)
  })
})

describe('16-18. a stale historical assistant claim never survives into the next answer once the fact has changed', () => {
  it('history explicitly asserting "Task A exists" does not stop CURRENT_KIVORA_STATE (context) from correctly showing it gone', async () => {
    const taskA = makeTask()
    seedTasks([taskA])

    const history: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: 'Millised ülesanded mul on?' },
      { role: 'assistant', content: `Praegu on sul üks ülesanne: "${taskA.title}".` },
    ]
    await fetchAIReply(history, 'et')
    expect(lastRequestBody().context).toContain(taskA.title)

    // The fact changes outside the conversation.
    await deleteTask(taskA.id)
    seedTasks([])

    // 17. The SAME history (still literally asserting the task exists) is
    // resent as part of a later turn.
    history.push({ role: 'user', content: 'Kas see ülesanne on ikka olemas?' })
    await fetchAIReply(history, 'et')
    const payload = lastRequestBody()

    // The stale claim is still present in the sent history (never edited or
    // deleted — this proves nothing was silently rewritten to "fix" it)...
    expect(payload.messages.some((m) => m.content.includes(`Praegu on sul üks ülesanne: "${taskA.title}"`))).toBe(true)
    // ...but 18. the fresh state — the thing that must win — correctly
    // shows the task gone.
    expect(payload.context).not.toContain(taskA.title)
  })
})

describe('22. a brand-new conversation (no history at all) still gets correct, fresh context', () => {
  it('a first-ever turn with an empty history array reports current state correctly', async () => {
    const task = makeTask({ id: 'task-3', title: 'Uus vestlus töötab' })
    seedTasks([task])

    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')
    const payload = lastRequestBody()
    expect(payload.context).toContain(task.title)
    expect(payload.messages.length).toBe(1)
  })
})
