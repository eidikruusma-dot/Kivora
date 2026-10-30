/**
 * Regression test for the reported live bug: deleting a School subject
 * removes it from the UI, but after a page refresh the subject is back.
 *
 * Root cause (confirmed below, not assumed): SchoolPage.tsx's Ained tab
 * deliberately renders subject cards from useSchoolSubjectsFromLessons()
 * — a list MERGED from real stored subject documents AND subjects
 * synthesized purely from legacy lesson references with no stored
 * document at all (see that hook's own comment in schoolStore.tsx). For a
 * subject with no real document, deleteSchoolSubject() previously
 * committed a writeBatch whose only real delete targeted a path that
 * never existed — Firestore reports that as a clean success, the
 * confirmation dialog closed as if it worked, and the exact same subject
 * reappeared on the next load because nothing was ever actually
 * persisted to begin with. Fixed by having deleteSchoolSubject() reject
 * with SUBJECT_NOT_FOUND whenever `id` has no real stored document,
 * routing into the existing confirmDeleteSubject catch block (toast.error
 * + dialog stays open) instead of lying about success.
 *
 * Also exercises the exact scenario against the REAL deleteSchoolSubject
 * (schoolStore.tsx) for subjects that DO have a real document — both
 * freshly created and legacy-shaped — by simulating a genuine page
 * reload: tear down the current onSnapshot subscription
 * (initSchoolStore(null)) and open a BRAND NEW one (initSchoolStore(uid)
 * again) against the SAME fake Firestore backing store, exactly as a real
 * browser refresh re-subscribes against the real server.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectDeletePersistsAfterReload.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

let nextCommitError: Error | null = null
const writeBatchDeleteMock = vi.fn((_path: string) => {})
const writeBatchMock = vi.fn(() => {
  const pending: string[] = []
  return {
    delete: (ref: { path: string }) => { pending.push(ref.path); writeBatchDeleteMock(ref.path) },
    commit: async () => {
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
  addSchoolLesson,
  deleteSchoolSubject,
  getAllSchoolSubjects,
  getAllSchoolTasks,
  mergeStoredAndLessonSubjects,
} from '@/lib/schoolStore'

/** Pumps the MOST RECENTLY registered onSnapshot subscription from current fakeDb contents. */
function pumpLatestSubscription() {
  const calls = onSnapshotMock.mock.calls
  const [, onNext] = calls[calls.length - 1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

/** Tears down the current store subscription and opens a brand-new one — a real browser refresh. */
function simulatePageReload() {
  initSchoolStore(null)
  initSchoolStore(UID)
  pumpLatestSubscription()
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchDeleteMock.mockClear()
  nextCommitError = null
  initSchoolStore(UID)
  pumpLatestSubscription()
})

describe('deleting a newly-created subject survives a fresh page reload', () => {
  it('the subject is gone from a BRAND NEW subscription reading the same backing store, not just the listener open at delete time', async () => {
    await addSchoolSubject({ id: 'sub-new', name: 'Uus aine', color: '#2563EB', bg: '#EFF6FF', icon: null })
    pumpLatestSubscription()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-new')).toBe(true)

    await deleteSchoolSubject('sub-new')
    pumpLatestSubscription()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-new')).toBe(false)

    // The real test: a completely fresh subscription (simulating a page
    // refresh) must ALSO not see it — proving the server-side document is
    // actually gone, not just the one listener that was open.
    simulatePageReload()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-new')).toBe(false)
    expect(fakeDb.has(schoolItemPath('subject-sub-new'))).toBe(false)
  })
})

describe('deleting a legacy-shaped subject (missing newer optional fields) survives a fresh page reload', () => {
  it('a subject document written directly (as an older app version would have, without e.g. `assessment`) is still fully deletable', async () => {
    // Seeded directly into fakeDb, bypassing addSchoolSubject entirely —
    // simulates a document that predates this exact app version, with only
    // the fields an old client would have written.
    fakeDb.set(schoolItemPath('subject-sub-legacy'), {
      kind: 'subject',
      id: 'sub-legacy',
      name: 'Vana aine',
      color: '#CA8A04',
      bg: '#FEF9C3',
    })
    simulatePageReload()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-legacy')).toBe(true)

    await deleteSchoolSubject('sub-legacy')
    simulatePageReload()

    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-legacy')).toBe(false)
    expect(fakeDb.has(schoolItemPath('subject-sub-legacy'))).toBe(false)
  })
})

describe('a legacy task with no subjectId never blocks the subject itself from being deleted', () => {
  it('a pre-subjectId-era task document (no subjectId field at all) is left alone, and the subject deletion still succeeds and persists', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    // A legacy task matched to this subject only by name (the pre-subjectId
    // convention) — no subjectId field at all, exactly like real old data.
    fakeDb.set(schoolItemPath('task-99'), {
      kind: 'task',
      id: 99,
      subject: 'Matemaatika',
      subjectColor: '#6F5AE8',
      subjectBg: '#EDE9FB',
      title: 'Vana kodutöö',
      type: 'homework',
      deadlineLabel: '',
      deadline: '2026-01-01',
      progress: 0,
      moodleUrl: '',
    })
    await addSchoolTask({
      id: 1, subject: 'Matemaatika', subjectId: 'sub-mat', subjectColor: '#6F5AE8', subjectBg: '#EDE9FB',
      subjectIcon: null, title: 'Uus kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-09-01',
      progress: 0, moodleUrl: '',
    } as never)
    simulatePageReload()
    expect(getAllSchoolTasks().length).toBe(2)

    await expect(deleteSchoolSubject('sub-mat')).resolves.toBeUndefined()
    simulatePageReload()

    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-mat')).toBe(false)
    // The legacy, subjectId-less task was never matched by the cascade —
    // it's untouched, exactly like any other unrelated task.
    expect(fakeDb.has(schoolItemPath('task-99'))).toBe(true)
    expect(getAllSchoolTasks().some((t) => t.id === 99)).toBe(true)
    // The real, subjectId-linked task WAS cascaded away.
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
  })
})

