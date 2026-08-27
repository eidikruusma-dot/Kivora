/**
 * Regression tests for a live bug: clicking "Uus kalender" / "New calendar"
 * in the Calendar page's + dropdown did nothing. CalendarHeader.tsx already
 * called the onNewCalendar prop correctly — CalendarPage.tsx's
 * handleNewCalendar was just an empty stub ("Future feature: open calendar
 * creation modal"), so the click had no effect.
 *
 * Fix: a real calendar-creation flow, reusing existing patterns rather than
 * inventing new ones:
 *   - userCalendarsStore.ts — a Firestore-backed pub/sub store for
 *     user-created calendar *definitions* (name + color), following the
 *     exact same module shape as calendarStore.ts (which stores calendar
 *     *events*, a different concern) and tasksStore.ts. Persisted under
 *     users/{uid}/calendars, so a created calendar survives a refresh via
 *     the same onSnapshot-driven re-hydration every other store in this app
 *     uses.
 *   - NewCalendarModal.tsx — a name field + a color-swatch picker reusing
 *     the exact same supported palette as the existing habit-color picker
 *     (HabitsPage.tsx's COLOR_OPTIONS), following the same dialog structure
 *     (role="dialog", aria-modal, Escape-to-close, backdrop-click-to-close,
 *     Cancel/Save footer) as the existing NewEventModal.tsx.
 *   - CalendarPage.tsx: handleNewCalendar now opens NewCalendarModal instead
 *     of doing nothing; saving calls addUserCalendar (the store's own
 *     action) and the new calendar is merged into CALENDARS, which
 *     MyCalendars.tsx already renders under "Minu kalendrid" — no new
 *     sidebar/list code needed, and no second creation modal or store was
 *     added anywhere.
 *
 * The store half is verified functionally against a mocked Firestore (same
 * harness pattern as taskCalendarAllDayLinking.test.ts / taskDeleteCascade
 * .test.ts). The component wiring has no React rendering harness in this
 * repo, so it's verified structurally against component source, consistent
 * with every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/calendarCreationFlow.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Store half: fake Firestore, same shape as the other store tests ────────

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

const {
  initUserCalendarsStore,
  addUserCalendar,
  getAllUserCalendars,
} = await import('@/lib/userCalendarsStore')

const UID = 'user-a'

function seed(calendars: { id: string; label: string; color: string }[]) {
  const lastCall = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1]
  const onNext = lastCall[1]
  onNext({ docs: calendars.map((c) => ({ data: () => c })) })
}

beforeEach(() => {
  initUserCalendarsStore(null)
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  unsubscribeMock.mockClear()
  initUserCalendarsStore(UID)
})

describe('userCalendarsStore — saving uses a real, persisted store action', () => {
  it('addUserCalendar writes the new calendar to users/{uid}/calendars/{id}', async () => {
    await addUserCalendar({ id: 'cal-123', label: 'Hobid', color: '#16A34A' })
    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [docRef, data] = setDocMock.mock.calls[0]
    expect((docRef as { path: string }).path).toBe(`users/${UID}/calendars/cal-123`)
    expect(data).toEqual({ id: 'cal-123', label: 'Hobid', color: '#16A34A' })
  })

  it('rejects when no user is signed in, instead of silently discarding the calendar', async () => {
    initUserCalendarsStore(null)
    await expect(addUserCalendar({ id: 'cal-x', label: 'X', color: '#000' })).rejects.toThrow(
      /STORE_NOT_INITIALIZED/,
    )
  })
})

describe('the new calendar appears immediately, driven by the store\'s own live listener', () => {
  it('getAllUserCalendars reflects the onSnapshot payload as soon as it fires', () => {
    expect(getAllUserCalendars()).toEqual([])
    seed([{ id: 'cal-123', label: 'Hobid', color: '#16A34A' }])
    expect(getAllUserCalendars()).toEqual([{ id: 'cal-123', label: 'Hobid', color: '#16A34A' }])
  })
})

describe('the calendar remains present after refreshing the page', () => {
  it('re-initialising the store for the same uid (simulating a reload) re-hydrates from Firestore', () => {
    seed([{ id: 'cal-123', label: 'Hobid', color: '#16A34A' }])
    expect(getAllUserCalendars()).toHaveLength(1)

    // Simulate a page refresh: the store tears down and re-subscribes.
    initUserCalendarsStore(null)
    expect(getAllUserCalendars()).toEqual([])
    initUserCalendarsStore(UID)
    seed([{ id: 'cal-123', label: 'Hobid', color: '#16A34A' }])
    expect(getAllUserCalendars()).toEqual([{ id: 'cal-123', label: 'Hobid', color: '#16A34A' }])
  })
})

// ── Component wiring: verified structurally (no React rendering harness) ──

const CALENDAR_HEADER_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/CalendarHeader.tsx'),
  'utf8',
)
const CALENDAR_PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/CalendarPage.tsx'),
  'utf8',
)
const NEW_CALENDAR_MODAL_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/NewCalendarModal.tsx'),
  'utf8',
)
const MY_CALENDARS_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/MyCalendars.tsx'),
  'utf8',
)

describe('the broken dropdown action is fixed', () => {
  it('CalendarHeader\'s "Uus kalender" item still calls onNewCalendar (unchanged, was never the bug)', () => {
    const item = CALENDAR_HEADER_SRC.match(/onClick=\{\(\) => \{ setMenuOpen\(false\); onNewCalendar\(\) \}\}[\s\S]{0,300}/)?.[0] ?? ''
    expect(item).not.toBe('')
    expect(item).toMatch(/cal\.newCalendar/)
  })

  it('CalendarPage.handleNewCalendar is no longer an empty stub — it opens the creation modal', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleNewCalendar = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\)/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).not.toMatch(/Future feature/)
    expect(fn).toMatch(/setCalendarModalOpen\(true\)/)
  })
})

describe('an existing creation flow is reused, not duplicated', () => {
  it('exactly one calendar-creation modal component exists and is rendered exactly once', () => {
    expect(CALENDAR_PAGE_SRC.match(/<NewCalendarModal/g)?.length).toBe(1)
  })

  it('saving delegates to the store\'s own addUserCalendar action, not a second/local persistence path', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleSaveCalendar = useCallback\(\(calendar: UserCalendar\) => \{[\s\S]*?\n  \}, \[\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/addUserCalendar\(calendar\)/)
  })

  it('CalendarPage imports the calendar-definitions store, distinct from the pre-existing calendar-events store', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/from '@\/lib\/userCalendarsStore'/)
    expect(CALENDAR_PAGE_SRC).toMatch(/from '@\/lib\/calendarStore'/)
  })
})

describe('the creation form: name + an existing supported color', () => {
  it('has a required name field', () => {
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/value=\{name\}/)
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/onChange=\{\(e\) => setName\(e\.target\.value\)\}/)
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/if \(!name\.trim\(\)\)/)
  })

  it('offers a swatch picker over the same supported palette used elsewhere in the app (habit colors)', () => {
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/CALENDAR_COLOR_OPTIONS = \[/)
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/'#6F5AE8'/)
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/CALENDAR_COLOR_OPTIONS\.map/)
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/onClick=\{\(\) => setColor\(c\)\}/)
  })

  it('handleSave builds a calendar from the entered name and chosen color and calls onSave exactly once', () => {
    const fn = NEW_CALENDAR_MODAL_SRC.match(/const handleSave = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    const calls = (fn.match(/onSave\(/g) ?? []).length
    expect(calls).toBe(1)
    expect(fn).toMatch(/label: name\.trim\(\)/)
    expect(fn).toMatch(/color,/)
    expect(fn).toMatch(/onClose\(\)/)
  })
})

describe('cancel and close create nothing', () => {
  it('the Cancel button only calls onClose, never onSave', () => {
    const cancelBlock = NEW_CALENDAR_MODAL_SRC.match(/onClick=\{onClose\}\s*\n\s*className="px-4 py-2 min-h-\[44px\] rounded-lg text-sm font-medium text-\[#64748B\][\s\S]{0,100}/)?.[0] ?? ''
    expect(cancelBlock).not.toBe('')
    expect(cancelBlock).not.toMatch(/onSave/)
  })

  it('the backdrop click closes without saving', () => {
    const backdrop = NEW_CALENDAR_MODAL_SRC.match(/onClick=\{onClose\}>/)?.[0] ?? ''
    expect(backdrop).not.toBe('')
  })

  it('Escape closes the modal without saving', () => {
    expect(NEW_CALENDAR_MODAL_SRC).toMatch(/e\.key === 'Escape'\) onClose\(\)/)
  })

  it('the modal resets its fields every time it opens, so a stale name/color can never leak into a later save', () => {
    const resetEffect = NEW_CALENDAR_MODAL_SRC.match(/useEffect\(\(\) => \{\s*\n\s*if \(open\) \{[\s\S]*?\n\s*\}\s*\n\s*\}, \[open\]\)/)?.[0] ?? ''
    expect(resetEffect).toMatch(/setName\(''\)/)
    expect(resetEffect).toMatch(/setError\(''\)/)
  })
})

describe('the new calendar immediately appears under "Minu kalendrid"', () => {
  it('CALENDARS merges the fixed built-in calendars with the live user-created ones', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const userCalendars = useUserCalendars\(\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/\.\.\.userCalendars,\s*\n\s*\]/)
  })

  it('MyCalendars (the "Minu kalendrid" sidebar list) is still fed the merged CALENDARS array, unchanged', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/<MyCalendars[\s\S]{0,120}calendars=\{CALENDARS\}/)
    expect(MY_CALENDARS_SRC).toMatch(/cal\.myCalendars/)
  })

  it('a newly-loaded or newly-created calendar defaults to visible without resetting existing toggles', () => {
    const effect = CALENDAR_PAGE_SRC.match(/useEffect\(\(\) => \{\s*\n\s*setVisibleCalendars\(\(prev\) => \{[\s\S]*?\n\s*\}, \[userCalendars\]\)/)?.[0] ?? ''
    expect(effect).not.toBe('')
    expect(effect).toMatch(/missing\.map\(\(c\) => \[c\.id, true\]\)/)
    expect(effect).toMatch(/\.\.\.prev,/)
  })
})

describe('"Uus sündmus" (new event) remains completely unchanged', () => {
  it('the dropdown\'s event item still calls onNewEvent, and the label key is untouched', () => {
    const item = CALENDAR_HEADER_SRC.match(/onClick=\{\(\) => \{ setMenuOpen\(false\); onNewEvent\(\) \}\}[\s\S]{0,300}/)?.[0] ?? ''
    expect(item).not.toBe('')
    expect(item).toMatch(/cal\.newEvent/)
  })

  it('CalendarPage still opens the pre-existing NewEventModal for event creation, and it is unrelated to the new calendar modal', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleNewEvent = useCallback\(\(\) => \{\s*\n\s*setEventModalOpen\(true\)\s*\n\s*\}, \[\]\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/<NewEventModal\s*\n\s*open=\{eventModalOpen\}/)
  })

  it('handleSaveEvent still adds the event via the existing calendar-events store, untouched by this fix', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleSaveEvent = useCallback\(\(event: MockCalendarEvent\) => \{[\s\S]*?\n  \}, \[lang\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/addCalendarEvent\(event\)/)
  })
})
