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
  Settings,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/app', label: 'Minu päev', icon: LayoutDashboard },
  { to: '/app/tasks', label: 'Ülesanded', icon: CheckSquare },
  { to: '/app/calendar', label: 'Kalender', icon: Calendar },
  { to: '/app/notes', label: 'Märkmed', icon: StickyNote },
  { to: '/app/habits', label: 'Harjumused', icon: Activity },
  { to: '/app/goals', label: 'Eesmärgid', icon: Flag },
  { to: '/app/assistant', label: 'AI assistent', icon: Sparkles },
  { to: '/app/school', label: 'Kool', icon: GraduationCap },
  { to: '/app/settings', label: 'Seaded', icon: Settings },
]

export default function Sidebar() {
  const [darkMode, setDarkMode] = useState(false)
  const navigate = useNavigate()

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-[#EBEBEB] flex flex-col h-[100dvh]">
      {/* Logo */}
      <button
        onClick={() => navigate('/app')}
        className="px-5 py-5 flex items-center gap-2.5 w-full hover:opacity-80 transition-opacity"
      >
        {/* Placeholder for official Kivora logo — replace when provided */}
        <div className="w-8 h-8 rounded-lg bg-[#6F5AE8] flex items-center justify-center">
          <span className="text-white font-bold text-sm tracking-tight">K</span>
        </div>
        <span className="text-base font-bold text-[#1A1F36] tracking-tight">kivora</span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
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
                {label}
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
            <span className="text-sm text-[#64748B]">Tume režiim</span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="relative rounded-full transition-colors"
            style={{
              width: '38px',
              height: '22px',
              backgroundColor: darkMode ? '#6F5AE8' : '#D1D5DB',
            }}
          >
            <div
              className="absolute top-0.5 bg-white rounded-full shadow-sm transition-all"
              style={{
                width: '18px',
                height: '18px',
                left: darkMode ? 'calc(100% - 20px)' : '2px',
              }}
            />
          </button>
        </div>
      </div>
    </aside>
  )
}
