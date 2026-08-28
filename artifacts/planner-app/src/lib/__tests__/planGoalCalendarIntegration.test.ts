/**
 * Regression tests for wiring dated Plans and dated Goals into Calendar
 * (CalendarPage.tsx, MonthView.tsx, DayPreview.tsx), and for confirming
 * this does not disturb the existing Task -> Calendar integration, manual
 * calendar events, or existing all-day/single-day rendering.
 *
 * See planGoalCalendarEvents.test.ts for the pure derivation-logic tests
 * (title/date sync, deletion, no-duplicates, progress/step isolation).
 * This file covers the merge-into-CalendarPage wiring, the multi-day
 * month/day-preview range rendering, and the "route to source module
 * instead of the normal edit/delete flow" click behavior for derived
 * entries — plus the non-regression checks.
 *
 * No React rendering harness exists in this repo, so the component wiring
 * is verified structurally against source, consistent with every other
 * regression test here (see calendarEventDeleteConfirmation.test.ts for
 * the exact precedent this mirrors).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/planGoalCalendarIntegration.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eventOccursOnDate, eventDateKeys, type MockCalendarEvent } from '@/lib/calendar/eventLayout'

const CALENDAR_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/CalendarPage.tsx'), 'utf8')
const MONTH_VIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/MonthView.tsx'), 'utf8')
const DAY_PREVIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/DayPreview.tsx'), 'utf8')
const WEEK_VIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/WeekView.tsx'), 'utf8')
const DAY_VIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/DayView.tsx'), 'utf8')
const EVENT_LAYOUT_SRC = readFileSync(resolve(process.cwd(), 'src/lib/calendar/eventLayout.ts'), 'utf8')
const AUTOMATIC_LINKING_SRC = readFileSync(resolve(process.cwd(), 'src/lib/automaticLinking.ts'), 'utf8')

function makeEvent(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return {
    id: 'e1',
    title: 'Test',
    startTime: '',
    endTime: '',
    color: '#6F5AE8',
    date: '2026-08-28',
    allDay: true,
    ...overrides,
  }
}

describe('CalendarPage: dated Plans/Goals are merged into the calendar without a second storage/sync system', () => {
  it('reuses the existing usePlans/useGoals hooks and the pure derivation module — no new Firestore collection', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/import \{ usePlans \} from '@\/lib\/plansStore'/)
    expect(CALENDAR_PAGE_SRC).toMatch(/import \{ useGoals \} from '@\/lib\/goalsStore'/)
    expect(CALENDAR_PAGE_SRC).toMatch(/import \{ getDerivedCalendarEvents \} from '@\/lib\/planGoalCalendarEvents'/)
  })

  it('derived events are recomputed from live plans/goals state (useMemo keyed on them), not stored separately', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const derivedEvents = useMemo\(\s*\n\s*\(\) => getDerivedCalendarEvents\(plans, goals\),\s*\n\s*\[plans, goals\],\s*\n\s*\)/)
    expect(fn).not.toBeNull()
  })

  it('derived events are merged with the real calendarStore events into one list feeding every view', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const allEvents = useMemo\(\(\) => \[\.\.\.events, \.\.\.derivedEvents\], \[events, derivedEvents\]\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const visibleEvents = useMemo\(\s*\n\s*\(\) => allEvents\.filter/)
  })

  it('no second calendar store, sync effect, or duplicate-prevention mechanism was introduced', () => {
    expect((CALENDAR_PAGE_SRC.match(/useCalendarEvents\(\)/g) ?? []).length).toBe(1)
    expect(CALENDAR_PAGE_SRC).not.toMatch(/addCalendarEvent\(.*plan/i)
    expect(CALENDAR_PAGE_SRC).not.toMatch(/addCalendarEvent\(.*goal/i)
  })
})

describe('CalendarPage: clicking a derived entry routes to its source module instead of the normal edit/delete flow', () => {
  it('a Plan-derived entry navigates to its plan detail route', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleEventClick = useCallback\(\(id: string\) => \{[\s\S]*?\n {2}\}, \[allEvents, navigate\]\)/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/if \(evt\?\.source\?\.type === 'plan'\) \{\s*\n\s*navigate\(`\/app\/plans\/\$\{evt\.source\.id\}`\)/)
  })

  it('a Goal-derived entry navigates to Goals using the exact same openId deep-link convention LinkedItemsPanel already uses', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleEventClick = useCallback\(\(id: string\) => \{[\s\S]*?\n {2}\}, \[allEvents, navigate\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/if \(evt\?\.source\?\.type === 'goal'\) \{\s*\n\s*navigate\('\/app\/goals', \{ state: \{ openId: evt\.source\.id \} \}\)/)
  })

  it('a real (non-derived) event still falls through to the existing detail modal, unchanged', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleEventClick = useCallback\(\(id: string\) => \{[\s\S]*?\n {2}\}, \[allEvents, navigate\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/setDetailEvent\(evt\)/)
  })

  it('EventDetailsModal, NewEventModal edit flow, and delete flow were not modified to special-case derived entries — routing happens before any of that is reached', () => {
    const EVENT_DETAILS_MODAL_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/EventDetailsModal.tsx'), 'utf8')
    expect(EVENT_DETAILS_MODAL_SRC).not.toMatch(/source/)
  })
})

describe('MonthView: a multi-day all-day event is listed under every day it spans', () => {
  it('builds eventsByDate from eventDateKeys(evt), not evt.date alone', () => {
    expect(MONTH_VIEW_SRC).toMatch(/import \{ eventDateKeys, type MockCalendarEvent \} from '@\/lib\/calendar\/eventLayout'/)
    expect(MONTH_VIEW_SRC).toMatch(/for \(const key of eventDateKeys\(evt\)\) \{/)
  })

  it('eventDateKeys keeps every existing single-day event under exactly its own date (no behavior change for non-Plan events)', () => {
    const singleDay = makeEvent({ date: '2026-08-28' })
    expect(eventDateKeys(singleDay)).toEqual(['2026-08-28'])
  })
})

describe('DayPreview: the selected-day sidebar widget also shows multi-day spans on every day they cover', () => {
  it('filters with eventOccursOnDate instead of an exact evt.date match', () => {
    expect(DAY_PREVIEW_SRC).toMatch(/import \{ eventOccursOnDate, type MockCalendarEvent \} from '@\/lib\/calendar\/eventLayout'/)
    expect(DAY_PREVIEW_SRC).toMatch(/\.filter\(\(evt\) => eventOccursOnDate\(evt, dateKey\(selectedDate\)\)\)/)
  })
})

describe('Week/Day views already used the shared getEventsForDate helper, so extending it covers them for free', () => {
  it('WeekView and DayView still call getEventsForDate — untouched call sites', () => {
    expect(WEEK_VIEW_SRC).toMatch(/getEventsForDate\(events, day\)/)
    expect(DAY_VIEW_SRC).toMatch(/getEventsForDate\(events, date\)/)
  })
})

describe('eventOccursOnDate / eventDateKeys: multi-day all-day range with no off-by-one or timezone bug', () => {
  it('a plan spanning 28 Aug - 1 Sep visually includes both boundary days and everything between, and nothing outside', () => {
    const evt = makeEvent({ date: '2026-08-28', endDate: '2026-09-01', allDay: true })
    expect(eventOccursOnDate(evt, '2026-08-27')).toBe(false)
    expect(eventOccursOnDate(evt, '2026-08-28')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-08-29')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-08-30')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-08-31')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-09-01')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-09-02')).toBe(false)
  })

  it('a non-all-day event never spans multiple days even if endDate were somehow set', () => {
    const timed = makeEvent({ date: '2026-08-28', endDate: '2026-09-01', allDay: false, startTime: '09:00', endTime: '10:00' })
    expect(eventOccursOnDate(timed, '2026-08-29')).toBe(false)
  })

  it('an existing single-day all-day event (no endDate) behaves exactly as before this change', () => {
    const single = makeEvent({ date: '2026-08-28', allDay: true })
    expect(eventOccursOnDate(single, '2026-08-28')).toBe(true)
    expect(eventOccursOnDate(single, '2026-08-29')).toBe(false)
    expect(eventDateKeys(single)).toEqual(['2026-08-28'])
  })
})

describe('MockCalendarEvent: the new fields are additive and optional', () => {
  it('endDate and source are both optional on the interface — every existing event literal without them still typechecks', () => {
    expect(EVENT_LAYOUT_SRC).toMatch(/endDate\?: string/)
    expect(EVENT_LAYOUT_SRC).toMatch(/source\?: \{ type: 'plan' \| 'goal'; id: string \}/)
  })
})

describe('regression: the existing Task -> Calendar integration is untouched', () => {
  it('automaticLinking.ts (task auto-create + syncTaskCalendarEvent) is unmodified by this change', () => {
    expect(AUTOMATIC_LINKING_SRC).toMatch(/const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'/)
    expect(AUTOMATIC_LINKING_SRC).toMatch(/export async function syncTaskCalendarEvent\(task: Task\): Promise<void> \{/)
    // automaticLinking.ts already had a pre-existing 'goal' case (for
    // auto-linking, not calendar auto-creation) — this change adds no new
    // Plan/Goal calendar-creation path here, since that's now derived, not
    // materialized via this service.
    expect(AUTOMATIC_LINKING_SRC).not.toMatch(/PLAN_CALENDAR_EVENT_PREFIX|GOAL_CALENDAR_EVENT_PREFIX|planGoalCalendarEvents/)
  })

  it('CalendarPage still runs the same automatic linking for manually-created events, unchanged', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/runAutomaticLinking\('calendar', event\.id, lang, \{/)
  })
})

describe('regression: manual calendar events and existing all-day behavior are untouched', () => {
  it('addCalendarEvent/updateCalendarEvent/deleteCalendarEvent still back the create/edit/delete flows exactly as before', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleSaveEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*addCalendarEvent\(event\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleUpdateEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*updateCalendarEvent\(event\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/await deleteCalendarEvent\(id\)/)
  })

  it('getEventsForDate for a plain single-day query is unchanged in shape (still takes events + a Date, returns matches)', () => {
    expect(EVENT_LAYOUT_SRC).toMatch(/export function getEventsForDate\(\s*\n\s*events: MockCalendarEvent\[\],\s*\n\s*date: Date,\s*\n\s*\): MockCalendarEvent\[\] \{/)
  })
})
