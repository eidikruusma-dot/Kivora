// @vitest-environment jsdom
/**
 * Real production discrepancy: on a real, up-to-date deployment, the
 * Study plan (Õppimisplaan / ScheduleTab in elearning mode) showed only 4
 * subject cards after "Kirjandus" was removed, yet "Lisa õppimisblokk"'s
 * subject selector still offered 5, including Kirjandus.
 *
 * Root cause, found by tracing the Study plan card's actual delete button
 * all the way to Firestore (not assumed): a Study plan card is a LESSON
 * (a learning block), not a Subject. Its delete button
 * (ScheduleTab.tsx's handleDelete -> onDelete prop) resolves, in
 * SchoolPage.tsx, to a function that only ever called
 * storeDeleteSchoolLesson(id) — removing that one lesson document. It
 * never touched the separate Subject document (schoolItems/subject-*)
 * that the lesson's `subject`/`subjectId` fields reference. If that
 * lesson was the subject's only remaining one, the Subject document kept
 * existing — so useSchoolSubjects() (the selector's real-subjects-only
 * source, correctly fixed by commit f56e8d7) correctly kept offering it,
 * even though the last Study plan card referencing it was gone.
 *
 * This explains why scheduleTabDeletedSubjectSelectorRuntime.test.tsx
 * (this session's earlier behavioral test) passed while the real UI flow
 * did not: that test called deleteSchoolSubject() directly, proving the
 * STORE's own subject-deletion path is correct — but it never exercised
 * the Study plan card's actual delete button, which is a DIFFERENT
 * action (delete-lesson) that never reaches deleteSchoolSubject at all.
 * Both facts are true and consistent: deleting a Subject correctly
 * excludes it (already proven); deleting a Study plan CARD never deleted
 * the Subject (the actual gap, fixed here).
 *
 * Fix (SchoolPage.tsx only — the one file that wires ScheduleTab's
 * onDelete prop): deleteLesson now checks, after removing the lesson,
 * whether any OTHER lesson (any subject, anywhere — not just the
 * currently visible list) still references the same subject
 * (by subjectId when present, else by name). If none does, the now-
 * orphaned real Subject document is also deleted via the existing,
 * unmodified deleteSchoolSubject. If another lesson still references the
 * subject, nothing beyond the one deleted lesson is touched — no other
 * lesson, historical or otherwise, is ever read, modified, or deleted.
 * The Ained tab's own subject-delete flow (deleteSubject/
 * confirmDeleteSubject) is completely untouched. No schema change, no
 * name-specific check, no second subject system — this reuses the exact
 * same deleteSchoolSubject/useSchoolSubjects the selector already
 * depends on.
 *
 * This test renders the ACTUAL SchoolPage component (not just source
 * text or an isolated ScheduleTab), seeds real Subject and Lesson
 * documents via the real schoolStore against a mocked Firestore, and
 * drives the exact same UI the real user does: click the Study plan
 * card's trash icon, confirm the inline "Kustuta" prompt, then open
 * "Lisa õppimisblokk" and read the real rendered <option> list.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolStudyPlanDeleteOrphansSubject.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SchoolPage from '@/views/SchoolPage'

afterEach(cleanup)

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))

// jsdom doesn't implement scrollIntoView — SchoolPage's tab-strip effect
// and School's own mobile-tab-visibility effect both call it on mount.
Element.prototype.scrollIntoView = vi.fn()

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
  getAllSchoolSubjects,
} from '@/lib/schoolStore'

function pumpSchool() {
  act(() => {
    const call = onSnapshotMock.mock.calls.find(([, onNext]) => typeof onNext === 'function')
    const onNext = call?.[1]
    const docs = [...fakeDb.entries()]
      .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
      .map(([, data]) => ({ data: () => data }))
    onNext?.({ docs })
  })
}

function renderSchoolPage() {
  return render(
    <MemoryRouter initialEntries={['/app/school']}>
      <SchoolPage />
    </MemoryRouter>,
  )
}

/** Switches to the "Tunniplaan" (schedule / Study plan) tab, the real
 * navigation path to the Study plan cards. */
function openScheduleTab() {
  fireEvent.click(screen.getByText('Tunniplaan'))
}

/**
 * Every Study plan (Tunniplaan tab) lesson card renders the subject name
 * too, but so does the always-visible "Today's timetable" sidebar widget
 * (TodaySchedule, SchoolPage.tsx) — it's rendered on every tab, not just
 * Tunniplaan, and independently shows any lesson whose date range covers
 * the current real date. A plain document-wide `getByText`/`getAllByText`
 * for a subject name can therefore also match that sidebar's own read-only
 * card whenever a fixture's lesson dates happen to include "today" (as
 * they legitimately can, this file's fixtures start on 2026-09-01) — that
 * is correct, unrelated UI, not a Study plan card, and not a regression.
 *
 * A genuine Study plan card is always a clickable `.rounded-xl` element
 * (it carries `cursor-pointer`, the same class its own trash-icon click
 * handler depends on); TodaySchedule's cards never do. Filtering on that
 * distinction — rather than counting/matching raw text anywhere in the
 * document — is what actually targets "the Study plan cards for this
 * subject", robustly, regardless of what date the suite runs on.
 */
