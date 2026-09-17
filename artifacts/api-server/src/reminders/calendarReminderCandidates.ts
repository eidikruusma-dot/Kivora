/**
 * calendarReminderCandidates.ts — the one Calendar-specific piece of the
 * Phase 1 reminders tick: turns a single timed Calendar event, plus a
 * user's `defaultReminder` setting and timezone, into the exact instant a
 * reminder should fire and a deterministic dedup id — or `null` when this
 * mechanism should never fire for the event at all.
 */

import { zonedWallClockToInstant, subtractOneCalendarDay } from '../lib/timeZoneWallClock.js'
import type { ReminderOffset } from '../lib/notificationSettingsTypes.js'

/** The subset of a calendarEvents doc (users/{uid}/calendarEvents/{id}) this needs. */
export interface CalendarEventLike {
  id: string
  date: string // 'YYYY-MM-DD'
  startTime?: string // 'HH:mm'
  allDay?: boolean
}

export interface ReminderCandidate {
  triggerInstant: Date
  dedupId: string
}

const OFFSET_MINUTES: Partial<Record<ReminderOffset, number>> = {
  at_time: 0,
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '1hour': 60,
}

/**
 * `null` for an all-day event or one missing a start time — this
 * mechanism is strictly scoped to timed Calendar events (Phase 1).
 *
 * For every offset except `1day`, the trigger instant is the event's
 * real instant minus a fixed number of minutes — safe because none of
 * those offsets span long enough to cross a DST transition in practice.
 *
 * For `1day`, "exactly 24 hours before" would NOT reliably land on the
 * same local clock time across a DST transition (Europe "loses"/"gains"
 * an hour on the transition day), so instead the event's own date is
 * moved back one calendar day first, then re-converted to a real instant
 * for THAT date — picking up whatever UTC offset is actually in effect
 * then, which is what "one calendar day before, at the corresponding
 * local event time" means. See timeZoneWallClock.test.ts's DST-transition
 * cases for a worked example of exactly this composition.
 */
export function extractCalendarReminderCandidate(
  event: CalendarEventLike,
  defaultReminder: ReminderOffset,
  timeZone: string,
): ReminderCandidate | null {
  if (event.allDay) return null
  if (!event.startTime) return null

  let triggerInstant: Date

  if (defaultReminder === '1day') {
    const priorDate = subtractOneCalendarDay(event.date)
    triggerInstant = zonedWallClockToInstant(priorDate, event.startTime, timeZone)
  } else {
    const eventInstant = zonedWallClockToInstant(event.date, event.startTime, timeZone)
    const offsetMinutes = OFFSET_MINUTES[defaultReminder] ?? 0
    triggerInstant = new Date(eventInstant.getTime() - offsetMinutes * 60_000)
  }

  // Includes the event's own date/startTime (not just its id+offset): if
  // the event is edited to a new time after an earlier reminder already
  // fired, the id changes too, so the stale doc never blocks the new,
  // correctly-timed one — see remindersTick.ts's dedup design.
  const safeTime = event.startTime.replace(':', '')
  const dedupId = `srv-cal-${event.id}-${event.date}-${safeTime}-${defaultReminder}`

  return { triggerInstant, dedupId }
}
