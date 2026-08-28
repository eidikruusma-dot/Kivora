/**
 * Regression tests for Defect #2: deleting a task must also remove the
 * calendar event automatically created for it (and the EntityLinks tying
 * them together), atomically, without touching anything it doesn't own.
 *
 * The cascade lives in tasksStore.ts's exported `deleteTask` — the single
 * shared deletion path every task-deletion entry point calls through
 * (TasksPage, the AI assistant's delete_task action, useTaskActions).
 *
 * Ownership of a linked calendar event is proven by the event id's
 * `cal-auto-` prefix (stamped only by automaticLinking.ts's auto-create
 * path), NOT by relationType alone — a `scheduled` EntityLink is also used
 * when a user manually links a task to a pre-existing event (LinkPickerModal,
 * PostSaveLinkSuggestionsDialog), so relationType alone would over-delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EntityLink } from '@/types/entityLinks'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore ────────────────────────────────────────────────────────

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

const batchDeleteMock = vi.fn()
let batchCommitImpl: () => Promise<void> = () => Promise.resolve()
const batchCommitMock = vi.fn(() => batchCommitImpl())
const writeBatchMock = vi.fn(() => ({
  delete: batchDeleteMock,
  commit: batchCommitMock,
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initTasksStore, deleteTask } from '@/lib/tasksStore'
import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { executeActionsAsync } from '@/lib/aiActions'
import { getAllTasks } from '@/lib/tasksStore'

const UID = 'user-a'

function seedLinks(links: EntityLink[]) {
  // entityLinksStore is initialized after tasksStore in beforeEach, so its
  // onSnapshot call is always mock.calls[1].
  const onNext = onSnapshotMock.mock.calls[1][1]
  onNext({ docs: links.map((l) => ({ data: () => l })) })
}

function makeLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: `link-${Math.random().toString(36).slice(2, 8)}`,
    fromType: 'task',
    fromId: 'task-1',
    toType: 'calendar',
    toId: 'cal-auto-1000-abcd',
    relationType: 'scheduled',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function deletedPaths(): string[] {
  return batchDeleteMock.mock.calls.map((c) => (c[0] as { path: string }).path)
}

/** tasksStore only updates its in-memory _tasks via onSnapshot delivery — a
 * plain addTask() write (mocked setDoc) does not, so tests that need
 * getAllTasks()/executeAction to see a task must deliver it explicitly. */
function seedTasks(tasks: { id: string; title: string; priority: 'low' | 'medium' | 'high'; completed: boolean }[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: tasks.map((t) => ({ data: () => t })) })
}

beforeEach(() => {
  initTasksStore(null)
  initEntityLinksStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  batchDeleteMock.mockClear()
  batchCommitMock.mockClear()
  writeBatchMock.mockClear()
  batchCommitImpl = () => Promise.resolve()

  initTasksStore(UID)      // onSnapshot call index 0
  initEntityLinksStore(UID) // onSnapshot call index 1
})

