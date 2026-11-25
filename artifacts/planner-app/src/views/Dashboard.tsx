import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import TasksWidget from '@/components/dashboard/TasksWidget'
import CalendarWidget from '@/components/dashboard/CalendarWidget'
import QuickNoteWidget from '@/components/dashboard/QuickNoteWidget'
import HabitsWidget from '@/components/dashboard/HabitsWidget'
import GoalsWidget from '@/components/dashboard/GoalsWidget'
import QuickActionsWidget from '@/components/dashboard/QuickActionsWidget'
import HeroCard from '@/components/dashboard/HeroCard'
import DashboardStatCards from '@/components/dashboard/DashboardStatCards'
import DashboardBackground from '@/components/dashboard/DashboardBackground'
import { useModules } from '@/lib/modulesStore'

/**
 * Single, unified, mobile-first flow for every breakpoint — replacing the
 * earlier "fixed-height desktop grid vs. natural-flow mobile" split. The
 * confirmed design reference is itself a tall, naturally-scrolling page
 * (greeting → 4 separate stat cards → quick actions → task/calendar row →
 * habit/goal row → quick note), so the dashboard now follows that same
 * structure at every width instead of trying to force everything into a
 * fixed desktop viewport height (which was producing large empty gaps
 * under the Habits/Goals row on wide screens). Only the column COUNT of
 * each row adapts with the viewport (1 col on narrow phones, 2 from sm:),
 * not the overall composition.
 */
export default function Dashboard() {
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { settings: modules } = useModules()

  // Scroll to top whenever the user navigates to the Dashboard
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.key])

  const taskCalRow = [
    modules.tasks    && <TasksWidget    key="tasks"    />,
    modules.calendar && <CalendarWidget key="calendar" />,
  ].filter(Boolean) as React.ReactElement[]

  const habitGoalRow = [
    modules.habits && <HabitsWidget key="habits" />,
    modules.goals  && <GoalsWidget  key="goals"  />,
  ].filter(Boolean) as React.ReactElement[]

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto scrollbar-thin bg-[#FBFAFF] dark:bg-transparent">
      <DashboardBackground />

      <div className="relative z-10 flex flex-col gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-6 max-w-[1280px] mx-auto">
        <HeroCard />
        <DashboardStatCards />
        <QuickActionsWidget />

        {taskCalRow.length > 0 && (
          <div className={`grid grid-cols-1 ${taskCalRow.length > 1 ? 'sm:grid-cols-2' : ''} gap-3 sm:gap-4 items-stretch`}>
            {taskCalRow}
          </div>
        )}

        {habitGoalRow.length > 0 && (
          <div className={`grid grid-cols-1 ${habitGoalRow.length > 1 ? 'sm:grid-cols-2' : ''} gap-3 sm:gap-4 items-stretch`}>
            {habitGoalRow}
          </div>
        )}

        {modules.notes && <QuickNoteWidget />}
      </div>
    </div>
  )
}
