import { useEffect } from 'react'
import { dispatch } from '@/lib/notificationItemsStore'
import { getAllTasks } from '@/lib/tasksStore'
import { getAllHabits } from '@/lib/habitsStore'
import { isHabitScheduledOnDate, isHabitDoneOnDate } from '@/data/habitsData'
import { getAllGoals } from '@/lib/goalsStore'
import { getLocalLanguage } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Returns [currentMonthName, currentYear, nextMonthName, nextYear] using
 * the Estonian locale, since goal deadlines are stored in Estonian display format.
 */
function getDeadlineMonthPatterns(): string[] {
  const now = new Date()
  const etFmt = new Intl.DateTimeFormat('et-EE', { month: 'long' })
  const curMonthName = etFmt.format(now).toLowerCase()
  const curYear = String(now.getFullYear())

  // Next month
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextMonthName = etFmt.format(nextMonthDate).toLowerCase()
  const nextYear = String(nextMonthDate.getFullYear())

  return [curMonthName, curYear, nextMonthName, nextYear]
}

// ── Generators ────────────────────────────────────────────────────────────────

export function genTaskNotifications(): void {
  const lang = getLocalLanguage()
  const today = todayIso()
  const tasks = getAllTasks()

  for (const task of tasks) {
    if (task.completed || !task.date) continue
    if (task.date === today) {
      dispatch({
        type: `task-due-${task.id}`,
        module: 'tasks',
        title: t('notif.taskDue.title', lang),
        description: t('notif.taskDue.desc', lang).replace('{title}', task.title),
        timeLabel: t('notif.today', lang),
        read: false,
        icon: 'check',
        accent: '#F59E0B',
      })
    } else if (task.date < today) {
      dispatch({
        type: `task-overdue-${task.id}`,
        module: 'tasks',
        title: t('notif.overdue.title', lang),
        description: t('notif.overdue.desc', lang).replace('{title}', task.title),
        timeLabel: t('notif.today', lang),
        read: false,
        icon: 'clock',
        accent: '#EF4444',
      })
    }
  }
}

export function genHabitNotifications(): void {
  const lang = getLocalLanguage()
  const habits = getAllHabits()
  const today = new Date()

  // Count active habits scheduled for today that are NOT yet done
  const undoneCount = habits.filter(
    (h) => h.status === 'active' && isHabitScheduledOnDate(h, today) && !isHabitDoneOnDate(h, today),
  ).length

  if (undoneCount > 0) {
    dispatch({
      type: 'habit-reminder',
      module: 'habits',
      title: t('notif.habitReminder.title', lang),
      description: t('notif.habitReminder.desc', lang).replace('{n}', String(undoneCount)),
      timeLabel: t('notif.today', lang),
      read: false,
      icon: 'repeat',
      accent: '#6F5AE8',
    })
  }
}

export function genGoalNotifications(): void {
  const lang = getLocalLanguage()
  const goals = getAllGoals()
  const [curMonth, curYear, nextMonth, nextYear] = getDeadlineMonthPatterns()

  for (const goal of goals) {
    if (goal.status === 'completed' || goal.status === 'expired') continue
    const deadlineLower = goal.deadline.toLowerCase()

    const matchesCurrent =
      deadlineLower.includes(curMonth) && deadlineLower.includes(curYear)
    const matchesNext =
      deadlineLower.includes(nextMonth) && deadlineLower.includes(nextYear)

    if (matchesCurrent || matchesNext) {
      dispatch({
        type: `goal-reminder-${goal.id}`,
        module: 'goals',
        title: t('notif.goalReminder.title', lang),
        description: t('notif.goalReminder.desc', lang)
          .replace('{title}', goal.title)
          .replace('{deadline}', goal.deadlineShort || goal.deadline),
        timeLabel: t('notif.today', lang),
        read: false,
        icon: 'target',
        accent: '#16A34A',
      })
    }
  }
}

// ── App-shell hook ────────────────────────────────────────────────────────────

export function useNotificationGenerators(): void {
  useEffect(() => {
    genTaskNotifications()
    genHabitNotifications()
    genGoalNotifications()
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