describe('a failed commit never removes the subject from local state, even across a reload', () => {
  it('local state still reflects the subject after a rejected batch commit, both immediately and after a fresh subscription', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    pumpLatestSubscription()

    nextCommitError = new Error('simulated permission-denied')
    await expect(deleteSchoolSubject('sub-mat')).rejects.toThrow('simulated permission-denied')
    pumpLatestSubscription()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-mat')).toBe(true)

    simulatePageReload()
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-mat')).toBe(true)
    expect(fakeDb.has(schoolItemPath('subject-sub-mat'))).toBe(true)
  })
})

describe('the exact document path deleteSchoolSubject targets is user-scoped and matches addSchoolSubject\'s own path', () => {
  it('writeBatch.delete is called with the same users/{uid}/schoolItems/subject-{id} path addSchoolSubject wrote to', async () => {
    await addSchoolSubject({ id: 'sub-path-check', name: 'Keemia', color: '#16A34A', bg: '#DCFCE7', icon: null })
    pumpLatestSubscription()
    const createdPath = [...fakeDb.keys()].find((k) => k.includes('subject-sub-path-check'))
    expect(createdPath).toBe(schoolItemPath('subject-sub-path-check'))

    await deleteSchoolSubject('sub-path-check')

    expect(writeBatchDeleteMock).toHaveBeenCalledWith(schoolItemPath('subject-sub-path-check'))
  })
})

// ── ROOT CAUSE FIX: a purely lesson-derived "subject" (no real stored
// document) must never silently "succeed" at deletion. SchoolPage.tsx's
// deleteSubject/confirmDeleteSubject receive their `id` from
// useSchoolSubjectsFromLessons() — the MERGED (stored + lesson-derived)
// list every subject card in that file deliberately renders from (see that
// hook's own comment) — not the raw stored list. For a legacy lesson that
// predates the dedicated subject store, that merge synthesizes a
// subject-shaped entry with NO corresponding Firestore document at all.
// This is the actual root cause of the reported bug: deleting such an
// entry used to resolve cleanly (writeBatch happily commits a batch whose
// only real delete targets a path that was never there), closing the
// dialog as if it worked — then the exact same subject reappeared on the
// next load, because nothing about it was ever persisted to begin with.

describe('a purely lesson-derived subject (no real stored document) cannot be silently "deleted" — it now fails honestly instead of reappearing after reload', () => {
  it('mergeStoredAndLessonSubjects synthesizes an id for a legacy lesson with no matching subject document, and deleteSchoolSubject now rejects for it rather than no-op-succeeding', async () => {
    // A legacy timetable lesson that predates the dedicated subject store:
    // a bare `subject` name string, no subjectId, and critically, NO
    // corresponding real `subject-*` document was ever created for it.
    await addSchoolLesson({
      id: 'lesson-legacy-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)

    const merged = mergeStoredAndLessonSubjects(
      [{ id: 'lesson-legacy-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB' }],
      getAllSchoolSubjects(),
    )
    const syntheticEntry = merged.find((s) => s.name === 'Muusikaõpetus')
    expect(syntheticEntry).toBeDefined()
    // Exactly what the Ained tab would show and pass to deleteSubject(id).
    const idShownInUi = syntheticEntry!.id
    expect(fakeDb.has(schoolItemPath(`subject-${idShownInUi}`))).toBe(false) // confirms: no real document exists at that path

    // This is exactly what confirmDeleteSubject(idShownInUi) does — it now
    // rejects (SUBJECT_NOT_FOUND), which SchoolPage.tsx's existing catch
    // block turns into a toast.error + keeps the dialog open, instead of
    // silently closing as if the deletion had worked.
    await expect(deleteSchoolSubject(idShownInUi)).rejects.toThrow('SUBJECT_NOT_FOUND')
    simulatePageReload()

    // The lesson (the only real persisted trace of this "subject") is
    // correctly still there — this was never a real, deletable document,
    // and the honest rejection reflects that instead of lying about it.
    const mergedAfter = mergeStoredAndLessonSubjects(
      [{ id: 'lesson-legacy-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB' }],
      getAllSchoolSubjects(),
    )
    expect(mergedAfter.some((s) => s.name === 'Muusikaõpetus')).toBe(true)
  })
})
