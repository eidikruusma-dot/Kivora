/**
 * Integration-level regression test for the live "AI still sees the deleted
 * task, never sees the new one" bug, reported twice against production.
 *
 * Prior investigation (aiContextFreshness.test.ts) proved the READ path is
 * genuinely fresh: buildAIContext() and executeDestructiveAction's entity
 * resolution both always re-read the live store singleton at call time,
 * with no caching layer anywhere in aiContextBuilder.ts / aiClient.ts.
 * Those tests still passed after the reported live regression, which means
 * a store-level unit test alone cannot prove the real app is unaffected —
 * per this investigation's explicit instruction, "do not assume unit tests
 * prove the real app wiring."
 *
 * This file instead drives the ACTUAL production call chain end-to-end and
 * inspects the ACTUAL bytes that would go out over the network:
 *
 *   tasksStore/plansStore (real, Firestore-mocked)
 *     -> buildAIContext() (real, aiContextBuilder.ts)
 *     -> fetchAIReply() (real, aiClient.ts)
 *     -> authenticatedFetch() (real, authenticatedFetch.ts)
 *     -> global fetch (mocked at the network boundary — the request body
 *        this test inspects is byte-for-byte what api-server's /ai/chat
 *        route would have received)
 *
 * Root cause found during this pass (see composeFinalReply in aiActions.ts
 * and its new tests in aiDestructiveActionConfirmation.test.ts): the store
 * read path was never stale. What COULD make the app look stale is that a
 * create/delete action's OWN write can fail (a rejected Firestore write, a
 * security-rule denial) while the model's free-text reply — generated
 * BEFORE the write's outcome is known — still confidently claims success.
 * Previously that reply was appended unconditionally unless the action
 * needed confirmation, so a silently-failed write could read as a genuine
 * success to the user, leaving the store (and therefore every subsequent,
 * genuinely fresh context) unchanged. composeFinalReply now suppresses the
 * model's reply on outright failure too, not just on pending confirmation.
 * create_task also gained the post-write verification create_note/
 * create_calendar_event/create_money_* already had, closing the one
 * asymmetric gap where a task creation had no such safety net.
 *
 * This file also fixes a second, independently confirmed gap: Plans were
 * entirely absent from buildAIContext() — aiContextBuilder.ts never
 * imported plansStore at all, so no amount of freshness in the read path
 * could make an existing Plan visible to the AI. See the Plans coverage
 * below and buildPlansSection() in aiContextBuilder.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiRequestPayloadIntegration.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'
import type { Plan } from '@/lib/plansStore'

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

// ── Fake Firestore (same shape as aiContextFreshness.test.ts) ──────────────

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const updateDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))
// getDoc is shared by two unrelated callers: verifyDoc() (reads back the
// doc that was just written — only ever reads .exists(); individual tests
// override this to simulate a write that silently never persisted) and
// aiClient.ts's loadSettingsStrict() privacy-settings read (reads .data()
// too). Default "found" with empty data() matches both a real write that
// landed AND a privacy doc that resolves to its {aiData: true, ...} defaults.
const getDocMock = vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

// ── Auxiliary modules irrelevant to this test's assertions ─────────────────

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

import { initTasksStore, getAllTasks, addTask, deleteTask } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore, getAllPlans } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import {
  executeActionsAsync,
  composeFinalReply,
  __resetDestructiveActionGateForTests,
} from '@/lib/aiActions'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes() {
  onSnapshotMock.mock.calls[1][1]({ docs: [] })
}
function seedHabits() {
  onSnapshotMock.mock.calls[2][1]({ docs: [] })
}
function seedGoals() {
  onSnapshotMock.mock.calls[3][1]({ docs: [] })
}
function seedEvents() {
  onSnapshotMock.mock.calls[4][1]({ docs: [] })
}
function seedPlans(plans: Plan[]) {
  onSnapshotMock.mock.calls[5][1]({ docs: plans.map((p) => ({ data: () => p })) })
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Pane Matiase kooliasjad valmis',
    priority: 'medium',
    completed: false,
    ...overrides,
  }
}
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    type: 'workout',
    title: 'Jalgade trenn',
    color: '#6F5AE8',
    items: [{ id: 'item-1', label: 'Kükid', done: false }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function lastRequestBody(): { context: string; messages: unknown[] } {
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
  updateDocMock.mockClear()
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
  seedPlans([])

  __resetDestructiveActionGateForTests()

  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: UID,
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

describe('4. the exact request payload sent to /api/ai/chat, mirroring the real AIAssistantPage send flow', () => {
  it('task A is visible on the first turn, then task A drops out and task B appears on the very next turn — same running session, no remount', async () => {
    const taskA = makeTask()
    seedTasks([taskA])

    // Turn 1: mirrors AIAssistantPage's fetchAIReply(history, lang) call —
    // no contextOverride, so it must be buildAIContext(lang) built fresh.
    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastRequestBody().context).toContain(taskA.title)

    // Task A is deleted through the ACTUAL AI delete-action pipeline (the
    // real confirm-before-execute flow), exactly like a real AI turn would.
    const [propose] = await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    expect(propose.needsConfirmation).toBe(true)
    const [confirm] = await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    expect(confirm.success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)
    // Simulate the onSnapshot update a real Firestore delete produces.
    seedTasks([])

    // Task B is created directly through the store — mirrors "direct task
    // creation from the Tasks page" (requirement 5), not via the AI.
    const taskB = makeTask({ id: 'task-2', title: 'AI kustutamise test' })
    await addTask(taskB)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    seedTasks([taskB])

    // Turn 2: same running session — no store reset, no chat restart, no
    // remount. This is exactly what the live bug report describes.
    await fetchAIReply(
      [
        { role: 'user', content: 'Millised ülesanded mul on?' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'Millised ülesanded mul praegu Ülesannete moodulis olemas on?' },
      ],
      'et',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondPayload = lastRequestBody()
    expect(secondPayload.context).toContain('AI kustutamise test')
    expect(secondPayload.context).not.toContain('Pane Matiase kooliasjad valmis')
  })
})

describe('5a. the same freshness guarantee holds across a browser-like page refresh (full store reinitialization)', () => {
  it('a fresh initTasksStore(uid) after a reload reflects the true server state, not whatever the pre-refresh session last held', async () => {
    seedTasks([makeTask()])
    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).toContain('Pane Matiase kooliasjad valmis')

    // Simulate a full page reload: AuthContext's onAuthStateChanged tears
    // down and reopens every store from scratch (initTasksStore(null) then
    // initTasksStore(uid) again), exactly as it does on a real reload.
    onSnapshotMock.mockClear()
    initTasksStore(null)
    initTasksStore(UID)
    // The server's current truth: task A gone, task B present.
    onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1][1]({
      docs: [{ data: () => makeTask({ id: 'task-2', title: 'AI kustutamise test' }) }],
    })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    const payload = lastRequestBody()
    expect(payload.context).toContain('AI kustutamise test')
    expect(payload.context).not.toContain('Pane Matiase kooliasjad valmis')
  })
})

describe('5b. direct task creation from the Tasks page/store is visible to the AI without any AI-side action', () => {
  it('addTask() called directly (not via an AI action) is picked up by the next AI turn', async () => {
    expect(getAllTasks()).toEqual([])
    const task = makeTask({ id: 'task-3', title: 'Osta piima' })
    await addTask(task)
    seedTasks([task])

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).toContain('Osta piima')
  })
})

describe('5c. a successful AI delete action removes the entity from the very next request payload', () => {
  it('after the confirm round-trip, the item is gone from the context sent on the following turn', async () => {
    const task = makeTask()
    seedTasks([task])
    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    seedTasks([])

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).not.toContain(task.title)
  })
})

describe('6. Plans are visible to the AI — closes the "Plans invisible despite existing live data" gap', () => {
  it('an existing Plan appears in the request payload sent to /api/ai/chat', async () => {
    const plan = makePlan()
    seedPlans([plan])

    await fetchAIReply([{ role: 'user', content: 'Millised plaanid mul on?' }], 'et')
    expect(lastRequestBody().context).toContain(plan.title)
  })

  it('a Plan created mid-session is visible on the very next AI turn, without restarting', async () => {
    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).not.toContain('Suvine lugemisplaan')

    seedPlans([makePlan({ id: 'plan-2', title: 'Suvine lugemisplaan' })])

    await fetchAIReply([{ role: 'user', content: 'hi again' }], 'et')
    expect(lastRequestBody().context).toContain('Suvine lugemisplaan')
  })
})

describe('root-cause regression: a silently failed write can no longer be masked by the model\'s own confident reply', () => {
  it('create_task: when the post-write verification fails (the write never actually landed), the user sees the real failure, never the model\'s "lisatud!" narrative', async () => {
    getDocMock.mockImplementationOnce(() => Promise.resolve({ exists: () => false }))
    const results = await executeActionsAsync([
      { type: 'create_task', data: { title: 'Kaduv ülesanne' } },
    ])
    expect(results[0].success).toBe(false)
    expect(results[0].message).toMatch(/POST_WRITE_VERIFICATION_FAILED/)

    const finalReply = composeFinalReply(results, 'Valmis! Lisasin ülesande "Kaduv ülesanne".')
    expect(finalReply).not.toContain('Valmis! Lisasin')
    expect(finalReply).toMatch(/POST_WRITE_VERIFICATION_FAILED/)

    // And critically: since the write never actually landed, the task is
    // correctly absent from the next (still perfectly fresh) AI context —
    // there is no "stale" data here, just a write that never happened.
    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).not.toContain('Kaduv ülesanne')
  })

  it('delete_task: a rejected cascade batch commit is reported as a real failure, never overridden by the model\'s "kustutatud" claim', async () => {
    const task = makeTask()
    seedTasks([task])
    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])

    writeBatchCommitMock.mockImplementationOnce(() => Promise.reject(new Error('Missing or insufficient permissions.')))
    const [confirmed] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(confirmed.success).toBe(false)

    const finalReply = composeFinalReply([confirmed], 'Ülesanne on kustutatud!')
    expect(finalReply).not.toContain('Ülesanne on kustutatud!')
    expect(finalReply).toContain('Missing or insufficient permissions.')

    // The task was never actually removed server-side — the store correctly
    // still has it, and so does the next (still fresh) AI context.
    expect(getAllTasks()).toEqual([task])
  })
})
