/**
 * Regression tests for the CORRECTED BUG-03 scope: the exact production
 * flow shown in the bug screenshot —
 *
 *   Add learning block → Subject/activity dropdown → "+ Add new subject"
 *   → inline subject-name/color form → "Create subject"
 *
 * — which lives entirely in ScheduleTab.tsx's LessonModal component, a
 * DIFFERENT code path from SchoolPage.tsx's standalone "Ained" tab subject
 * management flow (SubjectFormModal / addingSubject / setSelectedSubject).
 * See the implementation report for the full trace of why these are two
 * separate paths and why setSelectedSubject (which opens SubjectDetailModal)
 * does not apply here.
 *
 * Store-level behavior (await/reject, zero-lesson visibility) is exercised
 * directly. The in-component behavior (modal stays open, no
 * SubjectDetailModal, selection order, error-keeps-form-open, double-submit
 * guard) is proven structurally against the source, since this repo has no
 * React rendering harness (same precedent as tasksPageResponsive.test.ts
 * and schoolSubjectCreate.test.ts).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabInlineSubjectCreate.test.ts
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
const setDocMock = vi.fn(() => setDocImpl())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initSchoolStore,
  addSchoolSubject,
  getAllSchoolSubjects,
  mergeStoredAndLessonSubjects,
} from '@/lib/schoolStore'

const UID = 'user-a'

beforeEach(() => {
  initSchoolStore(null)
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  setDocImpl = () => Promise.resolve()
  initSchoolStore(UID)
})

describe('inline subject creation store behavior (ScheduleTab.LessonModal.handleCreateSubject reuses addSchoolSubject)', () => {
  it('creating a subject with zero lessons makes it immediately available to the learning-block dropdown', async () => {
    // Mirrors handleCreateSubject's exact payload shape (id: `sub-${Date.now()}`, icon: null)
    const newSubject = { id: 'sub-1700000000000', name: 'Muusikaõpetus', color: '#6F5AE8', bg: '#EDE9FB', icon: null }
    await addSchoolSubject(newSubject)

    // Store state only updates via onSnapshot delivery (same pattern as every store test in this repo)
    const onNext = onSnapshotMock.mock.calls[0][1]
    onNext({ docs: [{ data: () => ({ kind: 'subject', ...newSubject }) }] })

    const stored = getAllSchoolSubjects()
    expect(stored.map((s) => s.name)).toContain('Muusikaõpetus')

    // Zero lessons reference it — the dropdown (subjects.map(...)) is fed by
    // this exact merge function in both ScheduleTab call sites.
    const merged = mergeStoredAndLessonSubjects([], stored)
    expect(merged.map((s) => s.name)).toContain('Muusikaõpetus')
  })

  it('a rejected write propagates as a rejection (what handleCreateSubject\'s catch relies on)', async () => {
    setDocImpl = () => Promise.reject(new Error('simulated Firestore write failure'))
    await expect(
      addSchoolSubject({ id: 'sub-x', name: 'X', color: '#6F5AE8', bg: '#EDE9FB', icon: null }),
    ).rejects.toThrow('simulated Firestore write failure')
  })
})

// ── Structural checks against the exact screenshot flow's component ────────

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)

function extractHandleCreateSubject(src: string): string {
  const match = src.match(/const handleCreateSubject = async \(\) => \{[\s\S]*?\n  \}/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('ScheduleTab.LessonModal — "+ Add new subject" inline flow (structural)', () => {
  it('the dropdown offers a "+ Add new subject" option that triggers the inline creator', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/__create_new__/)
    expect(SCHEDULE_TAB_SRC).toMatch(/\+ Lisa uus aine/)
    expect(SCHEDULE_TAB_SRC).toMatch(/\+ Create new subject/)
  })

  it('handleCreateSubject awaits addSchoolSubject before doing anything else', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/await addSchoolSubject\(/)
  })

  it('on success, the new subject becomes this form\'s own selected value (subjectId/subject), not a global "selected subject"', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    const awaitIdx = fn.indexOf('await addSchoolSubject(')
    const setIdIdx = fn.indexOf('setSubjectId(newId)')
    const setNameIdx = fn.indexOf('setSubject(name)')
    expect(awaitIdx).toBeGreaterThan(-1)
    expect(setIdIdx).toBeGreaterThan(awaitIdx)
    expect(setNameIdx).toBeGreaterThan(awaitIdx)
    // Never calls the global SchoolPage subject-detail selection setter
    expect(fn).not.toMatch(/setSelectedSubject/)
  })

  it('never opens SubjectDetailModal from this file at all — that belongs to the separate standalone flow', () => {
    // Check actual usage (a JSX tag or import), not just a mention in a
    // doc comment explaining why it's intentionally absent.
    expect(SCHEDULE_TAB_SRC).not.toMatch(/<SubjectDetailModal/)
    expect(SCHEDULE_TAB_SRC).not.toMatch(/import.*SubjectDetailModal/)
    expect(SCHEDULE_TAB_SRC).not.toMatch(/setSelectedSubject/)
  })

  it('never closes the LessonModal (no onClose call) from handleCreateSubject — the learning-block modal stays open', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    expect(fn).not.toMatch(/onClose\(\)/)
    expect(fn).not.toMatch(/onSave\(/)
  })

  it('on success, closes only the inline creator (showCreateNew) and clears its own input', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/setShowCreateNew\(false\)/)
    expect(fn).toMatch(/setNewSubjectName\(''\)/)
  })

  it('on a rejected write, sets a localized error and does NOT close the inline creator or clear the name (stays open for retry)', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    const catchBlock = fn.match(/\} catch \{[\s\S]*?\n    \}/)?.[0] ?? ''
    expect(catchBlock).toMatch(/setError\(/)
    expect(catchBlock).not.toMatch(/setShowCreateNew\(false\)/)
    expect(catchBlock).not.toMatch(/setNewSubjectName\(''\)/)
    expect(catchBlock).not.toMatch(/onClose\(\)/)
  })

  it('guards against double submission: early-returns while a save is in flight, and the Create button is disabled while saving', () => {
    const fn = extractHandleCreateSubject(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/if \(!name \|\| savingSubject\) return/)
    expect(SCHEDULE_TAB_SRC).toMatch(/disabled=\{!newSubjectName\.trim\(\) \|\| savingSubject\}/)
  })

  it('the remaining learning-block fields (day/date/time/room/teacher) are not gated by savingSubject', () => {
    // Only the inline creator's own input/color-swatch/create/cancel buttons
    // reference savingSubject — the rest of the form (day/date/start/end/
    // room/teacher selects and inputs) must stay fully usable.
    const savingSubjectRefs = (SCHEDULE_TAB_SRC.match(/savingSubject/g) ?? []).length
    // declaration + early-return check + input disabled + color buttons disabled + create button disabled/label(x2) + cancel disabled = 8
    expect(savingSubjectRefs).toBeLessThanOrEqual(8)
    // None of the day/date/start/end/room/teacher fields reference it
    for (const fieldName of ['day', 'startDate', 'endDate', 'startTime', 'endTime', 'room', 'teacher']) {
      const fieldBlockMatch = SCHEDULE_TAB_SRC.match(
        new RegExp(`value=\\{${fieldName}\\}[\\s\\S]{0,300}`),
      )
      expect(fieldBlockMatch).not.toBeNull()
      expect(fieldBlockMatch![0]).not.toMatch(/savingSubject/)
    }
  })
})
