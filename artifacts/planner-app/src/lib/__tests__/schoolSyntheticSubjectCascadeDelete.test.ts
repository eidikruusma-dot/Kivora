/**
 * Full regression suite for real deletion of a lesson-derived "synthetic"
 * School subject — one with no real users/{uid}/schoolItems/subject-{id}
 * document, that exists only because useSchoolSubjectsFromLessons()
 * (schoolStore.tsx) synthesizes it from legacy lesson references (its own
 * comment explains why; isSubjectReferenced documents the same id-first,
 * name-fallback matching this cascade mirrors). deleteSchoolSubject() now
 * permanently deletes every lesson and task that would otherwise cause
 * such an id to be resynthesized after a reload, instead of merely
 * rejecting with SUBJECT_NOT_FOUND (an error guard is not a deletion).
 *
 * Stored (real) subjects are completely unaffected by any of this — that
 * branch of deleteSchoolSubject() still only deletes the subject document
 * and tasks matched by subjectId, exactly as before; see
 * schoolSubjectDeleteCascadesTasks.test.ts for that coverage.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSyntheticSubjectCascadeDelete.test.ts
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
  type SchoolLesson,
} from '@/lib/schoolStore'

function pumpLatestSubscription() {
  const calls = onSnapshotMock.mock.calls
  const [, onNext] = calls[calls.length - 1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function simulatePageReload() {
  initSchoolStore(null)
  initSchoolStore(UID)
  pumpLatestSubscription()
}

/** The live lesson rows currently in fakeDb, in the shape mergeStoredAndLessonSubjects expects. */
function currentLessonsFromFakeDb(): SchoolLesson[] {
  return [...fakeDb.entries()]
    .filter(([path]) => path.includes('/lesson-'))
    .map(([, data]) => data as unknown as SchoolLesson)
}

/** Resolves the synthetic id the Ained tab would show for a given lesson-only subject name. */
function syntheticIdFor(name: string): string {
  const merged = mergeStoredAndLessonSubjects(currentLessonsFromFakeDb(), getAllSchoolSubjects())
  const entry = merged.find((s) => s.name === name)
  if (!entry) throw new Error(`no synthetic subject found for "${name}"`)
  return entry.id
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchMock.mockClear()
  writeBatchDeleteMock.mockClear()
  nextCommitError = null
  initSchoolStore(UID)
  pumpLatestSubscription()
})

// ── 1. deleting a synthetic lesson-derived subject ──────────────────────────

