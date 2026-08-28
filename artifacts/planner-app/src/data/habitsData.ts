import { startOfWeek, addDays, WEEKDAYS_ET, MONTHS_ET } from '@/lib/calendar/dateUtils'

export type HabitStatus = 'active' | 'paused' | 'completed'
export type HabitCategory = 'Isiklik' | 'Tervis' | 'Töö' | 'Kool'

export interface DayEntry {
  day: string   // 'E' | 'T' | 'K' | 'N' | 'R' | 'L' | 'P'
  date: string  // e.g. '21. juuli'
  done: boolean | null // null = paused/no data
}

export interface Habit {
  id: string
  title: string
  description: string
  iconBg: string
  iconColor: string
  icon: 'droplet' | 'run' | 'book' | 'meditation' | 'apple' | 'moon' | 'flame' | 'briefcase'
  // Legacy field from before completions were tracked per real calendar
  // date. No longer written — kept only so old Firestore docs still type-
  // check on read. Use computeHabitStreak() for the real, current value.
  streak: number
  status: HabitStatus
  category: HabitCategory
  // RECURRENCE SCHEDULE ONLY (Monday=0 … Sunday=6): true = the habit occurs
  // on that weekday. This is never completion data — whether a specific
  // calendar day was actually marked done lives in `completions`.
  weekDays: (boolean | null)[]
  // Real, explicit completions: local calendar-date key ("YYYY-MM-DD") ->
  // true. Only `true` entries are ever stored (unmarking deletes the key).
  // The single source of truth for "was this habit done on this date" —
  // the week-view header, the per-habit day dots, the sidebar's weekly
  // percent, and the streak are all derived from this same map, never a
  // separate/duplicate local completion system.
  completions: Record<string, boolean>
  // Local "YYYY-MM-DD" date the habit was created. Days before this are
  // never counted or markable, regardless of the weekly recurrence schedule.
  createdDate: string
}

/**
 * The current Monday–Sunday week's 7 calendar Date objects, computed fresh
 * from local time (never UTC). Pass an explicit `referenceDate` to get a
 * different week (e.g. today ± N weeks for Prev/Next navigation).
 */
export function getCurrentWeekDates(referenceDate: Date = new Date()): Date[] {
  const monday = startOfWeek(referenceDate, 'monday')
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/**
 * The current Monday–Sunday week's short day labels + calendar dates,
 * computed fresh from local time (never UTC) — never a fixed/demo week.
 * Pass an explicit `referenceDate` in tests to pin "today".
 */
export function getCurrentWeekDays(referenceDate: Date = new Date()): { short: string; date: string }[] {
  return getCurrentWeekDates(referenceDate).map((d, i) => {
    const month = MONTHS_ET[d.getMonth()].toLowerCase()
    return { short: WEEKDAYS_ET[i], date: `${d.getDate()}. ${month}` }
  })
}

/** Local "YYYY-MM-DD" key for a date — never UTC. String order == chronological order for this format, so keys can be compared directly with `<`/`>`. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Inverse of toDateKey() — parses a local "YYYY-MM-DD" key back into a local-midnight Date (never UTC). */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday=0 … Sunday=6 (ISO week) — JS getDay() is Sunday=0, so rotate by -1 mod 7. */
export function weekdayIndexOf(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Is `habit` scheduled to occur on this calendar date, per its weekly recurrence? */
export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  return habit.weekDays[weekdayIndexOf(date)] === true
}

/** Was `habit` explicitly marked done on this calendar date? */
export function isHabitDoneOnDate(habit: Habit, date: Date): boolean {
  return habit.completions?.[toDateKey(date)] === true
}

/**
 * A day is markable for a habit iff: it's scheduled that weekday, it is not
 * after `today` (future days are never markable), and it is not before the
 * habit's own creation date (days preceding creation are never markable).
 * Missing `createdDate` (pre-existing habits from before this field
 * existed) is treated as "always after creation" so old habits keep
 * working for any date.
 */
export function isDayMarkableForHabit(habit: Habit, date: Date, today: Date): boolean {
  if (!isHabitScheduledOnDate(habit, date)) return false
  const dateKey = toDateKey(date)
  if (dateKey > toDateKey(today)) return false
  if (dateKey < (habit.createdDate || '0000-01-01')) return false
  return true
}

/**
 * Completion stats for a single habit across an arbitrary set of dates
 * (e.g. a displayed week). Future dates (relative to `today`) and dates
 * before the habit's creation are excluded entirely — never added to the
 * denominator.
 */
export function computeHabitDateRangeStats(
  habit: Habit,
  dates: Date[],
  today: Date,
): { done: number; total: number } {
  let done = 0
  let total = 0
  const todayKey = toDateKey(today)
  const createdDate = habit.createdDate || '0000-01-01'
  for (const date of dates) {
    const dateKey = toDateKey(date)
    if (dateKey > todayKey) continue
    if (dateKey < createdDate) continue
    if (!isHabitScheduledOnDate(habit, date)) continue
    total++
    if (isHabitDoneOnDate(habit, date)) done++
  }
  return { done, total }
}

/**
 * Per-day completion stats across a set of active habits — X (done) / Y
 * (scheduled) for one calendar date. Future dates always return {0, 0}.
 */
export function computeDayStats(habits: Habit[], date: Date, today: Date): { done: number; total: number } {
  if (toDateKey(date) > toDateKey(today)) return { done: 0, total: 0 }
  const scheduled = habits.filter(
    (h) => h.status === 'active' && isHabitScheduledOnDate(h, date) && toDateKey(date) >= (h.createdDate || '0000-01-01'),
  )
  const done = scheduled.filter((h) => isHabitDoneOnDate(h, date)).length
  return { done, total: scheduled.length }
}

/** computeDayStats() for each date in a displayed week, in order. */
export function computeWeekStats(habits: Habit[], weekDates: Date[], today: Date): { done: number; total: number }[] {
  return weekDates.map((date) => computeDayStats(habits, date, today))
}

/**
 * Consecutive scheduled-and-done days ending today, walking backward.
 * A scheduled-but-undone day (including today itself) breaks the streak;
 * non-scheduled days are skipped without affecting it. Never counts past
 * the habit's creation date.
 */
export function computeHabitStreak(habit: Habit, today: Date): number {
  let streak = 0
  const createdDate = habit.createdDate || '0000-01-01'
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (let i = 0; i < 3650; i++) {
    const dateKey = toDateKey(cursor)
    if (dateKey < createdDate) break
    if (isHabitScheduledOnDate(habit, cursor)) {
      if (isHabitDoneOnDate(habit, cursor)) {
        streak++
      } else {
        break
      }
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// Intentionally empty — new users start with no demo habits.
export const mockHabits: Habit[] = []
