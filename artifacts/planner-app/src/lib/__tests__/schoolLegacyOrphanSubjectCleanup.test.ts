// @vitest-environment jsdom
/**
 * Legacy-data repair for orphan School Subject documents left behind by
 * the pre-afc03f7 Study plan delete behavior: deleting a lesson never
 * checked whether it was that subject's last remaining one, so the
 * subject's document could survive with zero referencing lessons —
 * absent from every Study plan card, yet still offered in
 * "Lisa õppimisblokk" (useSchoolSubjects, real subjects only).
 * afc03f7 stops this from happening to any *new* deletion (see
 * schoolStudyPlanDeleteOrphansSubject.test.tsx); this file covers the
 * separate, narrowly-scoped repair for subjects already orphaned this way
 * before afc03f7 shipped — findOrphanedSubjects (pure),
 * cleanupOrphanedLegacySubjects (the actual, idempotent repair), and
 * previewOrphanedSubjects (its read-only dry-run), all in schoolStore.tsx.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolLegacyOrphanSubjectCleanup.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import {
  initSchoolStore,
  addSchoolSubject,
  addSchoolLesson,
  deleteSchoolLesson,
  deleteSchoolSubject,
  getAllSchoolSubjects,
  findOrphanedSubjects,
  previewOrphanedSubjects,
  cleanupOrphanedLegacySubjects,
  type SchoolSubject,
  type SchoolLesson,
} from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function subject(overrides: Partial<SchoolSubject> = {}): SchoolSubject {
  return { id: 'sub-x', name: 'Aine', color: '#6F5AE8', bg: '#EDE9FB', icon: null, ...overrides }
}

function lesson(overrides: Partial<SchoolLesson> = {}): SchoolLesson {
  return { id: 'l-x', subject: 'Aine', dotColor: '#6F5AE8', cardBg: '#EDE9FB', ...overrides }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('findOrphanedSubjects (pure): an unreferenced legacy subject is identified as orphaned', () => {
  it('a subject with zero referencing lessons is orphaned', () => {
    const subjects = [subject({ id: 'sub-kirjandus', name: 'Kirjandus' })]
    const orphans = findOrphanedSubjects(subjects, [])
    expect(orphans.map((s) => s.id)).toEqual(['sub-kirjandus'])
  })

  it('identifies orphans among several subjects, leaving referenced ones out', () => {
    const subjects = [
      subject({ id: 'sub-a', name: 'Ajalugu' }),
      subject({ id: 'sub-b', name: 'Kirjandus' }), // orphaned
      subject({ id: 'sub-c', name: 'Matemaatika' }),
    ]
    const lessons = [
      lesson({ id: 'l1', subject: 'Ajalugu', subjectId: 'sub-a' }),
      lesson({ id: 'l2', subject: 'Matemaatika', subjectId: 'sub-c' }),
    ]
    const orphans = findOrphanedSubjects(subjects, lessons)
    expect(orphans.map((s) => s.name)).toEqual(['Kirjandus'])
  })
})

describe('findOrphanedSubjects (pure): a subject referenced by at least one lesson is never removed', () => {
  it('a subject matched by subjectId is not orphaned', () => {
    const subjects = [subject({ id: 'sub-a', name: 'Ajalugu' })]
    const lessons = [lesson({ id: 'l1', subject: 'Ajalugu', subjectId: 'sub-a' })]
    expect(findOrphanedSubjects(subjects, lessons)).toEqual([])
  })

  it('a subject matched only by name (legacy lesson with no subjectId) is not orphaned', () => {
    const subjects = [subject({ id: 'sub-a', name: 'Ajalugu' })]
    const lessons = [lesson({ id: 'l1', subject: 'Ajalugu' })] // no subjectId
    expect(findOrphanedSubjects(subjects, lessons)).toEqual([])
  })

  it('name matching is case-insensitive and trims whitespace, erring toward "referenced" not "orphaned"', () => {
    const subjects = [subject({ id: 'sub-a', name: 'Ajalugu' })]
    const lessons = [lesson({ id: 'l1', subject: '  AJALUGU  ' })]
    expect(findOrphanedSubjects(subjects, lessons)).toEqual([])
  })

  it('a subject referenced by only one of several lessons is not orphaned', () => {
    const subjects = [subject({ id: 'sub-a', name: 'Matemaatika' })]
    const lessons = [
      lesson({ id: 'l1', subject: 'Muusika' }),
      lesson({ id: 'l2', subject: 'Matemaatika', subjectId: 'sub-a' }),
    ]
    expect(findOrphanedSubjects(subjects, lessons)).toEqual([])
  })
})

describe('cleanupOrphanedLegacySubjects: the real, idempotent repair against the store', () => {
  it('deletes exactly the orphaned subject and leaves referenced ones and their lessons untouched', async () => {
    await addSchoolSubject({ id: 'sub-ajalugu', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    await addSchoolLesson({
      id: 'ajalugu-1', subject: 'Ajalugu', subjectId: 'sub-ajalugu',
      dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    // Kirjandus has NO lesson — reproducing the pre-afc03f7 legacy state
    // (its lesson was deleted by the old code, which never also deleted
    // the subject).
    pumpSchool()

    const deleted = await cleanupOrphanedLegacySubjects()

    expect(deleted.map((s) => s.name)).toEqual(['Kirjandus'])
    pumpSchool()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Kirjandus')).toBe(false)
    expect(getAllSchoolSubjects().some((s) => s.name === 'Ajalugu')).toBe(true)
    expect(fakeDb.get(schoolItemPath('subject-sub-ajalugu'))).toBeDefined()
    expect(fakeDb.get(schoolItemPath('lesson-ajalugu-1'))).toBeDefined()
  })

  it('running cleanup repeatedly is safe: the second run finds and deletes nothing', async () => {
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    pumpSchool()

    const firstRun = await cleanupOrphanedLegacySubjects()
    expect(firstRun.map((s) => s.name)).toEqual(['Kirjandus'])
    pumpSchool()
    deleteDocMock.mockClear()

    const secondRun = await cleanupOrphanedLegacySubjects()
    expect(secondRun).toEqual([])
    expect(deleteDocMock).not.toHaveBeenCalled()
  })

  it('does nothing when there are no orphans at all', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolLesson({
      id: 'mat-1', subject: 'Matemaatika', subjectId: 'sub-mat',
      dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    pumpSchool()

    const deleted = await cleanupOrphanedLegacySubjects()
    expect(deleted).toEqual([])
    expect(deleteDocMock).not.toHaveBeenCalled()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Matemaatika')).toBe(true)
  })
})

describe('previewOrphanedSubjects: read-only, never deletes', () => {
  it('reports the same subjects cleanup would delete, without deleting them', async () => {
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    pumpSchool()

    const preview = previewOrphanedSubjects()
    expect(preview.map((s) => s.name)).toEqual(['Kirjandus'])
    expect(deleteDocMock).not.toHaveBeenCalled()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Kirjandus')).toBe(true)
  })
})

describe('normal subject creation/deletion and the afc03f7 behavior remain intact', () => {
  it('addSchoolSubject/deleteSchoolSubject are unaffected by the new cleanup functions', async () => {
    await addSchoolSubject({ id: 'sub-new', name: 'Uus aine', color: '#2563EB', bg: '#EFF6FF', icon: null })
    pumpSchool()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Uus aine')).toBe(true)

    await deleteSchoolSubject('sub-new')
    pumpSchool()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Uus aine')).toBe(false)
  })

  it('deleting a still-referenced subject\'s lesson directly (bypassing the SchoolPage-level afc03f7 cleanup) leaves the subject exactly as findOrphanedSubjects would predict', async () => {
    await addSchoolSubject({ id: 'sub-bio', name: 'Bioloogia', color: '#16A34A', bg: '#DCFCE7', icon: null })
    await addSchoolLesson({
      id: 'bio-1', subject: 'Bioloogia', subjectId: 'sub-bio', dotColor: '#16A34A', cardBg: '#DCFCE7',
    } as never)
    pumpSchool()

    // deleteSchoolLesson itself (the store-level primitive afc03f7's
    // SchoolPage.tsx deleteLesson wraps) still only removes the lesson —
    // exactly the pre-afc03f7 behavior at the store level, which is why
    // the orphan-check has to live one layer up (SchoolPage.tsx) or, for
    // already-orphaned legacy data, in this repair. Calling it directly
    // here (without that wrapper) is expected to leave Bioloogia
    // orphaned — findOrphanedSubjects correctly reports it as such.
    await deleteSchoolLesson('bio-1')
    pumpSchool()

    expect(getAllSchoolSubjects().some((s) => s.name === 'Bioloogia')).toBe(true)
    expect(findOrphanedSubjects(getAllSchoolSubjects(), []).map((s) => s.name)).toContain('Bioloogia')
  })
})
