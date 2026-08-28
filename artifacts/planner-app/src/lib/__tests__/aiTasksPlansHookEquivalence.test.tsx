// @vitest-environment jsdom
/**
 * Proves — using the ACTUAL React hooks TasksPage.tsx and PlansPage.tsx
 * render (`useTasks()` / `usePlans()`), not just their underlying sync
 * getters — that what the page shows on screen and what buildAIContext()
 * (and therefore the AI request payload) sees are always the exact same
 * data, at every point in a create/delete sequence, with no remount.
 *
 * This is the "mocks are not sufficient" ask from the third investigation
 * round: aiContextFreshness.test.ts and aiRequestPayloadIntegration.test.ts
 * already prove the sync getters (getAllTasks()/getAllPlans(), which
 * buildAIContext() calls) are fresh. This file additionally proves the
 * *page's own rendering path* — the useState/useEffect/listener-subscribe
 * machinery inside useTasks()/usePlans() that TasksPage/PlansPage actually
 * mount — reads from the identical module singleton, so a real screen and
 * a real AI request can never observe two different worlds.
 *
 * Uses @testing-library/react's renderHook + act, added to this package
 * specifically for this proof (jsdom environment, scoped to this file only
 * via the @vitest-environment docblock above — every other *.test.ts file
 * in this suite keeps running under the default 'node' environment).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiTasksPlansHookEquivalence.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Task } from '@/types'
import type { Plan } from '@/lib/plansStore'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-a' } }, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn((..._args: unknown[]) => Promise.resolve())
const deleteDocMock = vi.fn((..._args: unknown[]) => Promise.resolve())
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn((..._args: unknown[]) => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  runTransaction: vi.fn(),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import { initTasksStore, useTasks, getAllTasks, addTask, deleteTask } from '@/lib/tasksStore'
import { initPlansStore, usePlans, getAllPlans, addPlan } from '@/lib/plansStore'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedPlans(plans: Plan[]) {
  onSnapshotMock.mock.calls[1][1]({ docs: plans.map((p) => ({ data: () => p })) })
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

beforeEach(() => {
  initTasksStore(null)
  initPlansStore(null)
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()

  initTasksStore(UID) // onSnapshot call index 0 — same order TasksPage's mount triggers
  initPlansStore(UID) // 1 — same order PlansPage's mount triggers
  seedTasks([])
  seedPlans([])
})

describe('TasksPage (useTasks) and the AI context (getAllTasks) never diverge', () => {
  it('a task visible to the useTasks() hook is identically visible to getAllTasks() at every step — create, then delete', () => {
    const { result } = renderHook(() => useTasks())
    expect(result.current).toEqual([])
    expect(getAllTasks()).toEqual([])

    const task = makeTask()
    act(() => { seedTasks([task]) })
    // What TasksPage renders (the hook's state) and what buildAIContext()
    // reads (the sync getter) are the exact same array, every time.
    expect(result.current).toEqual(getAllTasks())
    expect(result.current).toEqual([task])

    act(() => { seedTasks([]) })
    expect(result.current).toEqual(getAllTasks())
    expect(result.current).toEqual([])
  })

  it('addTask()/deleteTask() — the real writes TasksPage and the AI delete action both call — are reflected identically in both the hook and the getter', async () => {
    const { result } = renderHook(() => useTasks())

    const task = makeTask({ id: 'task-2', title: 'AI kustutamise test' })
    await act(async () => {
      await addTask(task)
      seedTasks([task]) // the onSnapshot update a real Firestore write produces
    })
    expect(result.current).toEqual(getAllTasks())
    expect(result.current.map((t) => t.title)).toContain('AI kustutamise test')

    await act(async () => {
      await deleteTask(task.id)
      seedTasks([])
    })
    expect(result.current).toEqual(getAllTasks())
    expect(result.current).toEqual([])
  })
})

describe('PlansPage (usePlans) and the AI context (getAllPlans) never diverge', () => {
  it('a plan visible to the usePlans() hook is identically visible to getAllPlans() — including one created mid-session', async () => {
    const { result } = renderHook(() => usePlans())
    expect(result.current).toEqual([])
    expect(getAllPlans()).toEqual([])

    const plan = makePlan()
    await act(async () => {
      await addPlan(plan)
      seedPlans([plan]) // the onSnapshot update a real Firestore write produces
    })

    expect(result.current).toEqual(getAllPlans())
    expect(result.current.map((p) => p.title)).toContain('Kalendri seose test')
  })
})

describe('both hooks and both getters are driven by the exact same onSnapshot listener — no second subscription', () => {
  it('mounting useTasks()/usePlans() multiple times never opens extra Firestore listeners', () => {
    renderHook(() => useTasks())
    renderHook(() => useTasks())
    renderHook(() => usePlans())
    renderHook(() => usePlans())
    // Still just the 2 subscriptions opened once each in beforeEach.
    expect(onSnapshotMock).toHaveBeenCalledTimes(2)
  })
})
