import type { Habit, HabitStatus, HabitCategory } from '@/data/habitsData'
import { mockHabits } from '@/data/habitsData'

// Index 1 = Teisipäev (22. juuli) — matches the existing week-view "today" highlight.
export const TODAY_INDEX = 1

let habits: Habit[] = [...mockHabits]
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getAllHabits(): Habit[] {
  return habits
}

export function subscribeHabits(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getDashboardPercent(): number {
  const active = habits.filter((h) => h.status === 'active')
  if (active.length === 0) return 0
  const done = active.filter((h) => h.weekDays[TODAY_INDEX] === true).length
  return Math.round((done / active.length) * 100)
}

export function addHabit(input: {
  title: string
  description: string
  category: HabitCategory
  icon: Habit['icon']
  iconColor: string
  iconBg: string
  recurrence: 'daily' | 'weekdays' | 'custom'
  customDays?: boolean[]
}): Habit {
  let weekDays: (boolean | null)[]
  if (input.recurrence === 'daily') {
    weekDays = [true, true, true, true, true, true, true]
  } else if (input.recurrence === 'weekdays') {
    weekDays = [true, true, true, true, true, false, false]
  } else {
    weekDays = (input.customDays || [false, false, false, false, false, false, false]).map(
      (d) => (d ? true : null),
    )
    // If no days selected, default to weekdays
    if (!weekDays.some((d) => d === true)) {
      weekDays = [true, true, true, true, true, false, false]
    }
  }

  const habit: Habit = {
    id: `habit-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    iconBg: input.iconBg,
    iconColor: input.iconColor,
    icon: input.icon,
    streak: 0,
    status: 'active',
    category: input.category,
    weekDays,
  }
  habits = [habit, ...habits]
  emit()
  return habit
}

export function updateHabit(id: string, updates: Partial<Habit>): void {
  let changed = false
  habits = habits.map((h) => {
    if (h.id !== id) return h
    changed = true
    return { ...h, ...updates }
  })
  if (changed) emit()
}

export function toggleToday(id: string): void {
  let changed = false
  habits = habits.map((h) => {
    if (h.id !== id) return h
    changed = true
    const isDone = h.weekDays[TODAY_INDEX] === true
    const nextDays = [...h.weekDays]
    nextDays[TODAY_INDEX] = !isDone
    return {
      ...h,
      weekDays: nextDays,
      streak: isDone ? Math.max(0, h.streak - 1) : h.streak + 1,
    }
  })
  if (changed) emit()
}

export function setStatus(id: string, status: HabitStatus): void {
  let changed = false
  habits = habits.map((h) => {
    if (h.id !== id) return h
    changed = true
    if (status === 'paused') {
      return { ...h, status, weekDays: h.weekDays.map(() => null) }
    }
    return { ...h, status }
  })
  if (changed) emit()
}

export function deleteHabit(id: string): void {
  const before = habits.length
  habits = habits.filter((h) => h.id !== id)
  if (habits.length !== before) emit()
}
