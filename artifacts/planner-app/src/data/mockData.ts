import type { Task, CalendarEvent, Habit, Goal } from '@/types'

// These exports are kept for backwards-compatibility but are intentionally empty.
// A new user account always starts with zero data; no demo content is seeded.

export const mockTasks: Task[] = []

export const mockEvents: CalendarEvent[] = []

export const mockHabits: Habit[] = []

export const mockGoals: Goal[] = []

export const mockStats = {
  tasksTotal: 0,
  tasksCompleted: 0,
  eventsToday: 0,
  nextEventTime: '',
  habitsPercent: 0,
  habitsDone: 0,
  habitsTotal: 0,
  goalsPercent: 0,
}

export const mockFocus = {
  title: '',
  suggestion: '',
}