function studyPlanCardMatches(subjectName: string): HTMLElement[] {
  return screen
    .getAllByText(subjectName)
    .map((el) => el.closest('.rounded-xl.cursor-pointer'))
    .filter((el): el is HTMLElement => el !== null)
}

/** When multiple cards share a subject name (two lessons for the same
 * subject), returns the first — deleting it is enough to exercise the
 * "still referenced elsewhere" branch. */
function studyPlanCardFor(subjectName: string): HTMLElement {
  return studyPlanCardMatches(subjectName)[0]
}

/** Clicks a Study plan card's own trash icon, then confirms the inline
 * "Kustuta" prompt it reveals — the exact two-step delete flow a real
 * user performs (ScheduleTab.tsx's confirmDeleteId + handleDelete). */
function deleteStudyPlanCard(subjectName: string) {
  const card = studyPlanCardFor(subjectName)
  const trashBtn = card.querySelector('svg.lucide-trash-2')?.closest('button') as HTMLButtonElement
  fireEvent.click(trashBtn)
  const confirmBtn = within(card).getByText('Kustuta')
  fireEvent.click(confirmBtn)
}

function openSubjectSelector(): HTMLSelectElement {
  fireEvent.click(screen.getByRole('button', { name: 'Lisa õppimisblokk' }))
  return screen.getByRole('combobox') as HTMLSelectElement
}

/** Closes the "Lisa õppimisblokk" modal via its header X button — found by
 * its distinctive lucide-x icon, since it (like several Study plan card
 * icon buttons already on screen) has no accessible name. */
function closeSubjectModal() {
  const closeBtn = document.querySelector('svg.lucide-x')?.closest('button') as HTMLButtonElement
  fireEvent.click(closeBtn)
}

function optionTexts(select: HTMLSelectElement): string[] {
  return [...select.options].map((o) => o.textContent ?? '')
}