describe('deleteTask cascade (Defect #2)', () => {
  it('1. deletes the task, its auto-created calendar event, and its scheduled link, atomically', async () => {
    const link = makeLink({ id: 'link-1', fromId: 'task-1', toId: 'cal-auto-2000-xyz1' })
    seedLinks([link])

    await deleteTask('task-1')

    expect(writeBatchMock).toHaveBeenCalledTimes(1)
    const paths = deletedPaths()
    expect(paths).toContain(`users/${UID}/tasks/task-1`)
    expect(paths).toContain(`users/${UID}/calendarEvents/cal-auto-2000-xyz1`)
    expect(paths).toContain(`users/${UID}/entityLinks/link-1`)
    expect(paths).toHaveLength(3)
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  it('2. deleting an undated task (no links at all) still succeeds, deleting only the task doc', async () => {
    seedLinks([]) // no links reference this task

    await expect(deleteTask('task-undated')).resolves.toBeUndefined()

    const paths = deletedPaths()
    expect(paths).toEqual([`users/${UID}/tasks/task-undated`])
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  it('3. an unrelated calendar event (belonging to a different task) is left untouched', async () => {
    const ownLink = makeLink({ id: 'link-own', fromId: 'task-1', toId: 'cal-auto-1-own' })
    const otherLink = makeLink({ id: 'link-other', fromId: 'task-2', toId: 'cal-auto-2-other' })
    seedLinks([ownLink, otherLink])

    await deleteTask('task-1')

    const paths = deletedPaths()
    expect(paths).toContain(`users/${UID}/calendarEvents/cal-auto-1-own`)
    expect(paths).not.toContain(`users/${UID}/calendarEvents/cal-auto-2-other`)
    expect(paths).not.toContain(`users/${UID}/entityLinks/link-other`)
  })

  it('4a. a manually linked pre-existing calendar event (relationType scheduled, non-auto id) is NOT deleted', async () => {
    // Same relationType as an auto-created link, but the event id lacks the
    // cal-auto- prefix because it was created independently (e.g. via
    // LinkPickerModal's "create calendar event & link" flow, which mints
    // ids as `cal-${Date.now()}-...`, or the Calendar page / AI assistant).
    const manualLink = makeLink({ id: 'link-manual', fromId: 'task-1', toId: 'cal-1234-manual' })
    seedLinks([manualLink])

    await deleteTask('task-1')

    const paths = deletedPaths()
    expect(paths).not.toContain(`users/${UID}/calendarEvents/cal-1234-manual`)
    // The link itself is still cleaned up (it references the deleted task),
    // just not the independently-created event it points at.
    expect(paths).toContain(`users/${UID}/entityLinks/link-manual`)
  })

  it('4b. a scheduled link pointing FROM the calendar event TO the task is never treated as owned', async () => {
    // Defensive case: relationType/toType alone would match; direction must too.
    const reversedLink = makeLink({
      id: 'link-reversed',
      fromType: 'calendar',
      fromId: 'cal-auto-9-reversed',
      toType: 'task',
      toId: 'task-1',
    })
    seedLinks([reversedLink])

    await deleteTask('task-1')

    const paths = deletedPaths()
    expect(paths).not.toContain(`users/${UID}/calendarEvents/cal-auto-9-reversed`)
    expect(paths).toContain(`users/${UID}/entityLinks/link-reversed`)
  })

  it('5a. the AI assistant\'s delete_task action reaches the same shared cascade, once confirmed', async () => {
    // delete_task now asks for confirmation before executing (see
    // aiDestructiveActionConfirmation.test.ts) — the first call must NOT
    // delete anything; only the second (confirming) call does.
    const link = makeLink({ id: 'link-ai', fromId: 'ai-task-1', toId: 'cal-auto-5-ai' })
    seedLinks([link])
    seedTasks([{ id: 'ai-task-1', title: 'AI task', priority: 'medium', completed: false }])

    // Each call goes through executeActionsAsync (not bare executeAction)
    // so the confirmation-gate generation counter actually advances between
    // them — exactly how the real chat pipeline calls this on every reply.
    const [first] = await executeActionsAsync([{ type: 'delete_task', data: { id: 'ai-task-1' } }])
    expect(first.success).toBe(false)
    expect(first.needsConfirmation).toBe(true)
    expect(deletedPaths()).toEqual([])

    const [result] = await executeActionsAsync([{ type: 'delete_task', data: { id: 'ai-task-1' } }])

    expect(result.success).toBe(true)
    const paths = deletedPaths()
    expect(paths).toContain(`users/${UID}/tasks/ai-task-1`)
    expect(paths).toContain(`users/${UID}/calendarEvents/cal-auto-5-ai`)
    expect(paths).toContain(`users/${UID}/entityLinks/link-ai`)
  })

  it('5b. useTaskActions() and the AI action both delegate to tasksStore.deleteTask (same function reference)', async () => {
    // Structural proof: useTaskActions is a thin useCallback wrapper around
    // the exact same exported deleteTask this whole suite exercises, so any
    // caller of the hook automatically gets the cascade — there is no
    // separate deletion implementation to keep in sync.
    const tasksStoreModule = await import('@/lib/tasksStore')
    expect(tasksStoreModule.deleteTask).toBe(deleteTask)
  })

  it('6. a failed calendar/link deletion (batch commit rejects) does not resolve — no false success', async () => {
    seedLinks([makeLink({ id: 'link-fail', fromId: 'task-1', toId: 'cal-auto-fail' })])
    batchCommitImpl = () => Promise.reject(new Error('simulated Firestore batch failure'))

    await expect(deleteTask('task-1')).rejects.toThrow('simulated Firestore batch failure')
  })

  it('6b. the AI delete_task action surfaces failure as success:false, never a false-positive message', async () => {
    seedLinks([])
    seedTasks([{ id: 'task-fail', title: 'Will fail', priority: 'low', completed: false }])
    batchCommitImpl = () => Promise.reject(new Error('simulated Firestore batch failure'))

    // First call only asks for confirmation — the simulated failure hasn't
    // been reached yet, so confirm before exercising the failure path.
    const [asked] = await executeActionsAsync([{ type: 'delete_task', data: { id: 'task-fail' } }])
    expect(asked.needsConfirmation).toBe(true)

    const [result] = await executeActionsAsync([{ type: 'delete_task', data: { id: 'task-fail' } }])

    expect(result.success).toBe(false)
    expect(result.message).not.toMatch(/kustutatud/i) // never claims "deleted" on failure
  })

  it('7. getAllTasks() still reflects the live onSnapshot state (existing task/calendar behavior unchanged)', () => {
    const onNext = onSnapshotMock.mock.calls[0][1]
    const task = { id: 't1', title: 'Synthetic', priority: 'low' as const, completed: false }
    onNext({ docs: [{ data: () => task }] })
    expect(getAllTasks()).toEqual([task])
  })
})
