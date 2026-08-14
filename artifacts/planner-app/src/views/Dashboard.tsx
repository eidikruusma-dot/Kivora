import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import TasksWidget from '@/components/dashboard/TasksWidget'
import CalendarWidget from '@/components/dashboard/CalendarWidget'
import QuickNoteWidget from '@/components/dashboard/QuickNoteWidget'
import HabitsWidget from '@/components/dashboard/HabitsWidget'
import GoalsWidget from '@/components/dashboard/GoalsWidget'
import QuickActionsWidget from '@/components/dashboard/QuickActionsWidget'
import HeroCard from '@/components/dashboard/HeroCard'
import { useModules } from '@/lib/modulesStore'

export default function Dashboard() {
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { settings: modules } = useModules()

  // Scroll to top whenever the user navigates to the Dashboard
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.key])

  // Build visible widget arrays — QuickActionsWidget is always shown
  const row1 = [
    modules.tasks    && <TasksWidget    key="tasks"    />,
    modules.calendar && <CalendarWidget key="calendar" />,
    modules.notes    && <QuickNoteWidget key="notes"   />,
  ].filter(Boolean) as React.ReactElement[]

  const row2 = [
    modules.habits && <HabitsWidget  key="habits" />,
    modules.goals  && <GoalsWidget   key="goals"  />,
    <QuickActionsWidget key="actions" />,
  ].filter(Boolean) as React.ReactElement[]

  // Combine rows; if row1 is empty, put everything in a single row
  const allWidgets = [...row1, ...row2]

  // Desktop: split into two balanced rows (up to 3 per row)
  const desktopRow1 = row1.length > 0 ? row1 : allWidgets.slice(0, Math.ceil(allWidgets.length / 2))
  const desktopRow2 = row1.length > 0 ? row2 : allWidgets.slice(Math.ceil(allWidgets.length / 2))

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-thin lg:overflow-hidden">
      {/* Desktop: fixed grid with hero strip + up to 2 rows of cards */}
      <div className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col px-8 pt-4 pb-5 gap-3.5">
        <div className="flex-shrink-0">
          <HeroCard />
        </div>

        {allWidgets.length > 0 ? (
          <div
            className="flex-1 min-h-0 gap-3.5"
            style={{
              display: 'grid',
              gridTemplateRows: desktopRow2.length > 0
                ? 'minmax(0, 1fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr)',
            }}
          >
            {/* Row 1 */}
            {desktopRow1.length > 0 && (
              <div
                className="min-h-0 gap-3.5"
                style={{ display: 'grid', gridTemplateColumns: `repeat(${desktopRow1.length}, minmax(0, 1fr))` }}
              >
                {desktopRow1}
              </div>
            )}
            {/* Row 2 */}
            {desktopRow2.length > 0 && (
              <div
                className="min-h-0 gap-3.5"
                style={{ display: 'grid', gridTemplateColumns: `repeat(${desktopRow2.length}, minmax(0, 1fr))` }}
              >
                {desktopRow2}
              </div>
            )}
          </div>
        ) : (
          /* All modules disabled — empty state */
          <div className="flex-1 flex items-center justify-center text-sm text-[#94A3B8]">
            {/* Modules can be re-enabled in Settings */}
          </div>
        )}
      </div>

      {/*
       * Mobile / tablet (< lg): natural flow with page scroll.
       *
       * Widget columns:
       *   < sm  (portrait phone  ≤ 639 px)  → 1 column
       *   sm+   (landscape phone ≥ 640 px)  → 2 columns
       *
       * The sm breakpoint (640 px) captures virtually all landscape phones
       * (iPhone SE landscape = 667 px, Pixel 5 landscape = 851 px, etc.)
       * without affecting portrait phones.
       */}
      <div className="flex flex-col px-4 sm:px-6 pt-3 sm:pt-4 pb-4 gap-3 lg:hidden">
        <HeroCard />
        {allWidgets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allWidgets}
          </div>
        )}
      </div>
    </div>
  )
}
