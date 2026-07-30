import { NavLink, useNavigate } from 'react-router-dom'
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

// Route + icon definitions — labels are derived from translations at render time
const NAV_ROUTES = [
  { to: '/app',           tKey: 'nav.myDay'     as const, icon: LayoutDashboard },
  { to: '/app/tasks',     tKey: 'nav.tasks'     as const, icon: CheckSquare     },
  { to: '/app/calendar',  tKey: 'nav.calendar'  as const, icon: Calendar        },
  { to: '/app/notes',     tKey: 'nav.notes'     as const, icon: StickyNote      },
  { to: '/app/habits',    tKey: 'nav.habits'    as const, icon: Activity        },
  { to: '/app/goals',     tKey: 'nav.goals'     as const, icon: Flag            },
  { to: '/app/assistant', tKey: 'nav.assistant' as const, icon: Sparkles        },
  { to: '/app/school',    tKey: 'nav.school'    as const, icon: GraduationCap   },
  { to: '/app/help',      tKey: 'nav.help'      as const, icon: HelpCircle      },
  { to: '/app/settings',  tKey: 'nav.settings'  as const, icon: Settings        },
]

export default function Sidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()

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

  const isDark = effectiveTheme === 'dark'

  const handleToggle = () => {
    const current = getLocalAppearance()
    const newMode: ThemeMode = isDark ? 'light' : 'dark'
    const newSettings = { ...current, themeMode: newMode }
    applyAppearance(newSettings)
    if (user) saveAppearanceSettings(user.uid, newSettings)
  }

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-[#EBEBEB] flex flex-col h-[100dvh]">
      {/* Logo */}
      <button
        onClick={() => navigate('/app')}
        className="px-5 py-5 flex items-center gap-2.5 w-full hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-lg bg-[#6F5AE8] flex items-center justify-center">
          <span className="text-white font-bold text-sm tracking-tight">K</span>
        </div>
        <span className="text-base font-bold text-[#1A1F36] tracking-tight">kivora</span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV_ROUTES.map(({ to, tKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            onClick={(e) => {
              e.preventDefault()
              navigate(to)
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
