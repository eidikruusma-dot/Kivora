// @vitest-environment jsdom
/**
 * School UX fix — the "Muuda kirjet / Edit entry" learning-block modal
 * (LessonModal, ScheduleTab.tsx) gains a Hindamine / Assessment multiline
 * textarea below its existing subject/dates/room/teacher fields.
 *
 * The assessment belongs to the LEARNING BLOCK being edited (ScheduleLesson),
 * not to the Subject: `assessment?: string` is added to ScheduleLesson
 * (ScheduleTab.tsx) and its schoolStore.tsx mirrors (SchoolLesson,
 * StoredLesson). addSchoolLesson/updateSchoolLesson/storedToLesson needed
 * zero body changes — same generic pass-through + sanitizeForFirestore
 * undefined-stripping pattern already used for Subject.assessment
 * (School change #12A) and every other optional field in this store.
 *
 * IMPORTANT — inspected but NOT removed: Subject already has its own
 * `assessment?: string` field (School changes #12A/#12B), editable via
 * SubjectDetailModal's inline editor and the Subject edit form. That field
 * is now a DIFFERENT, PARALLEL concept from this one: Subject-level
 * assessment describes the whole course generally, while this new
 * per-learning-block field can differ across a subject's several lessons/
 * blocks (e.g. two weekly slots, or several e-learning blocks for the same
 * subject) — they are not merged, synced, or deduplicated by this change,
 * per the requirement not to blindly duplicate assessment data between the
 * two. Whether Subject-level assessment is now redundant given this
 * lesson-level field is a product decision flagged in the commit message,
 * not resolved here — nothing was removed.
 *
 * No React rendering harness is available in this repo for ScheduleTab.tsx
 * (see scheduleTabInlineSubjectCreate.test.ts for the established
 * precedent), so:
 *   - persistence/multiline/back-compat are proven by exercising the REAL
 *     schoolStore functions (addSchoolLesson/updateSchoolLesson) against a
 *     mocked Firestore with the REAL sanitizeForFirestore;
 *   - the UI wiring (pre-fill, save payload, placement) is proven
 *     structurally against the source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabLearningBlockAssessment.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')

function lessonModalSource(): string {
  const match = SCHEDULE_TAB_SRC.match(/function LessonModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── Structural: data model gains assessment?: string only ──────────────────

describe('ScheduleLesson / SchoolLesson / StoredLesson gain assessment?: string only', () => {
  it('ScheduleTab.tsx: ScheduleLesson declares assessment?: string', () => {
    const block = SCHEDULE_TAB_SRC.match(/export interface ScheduleLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/assessment\?:\s*string/)
  })

  it('schoolStore.tsx: SchoolLesson and StoredLesson both declare assessment?: string', () => {
    const schoolLessonBlock = SCHOOL_STORE_SRC.match(/export interface SchoolLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedLessonBlock = SCHOOL_STORE_SRC.match(/interface StoredLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(schoolLessonBlock).toMatch(/assessment\?:\s*string/)
    expect(storedLessonBlock).toMatch(/assessment\?:\s*string/)
  })

  it('addSchoolLesson/updateSchoolLesson/storedToLesson function bodies are unchanged — no special-casing for assessment', () => {
    const addBlock = SCHOOL_STORE_SRC.match(/export async function addSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    const updateBlock = SCHOOL_STORE_SRC.match(/export async function updateSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    const storedToLessonBlock = SCHOOL_STORE_SRC.match(/function storedToLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(addBlock).not.toMatch(/assessment/)
    expect(updateBlock).not.toMatch(/assessment/)
    expect(storedToLessonBlock).not.toMatch(/assessment/)
  })
})

// ── UI wiring (structural) ──────────────────────────────────────────────────

describe('LessonModal: assessment field pre-fill, placement, and save payload', () => {
  const src = lessonModalSource()

  it('pre-fills from the existing lesson\'s assessment when editing', () => {
    expect(src).toMatch(/const \[assessment, setAssessment\] = useState\(lesson\?\.assessment \?\? ''\);?/)
  })

  it('renders a multiline textarea labeled Hindamine/Assessment, placed after the room/teacher grid', () => {
    const roomTeacherIdx = src.indexOf("t('sched.field.teacher'")
    const assessmentLabelIdx = src.indexOf("t('sched.field.assessment'")
    const textareaIdx = src.indexOf('<textarea')
    expect(roomTeacherIdx).toBeGreaterThan(-1)
    expect(assessmentLabelIdx).toBeGreaterThan(roomTeacherIdx)
    expect(textareaIdx).toBeGreaterThan(assessmentLabelIdx)
    expect(src).toMatch(/<textarea[\s\S]*?value=\{assessment\}/)
  })

  it('is an always-optional field, regardless of traditional vs. flexible mode', () => {
    const fieldBlock = src.match(/<label[^>]*>\s*\{t\('sched\.field\.assessment', lang\)\}[\s\S]*?<\/label>/)?.[0] ?? ''
    expect(fieldBlock).toMatch(/\{optional\}/)
  })

  it('saving includes assessment in the lesson payload, trimmed to undefined when blank', () => {
    const saveBlock = src.match(/await onSave\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(saveBlock).toMatch(/assessment: assessment\.trim\(\) \|\| undefined,/)
  })

  it('does not touch the other existing fields\' save logic (room/teacher/day/dates unchanged)', () => {
    const saveBlock = src.match(/await onSave\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(saveBlock).toMatch(/room: room \|\| undefined,/)
    expect(saveBlock).toMatch(/teacher: teacher \|\| undefined,/)
  })
})

// ── Persistence, multiline, and back-compat — real store + real sanitizer ──

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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: vi.fn(),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

// Real sanitizeForFirestore (not the identity mock some sibling tests use)
// so field-removal-on-clear is actually exercised.

import { renderHook, act } from '@testing-library/react'
import { initSchoolStore, addSchoolLesson, updateSchoolLesson, useSchoolLessons } from '@/lib/schoolStore'

// schoolStore.tsx has no synchronous getAllSchoolLessons getter (unlike
// tasks/exams/subjects), so lessons are read back the same way
// aiTasksPlansHookEquivalence.test.tsx reads other stores without one: via
// the real useSchoolLessons() hook through renderHook/act.
function pumpSchool() {
  act(() => {
    const onNext = onSnapshotMock.mock.calls[0][1]
    const docs = [...fakeDb.entries()]
      .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
      .map(([, data]) => ({ data: () => data }))
    onNext({ docs })
  })
}

const MULTILINE_ASSESSMENT = [
  '07.09 – Kursust sissejuhatav test',
  '13.09 – Õppimiseks mõeldud test nr 1',
  '20.09 – Õppimiseks mõeldud test nr 2',
  'Õppimiseks mõeldud testides vähemalt 75%.',
].join('\n')

function baseLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
    dotColor: '#DC2626', cardBg: '#FEE2E2',
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('create: a new learning block with assessment persists it verbatim', () => {
  it('addSchoolLesson with assessment set stores it, multiline preserved', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ assessment: MULTILINE_ASSESSMENT }) as never)
    pumpSchool()

    const stored = fakeDb.get(schoolItemPath('lesson-lesson-1')) as Record<string, unknown>
    expect(stored.assessment).toBe(MULTILINE_ASSESSMENT)
    const loaded = result.current.find((l) => l.id === 'lesson-1')
    expect(loaded?.assessment).toBe(MULTILINE_ASSESSMENT)
    expect(loaded?.assessment?.split('\n')).toHaveLength(4)
  })
})

describe('load/edit: existing assessment loads for editing and can be changed', () => {
  it('updateSchoolLesson changes an existing block\'s assessment', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson() as never)
    pumpSchool()
    expect(result.current.find((l) => l.id === 'lesson-1')?.assessment).toBeUndefined()

    await updateSchoolLesson('lesson-1', { assessment: MULTILINE_ASSESSMENT })
    pumpSchool()

    expect(result.current.find((l) => l.id === 'lesson-1')?.assessment).toBe(MULTILINE_ASSESSMENT)
  })
})

describe('clear: saving an empty assessment removes the field entirely', () => {
  it('updateSchoolLesson with assessment: undefined strips the key from the stored document', async () => {
    await addSchoolLesson(baseLesson({ assessment: 'Something' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-1', { assessment: undefined })

    const stored = fakeDb.get(schoolItemPath('lesson-lesson-1')) as Record<string, unknown>
    expect('assessment' in stored).toBe(false)
  })
})

describe('backward compatibility: existing learning blocks without assessment remain compatible', () => {
  it('a lesson document with no assessment key at all loads fine, other fields intact', () => {
    const { result } = renderHook(() => useSchoolLessons())
    fakeDb.set(schoolItemPath('lesson-legacy-1'), {
      kind: 'lesson', id: 'legacy-1', subject: 'Matemaatika', day: 'Teisipäev',
      startTime: '09:00', endTime: '09:45', room: '204', teacher: 'Mari Maasikas',
      dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'legacy-1')
    expect(lesson).toBeDefined()
    expect(lesson?.assessment).toBeUndefined()
    expect(lesson?.subject).toBe('Matemaatika')
    expect(lesson?.room).toBe('204')
    expect(lesson?.teacher).toBe('Mari Maasikas')
  })

  it('editing other fields on a legacy lesson (no assessment) leaves assessment absent, not null/empty', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ id: 'lesson-2', room: '101' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-2', { room: '305' })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'lesson-2')
    expect(lesson?.room).toBe('305')
    expect(lesson?.assessment).toBeUndefined()
    const stored = fakeDb.get(schoolItemPath('lesson-lesson-2')) as Record<string, unknown>
    expect('assessment' in stored).toBe(false)
  })
})

describe('an assessment-only edit leaves every other learning-block field untouched', () => {
  it('updating only assessment does not change subject/day/time/room/teacher', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ room: '101', teacher: 'Jaan Tamm' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-1', { assessment: 'Uus hindamiskord' })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'lesson-1')
    expect(lesson?.subject).toBe('Ajalugu')
    expect(lesson?.day).toBe('Esmaspäev')
    expect(lesson?.startTime).toBe('10:00')
    expect(lesson?.endTime).toBe('10:45')
    expect(lesson?.room).toBe('101')
    expect(lesson?.teacher).toBe('Jaan Tamm')
    expect(lesson?.assessment).toBe('Uus hindamiskord')
  })
})

describe('Subject-level assessment (#12A/#12B) and learning-block-level assessment are independent, not synced', () => {
  it('a Subject document\'s own assessment field is untouched by a lesson-level assessment update', async () => {
    fakeDb.set(`users/${UID}/schoolItems/subject-sub-1`, {
      kind: 'subject', id: 'sub-1', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2',
      assessment: 'Subject-level assessment text',
    })
    await addSchoolLesson(baseLesson({ subjectId: 'sub-1' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-1', { assessment: 'Lesson-level assessment text' })
    pumpSchool()

    const subjectDoc = fakeDb.get(`users/${UID}/schoolItems/subject-sub-1`) as Record<string, unknown>
    expect(subjectDoc.assessment).toBe('Subject-level assessment text')
    const lessonDoc = fakeDb.get(schoolItemPath('lesson-lesson-1')) as Record<string, unknown>
    expect(lessonDoc.assessment).toBe('Lesson-level assessment text')
  })
})
