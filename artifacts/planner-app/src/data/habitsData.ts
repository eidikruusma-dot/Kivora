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

export const WEEK_DAYS: { short: string; date: string }[] = [
  { short: 'E', date: '21. juuli' },
  { short: 'T', date: '22. juuli' },
  { short: 'K', date: '23. juuli' },
  { short: 'N', date: '24. juuli' },
  { short: 'R', date: '25. juuli' },
  { short: 'L', date: '26. juuli' },
  { short: 'P', date: '27. juuli' },
]

// Intentionally empty — new users start with no demo habits.
export const mockHabits: Habit[] = []
