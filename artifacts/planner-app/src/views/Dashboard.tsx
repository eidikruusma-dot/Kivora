import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import TasksWidget from '@/components/dashboard/TasksWidget'
import CalendarWidget from '@/components/dashboard/CalendarWidget'
import QuickNoteWidget from '@/components/dashboard/QuickNoteWidget'
import HabitsWidget from '@/components/dashboard/HabitsWidget'
import GoalsWidget from '@/components/dashboard/GoalsWidget'
import QuickActionsWidget from '@/components/dashboard/QuickActionsWidget'
import HeroCard from '@/components/dashboard/HeroCard'

export default function Dashboard() {
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top whenever the user navigates to the Dashboard
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.key])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-thin lg:overflow-hidden">
      {/* Desktop: fixed grid with hero strip + 2 rows of cards */}
      <div className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col px-8 pt-4 pb-5 gap-3.5">
        <div className="flex-shrink-0">
          <HeroCard />
        </div>
        <div
          className="flex-1 grid min-h-0 gap-3.5"
          style={{ gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)' }}
        >
          <div className="grid grid-cols-3 gap-3.5 min-h-0">
            <TasksWidget />
            <CalendarWidget />
            <QuickNoteWidget />
          </div>
          <div className="grid grid-cols-3 gap-3.5 min-h-0">
            <HabitsWidget />
            <GoalsWidget />
            <QuickActionsWidget />
          </div>
        </div>
      </div>

      {/* Mobile/tablet: natural flow with page scroll */}
      <div className="flex flex-col px-4 sm:px-6 pb-4 gap-3 lg:hidden">
        <HeroCard />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TasksWidget />
          <CalendarWidget />
          <QuickNoteWidget />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HabitsWidget />
          <GoalsWidget />
          <QuickActionsWidget />
        </div>
      </div>
    </div>
  )
}
