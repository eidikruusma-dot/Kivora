export type Priority = 'high' | 'medium' | 'low'
export type TaskCategory = 'Töö' | 'Kool' | 'Isiklik' | 'Pere' | 'Tervis' | 'Ostud'

export interface Task {
  id: string
  title: string
  description?: string
  date?: string
  priority: Priority
  time?: string
  completed: boolean
  category?: TaskCategory
}

export interface CalendarEvent {
  id: string
  title: string
  time: string
  duration?: string
}

export type CalendarViewType = 'week' | 'day' | 'month' | 'agenda'

export interface Habit {
  id: string
  name: string
  completed: boolean
  weekDone: number
  weekTotal: number
}

export interface Goal {
  id: string
  title: string
  progress: number
  nextStep?: string
  dueDateLabel?: string
}

export interface QuickNote {
  id: string
  content: string
  createdAt: Date
}

export type StartOfWeek = 'monday' | 'sunday'
export type TimeFormat = '24h' | '12h'
export type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

export type ThemeMode = 'light' | 'dark' | 'system'
export type PrimaryColor = 'purple' | 'blue' | 'green' | 'rose' | 'amber'
export type CardRadius = 'sharp' | 'rounded' | 'smooth'
export type Density = 'comfortable' | 'compact'

export interface AppearanceSettings {
  themeMode: ThemeMode
  primaryColor: PrimaryColor
  cardRadius: CardRadius
  density: Density
}

export interface UserPreferences {
  startOfWeek: StartOfWeek
  timeFormat: TimeFormat
  dateFormat: DateFormat
}

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  phone?: string
  birthday?: string
  photoURL: string | null
  preferredLanguage: string
  timezone: string
  preferences?: UserPreferences
  createdAt: unknown
  updatedAt: unknown
  lastLoginAt?: unknown
}
