/**
 * timeZoneWallClock.ts — local wall-clock <-> real instant conversions,
 * needed by the Calendar reminders tick (Phase 1 of the V1 reminder
 * architecture, see remindersTick.ts).
 *
 * Calendar events store a local wall-clock date ("YYYY-MM-DD") and time
 * ("HH:mm") with no UTC offset, interpreted against the user's stored
 * IANA timezone (users/{uid}.timezone) — the same model the client
 * already uses for display formatting (see planner-app's
 * KuupaevJaAegPage.tsx, which does the same Intl.DateTimeFormat +
 * `timeZone` option trick, just for display rather than instant math).
 *
 * This server process runs in UTC (Render's default), not the user's
 * timezone, so both directions are needed:
 *   - zonedWallClockToInstant: local wall clock -> real UTC instant, to
 *     decide whether an event's reminder is due right now.
 *   - instantToZonedClockDate: real instant -> a synthetic Date whose own
 *     getHours()/getMinutes() report the user's local time, so the
 *     Phase-0-shared isInQuietHours() (which reads exactly those two
 *     accessors) can be reused server-side completely unmodified.
 *
 * Built entirely on Node's built-in Intl — no new date library.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

interface WallClockParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partsInZone(instant: Date, timeZone: string): WallClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const p: Record<string, string> = {}
  for (const { type, value } of parts) p[type] = value

  // Some environments format midnight as hour "24" when hour12 is false —
  // normalize so it never parses as an out-of-range hour.
  const hour = p.hour === '24' ? 0 : Number(p.hour)

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

/**
 * Converts a local wall-clock date ("YYYY-MM-DD") + time ("HH:mm"),
 * interpreted in `timeZone`, into the real UTC instant it represents.
 * DST-safe: measures the actual offset Intl reports for that timezone at
 * that specific date rather than assuming a fixed one, converging in at
 * most two passes (a timezone offset is never more than ±24h, and each
 * pass corrects the full remaining delta).
 */
export function zonedWallClockToInstant(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const wantedAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0)

  // First guess: treat the wall clock as if it were already UTC.
  let guess = wantedAsUtc

  for (let i = 0; i < 2; i++) {
    const seen = partsInZone(new Date(guess), timeZone)
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
    const deltaMs = wantedAsUtc - seenAsUtc
    if (deltaMs === 0) break
    guess += deltaMs
  }

  return new Date(guess)
}

/**
 * The reverse direction: given a real instant, returns a synthetic Date
 * whose own getHours()/getMinutes()/etc (as read by this UTC-running
 * process) report the wall-clock time `timeZone` would show at that
 * instant. Only ever consumed by code that reads those two accessors
 * (isInQuietHours) — the returned Date's own UTC fields are NOT the real
 * instant and must not be used for anything else.
 */
export function instantToZonedClockDate(instant: Date, timeZone: string): Date {
  const seen = partsInZone(instant, timeZone)
  return new Date(Date.UTC(2000, 0, 1, seen.hour, seen.minute, seen.second))
}

/**
 * "YYYY-MM-DD" one calendar day earlier. Pure calendar-day arithmetic on
 * the date string itself — no timezone is involved here; DST correctness
 * for a "1 day before, same local time" reminder comes from re-running
 * zonedWallClockToInstant against this earlier date afterward (see
 * calendarReminderCandidates.ts), which picks up whatever UTC offset is
 * actually in effect on that earlier date.
 */
export function subtractOneCalendarDay(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/**
 * True when this process's own local timezone is UTC — a precondition
 * instantToZonedClockDate's trick depends on (getHours() must equal
 * getUTCHours()). Render's default container timezone is UTC, but this is
 * checked explicitly at startup (see scripts/remindersTick.ts) so a
 * misconfigured host fails loudly instead of silently computing wrong
 * quiet-hours windows for every user.
 */
export function isProcessTimeZoneUtc(): boolean {
  const probe = new Date(Date.UTC(2020, 0, 1, 13, 0, 0))
  return probe.getHours() === 13 && probe.getMinutes() === 0
}
