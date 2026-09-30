/**
 * workScheduleReminderCandidates.ts — the Work Schedule-specific piece of
 * the reminders tick, mirroring calendarReminderCandidates.ts's role: turns
 * one Work Schedule shift item (from a users/{uid}/plans/{planId} doc whose
 * type is 'workSchedule') plus the user's timezone into 0, 1, or 2 reminder
 * candidates — never a default. Unlike Calendar events, which always have
 * SOME effective reminder (falling back to the user's global
 * `defaultReminder` when unset), a Work Schedule shift has no global
 * fallback: `reminder` missing or `'off'` both mean "no reminder", so every
 * existing shift (saved before this feature existed) keeps behaving exactly
 * as it does today — no migration needed.
 *
 * 'both' produces TWO candidates with distinct `kind`s and distinct
 * dedupIds — each is independently due-checked and deduplicated, so one is
 * never blocked or superseded by the other.
 *
 * Reuses the exact same DST-safe timezone helpers calendarReminderCandidates
 * already uses:
 *   - "1 hour before" is real-instant arithmetic (shift instant minus 60
 *     minutes), so an early-morning shift (e.g. 00:30) correctly rolls the
 *     trigger back to 23:30 the PREVIOUS calendar day with no special-casing
 *     — subtracting minutes from a real UTC instant is inherently correct
 *     regardless of what wall-clock date it lands on.
 *   - "previous evening" reuses subtractOneCalendarDay +
 *     zonedWallClockToInstant exactly like Calendar's `1day` offset, just
 *     with a fixed 19:00 instead of the shift's own start time — so it is
 *     DST-safe for the same reason that offset is.
 */

import { zonedWallClockToInstant, subtractOneCalendarDay } from '../lib/timeZoneWallClock.js'

export type WorkShiftReminder = 'off' | 'eveningBefore' | 'oneHourBefore' | 'both'

/** The subset of a Work Schedule shift item (PlanItem) this needs. */
export interface WorkScheduleShiftLike {
  id: string
  date?: string // 'YYYY-MM-DD'
  startTime?: string // 'HH:mm'
  endTime?: string // 'HH:mm'
  reminder?: WorkShiftReminder
}

export interface WorkScheduleReminderCandidate {
  triggerInstant: Date
  dedupId: string
  kind: 'eveningBefore' | 'oneHourBefore'
}

const EVENING_BEFORE_TIME = '19:00'

function safeTimeSuffix(startTime: string): string {
  return startTime.replace(':', '')
}

function eveningBeforeCandidate(
  planId: string,
  item: Required<Pick<WorkScheduleShiftLike, 'id' | 'date' | 'startTime'>>,
  timeZone: string,
): WorkScheduleReminderCandidate {
  const priorDate = subtractOneCalendarDay(item.date)
  const triggerInstant = zonedWallClockToInstant(priorDate, EVENING_BEFORE_TIME, timeZone)
  return {
    triggerInstant,
    kind: 'eveningBefore',
    dedupId: `srv-ws-${planId}-${item.id}-${item.date}-${safeTimeSuffix(item.startTime)}-evening`,
  }
}

function oneHourBeforeCandidate(
  planId: string,
  item: Required<Pick<WorkScheduleShiftLike, 'id' | 'date' | 'startTime'>>,
  timeZone: string,
): WorkScheduleReminderCandidate {
  const shiftInstant = zonedWallClockToInstant(item.date, item.startTime, timeZone)
  const triggerInstant = new Date(shiftInstant.getTime() - 60 * 60_000)
  return {
    triggerInstant,
    kind: 'oneHourBefore',
    dedupId: `srv-ws-${planId}-${item.id}-${item.date}-${safeTimeSuffix(item.startTime)}-hour`,
  }
}

/**
 * Returns every candidate this shift's `reminder` choice implies. Empty for
 * `'off'`/missing reminder, or for a shift missing date/startTime (endTime
 * is not needed for either offset, but is still required for the shift to
 * be a valid, complete one — a shift missing it is mid-edit/incomplete, so
 * no candidate is produced for it either).
 */
export function extractWorkScheduleReminderCandidates(
  planId: string,
  item: WorkScheduleShiftLike,
  timeZone: string,
): WorkScheduleReminderCandidate[] {
  if (!item.date || !item.startTime || !item.endTime) return []

  const reminder = item.reminder ?? 'off'
  if (reminder === 'off') return []

  const shiftFields = { id: item.id, date: item.date, startTime: item.startTime }
  const candidates: WorkScheduleReminderCandidate[] = []
  if (reminder === 'eveningBefore' || reminder === 'both') {
    candidates.push(eveningBeforeCandidate(planId, shiftFields, timeZone))
  }
  if (reminder === 'oneHourBefore' || reminder === 'both') {
    candidates.push(oneHourBeforeCandidate(planId, shiftFields, timeZone))
  }
  return candidates
}
