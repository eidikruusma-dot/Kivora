import { useState, useEffect } from 'react'
import { Zap, CheckSquare, Calendar, StickyNote, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFocusTimer } from '@/context/FocusTimerContext'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * Its own full-width strip directly under the day's stat cards (never
 * mixed into the Tasks/Calendar/Habits/Goals grid below) — see the
 * "Minu päev" redesign's explicit requirement that quick actions sit
 * immediately below the day's statistics. Per the confirmed design
 * reference, each action is its own solidly-colored button card (not a
 * neutral card with just a tinted icon chip) — purple / blue / peach /
 * green, matching the reference exactly.
 */
export default function QuickActionsWidget() {
  const navigate = useNavigate()
  const { openModal } = useFocusTimer()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const actions = [
    {
      icon: CheckSquare, labelKey: 'dash.action.newTask' as const, onClick: () => navigate('/app/tasks'),
      bg: 'bg-gradient-to-b from-[#EDE7FD] to-[#E1D7FB] dark:from-[#3B2F66] dark:to-[#30275A]',
      color: 'text-[#6F5AE8] dark:text-[#C4B5FD]',
    },
    {
      icon: Calendar, labelKey: 'dash.action.newEvent' as const, onClick: () => navigate('/app/calendar'),
      bg: 'bg-gradient-to-b from-[#DCEAFE] to-[#C9DEFC] dark:from-[#1E3156] dark:to-[#192A49]',
      color: 'text-[#3B82F6] dark:text-blue-300',
    },
    {
      icon: StickyNote, labelKey: 'dash.action.quickNote' as const, onClick: () => navigate('/app/notes'),
      bg: 'bg-gradient-to-b from-[#FDE9D2] to-[#FBDCB8] dark:from-[#4A2E14] dark:to-[#3D250F]',
      color: 'text-[#F97316] dark:text-orange-300',
    },
    {
      icon: Timer, labelKey: 'dash.action.timer' as const, onClick: openModal,
      bg: 'bg-gradient-to-b from-[#D7F5DE] to-[#C2EDCD] dark:from-[#153821] dark:to-[#102C1A]',
      color: 'text-[#16A34A] dark:text-green-300',
    },
  ]

  return (
    <div className="rounded-2xl bg-white/85 dark:bg-[#1E1B33]/80 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-[0_10px_28px_rgba(99,69,181,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.3)] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap size={16} className="text-[#6F5AE8] dark:text-[#A78BFA]" />
        <h2 className="text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">{t('dash.actions.title', lang)}</h2>
      </div>
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5">
        {actions.map(({ icon: Icon, labelKey, onClick, bg, color }) => (
          <button
            key={labelKey}
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-1 rounded-2xl shadow-[0_6px_16px_rgba(99,69,181,0.08)] hover:shadow-[0_8px_20px_rgba(99,69,181,0.14)] hover:-translate-y-0.5 transition-all text-center ${bg}`}
          >
            <Icon size={20} className={color} strokeWidth={2.2} />
            <span className={`text-[10.5px] sm:text-xs font-semibold leading-tight ${color}`}>
              {t(labelKey, lang)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
