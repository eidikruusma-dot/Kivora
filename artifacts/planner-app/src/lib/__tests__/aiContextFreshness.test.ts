/**
 * Regression tests for AI context/state freshness.
 *
 * Reported live bug: after the AI deleted a task and the user created a new
 * one, the AI's answers kept referring to the deleted task and never saw the
 * new one — i.e. the AI appeared to be working from a stale snapshot of the
 * user's data captured once (at chat start) instead of the live state.
 *
 * Investigation (see aiContextBuilder.ts / aiClient.ts / aiActions.ts):
 * buildAIContext() is already called fresh, inline, on every single
 * fetchAIReply() call — there is no caching layer, no "capture once at
 * mount" step, and no contextOverride stored per conversation. Entity
 * resolution for delete/update actions (executeDestructiveAction's `find`)
 * also always re-reads the live store via getAllTasks()/getAllGoals()/etc.
 * at call time, never a snapshot taken earlier in the conversation.
 *
 * These tests lock in that behavior end-to-end (real store singletons, real
 * buildAIContext(), real executeActionsAsync()) so a future change can never
 * silently reintroduce a "captured once" cache: a task/goal created mid-
 * conversation must appear on the very next AI turn, a deleted one must
 * disappear on the very next AI turn, and delete/update action resolution
 * must always target the live entity — all without reinitializing the
 * store or restarting the conversation.
 *
 * Same fake-Firestore harness as aiDestructiveActionConfirmation.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiContextFreshness.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Task } from '@/types'
import type { Goal } from '@/data/goalsData'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-a' } }, storage: {} }))

// ── Fake Firestore (same shape as aiDestructiveActionConfirmation.test.ts) ─

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
// Also backs aiClient.ts's loadSettingsStrict() privacy-settings read —
// empty data() means its defaults ({aiData: true, ...}) apply.
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

// ── Auxiliary modules irrelevant to this test's assertions — stubbed to
// keep the import graph light (same rationale as planAIGenerationStage6.test.ts) ──

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
    finance: true, plans: true, school: true, assistant: true, onboardingComplete: true,
  })),
}))

import { initTasksStore, getAllTasks, updateTask } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore, getAllGoals, updateGoal } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { buildAIContext } from '@/lib/aiContextBuilder'
import {
  executeActionsAsync,
  __resetDestructiveActionGateForTests,
} from '@/lib/aiActions'

const UID = 'user-a'

// initTasksStore -> call 0, initNotesStore -> call 1, initHabitsStore -> call 2,
// initGoalsStore -> call 3, initCalendarStore -> call 4 (fixed order, set below).
function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes() {
  onSnapshotMock.mock.calls[1][1]({ docs: [] })
}
function seedHabits() {
  onSnapshotMock.mock.calls[2][1]({ docs: [] })
}
function seedGoals(goals: Goal[]) {
  onSnapshotMock.mock.calls[3][1]({ docs: goals.map((g) => ({ data: () => g })) })
}
function seedEvents() {
  onSnapshotMock.mock.calls[4][1]({ docs: [] })
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
function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1', title: 'Jooksuvorm', description: '', iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    icon: 'other', status: 'active', progressType: 'fraction', progressValue: 0, progressMax: 1,
    deadline: '', deadlineShort: '', barColor: '#6F5AE8', steps: [],
    ...overrides,
  }
}

beforeEach(() => {
  initTasksStore(null)
  initNotesStore(null)
  initHabitsStore(null)
  initGoalsStore(null)
  initCalendarStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()
  getDocMock.mockClear()

  initTasksStore(UID)    // onSnapshot call index 0
  initNotesStore(UID)    // 1
  initHabitsStore(UID)   // 2
  initGoalsStore(UID)    // 3
  initCalendarStore(UID) // 4
  seedTasks([])
  seedNotes()
  seedHabits()
  seedGoals([])
  seedEvents()

  __resetDestructiveActionGateForTests()
})

describe('1. an existing task is visible to the AI', () => {
  it('buildAIContext includes a task that already exists in the store', () => {
    const task = makeTask()
    seedTasks([task])

    const context = buildAIContext('et')
    expect(context).toContain(task.title)
  })
})

describe('2-3. a deleted task disappears from the very next AI context — no restart needed', () => {
  it('after a confirmed delete_task, buildAIContext (called again in the SAME running session) no longer contains it', async () => {
    const task = makeTask()
    seedTasks([task])

    // Turn 1: the confirmation question — nothing deleted yet, context still shows it.
    const [first] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(first.needsConfirmation).toBe(true)
    expect(buildAIContext('et')).toContain(task.title)

    // Turn 2: confirmed — the write actually happens.
    const [second] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(second.success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)

    // Simulate Firestore's onSnapshot reflecting the delete back to this
    // same running client (no test-harness reset, no re-init — this is the
    // exact "next AI turn, same conversation" scenario from the bug report).
    seedTasks([])

    const context = buildAIContext('et')
    expect(context).not.toContain(task.title)
    expect(context).toMatch(/Kõik ülesanded on tehtud\.|Praegu ei ole selles moodulis ühtegi kirjet\./)
  })
})

describe('4-5. a newly created task appears on the very next AI turn — no restart/reinit needed', () => {
  it('buildAIContext (same running session) includes a task created after the conversation already started', () => {
    // Conversation "starts" with an empty task list — this exercises the
    // exact bug report shape: create the entity mid-conversation, then ask
    // "which tasks exist" in the SAME session without any store reset.
    expect(buildAIContext('et')).not.toContain('AI kustutamise test')

    const newTask = makeTask({ id: 'task-2', title: 'AI kustutamise test' })
    // Simulate the Firestore onSnapshot that follows a real addTask() write —
    // the store is never reinitialized, exactly like a live app that never
    // reloads the page between chat turns.
    seedTasks([newTask])

    const context = buildAIContext('et')
    expect(context).toContain('AI kustutamise test')
  })
})

describe('6-7. an edited task is reflected with its latest value on the next AI turn', () => {
  it('buildAIContext shows the renamed title, not the original one, without any restart', async () => {
    const task = makeTask({ id: 'task-3', title: 'Original title' })
    seedTasks([task])
    expect(buildAIContext('et')).toContain('Original title')

    await updateTask({ ...task, title: 'Renamed title' })
    seedTasks([{ ...task, title: 'Renamed title' }])

    const context = buildAIContext('et')
    expect(context).toContain('Renamed title')
    expect(context).not.toContain('Original title')
  })
})

describe('8. delete-action target resolution uses the latest live state, not a conversation-start snapshot', () => {
  it('a task created mid-conversation can be deleted immediately — it is never reported "not found"', async () => {
    // Nothing exists when the conversation begins.
    expect(getAllTasks()).toEqual([])

    // The task is created mid-conversation (e.g. via the Tasks page UI, or
    // an earlier create_task action) — simulated the same way a real
    // onSnapshot update would arrive.
    const newTask = makeTask({ id: 'task-4', title: 'AI kustutamise test' })
    seedTasks([newTask])

    // Immediately ask to delete it, in the same running session — this is
    // exactly step 4 of the reported bug ("AI said the task was not found").
    const [first] = await executeActionsAsync([
      { type: 'delete_task', data: { title: newTask.title } },
    ])
    expect(first.needsConfirmation).toBe(true)
    expect(first.message).not.toBe('Sellise pealkirjaga ülesannet ei leitud.')

    const [second] = await executeActionsAsync([
      { type: 'delete_task', data: { title: newTask.title } },
    ])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Ülesanne "${newTask.title}" kustutatud.`)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)
  })
})

describe('9. the same freshness guarantee holds for a second module (Goals)', () => {
  it('a goal created mid-conversation is visible, and a deleted goal disappears, on the next AI turn', async () => {
    expect(buildAIContext('et')).not.toContain('Jooksuvorm')

    const goal = makeGoal()
    seedGoals([goal])
    expect(buildAIContext('et')).toContain('Jooksuvorm')
    expect(getAllGoals()).toEqual([goal])

    // Edit is reflected too.
    await updateGoal(goal.id, { title: 'Jooksuvorm 10km' })
    seedGoals([{ ...goal, title: 'Jooksuvorm 10km' }])
    expect(buildAIContext('et')).toContain('Jooksuvorm 10km')

    // Delete resolves against the live (renamed) entity, not a stale one.
    const [first] = await executeActionsAsync([
      { type: 'delete_goal', data: { title: 'Jooksuvorm 10km' } },
    ])
    expect(first.needsConfirmation).toBe(true)
    const [second] = await executeActionsAsync([
      { type: 'delete_goal', data: { title: 'Jooksuvorm 10km' } },
    ])
    expect(second.success).toBe(true)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)

    seedGoals([])
    expect(buildAIContext('et')).not.toContain('Jooksuvorm')
  })
})

describe('10. the existing destructive-action confirmation guard is unchanged by the freshness fix', () => {
  it('a delete_task is still never executed on its first proposal, and needs a later round-trip to confirm', async () => {
    const task = makeTask()
    seedTasks([task])

    const [first] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(first.success).toBe(false)
    expect(first.needsConfirmation).toBe(true)
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
    expect(getAllTasks()).toEqual([task])

    const [second] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(second.success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)
  })
})

describe('11. no duplicate Firestore subscriptions are created by repeated freshness reads', () => {
  it('calling buildAIContext / getAllTasks many times never opens a second onSnapshot listener', () => {
    seedTasks([makeTask()])
    for (let i = 0; i < 20; i++) {
      buildAIContext('et')
      getAllTasks()
    }
    // Exactly the 5 subscriptions opened once each in beforeEach — reading
    // the store repeatedly must never re-subscribe.
    expect(onSnapshotMock).toHaveBeenCalledTimes(5)
  })

  it('re-initializing the tasks store with the same uid is a no-op — idempotent, does not tear down/reopen the listener', () => {
    initTasksStore(UID)
    initTasksStore(UID)
    initTasksStore(UID)
    expect(unsubscribeMock).not.toHaveBeenCalled()
    // Still just the one subscription from beforeEach's initTasksStore(UID).
    expect(onSnapshotMock).toHaveBeenCalledTimes(5)
  })
})

// ── Structural check: no caching layer between the store and the model ────

const AI_CLIENT_SRC = readFileSync(resolve(process.cwd(), 'src/lib/aiClient.ts'), 'utf8')

describe('aiClient.ts: every chat request rebuilds context fresh, never from a cached/memoized value', () => {
  // fetchAIReply's body, since the privacy-gate change (loadSettingsStrict)
  // replaced the old single-line ternary with an if/else assigning
  // `context` — these assertions check the same intent (contextOverride
  // stays authoritative; buildAIContext is only ever called inline,
  // per-request, never cached) against the current structure.
  const FETCH_AI_REPLY_SRC =
    AI_CLIENT_SRC.match(/export async function fetchAIReply\([\s\S]*?\n}\n/)?.[0] ?? ''

  it('an explicit contextOverride is used as-is, before the privacy-gated buildAIContext branch is ever reached', () => {
    expect(FETCH_AI_REPLY_SRC).toMatch(/if \(contextOverride !== undefined\) \{[\s\S]*?context = contextOverride/)
  })

  it('with no override, buildAIContext(lang) is called inline at request time, gated only by the privacy setting', () => {
    expect(FETCH_AI_REPLY_SRC).toMatch(/context = privacy\.aiData \? buildAIContext\(lang\) : ''/)
  })

  it('nothing stores buildAIContext\'s result in a variable/ref outside the request body', () => {
    expect(AI_CLIENT_SRC).not.toMatch(/const\s+\w+\s*=\s*buildAIContext\(/)
    expect(AI_CLIENT_SRC).not.toMatch(/useMemo\(.*buildAIContext/)
    expect(AI_CLIENT_SRC).not.toMatch(/useRef\(.*buildAIContext/)
  })
})
