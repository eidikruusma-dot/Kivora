/**
 * Cascade deletion for School subjects: deleting a subject (deleteSchoolSubject,
 * schoolStore.tsx) now also deletes every task linked to it — reusing the
 * existing task.subjectId relationship tasks already carry, in one atomic
 * Firestore writeBatch (subject doc + every linked task doc), never a
 * second deletion system. Unrelated tasks (different subjectId, or none)
 * are never touched, and a subject with no linked tasks still deletes
 * exactly as before.
 *
 * SchoolPage.tsx's own confirm-delete-subject flow (deleteSubject/
 * confirmDeleteSubject) gained a `deletingSubject` in-flight guard and a
 * toast.error() on failure — the same "deleting" boolean + toast
 * conventions already used by TasksPage.tsx's deleteTask/handleConfirmDelete,
 * not a new pattern. No React rendering harness exists for SchoolPage.tsx
 * in this repo (see schoolTaskWebLinks.test.ts and prior precedents), so
 * that wiring is proven structurally against the real source, exactly like
 * schoolSubjectEditFlow.test.ts already does for this same file.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectDeleteCascadesTasks.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/tasksStore', () => ({ setTaskCompleted: vi.fn() }))

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'
function schoolItemPath(docId: string) { return `users/${UID}/schoolItems/${docId}` }

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  fakeDb.set(ref.path, { ...data })
})
const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  fakeDb.delete(ref.path)
})

// Lets a test make the NEXT writeBatch commit() reject, to prove a failed
// Firestore write leaves everything exactly as it was (atomic, no partial
// deletion) rather than silently swallowing the error.
let nextCommitError: Error | null = null
const writeBatchDeleteMock = vi.fn((_path: string) => {})
const writeBatchCommitMock = vi.fn(async () => {})
const writeBatchMock = vi.fn(() => {
  const pending: string[] = []
  return {
    delete: (ref: { path: string }) => { pending.push(ref.path); writeBatchDeleteMock(ref.path) },
    commit: async () => {
      await writeBatchCommitMock()
      if (nextCommitError) {
        const err = nextCommitError
        nextCommitError = null
        throw err
      }
      for (const p of pending) fakeDb.delete(p)
    },
  }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  writeBatch: (...args: Parameters<typeof writeBatchMock>) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import {
  initSchoolStore,
  addSchoolSubject,
  addSchoolTask,
  deleteSchoolSubject,
  getAllSchoolSubjects,
  getAllSchoolTasks,
} from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext?.(docs ? { docs } : { docs: [] })
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject: 'Matemaatika',
    subjectId: 'sub-mat',
    subjectColor: '#6F5AE8',
    subjectBg: '#EDE9FB',
    subjectIcon: null,
    title: 'Kodutöö',
    type: 'homework',
    deadlineLabel: '',
    deadline: '2026-09-01',
    progress: 0,
    moodleUrl: '',
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  nextCommitError = null
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

// ── 1. deleting a subject deletes all of its linked tasks ──────────────────

describe('deleting a subject deletes all of its linked tasks', () => {
  it('every task with that subjectId is removed from Firestore and local state', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolTask(makeTask({ id: 1, subjectId: 'sub-mat' }) as never)
    await addSchoolTask(makeTask({ id: 2, subjectId: 'sub-mat', title: 'Kontrolltöö kordamine' }) as never)
    pumpSchool()
    expect(getAllSchoolTasks().length).toBe(2)

    await deleteSchoolSubject('sub-mat')
    pumpSchool()

    expect(fakeDb.has(schoolItemPath('subject-sub-mat'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('task-2'))).toBe(false)
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-mat')).toBe(false)
    expect(getAllSchoolTasks().length).toBe(0)
  })
})

// ── 2. unrelated tasks remain ───────────────────────────────────────────────

describe('unrelated tasks remain untouched', () => {
  it('a task linked to a different subject, and a task with no subject at all, both survive', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolSubject({ id: 'sub-bio', name: 'Bioloogia', color: '#16A34A', bg: '#DCFCE7', icon: null })
    await addSchoolTask(makeTask({ id: 1, subjectId: 'sub-mat' }) as never)
    await addSchoolTask(makeTask({ id: 2, subjectId: 'sub-bio', subject: 'Bioloogia' }) as never)
    await addSchoolTask(makeTask({ id: 3, subjectId: undefined, subject: '' }) as never)
    pumpSchool()

    await deleteSchoolSubject('sub-mat')
    pumpSchool()

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('task-2'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-3'))).toBe(true)
    const remainingIds = getAllSchoolTasks().map((t) => t.id).sort()
    expect(remainingIds).toEqual([2, 3])
    // The other subject is untouched too.
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-bio')).toBe(true)
  })
})

// ── 3. a subject with no tasks deletes normally ─────────────────────────────

describe('a subject with no linked tasks deletes normally', () => {
  it('deletes just the subject document, with no error', async () => {
    await addSchoolSubject({ id: 'sub-empty', name: 'Tühi aine', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    pumpSchool()

    await expect(deleteSchoolSubject('sub-empty')).resolves.toBeUndefined()
    pumpSchool()

    expect(fakeDb.has(schoolItemPath('subject-sub-empty'))).toBe(false)
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-empty')).toBe(false)
  })
})

// ── 4 & 5. cancelling / repeated confirmation — UI wiring (no render harness; see file header) ──

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('cancelling the confirmation deletes nothing (SchoolPage.tsx wiring)', () => {
  it('the Cancel button only clears confirmDeleteSubjectId — it never calls confirmDeleteSubject/deleteSchoolSubject', () => {
    const cancelButtonMatch = SCHOOL_PAGE_SRC.match(
      /onClick=\{\(\) => setConfirmDeleteSubjectId\(null\)\}\s*\n\s*disabled=\{deletingSubject\}/,
    )
    expect(cancelButtonMatch).not.toBeNull()
  })
})

describe('repeated confirmation cannot trigger duplicate deletion (SchoolPage.tsx wiring)', () => {
  it('confirmDeleteSubject guards re-entry while a delete is already in flight', () => {
    const fnBlock = SCHOOL_PAGE_SRC.match(/const confirmDeleteSubject = async \(id: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fnBlock).toMatch(/if \(deletingSubject\) return;/)
    expect(fnBlock).toMatch(/setDeletingSubject\(true\);/)
    expect(fnBlock).toMatch(/finally \{\s*\n\s*setDeletingSubject\(false\);/)
  })

  it('the Delete button is disabled while deletingSubject is true, so a second click cannot fire', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(
      /onClick=\{\(\) => confirmDeleteSubject\(confirmDeleteSubjectId\)\}\s*\n\s*disabled=\{deletingSubject\}/,
    )
  })

  it('store-level: calling deleteSchoolSubject twice for the same (already-deleted) subject is safe and never double-deletes another subject\'s tasks', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolTask(makeTask({ id: 1, subjectId: 'sub-mat' }) as never)
    pumpSchool()

    await deleteSchoolSubject('sub-mat')
    pumpSchool()
    // Second call finds the subject already gone — now correctly rejects
    // (SUBJECT_NOT_FOUND) rather than silently "succeeding" on a no-op
    // batch, which is exactly the bug this guard fixes (see
    // schoolSubjectDeletePersistsAfterReload.test.ts). It never throws an
    // UNEXPECTED error, never resurrects anything, and never touches any
    // other data.
    await expect(deleteSchoolSubject('sub-mat')).rejects.toThrow('SUBJECT_NOT_FOUND')
    pumpSchool()

    expect(getAllSchoolTasks().length).toBe(0)
    expect(getAllSchoolSubjects().length).toBe(0)
  })
})

// ── 6. Firestore failure is handled safely ──────────────────────────────────

describe('Firestore failure is handled safely', () => {
  it('a rejected batch commit propagates the error and leaves the subject and its tasks completely untouched', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolTask(makeTask({ id: 1, subjectId: 'sub-mat' }) as never)
    pumpSchool()

    nextCommitError = new Error('simulated Firestore outage')
    await expect(deleteSchoolSubject('sub-mat')).rejects.toThrow('simulated Firestore outage')
    pumpSchool()

    // Atomic batch: a failed commit deletes NOTHING, not even a partial set.
    expect(fakeDb.has(schoolItemPath('subject-sub-mat'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(true)
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-mat')).toBe(true)
    expect(getAllSchoolTasks().some((t) => t.id === 1)).toBe(true)
  })

  it('SchoolPage.tsx wiring: a failed confirmDeleteSubject shows the existing toast.error notification and does not close the confirmation', () => {
    const fnBlock = SCHOOL_PAGE_SRC.match(/const confirmDeleteSubject = async \(id: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fnBlock).toMatch(/catch \{/)
    expect(fnBlock).toMatch(/toast\.error\(lang === 'et' \? 'Aine kustutamine ebaõnnestus' : 'Failed to delete subject'\);/)
    // The catch block must NOT call setConfirmDeleteSubjectId(null) — the
    // dialog stays open on failure instead of silently closing.
    const catchBlock = fnBlock.match(/catch \{[\s\S]*?\n    \}/)?.[0] ?? ''
    expect(catchBlock).not.toMatch(/setConfirmDeleteSubjectId\(null\)/)
  })
})

// ── Confirmation text clearly warns about cascading task deletion ──────────

describe('the delete confirmation text warns that linked tasks are also deleted', () => {
  it('both the ET and EN copy mention the subject\'s linked tasks being deleted', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/kõik sellega seotud ülesanded kustutatakse/)
    expect(SCHOOL_PAGE_SRC).toMatch(/all tasks linked to it will be deleted/)
  })
})

// ── Reuses the existing delete flow — no second deletion system ────────────

describe('reuses the existing delete flow', () => {
  it('deleteSubject still shows the confirmation when the subject has linked tasks, even with no linked lessons', () => {
    const fnBlock = SCHOOL_PAGE_SRC.match(/const deleteSubject = \(id: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fnBlock).toMatch(/const linkedTasks = tasks\.filter\(\(t\) => t\.subjectId === id\);/)
    expect(fnBlock).toMatch(/if \(linkedLessons\.length > 0 \|\| linkedTasks\.length > 0\) \{/)
  })

  it('only one deleteSchoolSubject implementation exists in schoolStore.tsx (no parallel cascade helper)', () => {
    const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')
    const matches = SCHOOL_STORE_SRC.match(/export async function deleteSchoolSubject/g) ?? []
    expect(matches.length).toBe(1)
  })
})
