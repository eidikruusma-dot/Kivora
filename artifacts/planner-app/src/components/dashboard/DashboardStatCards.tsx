import { CheckSquare, Calendar, Target, Leaf } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTasks } from '@/lib/tasksStore'
import { useCalendarEvents } from '@/lib/calendarStore'
import { getEventsForDate } from '@/lib/calendar/eventLayout'
import { getDashboardPercent, subscribeHabits } from '@/lib/habitsStore'
import { useGoals } from '@/lib/goalsStore'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * Four separate glass stat cards — per the confirmed design reference,
 * each statistic is its OWN card (not one shared inset strip inside
 * HeroCard, which is how the first redesign pass had it). Pulled out of
 * HeroCard into its own component so it can sit as its own row directly
 * below the greeting, exactly as the reference shows.
 */
export default function DashboardStatCards() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const allTasks = useTasks()
  const allEvents = useCalendarEvents()
  const goals = useGoals()
  const [habitsPercent, setHabitsPercent] = useState(getDashboardPercent())
  useEffect(() => subscribeHabits(() => setHabitsPercent(getDashboardPercent())), [])

  const tasksCompleted = allTasks.filter((tk) => tk.completed).length
  const tasksTotal = allTasks.length
  const eventsToday = getEventsForDate(allEvents, new Date()).length
  const goalsPercent = goals.length === 0
    ? 0
    : Math.round(goals.reduce((sum, g) => sum + (g.progressValue / Math.max(g.progressMax, 1)) * 100, 0) / goals.length)

  const stats = [
    { icon: CheckSquare, cardBg: 'bg-gradient-to-br from-[#F3EEFD] to-[#E7DCFC] dark:from-[#2A2150] dark:to-[#201B3A]', iconBg: 'bg-[#6F5AE8]/15 dark:bg-[#A78BFA]/20', iconColor: 'text-[#6F5AE8] dark:text-[#C4B5FD]', value: `${tasksCompleted}/${tasksTotal}`, label: t('hero.tasks', lang), to: '/app/tasks' },
    { icon: Calendar, cardBg: 'bg-gradient-to-br from-[#EAF2FE] to-[#D9E8FD] dark:from-[#16233F] dark:to-[#1A2436]', iconBg: 'bg-[#3B82F6]/15 dark:bg-blue-400/20', iconColor: 'text-[#3B82F6] dark:text-blue-300', value: String(eventsToday), label: t('hero.events', lang), to: '/app/calendar' },
    { icon: Target, cardBg: 'bg-gradient-to-br from-[#FFF3E6] to-[#FEE4C8] dark:from-[#3A2714] dark:to-[#2E2016]', iconBg: 'bg-[#F97316]/15 dark:bg-orange-400/20', iconColor: 'text-[#F97316] dark:text-orange-300', value: `${goalsPercent}%`, label: t('hero.goals', lang), to: '/app/goals' },
    { icon: Leaf, cardBg: 'bg-gradient-to-br from-[#EAFBF0] to-[#D7F5DE] dark:from-[#17301F] dark:to-[#15261B]', iconBg: 'bg-[#16A34A]/15 dark:bg-green-400/20', iconColor: 'text-[#16A34A] dark:text-green-300', value: `${habitsPercent}%`, label: t('hero.habits', lang), to: '/app/habits' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <button
          key={s.label}
          onClick={() => navigate(s.to)}
          className={`flex items-center gap-2 sm:gap-3 text-left backdrop-blur-xl border border-white/70 dark:border-white/10 rounded-2xl px-3 sm:px-4 py-3.5 shadow-[0_10px_28px_rgba(99,69,181,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.3)] hover:shadow-[0_14px_32px_rgba(99,69,181,0.16)] transition-shadow min-w-0 ${s.cardBg}`}
        >
          <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
            <s.icon size={16} className={`${s.iconColor} sm:hidden`} />
            <s.icon size={20} className={`${s.iconColor} hidden sm:block`} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-[#1A1F36] dark:text-[#F1EFFB] leading-tight">{s.value}</p>
            {/* Sized to fit on a single line at every supported width
               (320px, 2-column grid) without ever needing to break mid-word
               — see dashboardEmptyStateRedesign.test.ts. */}
            <p className="text-[10px] sm:text-xs text-[#94A3B8] dark:text-[#B4AFD1] leading-tight whitespace-nowrap overflow-hidden">{s.label}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
