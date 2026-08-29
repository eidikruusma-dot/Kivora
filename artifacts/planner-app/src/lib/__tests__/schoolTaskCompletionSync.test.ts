/**
 * School change #4 — a School task's completion and its linked Tasks-module
 * task's `completed` boolean used to be two independent states: marking a
 * School assignment done/undone never touched the linked Task, and toggling
 * the linked Task in the Tasks module (or its Dashboard/Finance widgets)
 * never touched the School assignment.
 *
 * Fix, reusing the existing linkedTaskId reference and each store's own
 * CRUD (no new link system):
 *   - schoolStore.tsx's markSchoolTaskDone/markSchoolTaskUndone — the two
 *     existing entry points behind the "Märgi tehtuks"/"Märgi tegemata"
 *     actions — now also call tasksStore's new setTaskCompleted(linkedId,
 *     bool) after their own write, when a linkedTaskId exists.
 *   - tasksStore.ts's toggleTask — the ONE low-level function every UI
 *     surface that flips a task's completed state already funnels through
 *     (TasksPage, the Dashboard task widgets, FinancePage) — now also calls
 *     schoolStore's new syncSchoolTaskFromLinkedTask(taskId, bool) after its
 *     own write. This means every one of those UI surfaces gets School sync
 *     for free, with no UI file touched.
 *
 * School's "done" state is mapped from the EXISTING progress field
 * (progress >= 100 — the same mapping SchoolPage.tsx's own
 * statusFromProgress already uses), never a new completion field; the
 * reverse direction (Task -> School) is implemented by calling the SAME
 * markSchoolTaskDone/Undone functions the forward direction already uses,
 * so progress/prevProgress/parts are always derived through one single
 * code path regardless of which side a change started on.
 *
 * Loop prevention: setTaskCompleted only writes when the Task's current
 * `completed` differs from the target value; syncSchoolTaskFromLinkedTask
 * only proceeds when the School task's current progress-derived done state
 * differs from the target value. Propagating a change back to a side that
 * already has it is always a no-op — the chain terminates after exactly
 * one hop each way, with exactly one real write per side, ever.
 *
 * This file drives the REAL schoolStore.tsx and tasksStore.ts modules
 * against a small shared fake Firestore (a single path->data map every
 * mocked setDoc/updateDoc/deleteDoc reads and writes), with onSnapshot
 * "pumped" manually after each write to reflect the real read-your-own-
 * write behavior both directions' loop-prevention checks depend on.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskCompletionSync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/entityLinksStore', () => ({
  getLinksForEntity: vi.fn(() => []),
  linkDoc: vi.fn(() => ({ path: '' })),
}))
vi.mock('@/lib/calendarStore', () => ({
  eventDoc: vi.fn(() => ({ path: '' })),
}))

// ── Shared fake Firestore: one path -> data map for both collections ──────

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'

function taskPath(id: string) { return `users/${UID}/tasks/${id}` }
function schoolItemPath(docId: string) { return `users/${UID}/schoolItems/${docId}` }

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

// Real Firestore fires a document's onSnapshot listener with the local
// (pending-write) echo essentially immediately after a write — well before
// the write's own promise resolves. So by the time e.g. markSchoolTaskDone's
// `await setDoc(...)` line returns, that store's own in-memory cache already
// reflects the new value in production. Auto-pumping the affected collection
// here after every write reproduces that, instead of requiring every test to
// remember to call pumpTasks()/pumpSchool() after each mocked write — without
// this, the loop-prevention guards (which intentionally trust "my own
// store's cache is fresh right after I write to it") see stale data purely
// as a mock-harness artifact, not a real bug.
function emitCollection(prefix: string, snapshotIndex: number) {
  if (onSnapshotMock.mock.calls.length <= snapshotIndex) return
  const onNext = onSnapshotMock.mock.calls[snapshotIndex][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(prefix))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}
function autoPumpForPath(path: string) {
  if (path.startsWith(`users/${UID}/tasks/`)) emitCollection(`users/${UID}/tasks/`, 0)
  else if (path.startsWith(`users/${UID}/schoolItems/`)) emitCollection(`users/${UID}/schoolItems/`, 1)
}

const setDocMock = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  fakeDb.set(ref.path, { ...data })
  autoPumpForPath(ref.path)
})
const updateDocMock = vi.fn(async (ref: { path: string }, patch: Record<string, unknown>) => {
  const entry = fakeDb.get(ref.path)
  if (!entry) throw new Error('not-found')
  Object.assign(entry, patch)
  autoPumpForPath(ref.path)
})
const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  fakeDb.delete(ref.path)
  autoPumpForPath(ref.path)
})
const writeBatchMock = vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  updateDoc: (...args: Parameters<typeof updateDocMock>) => updateDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initTasksStore, getAllTasks, toggleTask, setTaskCompleted } from '@/lib/tasksStore'
import {
  initSchoolStore,
  getAllSchoolTasks,
  markSchoolTaskDone,
  markSchoolTaskUndone,
  syncSchoolTaskFromLinkedTask,
} from '@/lib/schoolStore'

// initTasksStore -> onSnapshot call 0, initSchoolStore -> onSnapshot call 1
// (fixed order set in beforeEach below).
function pumpTasks() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/tasks/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}
function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[1][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function seedTask(task: Task) {
  fakeDb.set(taskPath(task.id), { ...task })
}
function seedSchoolTask(schoolTask: Record<string, unknown> & { id: number }) {
  fakeDb.set(schoolItemPath(`task-${schoolTask.id}`), { kind: 'task', ...schoolTask })
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'linked-task-1',
    title: 'Matemaatika kodutöö',
    priority: 'medium',
    completed: false,
    ...overrides,
  }
}

function makeSchoolTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject: 'Matemaatika',
    subjectColor: '#6F5AE8',
    subjectBg: '#EDE9FB',
    title: 'Kodutöö lk 45',
    type: 'homework',
    deadlineLabel: '4. august 2026',
    deadline: '2026-08-04',
    progress: 0,
    moodleUrl: '',
    ...overrides,
  }
}

beforeEach(() => {
  initTasksStore(null)
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchMock.mockClear()

  initTasksStore(UID)  // onSnapshot call index 0
  initSchoolStore(UID) // onSnapshot call index 1
  pumpTasks()
  pumpSchool()
})

// ── 1. School done -> linked Task done ──────────────────────────────────────

describe('1. marking a School task done marks its linked Tasks-module task done', () => {
  it('setDoc/updateDoc reflect completed:true on the linked task after markSchoolTaskDone', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    await markSchoolTaskDone(1)

    const linkedTask = fakeDb.get(taskPath('linked-task-1'))!
    expect(linkedTask.completed).toBe(true)
  })
})

// ── 2. School undone -> linked Task undone ──────────────────────────────────

describe('2. marking a School task undone marks its linked Tasks-module task undone', () => {
  it('setDoc/updateDoc reflect completed:false on the linked task after markSchoolTaskUndone', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 100, prevProgress: 40, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: true }))
    pumpSchool(); pumpTasks()

    await markSchoolTaskUndone(1)

    const linkedTask = fakeDb.get(taskPath('linked-task-1'))!
    expect(linkedTask.completed).toBe(false)
  })

  it('School\'s own progress semantics (restoring prevProgress, dropping the field) are unchanged by this fix', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 100, prevProgress: 40, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: true }))
    pumpSchool(); pumpTasks()

    await markSchoolTaskUndone(1)

    const schoolDoc = fakeDb.get(schoolItemPath('task-1'))!
    expect(schoolDoc.progress).toBe(40)
    expect('prevProgress' in schoolDoc).toBe(false)
  })
})

// ── 3. Tasks done -> School done ─────────────────────────────────────────────

describe('3. marking the linked Tasks-module task done marks the School task done', () => {
  it('toggleTask (false -> true) writes progress:100 on the linked School task', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 20, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    await toggleTask('linked-task-1')

    const schoolDoc = fakeDb.get(schoolItemPath('task-1'))!
    expect(schoolDoc.progress).toBe(100)
    expect(schoolDoc.prevProgress).toBe(20) // previous progress preserved, same as a native "mark done"
  })
})

// ── 4. Tasks undone -> School undone ────────────────────────────────────────

describe('4. reopening the linked Tasks-module task marks the School task undone', () => {
  it('toggleTask (true -> false) restores the School task\'s previous progress', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 100, prevProgress: 60, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: true }))
    pumpSchool(); pumpTasks()

    await toggleTask('linked-task-1')

    const schoolDoc = fakeDb.get(schoolItemPath('task-1'))!
    expect(schoolDoc.progress).toBe(60)
    expect('prevProgress' in schoolDoc).toBe(false)
  })
})

// ── 5. no linked task -> School/Tasks behavior unchanged ────────────────────

describe('5. a School task with no linkedTaskId is unaffected — no cross-store write is attempted', () => {
  it('markSchoolTaskDone on an unlinked task only writes the School document, nothing else', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0 })) // no linkedTaskId
    pumpSchool()

    await markSchoolTaskDone(1)

    expect(fakeDb.get(schoolItemPath('task-1'))!.progress).toBe(100)
    // No task document was created or touched as a side effect.
    expect([...fakeDb.keys()].some((k) => k.startsWith(`users/${UID}/tasks/`))).toBe(false)
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('a plain Tasks-module toggle with no linking School task only writes the task, nothing else', async () => {
    seedTask(makeTask({ id: 'standalone-task', completed: false }))
    pumpTasks()

    await toggleTask('standalone-task')

    expect(fakeDb.get(taskPath('standalone-task'))!.completed).toBe(true)
    expect([...fakeDb.keys()].some((k) => k.startsWith(`users/${UID}/schoolItems/`))).toBe(false)
  })
})

// ── 6. missing/deleted counterpart fails safely ─────────────────────────────

describe('6. a missing or deleted counterpart fails safely — the surviving item stays usable', () => {
  it('markSchoolTaskDone with a linkedTaskId pointing at a deleted Task still succeeds on the School side', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'ghost-task-id' }))
    pumpSchool()
    // No task seeded at all — simulates the linked task having been deleted.

    await expect(markSchoolTaskDone(1)).resolves.toBeUndefined()
    expect(fakeDb.get(schoolItemPath('task-1'))!.progress).toBe(100) // School side still updated correctly
    expect(fakeDb.has(taskPath('ghost-task-id'))).toBe(false) // nothing fabricated for the missing task
  })

  it('setTaskCompleted for a non-existent task id is a safe no-op', async () => {
    await expect(setTaskCompleted('does-not-exist', true)).resolves.toBeUndefined()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('toggling a Task whose linkedTaskId reference has no matching School task (School item deleted) still succeeds on the Tasks side', async () => {
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpTasks()
    // No School task seeded — simulates the School assignment having been deleted.

    await expect(toggleTask('linked-task-1')).resolves.toBeUndefined()
    expect(fakeDb.get(taskPath('linked-task-1'))!.completed).toBe(true) // Tasks side still updated correctly
  })

  it('syncSchoolTaskFromLinkedTask for a taskId no School task links to is a safe no-op', async () => {
    await expect(syncSchoolTaskFromLinkedTask('unlinked-task-id', true)).resolves.toBeUndefined()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})

// ── 7. no loop, no duplicate writes ─────────────────────────────────────────

describe('7. synchronization does not loop or create duplicate writes', () => {
  it('marking a School task done writes the School doc once and the linked Task doc once — never more', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    await markSchoolTaskDone(1)

    // Exactly one write into each collection — no repeated/duplicate calls.
    const schoolWrites = setDocMock.mock.calls.filter((c) => (c[0] as { path: string }).path.startsWith(`users/${UID}/schoolItems/`))
    const taskWrites = updateDocMock.mock.calls.filter((c) => (c[0] as { path: string }).path.startsWith(`users/${UID}/tasks/`))
    expect(schoolWrites).toHaveLength(1)
    expect(taskWrites).toHaveLength(1)
  })

  it('toggling the linked Task writes the Task doc once and the School doc once — never more', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    await toggleTask('linked-task-1')

    const taskWrites = updateDocMock.mock.calls.filter((c) => (c[0] as { path: string }).path.startsWith(`users/${UID}/tasks/`))
    const schoolWrites = setDocMock.mock.calls.filter((c) => (c[0] as { path: string }).path.startsWith(`users/${UID}/schoolItems/`))
    expect(taskWrites).toHaveLength(1)
    expect(schoolWrites).toHaveLength(1)
  })

  it('re-running the same completion sync when already in sync is a total no-op (idempotent, breaks the ping-pong)', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 100, prevProgress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: true }))
    pumpSchool(); pumpTasks()

    // Both sides already agree (School done, Task done) — simulating the
    // second "hop" a real sync chain would attempt after the first write.
    await syncSchoolTaskFromLinkedTask('linked-task-1', true)
    await setTaskCompleted('linked-task-1', true)

    expect(setDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('directly calling both directions back-to-back for the same change never produces more than the one real write per side', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    // Simulates the full ping-pong chain a real change triggers end to end:
    // School -> Task (real write) -> attempt Task -> School again (no-op).
    await markSchoolTaskDone(1)
    await syncSchoolTaskFromLinkedTask('linked-task-1', true) // would-be second hop

    const schoolWrites = setDocMock.mock.calls.filter((c) => (c[0] as { path: string }).path.startsWith(`users/${UID}/schoolItems/`))
    expect(schoolWrites).toHaveLength(1) // still just the one write from markSchoolTaskDone itself
  })
})

// ── Direct getters reflect the synced state ─────────────────────────────────

describe('the in-memory stores reflect the synced state after a real onSnapshot round trip', () => {
  it('getAllTasks/getAllSchoolTasks show the propagated completion once the write is echoed back', async () => {
    seedSchoolTask(makeSchoolTask({ id: 1, progress: 0, linkedTaskId: 'linked-task-1' }))
    seedTask(makeTask({ id: 'linked-task-1', completed: false }))
    pumpSchool(); pumpTasks()

    await markSchoolTaskDone(1)
    pumpTasks() // simulate Firestore echoing the propagated write back

    expect(getAllTasks().find((t) => t.id === 'linked-task-1')?.completed).toBe(true)
    expect(getAllSchoolTasks().find((t) => t.id === 1)?.progress).toBe(100)
  })
})
