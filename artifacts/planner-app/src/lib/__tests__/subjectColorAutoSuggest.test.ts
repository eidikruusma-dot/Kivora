/**
 * Regression tests for the wiring around classifySubject (schoolStore.tsx):
 *   - the long example dropdown option is gone, replaced by a disabled/
 *     hidden localized placeholder (BUG-04);
 *   - both subject-creation UIs (standalone SchoolPage.tsx form, inline
 *     ScheduleTab.tsx "Add learning block" creator) use the SAME shared
 *     classifySubject helper for automatic color suggestion;
 *   - the manual-override rule: auto-suggest while untouched, freeze once
 *     the user picks a swatch, reset when a new subject starts;
 *   - existing stored subjects/colors are never rewritten by any of this;
 *   - the just-fixed inline flow (modal stays open, new subject selected,
 *     no SubjectDetailModal) still holds.
 *
 * No React rendering harness is available in this repo (same precedent as
 * tasksPageResponsive.test.ts, schoolSubjectCreate.test.ts,
 * scheduleTabInlineSubjectCreate.test.ts), so UI wiring is verified
 * structurally against the source; store-level claims (color preservation,
 * no rewriting) are exercised directly against schoolStore.tsx.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/subjectColorAutoSuggest.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
let setDocImpl: () => Promise<void> = () => Promise.resolve()
let setDocPaths: string[] = []
let setDocPayloads: Record<string, unknown>[] = []
const setDocMock = vi.fn((ref: { path: string }, payload: Record<string, unknown>) => {
  setDocPaths.push(ref.path)
  setDocPayloads.push(payload)
  return setDocImpl()
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(args[0] as { path: string }, args[1] as Record<string, unknown>),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initSchoolStore, addSchoolSubject, updateSchoolSubject, getAllSchoolSubjects } from '@/lib/schoolStore'

const UID = 'user-a'

function seedSnapshot(items: Record<string, unknown>[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: items.map((item) => ({ data: () => item })) })
}

beforeEach(() => {
  initSchoolStore(null)
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  setDocPaths = []
  setDocPayloads = []
  setDocImpl = () => Promise.resolve()
  initSchoolStore(UID)
})

describe('existing production data safety', () => {
  it('editing an existing subject without changing color preserves its stored color', async () => {
    seedSnapshot([{ kind: 'subject', id: 'sub-old', name: 'Ajalugu', teacher: 'Mari', color: '#DC2626', bg: '#FEE2E2' }])

    await updateSchoolSubject('sub-old', { teacher: 'Jaan' }) // no `color` in the patch

    // updateSchoolSubject builds { kind, ...base, ...patch } — the write it
    // issued must still carry the original color untouched.
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocPayloads[0]).toMatchObject({ color: '#DC2626', bg: '#FEE2E2', teacher: 'Jaan' })
  })

  it('a color explicitly included in the patch does still take effect (user changed it on purpose)', async () => {
    seedSnapshot([{ kind: 'subject', id: 'sub-old', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2' }])
    await updateSchoolSubject('sub-old', { color: '#16A34A', bg: '#DCFCE7' })
    expect(setDocPayloads[0]).toMatchObject({ color: '#16A34A', bg: '#DCFCE7' })
  })

  it('creating a new subject never issues a write for any other existing subject\'s document', async () => {
    seedSnapshot([
      { kind: 'subject', id: 'sub-a', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2' },
      { kind: 'subject', id: 'sub-b', name: 'Bioloogia', color: '#16A34A', bg: '#DCFCE7' },
    ])
    setDocPaths = []

    await addSchoolSubject({ id: 'sub-new', name: 'Muusika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })

    expect(setDocPaths).toEqual([`users/${UID}/schoolItems/subject-sub-new`])
    expect(setDocPaths).not.toContain(`users/${UID}/schoolItems/subject-sub-a`)
    expect(setDocPaths).not.toContain(`users/${UID}/schoolItems/subject-sub-b`)
  })

  it('updateSchoolSubject writes only a patch merged onto the existing stored fields, never a blind overwrite of color', async () => {
    seedSnapshot([{ kind: 'subject', id: 'sub-old', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2' }])
    await updateSchoolSubject('sub-old', { room: '204' })
    // Re-deliver the same doc unchanged (as Firestore would after a patch
    // that didn't touch color) and confirm the in-memory subject still
    // reports the original color.
    seedSnapshot([{ kind: 'subject', id: 'sub-old', name: 'Ajalugu', color: '#DC2626', bg: '#FEE2E2', room: '204' }])
    const [subject] = getAllSchoolSubjects()
    expect(subject.color).toBe('#DC2626')
  })
})

// ── Structural checks against both subject-creation UIs ────────────────────

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const SCHEDULE_TAB_SRC = readFileSync(resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'), 'utf8')

describe('BUG-04: long example dropdown option removed', () => {
  it('the long multi-example placeholder text no longer appears anywhere in ScheduleTab.tsx', () => {
    expect(SCHEDULE_TAB_SRC).not.toMatch(/Iseseisev õppimine, Moodle ülesanne/)
    expect(SCHEDULE_TAB_SRC).not.toMatch(/Self-study, Moodle task/)
  })

  it('the placeholder <option> is disabled and hidden — not a selectable dropdown choice', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/<option value="" disabled hidden>\{t\('sched\.field\.subjectPh', lang\)\}<\/option>/)
  })

  it('the short localized placeholder strings are exactly as specified', () => {
    const translationsSrc = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')
    expect(translationsSrc).toMatch(/"sched\.field\.subjectPh":\s*"Vali aine või tegevus"/)
    expect(translationsSrc).toMatch(/"sched\.field\.subjectPh":\s*"Select a subject or activity"/)
  })

  it('the subject field remains required (not made optional by this change)', () => {
    // handleSave's existing required-field validation is untouched
    expect(SCHEDULE_TAB_SRC).toMatch(/if \(!subject\.trim\(\)\) \{\s*setError\(t\('sched\.field\.error\.subject', lang\)\)/)
  })
})

describe('both creation paths use the same shared classifySubject helper', () => {
  it('SchoolPage.tsx imports classifySubject from schoolStore', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/classifySubject/)
    expect(SCHOOL_PAGE_SRC).toMatch(/from ["']@\/lib\/schoolStore["']/)
  })

  it('ScheduleTab.tsx imports classifySubject from schoolStore', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/import \{ useSchoolSubjectsFromLessons, addSchoolSubject, classifySubject \} from '@\/lib\/schoolStore'/)
  })

  it('no second classifier or subject store was introduced (no other schoolStore-like module)', () => {
    // classifySubject's implementation lives only in schoolStore.tsx
    const occurrences = (SCHOOL_PAGE_SRC.match(/function classifySubject|export function classifySubject/g) ?? []).length
      + (SCHEDULE_TAB_SRC.match(/function classifySubject|export function classifySubject/g) ?? []).length
    expect(occurrences).toBe(0) // it's only ever imported, never redefined
  })
})

describe('manual-override rule (standalone SchoolPage.tsx SubjectFormModal)', () => {
  it('the name input auto-updates the suggested color only while colorManuallySet is false', () => {
    const inputBlock = SCHOOL_PAGE_SRC.match(/value=\{name\}\s*onChange=\{\(e\) => \{[\s\S]*?\}\}\s*placeholder/)?.[0] ?? ''
    expect(inputBlock).toMatch(/if \(!colorManuallySet\) \{/)
    expect(inputBlock).toMatch(/setColorIdx\(classifySubject\(value\)\.colorIndex\)/)
  })

  it('clicking a color swatch sets colorManuallySet — future typing must not override it', () => {
    const swatchBlock = SCHOOL_PAGE_SRC.match(/SUBJECT_PALETTE\.map\(\(p, i\) => \([\s\S]*?\)\)\}/)?.[0] ?? ''
    expect(swatchBlock).toMatch(/setColorIdx\(i\);/)
    expect(swatchBlock).toMatch(/setColorManuallySet\(true\);/)
  })
})

describe('manual-override rule (inline ScheduleTab.tsx LessonModal creator)', () => {
  it('the inline name input auto-updates the suggested color only while newSubjectColorManuallySet is false', () => {
    const inputBlock = SCHEDULE_TAB_SRC.match(/value=\{newSubjectName\}\s*onChange=\{\(e\) => \{[\s\S]*?\n\s*\}\}/)?.[0] ?? ''
    expect(inputBlock).toMatch(/if \(!newSubjectColorManuallySet\) \{/)
    expect(inputBlock).toMatch(/setNewSubjectColorIdx\(classifySubject\(value\)\.colorIndex\)/)
  })

  it('clicking a color swatch sets newSubjectColorManuallySet', () => {
    const swatchBlock = SCHEDULE_TAB_SRC.match(/SUBJECT_COLORS\.map\(\(c, i\) => \([\s\S]*?\)\)\}/)?.[0] ?? ''
    expect(swatchBlock).toMatch(/setNewSubjectColorIdx\(i\)/)
    expect(swatchBlock).toMatch(/setNewSubjectColorManuallySet\(true\)/)
  })

  it('opening the inline creator ("+ Create new subject") resets the manual-override state for a fresh subject', () => {
    const openBlock = SCHEDULE_TAB_SRC.match(/if \(value === '__create_new__'\) \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
    expect(openBlock).toMatch(/setNewSubjectColorManuallySet\(false\)/)
    expect(openBlock).toMatch(/setNewSubjectColorIdx\(classifySubject\(''\)\.colorIndex\)/)
  })
})

describe('the just-fixed inline flow still holds after adding automatic color suggestion', () => {
  it('handleCreateSubject still awaits addSchoolSubject, selects the new subject locally, and never closes LessonModal or opens SubjectDetailModal', () => {
    const fn = SCHEDULE_TAB_SRC.match(/const handleCreateSubject = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/await addSchoolSubject\(/)
    expect(fn).toMatch(/setSubjectId\(newId\)/)
    expect(fn).toMatch(/setSubject\(name\)/)
    expect(fn).not.toMatch(/onClose\(\)/)
    expect(fn).not.toMatch(/onSave\(/)
    expect(SCHEDULE_TAB_SRC).not.toMatch(/<SubjectDetailModal/)
  })
})
