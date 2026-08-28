/**
 * planGoalCalendarEvents.ts
 *
 * Derives Calendar entries for dated Plans and dated Goals directly from
 * their live source data — Plans/Goals are never written into the
 * `calendarEvents` Firestore collection, and no second sync/storage layer
 * exists for them. Unlike Tasks (which get one real, separately-persisted
 * calendarEvents document created via automaticLinking.ts and kept in sync
 * via syncTaskCalendarEvent), a Plan/Goal calendar entry is recomputed
 * fresh, every render, from the Plan/Goal object itself. This is what makes
 * every one of these true with zero extra sync code:
 *   - editing the title/dates/deadline updates the calendar instantly;
 *   - removing the date(s) removes the calendar entry instantly;
 *   - deleting the Plan/Goal removes its calendar entry instantly;
 *   - refreshing, reloading, or re-running this never creates a duplicate —
 *     there is nothing to duplicate, since nothing is ever persisted;
 *   - EVERY existing dated Plan/Goal is visible immediately, including ones
 *     saved before this feature existed — there is no backfill/migration
 *     step to run, because there is no stored copy to be out of sync.
 *   - a Goal's progress/step changes never touch the calendar entry, since
 *     only title + deadline are read.
 *
 * The derived id is stable and deterministic (`plan-cal-<planId>` /
 * `goal-cal-<goalId>`) purely so a click on the entry can be traced back to
 * its source — see CalendarPage.tsx's handleEventClick, which routes a
 * derived entry to the Plan/Goal module instead of the normal
 * edit/delete flow (these are not independently editable from Calendar).
 */

import type { Plan } from '@/lib/plansStore'
import type { Goal } from '@/data/goalsData'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

export const PLAN_CALENDAR_EVENT_PREFIX = 'plan-cal-'
export const GOAL_CALENDAR_EVENT_PREFIX = 'goal-cal-'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function planCalendarEventId(planId: string): string {
  return `${PLAN_CALENDAR_EVENT_PREFIX}${planId}`
}

export function goalCalendarEventId(goalId: string): string {
  return `${GOAL_CALENDAR_EVENT_PREFIX}${goalId}`
}

/**
 * A Plan with no dates yields no entry. A Plan with only one of
 * startDate/endDate yields a one-day entry on that date. A Plan with both,
 * where endDate is strictly after startDate, yields one multi-day all-day
 * entry spanning the whole inclusive range.
 */
export function planToCalendarEvent(plan: Plan): MockCalendarEvent | null {
  const { startDate, endDate } = plan
  if (!startDate && !endDate) return null
  const date = startDate ?? endDate!
  const spanEnd = startDate && endDate && endDate > startDate ? endDate : undefined
  return {
    id: planCalendarEventId(plan.id),
    title: plan.title,
    date,
    endDate: spanEnd,
    allDay: true,
    startTime: '',
    endTime: '',
    color: plan.color,
    calendarId: 'mine',
    source: { type: 'plan', id: plan.id },
  }
}

/**
 * A Goal with no deadline, or a deadline that isn't a plain ISO
 * (YYYY-MM-DD) date, yields no entry — the same date-validity convention
 * automaticLinking.ts already uses for tasks/school items. This also
 * correctly excludes the translated "no deadline" placeholder string
 * GoalsPage.tsx stores when the deadline field is left empty.
 */
export function goalToCalendarEvent(goal: Goal): MockCalendarEvent | null {
  if (!ISO_DATE.test(goal.deadline)) return null
  return {
    id: goalCalendarEventId(goal.id),
    title: goal.title,
    date: goal.deadline,
    allDay: true,
    startTime: '',
    endTime: '',
    color: goal.barColor,
    calendarId: 'mine',
    source: { type: 'goal', id: goal.id },
  }
}

/** All Plan/Goal-derived calendar entries for the current Plans/Goals state. */
export function getDerivedCalendarEvents(plans: Plan[], goals: Goal[]): MockCalendarEvent[] {
  const planEvents = plans
    .map(planToCalendarEvent)
    .filter((e): e is MockCalendarEvent => e !== null)
  const goalEvents = goals
    .map(goalToCalendarEvent)
    .filter((e): e is MockCalendarEvent => e !== null)
  return [...planEvents, ...goalEvents]
}
