/**
 * School change #12A — a free-text "Hindamine / Assessment" field on the
 * existing Subject document (`users/{uid}/schoolItems/subject-{id}`), per
 * the change #12 architecture inspection: no new Course entity, no new
 * collection, no structured assessment-item model — just one new optional
 * string field (`assessment?: string`) on SchoolSubject/StoredSubject
 * (schoolStore.tsx) and the page-local Subject type (SchoolPage.tsx),
 * persisted through the existing updateSchoolSubject(id, patch) function
 * with zero changes to that function's body (it already accepted a generic
 * Partial<Omit<SchoolSubject, 'icon'>> patch).
 *
 * Displayed/edited only in the existing SubjectDetailModal:
 *   - empty -> a "+ Add assessment" affordance (school.action.addAssessment)
 *     instead of a blank block;
 *   - present -> whitespace-pre-wrap text (multiline preserved) with an
 *     edit (pencil) affordance;
 *   - editing -> a textarea + Cancel/Save, reusing the existing generic
 *     school.action.save/cancel keys (no new action-label keys beyond the
 *     field label/placeholder/empty-state ones).
 * Local `assessment` state (not the `subject` prop) drives the display, so
 * Save reflects immediately without needing the live store round-trip —
 * matching this file's established pattern of a static per-open snapshot.
 *
 * Subject creation (SubjectFormModal), all other Subject fields, and every
 * other School surface (Tasks, Kontrolltööd, Eksamid, both History
 * sections, Calendar, AI, Settings, timetable) are untouched.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectCreate.test.ts for the established precedent), so:
 *   - persistence/multiline/compatibility are proven by exercising the REAL
 *     schoolStore functions (addSchoolSubject/updateSchoolSubject) against
 *     a mocked Firestore, using the REAL sanitizeForFirestore (not an
 *     identity mock) so field-removal-on-clear is actually verified;
 *   - the UI wiring is proven structurally against the source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectAssessment.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')

function subjectDetailModalSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function SubjectDetailModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── Structural: data model carries the new optional field only ─────────────

describe('SchoolSubject / StoredSubject / Subject gain assessment?: string only (no other field/shape change)', () => {
  it('schoolStore.tsx: SchoolSubject and StoredSubject both declare assessment?: string', () => {
    const schoolSubjectBlock = SCHOOL_STORE_SRC.match(/export interface SchoolSubject \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedSubjectBlock = SCHOOL_STORE_SRC.match(/interface StoredSubject \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(schoolSubjectBlock).toMatch(/assessment\?:\s*string/)
    expect(storedSubjectBlock).toMatch(/assessment\?:\s*string/)
  })

  it('SchoolPage.tsx: the page-local Subject interface also declares assessment?: string', () => {
    const subjectBlock = SCHOOL_PAGE_SRC.match(/interface Subject \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(subjectBlock).toMatch(/assessment\?:\s*string/)
  })

  it('addSchoolSubject/updateSchoolSubject/storedToSubject function bodies are unchanged — no special-casing for assessment', () => {
    expect(SCHOOL_STORE_SRC).toMatch(/export async function updateSchoolSubject\(\s*\n\s*id: string,\s*\n\s*patch: Partial<Omit<SchoolSubject, 'icon'>>,\s*\n\)/)
    const addSchoolSubjectBlock = SCHOOL_STORE_SRC.match(/export async function addSchoolSubject\([\s\S]*?\n\}/)?.[0] ?? ''
    const storedToSubjectBlock = SCHOOL_STORE_SRC.match(/function storedToSubject\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(addSchoolSubjectBlock).not.toMatch(/assessment/)
    expect(storedToSubjectBlock).not.toMatch(/assessment/)
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

// @/lib/firestoreUtils is intentionally NOT mocked in this file (unlike
// schoolSubjectCreate.test.ts's identity mock) — this file needs the REAL
// sanitizeForFirestore's undefined-stripping behavior to verify that
// clearing the field actually removes it from the stored document.

import { initSchoolStore, addSchoolSubject, updateSchoolSubject, getAllSchoolSubjects } from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

const MULTILINE_ASSESSMENT = [
  '07.09 – Kursust sissejuhatav test',
  '13.09 – Õppimiseks mõeldud test nr 1',
  '20.09 – Õppimiseks mõeldud test nr 2',
  'Õppimiseks mõeldud testides vähemalt 75%.',
].join('\n')

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('persistence: assessment is stored/read through the existing updateSchoolSubject flow', () => {
  it('addSchoolSubject with assessment set stores it verbatim', async () => {
    await addSchoolSubject({
      id: 'sub-1', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2', icon: null,
      assessment: MULTILINE_ASSESSMENT,
    })
    const stored = fakeDb.get(schoolItemPath('subject-sub-1')) as Record<string, unknown>
    expect(stored.assessment).toBe(MULTILINE_ASSESSMENT)
  })

  it('updateSchoolSubject adds assessment to an existing subject that was created without one', async () => {
    await addSchoolSubject({ id: 'sub-2', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    pumpSchool()
    expect(getAllSchoolSubjects().find((s) => s.id === 'sub-2')?.assessment).toBeUndefined()

    await updateSchoolSubject('sub-2', { assessment: MULTILINE_ASSESSMENT })
    pumpSchool()

    expect(getAllSchoolSubjects().find((s) => s.id === 'sub-2')?.assessment).toBe(MULTILINE_ASSESSMENT)
  })

  it('clearing the field (assessment: undefined) removes it from the stored document entirely', async () => {
    await addSchoolSubject({ id: 'sub-3', name: 'Eesti keel', color: '#16A34A', bg: '#DCFCE7', icon: null, assessment: 'Something' })
    pumpSchool()

    await updateSchoolSubject('sub-3', { assessment: undefined })

    const stored = fakeDb.get(schoolItemPath('subject-sub-3')) as Record<string, unknown>
    expect('assessment' in stored).toBe(false)
  })
})

describe('multiline display: line breaks survive a full write -> onSnapshot -> read round trip', () => {
  it('newlines in the stored value are preserved exactly, not collapsed or escaped', async () => {
    await addSchoolSubject({ id: 'sub-4', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2', icon: null, assessment: MULTILINE_ASSESSMENT })
    pumpSchool()

    const roundTripped = getAllSchoolSubjects().find((s) => s.id === 'sub-4')?.assessment
    expect(roundTripped).toBe(MULTILINE_ASSESSMENT)
    expect(roundTripped?.split('\n')).toHaveLength(4)
  })
})

describe('existing subjects without the field remain fully compatible', () => {
  it('a subject document with no assessment key at all loads with assessment undefined, other fields intact', () => {
    fakeDb.set(schoolItemPath('subject-legacy-1'), {
      kind: 'subject', id: 'legacy-1', name: 'Füüsika', teacher: 'Mari Maasikas', room: '204', color: '#2563EB', bg: '#EFF6FF',
    })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'legacy-1')
    expect(subject).toBeDefined()
    expect(subject?.assessment).toBeUndefined()
    expect(subject?.name).toBe('Füüsika')
    expect(subject?.teacher).toBe('Mari Maasikas')
    expect(subject?.room).toBe('204')
    expect(subject?.icon).toBeTruthy() // icon reconstruction still works
  })
})

describe('no changes to other Subject fields or behavior', () => {
  it('an assessment-only patch leaves name/teacher/room/color/bg untouched', async () => {
    await addSchoolSubject({
      id: 'sub-5', name: 'Bioloogia', teacher: 'Jaan Tamm', room: '101',
      color: '#16A34A', bg: '#DCFCE7', icon: null,
    })
    pumpSchool()

    await updateSchoolSubject('sub-5', { assessment: 'Uus hindamiskord' })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-5')
    expect(subject?.name).toBe('Bioloogia')
    expect(subject?.teacher).toBe('Jaan Tamm')
    expect(subject?.room).toBe('101')
    expect(subject?.color).toBe('#16A34A')
    expect(subject?.bg).toBe('#DCFCE7')
    expect(subject?.assessment).toBe('Uus hindamiskord')
  })

  it('a name/teacher/room patch with no assessment key leaves an existing assessment value untouched', async () => {
    await addSchoolSubject({
      id: 'sub-6', name: 'Keemia', color: '#CA8A04', bg: '#FEF9C3', icon: null,
      assessment: 'Algne hindamiskord',
    })
    pumpSchool()

    await updateSchoolSubject('sub-6', { teacher: 'Uus õpetaja' })
    pumpSchool()

    const subject = getAllSchoolSubjects().find((s) => s.id === 'sub-6')
    expect(subject?.teacher).toBe('Uus õpetaja')
    expect(subject?.assessment).toBe('Algne hindamiskord')
  })
})

// ── UI wiring (structural) ───────────────────────────────────────────────

describe('SubjectDetailModal: empty-state affordance, multiline display, and inline edit', () => {
  const src = subjectDetailModalSource()

  it('shows a "+ Add assessment" affordance instead of a blank block when there is no assessment text', () => {
    expect(src).toMatch(/\{tr\("school\.action\.addAssessment", lang\)\}/)
  })

  it('renders existing assessment text with whitespace-pre-wrap (multiline preserved)', () => {
    expect(src).toMatch(/whitespace-pre-wrap[^"]*"\s*>\s*\{assessment\}/)
  })

  it('editing uses a textarea bound to a local draft, with the existing generic Save/Cancel actions (no new action labels)', () => {
    expect(src).toMatch(/<textarea[\s\S]*?value=\{assessmentDraft\}/)
    expect(src).toMatch(/\{tr\("school\.action\.save", lang\)\}/)
    expect(src).toMatch(/\{tr\("school\.action\.cancel", lang\)\}/)
  })

  it('Save persists through the existing onSaveAssessment prop, and updates local state immediately (no dependency on a live store refresh)', () => {
    expect(src).toMatch(/onSaveAssessment\?\.\(subject\.id, next\)/)
    expect(src).toMatch(/setAssessment\(next\)/)
  })

  it('an empty/whitespace-only draft saves as undefined (clears the field), not an empty string', () => {
    expect(src).toMatch(/const next = assessmentDraft\.trim\(\) \|\| undefined;/)
  })

  it('Cancel discards the draft without saving', () => {
    const cancelBlock = src.match(/const cancelAssessmentEdit = \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? ''
    expect(cancelBlock).not.toMatch(/onSaveAssessment/)
    expect(cancelBlock).toMatch(/setEditingAssessment\(false\)/)
  })
})

describe('call site: onSaveAssessment reuses the existing updateSchoolSubject flow (no new persistence path)', () => {
  it('SchoolPage wires onSaveAssessment through updateSubject -> storeUpdateSchoolSubject (aliased updateSchoolSubject)', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/updateSchoolSubject as storeUpdateSchoolSubject/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const updateSubject = \(id: string, patch: Partial<Omit<Subject, "icon">>\) =>\s*\n\s*storeUpdateSchoolSubject\(id, patch\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/onSaveAssessment=\{\(id, assessment\) => updateSubject\(id, \{ assessment \}\)\}/)
  })
})

// ── Subject creation is untouched ───────────────────────────────────────────

describe('Subject creation (SubjectFormModal) is untouched by this change', () => {
  it('SubjectFormModal\'s onSave payload does not reference assessment', () => {
    const formModalBlock = SCHOOL_PAGE_SRC.match(/function SubjectFormModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    const onSaveCallBlock = formModalBlock.match(/await onSave\(\{[\s\S]*?\}\);/)?.[0] ?? ''
    expect(onSaveCallBlock).not.toMatch(/assessment/)
  })
})
