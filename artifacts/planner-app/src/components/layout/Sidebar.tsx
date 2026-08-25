import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  StickyNote,
  Activity,
  Flag,
  Sparkles,
  Moon,
  GraduationCap,
  HelpCircle,
  Settings,
  Wallet,
  ClipboardList,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  subscribeToAppearance,
  applyAppearance,
  saveAppearanceSettings,
  getLocalAppearance,
  resolveEffectiveTheme,
} from '@/lib/appearanceStore'
import {
  subscribeToLanguage,
  getLocalLanguage,
} from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import { useAuth } from '@/context/AuthContext'
import type { ThemeMode } from '@/types'
import { useModules, type ModuleId } from '@/lib/modulesStore'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'

// ── Route definitions ────────────────────────────────────────────────────────

const NAV_ROUTES: {
  to: string
  tKey: Parameters<typeof t>[0]
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  moduleId?: ModuleId   // undefined = always visible
}[] = [
  { to: '/app',           tKey: 'nav.myDay'     as const, icon: LayoutDashboard },
  { to: '/app/tasks',     tKey: 'nav.tasks'     as const, icon: CheckSquare,   moduleId: 'tasks'     },
  { to: '/app/calendar',  tKey: 'nav.calendar'  as const, icon: Calendar,      moduleId: 'calendar'  },
  { to: '/app/notes',     tKey: 'nav.notes'     as const, icon: StickyNote,    moduleId: 'notes'     },
  { to: '/app/habits',    tKey: 'nav.habits'    as const, icon: Activity,      moduleId: 'habits'    },
  { to: '/app/finance',   tKey: 'nav.finance'   as const, icon: Wallet,        moduleId: 'finance'   },
  { to: '/app/goals',     tKey: 'nav.goals'     as const, icon: Flag,          moduleId: 'goals'     },
  { to: '/app/plans',     tKey: 'nav.plans'     as const, icon: ClipboardList, moduleId: 'plans'     },
  { to: '/app/assistant', tKey: 'nav.assistant' as const, icon: Sparkles,      moduleId: 'assistant' },
  { to: '/app/school',    tKey: 'nav.school'    as const, icon: GraduationCap, moduleId: 'school'    },
  { to: '/app/help',      tKey: 'nav.help'      as const, icon: HelpCircle                           },
  { to: '/app/settings',  tKey: 'nav.settings'  as const, icon: Settings                             },
]

// Modules gated by a central feature flag rather than a per-user toggle.
// Checked in addition to (and overriding) the stored module settings below.
export function isModuleFlaggedOff(moduleId: ModuleId): boolean {
  if (moduleId === 'finance') return !MONEY_MODULE_ENABLED
  return false
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { settings: modules } = useModules()

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() =>
    resolveEffectiveTheme(getLocalAppearance().themeMode)
  )

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => {
    return subscribeToAppearance((s) => {
      setEffectiveTheme(resolveEffectiveTheme(s.themeMode))
    })
  }, [])

  useEffect(() => {
    return subscribeToLanguage((s) => {
      setLang(s.appLang)
    })
  }, [])

  // If the user is currently on a module page and that module gets disabled,
  // redirect them to Home so they don't see a blank/broken page.
  useEffect(() => {
    const route = NAV_ROUTES.find(r => r.to === location.pathname)
    if (
      route?.moduleId &&
      (isModuleFlaggedOff(route.moduleId) || !modules[route.moduleId])
    ) {
      navigate('/app', { replace: true })
    }
  }, [modules, location.pathname, navigate])

  const isDark = effectiveTheme === 'dark'

  const handleToggle = () => {
    const current = getLocalAppearance()
    const newMode: ThemeMode = isDark ? 'light' : 'dark'
    const newSettings = { ...current, themeMode: newMode }
    applyAppearance(newSettings)
    if (user) saveAppearanceSettings(user.uid, newSettings)
  }

  // Filter nav items — hide module-gated items whose module is off
  const visibleRoutes = NAV_ROUTES.filter(({ moduleId }) => {
    if (!moduleId) return true                          // always visible (Home, Help, Settings)
    if (isModuleFlaggedOff(moduleId)) return false
    return modules[moduleId] === true                    // show only if module is enabled
  })

  const handleNavClick = (to: string) => {
    navigate(to)
    onClose()   // close the drawer on mobile/tablet after navigation
  }

  return (
    <aside
      className={[
        // Base: fixed overlay for mobile/tablet
        'flex-shrink-0 bg-white border-r border-[#EBEBEB] flex flex-col h-[100dvh]',
        'fixed inset-y-0 left-0 z-40 w-64',
        'transition-transform duration-300 ease-in-out',
        // Show/hide on mobile/tablet
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: back in normal flow, always visible, narrower
        'lg:static lg:translate-x-0 lg:w-52 lg:z-auto',
      ].join(' ')}
    >
      {/* Logo */}
      <button
        onClick={() => { navigate('/app'); onClose() }}
        className="px-5 py-3 flex items-center w-full hover:opacity-80 transition-opacity"
      >
        <span className="inline-flex items-center" style={{ gap: 8, height: 40 }}>
          <img src="/kivora-symbol.png" alt="" aria-hidden style={{ height: 40, width: 'auto', flexShrink: 0 }} draggable={false} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1, color: '#1A1F36' }}>Kivora</span>
        </span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleRoutes.map(({ to, tKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            onClick={(e) => {
              e.preventDefault()
              handleNavClick(to)
            }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                  : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={17}
                  strokeWidth={2}
                  className={isActive ? 'text-[#6F5AE8]' : 'text-[#94A3B8]'}
                />
                {t(tKey, lang)}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="px-5 py-5 border-t border-[#F0F0F0]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Moon size={16} className="text-[#94A3B8]" />
            <span className="text-sm text-[#64748B]">{t('sidebar.darkMode', lang)}</span>
          </div>
          <button
            onClick={handleToggle}
            className="relative rounded-full transition-colors"
            style={{
              width: '38px',
              height: '22px',
              backgroundColor: isDark ? '#6F5AE8' : '#D1D5DB',
            }}
          >
            <div
              className="absolute top-0.5 bg-white rounded-full shadow-sm transition-all"
              style={{
                width: '18px',
                height: '18px',
                left: isDark ? 'calc(100% - 20px)' : '2px',
              }}
            />
          </button>
        </div>
      </div>
    </aside>
  )
}
