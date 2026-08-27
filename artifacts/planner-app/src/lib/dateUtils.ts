/**
 * Shared local-calendar-date helpers.
 *
 * getLocalDateString/getLocalWeekdayIndex intentionally avoid
 * `date.toISOString().slice(0, 10)` (UTC-based) — that can report the wrong
 * calendar day for users west/east of UTC around local midnight. These build
 * the date from the Date object's own local getFullYear/getMonth/getDate/
 * getDay, matching the user's real local calendar day.
 */

import type { AppLang } from '@/lib/languageStore'

/**
 * YYYY-MM-DD from `date`'s local calendar day. Defaults to now; accepts an
 * explicit Date for deterministic tests.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Monday-first weekday index (0=Monday..6=Sunday) for `date`'s local day —
 * matches the ordering of ScheduleTab.tsx's canonical DAYS_ET array.
 */
export function getLocalWeekdayIndex(date: Date = new Date()): number {
  return (date.getDay() + 6) % 7
}

/**
 * Formats a YYYY-MM-DD date string with its localized weekday, e.g.
 * "26. august 2026, kolmapäev" (et) / "26 August 2026, Wednesday" (en).
 * Parses via `${dateStr}T00:00:00` (local midnight, never UTC) so the
 * date/weekday shown always match the calendar day the string represents.
 */
export function formatDateWithWeekday(dateStr: string, lang: AppLang): string {
  const locale = lang === 'et' ? 'et-EE' : 'en-GB'
  const d = new Date(`${dateStr}T00:00:00`)
  const datePart = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const weekdayPart = d.toLocaleDateString(locale, { weekday: 'long' })
  return `${datePart}, ${weekdayPart}`
}

/**
 * Formats a start/end YYYY-MM-DD pair as a localized date range, e.g.
 * "26. august 2026 – 2. september 2026" (et) / "26 August 2026 – 2 September
 * 2026" (en). When both dates are equal, returns a single formatted date
 * instead of repeating it. Parses via `${dateStr}T00:00:00` (local
 * midnight), matching formatDateWithWeekday's UTC-safe approach.
 */
export function formatDateRange(startISO: string, endISO: string, lang: AppLang): string {
  const locale = lang === 'et' ? 'et-EE' : 'en-GB'
  const fmt = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  if (startISO === endISO) return fmt(startISO)
  return `${fmt(startISO)} – ${fmt(endISO)}`
}

/**
 * Milliseconds until the next local midnight (plus a small buffer so the
 * timer reliably fires after, not just at, the boundary). Used to schedule
 * a single one-shot refresh rather than polling.
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0)
  return next.getTime() - now.getTime()
}
