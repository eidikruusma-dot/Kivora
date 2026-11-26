import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import type { Task } from '@/types'

/**
 * Free, local, rule-based "Kivora AI soovitab" banner for the Tasks module —
 * same philosophy as the "Minu päev" dashboard's dashboardSummary.ts: a pure
 * function over the user's real tasks, no AI/model call, never fabricated
 * text. Computed from the SAME tasksStore data TasksPage and the dashboard
 * widget already read — no new data source, no new backend request.
 */

// Local calendar-day string (YYYY-MM-DD), never UTC — `toISOString()` would
// roll over at a timezone-dependent hour (e.g. ~21:00-22:00 UTC+2/+3) and
// silently misclassify "today"'s tasks as yesterday's or vice versa.
export function localTodayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Same local (never UTC) calendar-day string, `offsetDays` days from `now` — used by the task modal's "Täna"/"Homme" quick-date chips. */
export function localDateStrWithOffset(offsetDays: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + offsetDays)
  return localTodayStr(d)
}

function sortByDateThenPriority(tasks: Task[]): Task[] {
  const priorityRank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 }
  return [...tasks].sort((a, b) => {
    const dateA = a.date ?? '9999-99-99'
    const dateB = b.date ?? '9999-99-99'
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return priorityRank[a.priority] - priorityRank[b.priority]
  })
}

/**
 * The single task the "Kivora AI soovitab" banner's chevron opens — the
 * same priority order the suggestion text itself describes: overdue first,
 * then today's high-priority tasks, then any of today's tasks, then the
 * soonest other active task. Undefined only when there are no active tasks
 * at all.
 */
export function getMostImportantTask(tasks: Task[], todayStr: string = localTodayStr()): Task | undefined {
  const active = tasks.filter((task) => !task.completed)
  const overdue = active.filter((task) => task.date && task.date < todayStr)
  if (overdue.length > 0) return sortByDateThenPriority(overdue)[0]

  const today = active.filter((task) => task.date === todayStr)
  const todayHighPriority = today.filter((task) => task.priority === 'high')
  if (todayHighPriority.length > 0) return sortByDateThenPriority(todayHighPriority)[0]
  if (today.length > 0) return sortByDateThenPriority(today)[0]

  if (active.length > 0) return sortByDateThenPriority(active)[0]
  return undefined
}

export function computeTaskSuggestion(tasks: Task[], lang: AppLang, todayStr: string = localTodayStr()): string {
  const active = tasks.filter((task) => !task.completed)
  const overdue = active.filter((task) => task.date && task.date < todayStr)
  if (overdue.length > 0) {
    return t('tasks.ai.overdue', lang).replace('{n}', String(overdue.length))
  }

  const today = active.filter((task) => task.date === todayStr)
  const todayHighPriority = today.filter((task) => task.priority === 'high')
  if (todayHighPriority.length > 0) {
    return t('tasks.ai.todayImportant', lang).replace('{n}', String(todayHighPriority.length))
  }
  if (today.length > 0) {
    return t('tasks.ai.today', lang).replace('{n}', String(today.length))
  }

  if (active.length > 0) {
    return t('tasks.ai.activeOnly', lang).replace('{n}', String(active.length))
  }

  return t('tasks.ai.allDone', lang)
}
