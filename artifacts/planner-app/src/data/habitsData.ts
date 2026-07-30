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
  icon: 'droplet' | 'run' | 'book' | 'meditation' | 'apple' | 'moon'
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

export const mockHabits: Habit[] = [
  {
    id: '1',
    title: 'Joo vett',
    description: '8 klaasi päevas',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    icon: 'droplet',
    streak: 12,
    status: 'active',
    category: 'Tervis',
    weekDays: [true, true, true, true, true, false, false],
  },
  {
    id: '2',
    title: 'Treeni',
    description: '30 minutit päevas',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    icon: 'run',
    streak: 7,
    status: 'active',
    category: 'Isiklik',
    weekDays: [true, true, true, true, true, false, false],
  },
  {
    id: '3',
    title: 'Loe',
    description: '20 minutit päevas',
    iconBg: '#FEF9C3',
    iconColor: '#CA8A04',
    icon: 'book',
    streak: 5,
    status: 'active',
    category: 'Isiklik',
    weekDays: [true, true, true, false, false, false, false],
  },
  {
    id: '4',
    title: 'Mediteeri',
    description: '10 minutit päevas',
    iconBg: '#CCFBF1',
    iconColor: '#0D9488',
    icon: 'meditation',
    streak: 3,
    status: 'active',
    category: 'Isiklik',
    weekDays: [true, true, false, false, false, false, false],
  },
  {
    id: '5',
    title: 'Söö tervislikult',
    description: '5 puu- ja köögivilja päevas',
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    icon: 'apple',
    streak: 2,
    status: 'active',
    category: 'Tervis',
    weekDays: [true, true, false, false, false, false, false],
  },
  {
    id: '6',
    title: 'Magan 8 tundi',
    description: 'Igapäevaselt',
    iconBg: '#F1F5F9',
    iconColor: '#64748B',
    icon: 'moon',
    streak: 0,
    status: 'paused',
    category: 'Tervis',
    weekDays: [null, null, null, null, null, null, null],
  },
]
