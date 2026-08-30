// @vitest-environment jsdom
/**
 * The "Lisa õppimisblokk / Muuda õppimisblokki" learning-block modal
 * (LessonModal, ScheduleTab.tsx) sourced its subject <select> options from
 * useSchoolSubjectsFromLessons() — documented as the "single source of
 * truth for School subject selectors" (schoolStore.tsx). That hook merges
 * real stored Subject documents with subjects SYNTHESIZED from any
 * lesson.subject string that has no matching stored document
 * (mergeStoredAndLessonSubjects, for legacy pre-subject-store timetables).
 *
 * deleteSchoolSubject() only deletes the subject document — it never
 * touches lessons that reference it. So once a subject was deleted, every
 * existing lesson still referencing its name/id kept synthesizing a
 * "ghost" entry for it via that same merge, and LessonModal kept offering
 * it as a selectable choice for NEW or edited learning blocks forever.
 *
 * Fix: LessonModal now sources its subjects from useSchoolSubjects()
 * instead — the plain, real-time list of currently-stored subject
 * documents only, with no lesson-derived synthesis. This is an existing
 * hook already used elsewhere in schoolStore.tsx (Ained management),
 * reused as-is — no new store, no new merge logic. The outer ScheduleTab
 * component (which renders existing lesson cards and needs a deleted
 * subject's name/color to still resolve for historical display) keeps
 * using useSchoolSubjectsFromLessons() completely unchanged, as does
 * mergeStoredAndLessonSubjects itself and every other call site
 * (SchoolPage.tsx's task/exam/overview flows).
 *
 * LessonModal's initialSubjectId/subject/subjectId state is seeded
 * directly from the lesson's own stored fields (lesson.subjectId,
 * lesson.subject), never solely from a match against the current
 * `subjects` list — so a lesson already referencing a deleted subject
 * still loads, displays, and saves its other fields correctly; only a
 * fresh pick of that deleted subject (for this or any other block) is no
 * longer offered.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolLearningBlockSubjectDropdownExcludesDeleted.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)

function lessonModalSource(): string {
  const match = SCHEDULE_TAB_SRC.match(/function LessonModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── Structural: which hook each component uses ──────────────────────────────

describe('LessonModal sources its subject dropdown from current subjects only', () => {
  it('imports both hooks, and LessonModal itself calls useSchoolSubjects (not useSchoolSubjectsFromLessons)', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(
      /import \{ useSchoolSubjectsFromLessons, useSchoolSubjects, addSchoolSubject, classifySubject \} from '@\/lib\/schoolStore'/,
    )
    const src = lessonModalSource()
    expect(src).toMatch(/const subjects = useSchoolSubjects\(\)/)
    expect(src).not.toMatch(/= useSchoolSubjectsFromLessons\(\)/)
  })

  it('the <select> still maps over `subjects` — current subjects remain selectable, unchanged markup', () => {
    const src = lessonModalSource()
    expect(src).toMatch(/\{subjects\.map\(\(s\) => \(/)
    expect(src).toMatch(/<option key=\{s\.id\} value=\{s\.id\}>\{s\.name\}<\/option>/)
  })
})

describe('unrelated School subject sources are untouched', () => {
  it('ScheduleTab (the outer component rendering existing lesson cards) still uses useSchoolSubjectsFromLessons', () => {
    const outerBlock = SCHEDULE_TAB_SRC.match(/export default function ScheduleTab\([\s\S]*?const subjects = (\w+)\(\)/)
    expect(outerBlock).not.toBeNull()
    expect(outerBlock![1]).toBe('useSchoolSubjectsFromLessons')
  })
})

describe('a lesson referencing a deleted subject still loads and saves safely', () => {
  it('initialSubjectId is seeded from the lesson\'s own stored subjectId, not solely from a match in `subjects`', () => {
    const src = lessonModalSource()
    expect(src).toMatch(
      /const initialSubjectId =\s*\n\s*lesson\?\.subjectId \?\?\s*\n\s*subjects\.find\(\(s\) => s\.name === lesson\?\.subject\)\?\.id \?\?\s*\n\s*''/,
    )
  })

  it('subject text state is seeded from lesson.subject directly, independent of the subjects list', () => {
    const src = lessonModalSource()
    expect(src).toMatch(/const \[subject, setSubject\] = useState\(lesson\?\.subject \?\? ''\)/)
  })

  it('save falls back to the lesson\'s own stored color when no current subject matches', () => {
    const src = lessonModalSource()
    const saveBlock = src.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(saveBlock).toMatch(/\} else if \(lesson\) \{\s*\n\s*dotColor = lesson\.dotColor\s*\n\s*cardBg = lesson\.cardBg/)
  })
})

// ── Behavioral: real schoolStore functions against a mocked Firestore ──────

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

import { renderHook, act } from '@testing-library/react'
import {
  initSchoolStore,
  addSchoolSubject,
  deleteSchoolSubject,
  addSchoolLesson,
  useSchoolSubjects,
  useSchoolSubjectsFromLessons,
  useSchoolLessons,
} from '@/lib/schoolStore'

function pumpSchool() {
  act(() => {
    const onNext = onSnapshotMock.mock.calls[0][1]
    const docs = [...fakeDb.entries()]
      .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
      .map(([, data]) => ({ data: () => data }))
    onNext({ docs })
  })
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  initSchoolStore(UID)
  pumpSchool()
})

describe('deleted subject is absent from the (fixed) learning-block dropdown source', () => {
  it('useSchoolSubjects no longer lists a subject after it is deleted, even though a lesson still references it', async () => {
    await addSchoolSubject({ id: 'sub-1', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    pumpSchool()
    await addSchoolLesson({
      id: 'lesson-1', subject: 'Ajalugu', subjectId: 'sub-1',
      dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    pumpSchool()

    const { result: dropdownSource } = renderHook(() => useSchoolSubjects())
    expect(dropdownSource.current.map((s) => s.name)).toContain('Ajalugu')

    await deleteSchoolSubject('sub-1')
    pumpSchool()

    expect(dropdownSource.current.map((s) => s.name)).not.toContain('Ajalugu')
    expect(dropdownSource.current.find((s) => s.id === 'sub-1')).toBeUndefined()
  })
})

describe('current subjects remain selectable', () => {
  it('a subject that was not deleted still appears in useSchoolSubjects after an unrelated subject is deleted', async () => {
    await addSchoolSubject({ id: 'sub-1', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    await addSchoolSubject({ id: 'sub-2', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    pumpSchool()

    const { result: dropdownSource } = renderHook(() => useSchoolSubjects())
    await deleteSchoolSubject('sub-1')
    pumpSchool()

    const names = dropdownSource.current.map((s) => s.name)
    expect(names).not.toContain('Ajalugu')
    expect(names).toContain('Matemaatika')
  })
})

describe('an existing block referencing a deleted subject is displayed/edited safely without corrupting its data', () => {
  it('the lesson document itself keeps its original subject/subjectId after the subject is deleted', async () => {
    await addSchoolSubject({ id: 'sub-1', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    pumpSchool()
    await addSchoolLesson({
      id: 'lesson-1', subject: 'Ajalugu', subjectId: 'sub-1', day: 'Esmaspäev',
      startTime: '10:00', endTime: '10:45', dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    pumpSchool()

    await deleteSchoolSubject('sub-1')
    pumpSchool()

    const { result: lessons } = renderHook(() => useSchoolLessons())
    const lesson = lessons.current.find((l) => l.id === 'lesson-1')
    expect(lesson).toBeDefined()
    expect(lesson?.subject).toBe('Ajalugu')
    expect(lesson?.subjectId).toBe('sub-1')
    expect(lesson?.day).toBe('Esmaspäev')
    expect(lesson?.dotColor).toBe('#CA8A04')
  })
})

describe('unrelated School dropdowns (lesson-derived merge) remain unchanged', () => {
  it('useSchoolSubjectsFromLessons still resurrects the deleted subject as a lesson-derived entry — untouched behavior for display', async () => {
    await addSchoolSubject({ id: 'sub-1', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    pumpSchool()
    await addSchoolLesson({
      id: 'lesson-1', subject: 'Ajalugu', subjectId: 'sub-1',
      dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    pumpSchool()

    const { result: legacyMergedSource } = renderHook(() => useSchoolSubjectsFromLessons())
    await deleteSchoolSubject('sub-1')
    pumpSchool()

    // Deliberately unchanged: this hook (used for existing-lesson display
    // elsewhere in School, not for the fixed dropdown) still shows it.
    expect(legacyMergedSource.current.map((s) => s.name)).toContain('Ajalugu')
  })
})
