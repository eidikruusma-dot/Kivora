import { CheckSquare, Calendar, CheckCircle2, Target } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getDailyMessage } from '@/lib/dailyMessage'
import { useTasks } from '@/lib/tasksStore'
import { useCalendarEvents } from '@/lib/calendarStore'
import { getEventsForDate } from '@/lib/calendar/eventLayout'
import { getDashboardPercent, subscribeHabits } from '@/lib/habitsStore'
import { useGoals } from '@/lib/goalsStore'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

function MountainIllustration() {
  return (
    <svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EDE9FB" />
          <stop offset="100%" stopColor="#F5F3FF" />
        </linearGradient>
      </defs>
      <rect width="220" height="200" fill="url(#skyG)" />
      <path d="M0 200 L25 115 L50 140 L80 85 L110 120 L140 70 L170 105 L220 75 L220 200 Z" fill="#C4B5FD" opacity="0.45"/>
      <path d="M0 200 L35 145 L65 160 L95 110 L125 140 L158 95 L195 125 L220 108 L220 200 Z" fill="#A78BFA" opacity="0.4"/>
      <path d="M45 200 L128 32 L210 200 Z" fill="#8B5CF6" opacity="0.85"/>
      <path d="M128 32 L162 95 L210 200 Z" fill="#7C3AED" opacity="0.25"/>
      <path d="M121 56 L128 32 L135 56 Q128 61 121 56 Z" fill="white" opacity="0.75"/>
      <polygon points="18,182 27,160 36,182" fill="#7C3AED" opacity="0.65"/>
      <polygon points="30,192 38,173 46,192" fill="#8B5CF6" opacity="0.55"/>
      <polygon points="172,186 180,166 188,186" fill="#7C3AED" opacity="0.65"/>
      <polygon points="186,194 193,178 200,194" fill="#8B5CF6" opacity="0.5"/>
      <path d="M128 32 C136 58 147 76 157 91 S171 116 174 138 S177 164 179 195"
            stroke="white" strokeWidth="2.5" fill="none"
            strokeDasharray="5,4" opacity="0.85" strokeLinecap="round"/>
      <line x1="128" y1="32" x2="128" y2="13" stroke="#6D28D9" strokeWidth="2"/>
      <polygon points="128,13 148,20 128,27" fill="#6F5AE8"/>
      <circle cx="157" cy="91" r="6" fill="white" opacity="0.95"/>
      <circle cx="157" cy="91" r="3.5" fill="#6F5AE8"/>
    </svg>
  )
}

export default function HeroCard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  const allTasks      = useTasks()
  const allEvents     = useCalendarEvents()
  const goals         = useGoals()
  const [habitsPercent, setHabitsPercent] = useState(getDashboardPercent())

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  useEffect(() => subscribeHabits(() => setHabitsPercent(getDashboardPercent())), [])

  const tasksCompleted = allTasks.filter((tk) => tk.completed).length
  const tasksTotal     = allTasks.length
  const eventsToday    = getEventsForDate(allEvents, new Date()).length
  const goalsPercent   = goals.length === 0
    ? 0
    : Math.round(goals.reduce((sum, g) => sum + (g.progressValue / Math.max(g.progressMax, 1)) * 100, 0) / goals.length)

  const stats = [
    { icon: CheckSquare,  color: 'text-blue-400',   bg: 'bg-blue-50',   value: `${tasksCompleted}/${tasksTotal}`, label: t('hero.tasks',   lang), to: '/app/tasks'    },
    { icon: Calendar,     color: 'text-sky-400',    bg: 'bg-sky-50',    value: String(eventsToday),               label: t('hero.events',  lang), to: '/app/calendar' },
    { icon: Target,       color: 'text-orange-400', bg: 'bg-orange-50', value: `${goalsPercent}%`,                label: t('hero.goals',   lang), to: '/app/goals'    },
    { icon: CheckCircle2, color: 'text-green-500',  bg: 'bg-green-50',  value: `${habitsPercent}%`,               label: t('hero.habits',  lang), to: '/app/habits'   },
  ]

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? t('hero.morning', lang) : hour < 18 ? t('hero.afternoon', lang) : t('hero.evening', lang)
  const name     = user?.displayName || 'kasutaja'
  const dailyMsg = getDailyMessage({ date: new Date(), lang })

  return (
    <div className="bg-white rounded-2xl flex overflow-hidden h-full" style={{ minHeight: '120px' }}>
      <div className="flex-1 px-6 py-4 flex items-center gap-6">
        <div className="flex-shrink-0">
          <p className="text-lg font-bold text-[#1A1F36] leading-tight">{greeting}, {name} 👋</p>
          <p className="text-xs text-[#94A3B8] mt-1">{dailyMsg}</p>
        </div>
        <div className="h-10 w-px bg-[#F0F0F0]" />
        <div className="grid grid-cols-4 gap-5 flex-1">
          {stats.map(({ icon: Icon, color, bg, value, label, to }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
            >
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-base font-bold text-[#1A1F36] leading-none">{value}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{label}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="w-32 flex-shrink-0 hidden sm:block">
        <MountainIllustration />
      </div>
    </div>
  )
}
