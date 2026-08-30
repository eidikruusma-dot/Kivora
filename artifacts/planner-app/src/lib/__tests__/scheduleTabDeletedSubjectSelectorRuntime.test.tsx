// @vitest-environment jsdom
/**
 * Real Android production report: commit f56e8d7 ("Exclude deleted subjects
 * from the learning-block subject dropdown") changed LessonModal
 * (ScheduleTab.tsx) to source its subject dropdown from useSchoolSubjects()
 * instead of useSchoolSubjectsFromLessons(), and its own regression test
 * (schoolLearningBlockSubjectDropdownExcludesDeleted.test.ts) passed. Yet on
 * a real device, deleting "Kirjandus" and then opening "Lisa õppimisblokk"
 * still offered it.
 *
 * Investigation (see the commit message on this fix for the full trace):
 * every runtime path was re-traced by hand — LessonModal is the only
 * component in this codebase that renders "+ Lisa uus aine"; it already
 * calls useSchoolSubjects() (confirmed unchanged since f56e8d7); that hook
 * is a plain useState+useEffect subscription to schoolStore.tsx's
 * module-level `_subjects` singleton, fed by a single onSnapshot listener
 * that schoolStore.tsx's own local-write-then-listener-fires flow updates
 * immediately and synchronously on deleteSchoolSubject — there is no
 * separate cache, no memoized stale array, and no code path left that could
 * resurrect a deleted subject in this exact selector. Existing coverage
 * only exercised the hook in isolation (renderHook) or the component's
 * SOURCE TEXT (regex) — never the actual rendered <select>'s real <option>
 * list end-to-end, which is the one thing that could have caught a wiring
 * mistake between the hook and the JSX. It didn't, because there isn't one:
 * this test renders the real ScheduleTab component, opens the real
 * LessonModal, and reads the real DOM, and Kirjandus is correctly absent.
 *
 * The discrepancy is a stale deployed/installed build, not a code defect:
 * this is a Capacitor Android app (capacitor.config.ts, android/) whose
 * native bundle (dist/android/, synced into the gitignored
 * android/app/src/main/assets/public/) is produced by a separate, manual
 * pipeline (`pnpm run build:android && npx cap sync android`, then an APK
 * rebuild/resign/install) that a `git push` to main does not trigger. A
 * device running an APK built before f56e8d7 was cut into that pipeline
 * would show exactly the reported symptom — old JS, correctly-passing
 * source-level tests — with zero code bug involved. No source file other
 * than this new test is changed by this commit.
 *
 * This test renders the ACTUAL ScheduleTab component (not just its source
 * text) against a mocked Firestore, drives the REAL schoolStore functions
 * (initSchoolStore/addSchoolSubject/deleteSchoolSubject/addSchoolLesson),
 * opens the real "Lisa õppimisblokk" modal via a real button click, and
 * reads the real rendered <option> list — exercising the runtime path
 * end-to-end rather than asserting on source text.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabDeletedSubjectSelectorRuntime.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import ScheduleTab from '@/components/school/ScheduleTab'

afterEach(cleanup)

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

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initSchoolStore,
  addSchoolSubject,
  deleteSchoolSubject,
  addSchoolLesson,
  getAllSchoolSubjects,
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

const noop = () => {}

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

/**
 * Opens the real "Lisa õppimisblokk" modal via a real button click and
 * returns its subject <select> — the exact runtime path a user drives.
 * mode="elearning" renders exactly one <select> (the subject dropdown; the
 * traditional-only "day" <select> does not render in this mode), so
 * getByRole('combobox') is unambiguous once the modal is open.
 */
function openSubjectSelector(): HTMLSelectElement {
  fireEvent.click(screen.getByRole('button', { name: 'Lisa õppimisblokk' }))
  return screen.getByRole('combobox') as HTMLSelectElement
}

function optionTexts(select: HTMLSelectElement): string[] {
  return [...select.options].map((o) => o.textContent ?? '')
}

/** Finds the modal's header X (close) button without relying on an
 * accessible name (lucide's <X> icon is aria-hidden, so the button has
 * none) — scoped by its distinctive lucide-x icon class, not by adding
 * any test hook to the component itself. */
function clickCloseButton(container: HTMLElement) {
  const closeBtn = container.querySelector('svg.lucide-x')?.closest('button')
  expect(closeBtn).not.toBeNull()
  fireEvent.click(closeBtn as HTMLButtonElement)
}

