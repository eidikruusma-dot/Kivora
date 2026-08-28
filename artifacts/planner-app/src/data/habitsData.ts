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
  streak: number
  status: HabitStatus
  category: HabitCategory
  weekDays: (boolean | null)[]  // index 0=E … 6=P
}

/**
 * The current Monday–Sunday week's short day labels + calendar dates,
 * computed fresh from local time (never UTC) — never a fixed/demo week.
 * Pass an explicit `referenceDate` in tests to pin "today".
 */
export function getCurrentWeekDays(referenceDate: Date = new Date()): { short: string; date: string }[] {
  const monday = startOfWeek(referenceDate, 'monday')
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    const month = MONTHS_ET[d.getMonth()].toLowerCase()
    return { short: WEEKDAYS_ET[i], date: `${d.getDate()}. ${month}` }
  })
}

// Intentionally empty — new users start with no demo habits.
export const mockHabits: Habit[] = []