describe('1. deleting a synthetic lesson-derived subject', () => {
  it('resolves successfully and removes the underlying lesson from Firestore', async () => {
    await addSchoolLesson({
      id: 'lesson-muusika-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    pumpLatestSubscription()

    const id = syntheticIdFor('Muusikaõpetus')
    expect(fakeDb.has(schoolItemPath(`subject-${id}`))).toBe(false) // no real document — confirms it IS the synthetic case

    await expect(deleteSchoolSubject(id)).resolves.toBeUndefined()

    expect(fakeDb.has(schoolItemPath('lesson-lesson-muusika-1'))).toBe(false)
  })
})

// ── 2. related legacy lessons no longer recreate it ─────────────────────────

describe('2. its related legacy lessons no longer recreate it after a reload', () => {
  it('a fresh subscription never resynthesizes the deleted subject, even with multiple lessons under the same name', async () => {
    await addSchoolLesson({
      id: 'lesson-muusika-mon', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB', day: 'E',
    } as never)
    await addSchoolLesson({
      id: 'lesson-muusika-wed', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB', day: 'K',
    } as never)
    pumpLatestSubscription()

    const id = syntheticIdFor('Muusikaõpetus')
    await deleteSchoolSubject(id)
    simulatePageReload()

    expect(fakeDb.has(schoolItemPath('lesson-lesson-muusika-mon'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('lesson-lesson-muusika-wed'))).toBe(false)
    const mergedAfter = mergeStoredAndLessonSubjects(currentLessonsFromFakeDb(), getAllSchoolSubjects())
    expect(mergedAfter.some((s) => s.name === 'Muusikaõpetus')).toBe(false)
  })
})

// ── 3. its linked tasks are deleted ──────────────────────────────────────────

describe('3. its linked tasks are deleted', () => {
  it('a legacy task with no subjectId, matched purely by name, is deleted', async () => {
    await addSchoolLesson({
      id: 'lesson-kunst-1', subject: 'Kunstiõpetus', dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    await addSchoolTask({
      id: 1, subject: 'Kunstiõpetus', subjectColor: '#CA8A04', subjectBg: '#FEF9C3', subjectIcon: null,
      title: 'Vana joonistus', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)
    pumpLatestSubscription()

    const id = syntheticIdFor('Kunstiõpetus')
    await deleteSchoolSubject(id)
    pumpLatestSubscription()

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
    expect(getAllSchoolTasks().some((t) => t.id === 1)).toBe(false)
  })

  it('a task explicitly linked by subjectId to the synthetic id (picked from the subject dropdown, per TaskEditModal) is deleted', async () => {
    await addSchoolLesson({
      id: 'lesson-keemia-1', subject: 'Keemia', dotColor: '#16A34A', cardBg: '#DCFCE7',
    } as never)
    pumpLatestSubscription()
    const id = syntheticIdFor('Keemia')

    // TaskEditModal resolves subjectId from useSchoolSubjectsFromLessons()
    // (the merged list), so a task can legitimately be saved with
    // subjectId pointing at a synthetic id, not only a real one.
    await addSchoolTask({
      id: 2, subject: 'Keemia', subjectId: id, subjectColor: '#16A34A', subjectBg: '#DCFCE7', subjectIcon: null,
      title: 'Lahuste ülesanne', type: 'homework', deadlineLabel: '', deadline: '2026-09-01', progress: 0, moodleUrl: '',
    } as never)
    pumpLatestSubscription()

    await deleteSchoolSubject(id)

    expect(fakeDb.has(schoolItemPath('task-2'))).toBe(false)
  })
})

// ── 4. unrelated lessons and tasks remain ───────────────────────────────────

describe('4. unrelated lessons and tasks remain untouched', () => {
  it('a different-named lesson/task survive, and a same-named lesson/task whose OWN subjectId resolves to a different real subject are never touched', async () => {
    await addSchoolSubject({ id: 'sub-real-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    pumpLatestSubscription()

    // Target: a synthetic subject with its own lesson + task.
    await addSchoolLesson({ id: 'lesson-bio-1', subject: 'Bioloogia', dotColor: '#16A34A', cardBg: '#DCFCE7' } as never)
    await addSchoolTask({
      id: 10, subject: 'Bioloogia', subjectColor: '#16A34A', subjectBg: '#DCFCE7', subjectIcon: null,
      title: 'Bio kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)

    // Unrelated by name entirely.
    await addSchoolLesson({ id: 'lesson-geo-1', subject: 'Geograafia', dotColor: '#DC2626', cardBg: '#FFF1F2' } as never)
    await addSchoolTask({
      id: 11, subject: 'Geograafia', subjectColor: '#DC2626', subjectBg: '#FFF1F2', subjectIcon: null,
      title: 'Geo kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)

    // Unrelated despite a NAME collision: this lesson/task's OWN subjectId
    // resolves to the real, still-existing Matemaatika subject — must
    // never be swept up even if (hypothetically) its display name matched.
    await addSchoolLesson({
      id: 'lesson-mat-real', subject: 'Matemaatika', subjectId: 'sub-real-mat', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    await addSchoolTask({
      id: 12, subject: 'Matemaatika', subjectId: 'sub-real-mat', subjectColor: '#6F5AE8', subjectBg: '#EDE9FB',
      subjectIcon: null, title: 'Mat kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)

    pumpLatestSubscription()

    const id = syntheticIdFor('Bioloogia')
    await deleteSchoolSubject(id)
    pumpLatestSubscription()

    // Target gone.
    expect(fakeDb.has(schoolItemPath('lesson-lesson-bio-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('task-10'))).toBe(false)

    // Everything else survives, byte for byte.
    expect(fakeDb.has(schoolItemPath('lesson-lesson-geo-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-11'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('lesson-lesson-mat-real'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-12'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('subject-sub-real-mat'))).toBe(true)
    expect(getAllSchoolSubjects().some((s) => s.id === 'sub-real-mat')).toBe(true)
  })
})

// ── 5. cancellation deletes nothing ─────────────────────────────────────────

describe('5. cancellation deletes nothing', () => {
  it('never calling deleteSchoolSubject (the Cancel path) leaves the synthetic subject, its lesson, and its task completely intact', async () => {
    await addSchoolLesson({ id: 'lesson-füüsika-1', subject: 'Füüsika', dotColor: '#2563EB', cardBg: '#EFF6FF' } as never)
    await addSchoolTask({
      id: 20, subject: 'Füüsika', subjectColor: '#2563EB', subjectBg: '#EFF6FF', subjectIcon: null,
      title: 'Füüsika kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)
    pumpLatestSubscription()

    // Simulates clicking "Cancel" in the confirmation dialog: the modal's
    // onClick only does setConfirmDeleteSubjectId(null) — deleteSchoolSubject
    // is never called at all (see SchoolPage.tsx wiring test below).
    const beforeLessonCount = fakeDb.size

    expect(writeBatchMock).not.toHaveBeenCalled()
    expect(fakeDb.has(schoolItemPath('lesson-lesson-füüsika-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-20'))).toBe(true)
    expect(fakeDb.size).toBe(beforeLessonCount)
  })
})

// ── 6. failed batch commit preserves everything and the UI shows an error ──

describe('6. a failed batch commit preserves everything untouched', () => {
  it('a rejected commit leaves the lesson and task completely intact, and the rejection propagates for the UI to show an error', async () => {
    await addSchoolLesson({ id: 'lesson-ajalugu-1', subject: 'Ajalugu', dotColor: '#CA8A04', cardBg: '#FEF9C3' } as never)
    await addSchoolTask({
      id: 30, subject: 'Ajalugu', subjectColor: '#CA8A04', subjectBg: '#FEF9C3', subjectIcon: null,
      title: 'Essee', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)
    pumpLatestSubscription()

    const id = syntheticIdFor('Ajalugu')
    nextCommitError = new Error('simulated Firestore outage')
    await expect(deleteSchoolSubject(id)).rejects.toThrow('simulated Firestore outage')

    expect(fakeDb.has(schoolItemPath('lesson-lesson-ajalugu-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-30'))).toBe(true)

    simulatePageReload()
    const mergedAfter = mergeStoredAndLessonSubjects(currentLessonsFromFakeDb(), getAllSchoolSubjects())
    expect(mergedAfter.some((s) => s.name === 'Ajalugu')).toBe(true)
    expect(getAllSchoolTasks().some((t) => t.id === 30)).toBe(true)
  })

  it('SchoolPage.tsx wiring: the same catch block (toast.error + dialog stays open) handles this failure — no new error-handling path was added', () => {
    const SCHOOL_PAGE_SRC = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/views/SchoolPage.tsx'),
      'utf8',
    ) as string
    const fnBlock = SCHOOL_PAGE_SRC.match(/const confirmDeleteSubject = async \(id: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fnBlock).toMatch(/await storeDeleteSchoolSubject\(id\);/)
    expect(fnBlock).toMatch(/catch \{/)
    expect(fnBlock).toMatch(/toast\.error\(/)
    const catchBlock = fnBlock.match(/catch \{[\s\S]*?\n    \}/)?.[0] ?? ''
    expect(catchBlock).not.toMatch(/setConfirmDeleteSubjectId\(null\)/)
  })
})

// ── Confirmation text distinguishes the synthetic (lesson-removing) case ───

describe('the confirmation message states that lessons will also be deleted for a synthetic subject', () => {
  it('SchoolPage.tsx shows lesson+task wording for a non-real subject, distinct from the real-subject (tasks-only) wording', () => {
    const SCHOOL_PAGE_SRC = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/views/SchoolPage.tsx'),
      'utf8',
    ) as string
    expect(SCHOOL_PAGE_SRC).toMatch(/const isRealSubject = realSubjects\.some\(\(s\) => s\.id === confirmDeleteSubjectId\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/eemaldab kõik sellega seotud tunniplaani kirjed ja ülesanded/)
    expect(SCHOOL_PAGE_SRC).toMatch(/will remove every timetable lesson and task linked to it/)
  })
})

// ── Real (stored) subjects are unaffected by any of this ───────────────────

describe('a real stored subject never goes through the synthetic-cascade branch', () => {
  it('deleting a real subject with the same name as an unrelated synthetic one only ever deletes the real document + its own subjectId-linked tasks', async () => {
    await addSchoolSubject({ id: 'sub-real', name: 'Kirjandus', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolTask({
      id: 40, subject: 'Kirjandus', subjectId: 'sub-real', subjectColor: '#6F5AE8', subjectBg: '#EDE9FB',
      subjectIcon: null, title: 'Lugemine', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    } as never)
    pumpLatestSubscription()

    await deleteSchoolSubject('sub-real')

    expect(writeBatchDeleteMock).toHaveBeenCalledWith(schoolItemPath('subject-sub-real'))
    expect(writeBatchDeleteMock).toHaveBeenCalledWith(schoolItemPath('task-40'))
    // Never touches any lesson path — the real-subject branch never deletes lessons.
    expect(writeBatchDeleteMock.mock.calls.some(([p]) => (p as string).includes('/lesson-'))).toBe(false)
  })
})