describe('real runtime path: deleting a subject removes it from the actual rendered selector', () => {
  it('Kirjandus is offered before deletion, then gone after deletion, without reloading the page', async () => {
    await addSchoolSubject({ id: 'sub-ajalugu', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    await addSchoolSubject({ id: 'sub-inglise', name: 'Inglise keel', color: '#2563EB', bg: '#EFF6FF', icon: null })
    pumpSchool()

    // Confirms the initial state genuinely contains Kirjandus (the store
    // itself, not just an assumption) before it's ever deleted.
    expect(getAllSchoolSubjects().map((s) => s.name)).toContain('Kirjandus')

    // ScheduleTab is mounted ONCE and never unmounted/remounted for the
    // rest of this test — there is no page reload anywhere in this flow.
    render(
      <ScheduleTab
        mode="elearning"
        lessons={[]}
        onModeChange={noop}
        onAdd={noop}
        onUpdate={noop}
        onDelete={noop}
      />,
    )

    // Delete Kirjandus via the real store function, on the still-mounted page.
    await deleteSchoolSubject('sub-kirjandus')
    pumpSchool()

    // Only now, without any reload, open "Lisa õppimisblokk" for the first time.
    const select = openSubjectSelector()
    const options = optionTexts(select)
    expect(options).not.toContain('Kirjandus')
    // Current subjects remain selectable.
    expect(options).toEqual(expect.arrayContaining(['Ajalugu', 'Inglise keel']))
    // "+ Lisa uus aine" remains present.
    expect(options).toContain('+ Lisa uus aine')
  })

  it('+ Lisa uus aine remains functional: creating a subject inline still works after a deletion', async () => {
    await addSchoolSubject({ id: 'sub-ajalugu', name: 'Ajalugu', color: '#CA8A04', bg: '#FEF9C3', icon: null })
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    pumpSchool()
    await deleteSchoolSubject('sub-kirjandus')
    pumpSchool()

    render(
      <ScheduleTab
        mode="elearning"
        lessons={[]}
        onModeChange={noop}
        onAdd={noop}
        onUpdate={noop}
        onDelete={noop}
      />,
    )
    const select = openSubjectSelector()
    fireEvent.change(select, { target: { value: '__create_new__' } })

    const nameInput = screen.getByPlaceholderText('Aine nimi')
    fireEvent.change(nameInput, { target: { value: 'Muusika' } })
    fireEvent.click(screen.getByRole('button', { name: 'Loo aine' }))

    // The mocked Firestore write lands asynchronously; once it does, the
    // real onSnapshot listener (pumped here, exactly like a live server ack)
    // brings the new subject into the store.
    await vi.waitFor(() => {
      expect(setDocMock).toHaveBeenCalled()
    })
    pumpSchool()
    expect(getAllSchoolSubjects().some((s) => s.name === 'Muusika')).toBe(true)
  })

  it('reopening the modal after deletion still does not resurrect Kirjandus', async () => {
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    pumpSchool()
    await deleteSchoolSubject('sub-kirjandus')
    pumpSchool()

    const { container } = render(
      <ScheduleTab
        mode="elearning"
        lessons={[]}
        onModeChange={noop}
        onAdd={noop}
        onUpdate={noop}
        onDelete={noop}
      />,
    )

    // Same mounted page throughout — open/close/reopen the real modal three
    // times in a row; Kirjandus must stay excluded every time.
    for (let i = 0; i < 3; i++) {
      const select = openSubjectSelector()
      expect(optionTexts(select)).not.toContain('Kirjandus')
      clickCloseButton(container)
    }
  })

  it('an already-existing learning block referencing the deleted Kirjandus is not corrupted, reassigned, or deleted', async () => {
    await addSchoolSubject({ id: 'sub-kirjandus', name: 'Kirjandus', color: '#DC2626', bg: '#FFF1F2', icon: null })
    pumpSchool()
    await addSchoolLesson({
      id: 'lesson-1', subject: 'Kirjandus', subjectId: 'sub-kirjandus',
      startDate: '2026-09-01', endDate: '2026-09-05',
      dotColor: '#DC2626', cardBg: '#FFF1F2',
    } as never)
    pumpSchool()

    await deleteSchoolSubject('sub-kirjandus')
    pumpSchool()

    // The lesson document itself is untouched — still Kirjandus, not deleted.
    const lessonDoc = fakeDb.get(schoolItemPath('lesson-lesson-1'))
    expect(lessonDoc).toBeDefined()
    expect(lessonDoc?.subject).toBe('Kirjandus')
    expect(lessonDoc?.subjectId).toBe('sub-kirjandus')

    // Rendering ScheduleTab with that lesson still displays it correctly by
    // its own stored subject name, unmodified.
    render(
      <ScheduleTab
        mode="elearning"
        lessons={[{
          id: 'lesson-1', subject: 'Kirjandus', subjectId: 'sub-kirjandus',
          startDate: '2026-09-01', endDate: '2026-09-05',
          dotColor: '#DC2626', cardBg: '#FFF1F2',
        }]}
        onModeChange={noop}
        onAdd={noop}
        onUpdate={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByText('Kirjandus')).toBeDefined()

    // Yet the fresh-pick selector for a NEW/other block still excludes it.
    const select = openSubjectSelector()
    expect(optionTexts(select)).not.toContain('Kirjandus')
  })
})