beforeEach(() => {
  localStorage.setItem('kivora_schedule_mode', 'elearning')
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('deleting the only Study plan card for a subject also removes it from future learning-block choices', () => {
  it('reproduces the real production flow: card disappears, subject no longer selectable, historical lessons preserved', async () => {
    await addSchoolSubject({ id: 'sub-ajalugu', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    await addSchoolSubject({ id: 'sub-inglise', name: 'Inglise keel', color: '#2563EB', bg: '#EFF6FF', icon: null })
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    await addSchoolLesson({
      id: 'lesson-ajalugu', subject: 'Ajalugu', subjectId: 'sub-ajalugu',
      startDate: '2026-09-01', endDate: '2026-09-05', dotColor: '#CA8A04', cardBg: '#FEF9C3',
    } as never)
    await addSchoolLesson({
      id: 'lesson-inglise', subject: 'Inglise keel', subjectId: 'sub-inglise',
      startDate: '2026-09-01', endDate: '2026-09-05', dotColor: '#2563EB', cardBg: '#EFF6FF',
    } as never)
    await addSchoolLesson({
      id: 'lesson-kirjandus', subject: 'Kirjandus', subjectId: 'sub-kirjandus',
      startDate: '2026-09-01', endDate: '2026-09-05', dotColor: '#DC2626', cardBg: '#FFF1F2',
    } as never)
    pumpSchool()

    renderSchoolPage()
    openScheduleTab()

    // Confirmed present before deletion, exactly like the real device.
    // (A plain getByText('Kirjandus') would also match the always-visible
    // "Today's timetable" sidebar card whenever a lesson's date range
    // happens to cover the current real date — see studyPlanCardMatches.)
    expect(studyPlanCardMatches('Kirjandus').length).toBeGreaterThan(0)
    let select = openSubjectSelector()
    expect(optionTexts(select)).toContain('Kirjandus')
    closeSubjectModal()

    // The exact real UI flow: click the Study plan card's own delete
    // control, not deleteSchoolSubject directly.
    deleteStudyPlanCard('Kirjandus')

    // Both the lesson doc and the now-orphaned subject doc are removed via
    // deleteDoc (deleteSchoolLesson/deleteSchoolSubject both use deleteDoc,
    // never setDoc).
    await vi.waitFor(() => {
      const paths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
      expect(paths).toContain(schoolItemPath('lesson-lesson-kirjandus'))
      expect(paths).toContain(schoolItemPath('subject-sub-kirjandus'))
    })
    pumpSchool()

    // The card is gone from the Study plan.
    expect(screen.queryByText('Kirjandus')).toBeNull()

    // It must also now be gone from the real subjects store...
    expect(getAllSchoolSubjects().some((s) => s.name === 'Kirjandus')).toBe(false)
    // ...and therefore absent from "Lisa õppimisblokk" too — the actual
    // reported production symptom, now fixed.
    select = openSubjectSelector()
    const options = optionTexts(select)
    expect(options).not.toContain('Kirjandus')
    expect(options).toContain('Ajalugu')
    expect(options).toContain('Inglise keel')
    expect(options).toContain('+ Lisa uus aine')

    // Other subjects' lessons and documents (historical data) are
    // completely untouched.
    expect(fakeDb.get(schoolItemPath('lesson-lesson-ajalugu'))).toBeDefined()
    expect(fakeDb.get(schoolItemPath('lesson-lesson-inglise'))).toBeDefined()
    expect(fakeDb.get(schoolItemPath('subject-sub-ajalugu'))).toBeDefined()
    expect(fakeDb.get(schoolItemPath('subject-sub-inglise'))).toBeDefined()
  })
})

describe('a subject with another remaining Study plan card is never removed', () => {
  it('deleting one of two lessons for the same subject keeps the subject (and the other lesson) intact', async () => {
    await addSchoolSubject({ id: 'sub-mat', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolLesson({
      id: 'lesson-mat-1', subject: 'Matemaatika', subjectId: 'sub-mat',
      startDate: '2026-09-01', endDate: '2026-09-02', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    await addSchoolLesson({
      id: 'lesson-mat-2', subject: 'Matemaatika', subjectId: 'sub-mat',
      startDate: '2026-09-08', endDate: '2026-09-09', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    pumpSchool()

    renderSchoolPage()
    openScheduleTab()

    // Two Study plan cards specifically — not a count of every element in
    // the document that happens to say "Matemaatika" (see
    // studyPlanCardMatches: the always-visible "Today's timetable"
    // sidebar can independently show one of the same two lessons whenever
    // its date range covers the current real date).
    const matCards = studyPlanCardMatches('Matemaatika')
    expect(matCards.length).toBe(2)

    deleteStudyPlanCard('Matemaatika') // deletes the first match's card

    await vi.waitFor(() => {
      const paths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
      expect(paths.some((p) => p.startsWith('users/user-a/schoolItems/lesson-'))).toBe(true)
    })
    pumpSchool()

    // Exactly one lesson document remains; the subject document was never
    // deleted (no deleteDoc call for its path) because the other lesson
    // still references it.
    const remainingLessons = [...fakeDb.keys()].filter((k) => k.includes('/lesson-lesson-mat-'))
    expect(remainingLessons.length).toBe(1)
    const deletedPaths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect(deletedPaths).not.toContain(schoolItemPath('subject-sub-mat'))
    expect(fakeDb.get(schoolItemPath('subject-sub-mat'))).toBeDefined()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Matemaatika')).toBe(true)

    const select = openSubjectSelector()
    expect(optionTexts(select)).toContain('Matemaatika')
  })
})

describe('the Ained tab\'s own subject-delete flow is untouched', () => {
  it('deleteSchoolSubject still exists and is not called by the Study plan card path for a still-referenced subject', async () => {
    await addSchoolSubject({ id: 'sub-bio', name: 'Bioloogia', color: '#16A34A', bg: '#DCFCE7', icon: null })
    await addSchoolLesson({
      id: 'lesson-bio-1', subject: 'Bioloogia', subjectId: 'sub-bio',
      startDate: '2026-09-01', endDate: '2026-09-02', dotColor: '#16A34A', cardBg: '#DCFCE7',
    } as never)
    await addSchoolLesson({
      id: 'lesson-bio-2', subject: 'Bioloogia', subjectId: 'sub-bio',
      startDate: '2026-09-08', endDate: '2026-09-09', dotColor: '#16A34A', cardBg: '#DCFCE7',
    } as never)
    pumpSchool()
    deleteDocMock.mockClear()

    renderSchoolPage()
    openScheduleTab()
    deleteStudyPlanCard('Bioloogia')

    await vi.waitFor(() => {
      expect(deleteDocMock).toHaveBeenCalled() // the lesson delete
    })
    pumpSchool()

    // deleteDoc was called for the lesson, but never for the subject's own
    // path — confirming deleteSchoolSubject (the Ained tab's own delete
    // function, reused here only for the orphan case) was not invoked for
    // a subject that still has another referencing lesson.
    const deletedPaths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect(deletedPaths).not.toContain(schoolItemPath('subject-sub-bio'))
    expect(getAllSchoolSubjects().some((s) => s.name === 'Bioloogia')).toBe(true)
  })
})
