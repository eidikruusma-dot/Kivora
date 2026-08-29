/**
 * School change #12B — expose Subject's Hindamine/Assessment field in the
 * Subject edit flow.
 *
 * Architecture finding: change #12A added `assessment?: string` and an
 * inline editor for it inside SubjectDetailModal (view/quick-edit), but the
 * codebase had — and still has, for name/teacher/room — no separate
 * "edit an existing Subject" flow at all: SubjectFormModal was strictly
 * add-only (always generated a fresh id, always ran its duplicate-name
 * check against every subject including itself). That is the literal
 * "Subject edit/change flow" every other School entity already has
 * (TaskEditModal-equivalent, ExamFormModal/EksamFormModal's `exam?`-driven
 * add/edit mode) and Subject was missing — which is what left Assessment
 * out of "the normal edit flow" despite already working in the inline
 * editor.
 *
 * Fix: SubjectFormModal now accepts an optional `subject` prop. When
 * provided (`isEdit`), it:
 *   - pre-fills name/teacher/room/color from that subject, and Hindamine/
 *     Assessment from `subject.assessment` (rendered ONLY in edit mode, so
 *     the add form is visually/behaviorally unchanged);
 *   - excludes the subject being edited from its own duplicate-name check
 *     (previously would have false-positived on every edit that didn't
 *     rename the subject);
 *   - saves through the SAME existing updateSchoolSubject() flow
 *     (schoolStore.tsx), reusing the store's `updateSubject` wrapper that
 *     already backs SubjectDetailModal's inline editor — no new
 *     persistence path, no schema change.
 * SubjectDetailModal gained a new Edit button (mirroring ExamDetailModal's
 * Delete-left / Close+Edit-right footer layout) that opens this form
 * pre-filled; its own inline assessment editor (change #12A) is untouched
 * and still works independently — both edit surfaces exist side by side,
 * per the requirement not to remove the inline editor.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectAssessment.test.ts for the established precedent), so:
 *   - persistence/compatibility/other-fields-unchanged are proven by
 *     exercising the REAL schoolStore.updateSchoolSubject against a mocked
 *     Firestore with the REAL sanitizeForFirestore;
 *   - the UI wiring (pre-fill, edit-only assessment field, duplicate-name
 *     guard excluding self, the Edit button, the call site reusing
 *     updateSubject) is proven structurally.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectEditFlow.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function subjectFormModalSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function SubjectFormModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

function subjectDetailModalSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function SubjectDetailModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── 1. existing assessment loads into Subject edit (structural) ────────────

describe('1. SubjectFormModal pre-fills from the existing subject when editing', () => {
  const src = subjectFormModalSource()

  it('name/teacher/room/assessment are initialized from the subject prop', () => {
    expect(src).toMatch(/const \[name, setName\] = useState\(subject\?\.name \?\? ""\);/)
    expect(src).toMatch(/const \[teacher, setTeacher\] = useState\(subject\?\.teacher \?\? ""\);/)
    expect(src).toMatch(/const \[room, setRoom\] = useState\(subject\?\.room \?\? ""\);/)
    expect(src).toMatch(/const \[assessment, setAssessment\] = useState\(subject\?\.assessment \?\? ""\);/)
  })

  it('the color swatch pre-fills from the subject\'s existing color, falling back safely if no exact match is found', () => {
    expect(src).toMatch(/SUBJECT_PALETTE\.findIndex\(\(p\) => p\.color === subject\.color\)/)
    expect(src).toMatch(/return idx >= 0 \? idx : 0;/)
  })

  it('the assessment textarea is rendered only in edit mode (isEdit), leaving the add form unchanged', () => {
    expect(src).toMatch(/\{isEdit && \(/)
    const editOnlyBlock = src.match(/\{isEdit && \([\s\S]*?<textarea[\s\S]*?\/>\s*\n\s*<\/div>\s*\n\s*\)\}/)?.[0] ?? ''
    expect(editOnlyBlock).toMatch(/value=\{assessment\}/)
    expect(editOnlyBlock).toMatch(/tr\("school\.field\.assessment", lang\)/)
  })

  it('the modal title switches to the dedicated edit-subject label when editing', () => {
    expect(src).toMatch(/\{isEdit \? tr\("school\.modal\.editSubject", lang\) : tr\("school\.action\.addSubject", lang\)\}/)
  })
})

// ── existing edit/delete/close and duplicate-name guard fix ────────────────

describe('editing an existing subject does not false-positive its own name as a duplicate', () => {
  it('the duplicate-name check excludes the subject currently being edited', () => {
    const src = subjectFormModalSource()
    expect(src).toMatch(/s\.id !== subject\?\.id && s\.name\.toLowerCase\(\) === name\.trim\(\)\.toLowerCase\(\)/)
  })
})

describe('SubjectDetailModal: existing inline assessment editor (change #12A) is untouched, plus a new Edit action', () => {
  const src = subjectDetailModalSource()

  it('still has its own local assessment state and inline edit/save/cancel (unchanged from #12A)', () => {
    expect(src).toMatch(/const \[assessment, setAssessment\] = useState\(subject\.assessment\);/)
    expect(src).toMatch(/const \[editingAssessment, setEditingAssessment\] = useState\(false\);/)
    expect(src).toMatch(/startEditingAssessment/)
  })

  it('gained an Edit button in its footer that calls onEdit(subject), alongside the existing Close (not replacing it)', () => {
    expect(src).toMatch(/onEdit\(subject\)/)
    expect(src).toMatch(/\{tr\("school\.action\.edit", lang\)\}/)
    expect(src).toMatch(/onClick=\{onClose\}[\s\S]*?\{tr\("school\.action\.close", lang\)\}/)
  })

  it('Delete is still present and unchanged', () => {
    expect(src).toMatch(/onDelete\(subject\.id\)/)
  })
})

// ── Call site: reuses the existing updateSchoolSubject flow ────────────────

describe('the edit call site saves through the same existing updateSubject/updateSchoolSubject flow', () => {
  it('editingSubject state opens SubjectFormModal pre-filled, and onSave calls updateSubject (not a new persistence path)', () => {
    const callSiteMatch = SCHOOL_PAGE_SRC.match(/\{editingSubject && \([\s\S]*?<SubjectFormModal[\s\S]*?\n\s*\/>\n\s*\)\}/)
    expect(callSiteMatch).not.toBeNull()
    const callSite = callSiteMatch![0]
    expect(callSite).toMatch(/subject=\{editingSubject\}/)
    expect(callSite).toMatch(/await updateSubject\(subject\.id, \{/)
    expect(callSite).toMatch(/assessment: subject\.assessment,/)
  })

  it('SubjectDetailModal\'s onEdit hands off from view to edit (closes the detail modal, opens the edit form)', () => {
    const callSiteMatch = SCHOOL_PAGE_SRC.match(/<SubjectDetailModal[\s\S]*?\n {8}\/>/)
    expect(callSiteMatch).not.toBeNull()
    const callSite = callSiteMatch![0]
    expect(callSite).toMatch(/onEdit=\{\(s\) => \{\s*\n\s*setEditingSubject\(s\);\s*\n\s*setSelectedSubject\(null\);/)
  })
})

// ── Persistence, compatibility, and other-fields-unchanged (real store) ───

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

import { initSchoolStore, addSchoolSubject, updateSchoolSubject, getAllSchoolSubjects } from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
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

// This exercises exactly the payload shape the edit call site sends
// (name/teacher/room/color/bg/assessment as a single patch), through the
// same updateSchoolSubject function the inline editor already used.

describe('2. editing and saving through the edit-flow payload updates the existing subject', () => {
  it('a full edit-flow-shaped patch persists every field, including assessment', async () => {
    await addSchoolSubject({ id: 'sub-1', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2', icon: null })
    pumpSchool()

    await updateSchoolSubject('sub-1', {
      name: 'Ajalugu (uus)',
      teacher: 'Mari Maasikas',
      room: '204',
      color: '#DC2626',
      bg: '#FEE2E2',
      assessment: '07.09 – Kursust sissejuhatav test\n13.09 – test nr 1',
    })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-1')
    expect(subject?.name).toBe('Ajalugu (uus)')
    expect(subject?.teacher).toBe('Mari Maasikas')
    expect(subject?.room).toBe('204')
    expect(subject?.assessment).toBe('07.09 – Kursust sissejuhatav test\n13.09 – test nr 1')
  })
})

describe('3. subjects without an existing assessment remain compatible with the edit flow', () => {
  it('editing a subject that never had assessment set (undefined) works and can add one', async () => {
    await addSchoolSubject({ id: 'sub-2', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    pumpSchool()
    expect(getAllSchoolSubjects().find((s) => s.id === 'sub-2')?.assessment).toBeUndefined()

    // Same edit-flow patch shape, with assessment left unset (mirrors
    // saving the edit form without ever touching that field).
    await updateSchoolSubject('sub-2', {
      name: 'Matemaatika',
      teacher: undefined,
      room: undefined,
      color: '#6F5AE8',
      bg: '#EDE9FB',
      assessment: undefined,
    })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-2')
    expect(subject?.name).toBe('Matemaatika')
    expect(subject?.assessment).toBeUndefined()
    const stored = fakeDb.get(schoolItemPath('subject-sub-2')) as Record<string, unknown>
    expect('assessment' in stored).toBe(false)
  })

  it('a legacy subject document with no assessment key at all still loads and can be edited', async () => {
    fakeDb.set(schoolItemPath('subject-legacy-1'), {
      kind: 'subject', id: 'legacy-1', name: 'Füüsika', color: '#2563EB', bg: '#EFF6FF',
    })
    pumpSchool()
    expect(getAllSchoolSubjects().find((s) => s.id === 'legacy-1')?.assessment).toBeUndefined()

    await updateSchoolSubject('legacy-1', { assessment: 'Uus hindamiskord' })
    pumpSchool()

    expect(getAllSchoolSubjects().find((s) => s.id === 'legacy-1')?.assessment).toBe('Uus hindamiskord')
  })
})

describe('4. other Subject fields remain unchanged by an assessment-focused edit, and vice versa', () => {
  it('changing only assessment through the edit flow leaves name/teacher/room/color/bg untouched', async () => {
    await addSchoolSubject({
      id: 'sub-3', name: 'Bioloogia', teacher: 'Jaan Tamm', room: '101',
      color: '#16A34A', bg: '#DCFCE7', icon: null,
    })
    pumpSchool()

    await updateSchoolSubject('sub-3', { assessment: 'Uus hindamiskord' })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-3')
    expect(subject?.name).toBe('Bioloogia')
    expect(subject?.teacher).toBe('Jaan Tamm')
    expect(subject?.room).toBe('101')
    expect(subject?.color).toBe('#16A34A')
    expect(subject?.bg).toBe('#DCFCE7')
    expect(subject?.assessment).toBe('Uus hindamiskord')
  })

  it('changing name/teacher/room through the edit flow leaves an existing assessment value untouched', async () => {
    await addSchoolSubject({
      id: 'sub-4', name: 'Keemia', color: '#CA8A04', bg: '#FEF9C3', icon: null,
      assessment: 'Algne hindamiskord',
    })
    pumpSchool()

    await updateSchoolSubject('sub-4', { name: 'Keemia (edasijõudnud)', teacher: 'Uus õpetaja', room: '305' })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-4')
    expect(subject?.name).toBe('Keemia (edasijõudnud)')
    expect(subject?.teacher).toBe('Uus õpetaja')
    expect(subject?.room).toBe('305')
    expect(subject?.assessment).toBe('Algne hindamiskord')
  })
})
