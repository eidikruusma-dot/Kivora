import type { Task, CalendarEvent, Habit, Goal } from '@/types'

export const mockTasks: Task[] = [
  { id: '1', title: 'Saada projektiraport', priority: 'high', time: '10:00', completed: false, category: 'Töö' },
  { id: '2', title: 'Valmista ette koosoleku märkmed', priority: 'medium', time: '14:30', completed: false, category: 'Töö' },
  { id: '3', title: 'Uuri turu-uuringuid', priority: 'low', time: '16:00', completed: true, category: 'Isiklik' },
  { id: '4', title: 'Uuenda tegevusplaan', priority: 'medium', time: '17:30', completed: false, category: 'Kool' },
]

export const mockEvents: CalendarEvent[] = [
  { id: '1', title: 'Projektikoosolek', time: '14:30', duration: '1h' },
  { id: '2', title: 'Treening', time: '17:00', duration: '45min' },
  { id: '3', title: 'Meeskonnaõhtusöök', time: '19:30', duration: '2h' },
]

export const mockHabits: Habit[] = [
  { id: '1', name: 'Joo vett', completed: true, weekDone: 7, weekTotal: 7 },
  { id: '2', name: 'Hommikune venitus', completed: true, weekDone: 5, weekTotal: 7 },
  { id: '3', name: 'Loe 20 minutit', completed: false, weekDone: 2, weekTotal: 7 },
  { id: '4', name: 'Meditatsioon', completed: false, weekDone: 4, weekTotal: 7 },
]

export const mockGoals: Goal[] = [
  {
    id: '1',
    title: 'Käivita Kivora avaleht',
    progress: 65,
    nextStep: 'Disaini viimase lehe ülevaatus',
    dueDateLabel: 'Reede',
  },
  {
    id: '2',
    title: 'Parenda igapäevast rutiini',
    progress: 40,
    nextStep: 'Lisa hommikuharjumus',
    dueDateLabel: 'Laupäev',
  },
]

export const mockStats = {
  tasksTotal: 6,
  tasksCompleted: 3,
  eventsToday: 2,
  nextEventTime: '14:30',
  habitsPercent: 72,
  habitsDone: 5,
  habitsTotal: 7,
  goalsPercent: 65,
}

export const mockFocus = {
  title: 'lõpetada projektiraport.',
  suggestion: 'Soovitan alustada sellest enne lõunat.',
}
