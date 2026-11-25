import { NavLink, useNavigate } from 'react-router-dom'
import { Home, CheckSquare, Calendar, Leaf, Target, LayoutGrid } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useModules, type ModuleId } from '@/lib/modulesStore'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * Fixed bottom navigation shown on mobile/tablet (< lg) only — desktop
 * keeps the existing always-visible Sidebar, unchanged.
 *
 * Primary slots: "Minu päev" always, then up to 4 of the most-used
 * modules (tasks, calendar, habits, goals), each shown ONLY if that
 * module is currently enabled (see modulesStore) — a disabled module's
 * slot is simply omitted rather than replaced by another module, so the
 * bar never shows more than 6 items and the remaining enabled items
 * redistribute evenly (via `flex-1` on each item) to fill the width.
 * "Rohkem" is always last and opens the existing Sidebar drawer (the
 * exact same component the header's hamburger button already opens) —
 * no separate "more" screen was built, so the side menu stays the single
 * source of truth for every other destination (Notes, Plans, Finance,
 * Assistant, School, Settings, Help, etc).
 *
 * Icons match the confirmed design reference's bottom nav exactly (home /
 * checkbox / calendar / leaf / target / grid), and the active item gets
 * the reference's rounded lavender pill behind both icon and label.
 * Labels are sized to fit on a single line at the narrowest supported
 * phone width (320px / 6 items) without ever truncating with an ellipsis
 * or being hyphenated/split mid-word — `whitespace-nowrap overflow-hidden`
 * is only a safe, invisible fallback for an unexpectedly long future
 * translation string, not the normal case.
 */

interface PrimaryRoute {
  to: string
  tKey: Parameters<typeof t>[0]
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  moduleId?: ModuleId // undefined = always visible (Minu päev)
}

const PRIMARY_ROUTES: PrimaryRoute[] = [
  { to: '/app',          tKey: 'nav.myDay',    icon: Home },
  { to: '/app/tasks',    tKey: 'nav.tasks',    icon: CheckSquare, moduleId: 'tasks' },
  { to: '/app/calendar', tKey: 'nav.calendar', icon: Calendar,    moduleId: 'calendar' },
  { to: '/app/habits',   tKey: 'nav.habits',   icon: Leaf,        moduleId: 'habits' },
  { to: '/app/goals',    tKey: 'nav.goals',    icon: Target,      moduleId: 'goals' },
]

interface MobileBottomNavProps {
  onOpenMore: () => void
}

export default function MobileBottomNav({ onOpenMore }: MobileBottomNavProps) {
  const navigate = useNavigate()
  const { settings: modules } = useModules()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const visibleRoutes = PRIMARY_ROUTES.filter(
    ({ moduleId }) => !moduleId || modules[moduleId] === true,
  )

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch bg-white/85 dark:bg-[#17132A]/90 backdrop-blur-xl border-t border-white/70 dark:border-white/10 shadow-[0_-8px_30px_rgba(99,69,181,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.4)] px-1 py-1.5"
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
    >
      {visibleRoutes.map(({ to, tKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/app'}
          onClick={(e) => {
            e.preventDefault()
            navigate(to)
          }}
          className="flex-1 min-w-0 flex items-center justify-center py-1"
        >
          {({ isActive }) => (
            <span
              className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-colors ${
                isActive ? 'bg-[#EDE7FD] dark:bg-[#3B2F66]' : ''
              }`}
            >
              <Icon
                size={18}
                strokeWidth={isActive ? 2.3 : 1.8}
                className={isActive ? 'text-[#6F5AE8] dark:text-[#C4B5FD]' : 'text-[#94A3B8] dark:text-[#7A7599]'}
              />
              {/* Sized to fit every nav label on a single line at the
                 narrowest supported phone width (320px / 6 items) without
                 ever needing to hyphenate or wrap mid-word — see
                 dashboardEmptyStateRedesign.test.ts. */}
              <span
                className={`w-full text-[8.5px] font-medium leading-[1.1] text-center whitespace-nowrap overflow-hidden ${
                  isActive ? 'text-[#6F5AE8] dark:text-[#C4B5FD] font-semibold' : 'text-[#94A3B8] dark:text-[#7A7599]'
                }`}
              >
                {t(tKey, lang)}
              </span>
            </span>
          )}
        </NavLink>
      ))}

      <button
        onClick={onOpenMore}
        className="flex-1 min-w-0 flex items-center justify-center py-1"
      >
        <span className="w-full flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl">
          <LayoutGrid size={18} strokeWidth={1.8} className="text-[#94A3B8] dark:text-[#7A7599]" />
          <span className="w-full text-[8.5px] font-medium leading-[1.1] text-center whitespace-nowrap overflow-hidden text-[#94A3B8] dark:text-[#7A7599]">
            {t('nav.more', lang)}
          </span>
        </span>
      </button>
    </nav>
  )
}
