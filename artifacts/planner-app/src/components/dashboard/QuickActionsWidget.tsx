import { useState, useEffect } from 'react'
import { CheckSquare, Calendar, StickyNote, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/AppCard'
import { useFocusTimer } from '@/context/FocusTimerContext'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function QuickActionsWidget() {
  const navigate = useNavigate()
  const { openModal } = useFocusTimer()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const actions = [
    { icon: CheckSquare, labelKey: 'dash.action.newTask'   as const, to: '/app/tasks',    iconBg: 'bg-[#EDE9FB]', iconColor: 'text-[#6F5AE8]' },
    { icon: Calendar,    labelKey: 'dash.action.newEvent'  as const, to: '/app/calendar', iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
    { icon: StickyNote,  labelKey: 'dash.action.quickNote' as const, to: '/app/notes',    iconBg: 'bg-[#FFEDD5]', iconColor: 'text-[#F97316]' },
  ]

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4">
        <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.actions.title', lang)}</h2>
      </div>
      <div className="flex-1 px-4 pb-4 grid grid-cols-2 gap-2.5 content-center">
        {actions.map(({ icon: Icon, labelKey, to, iconBg, iconColor }) => (
          <button
            key={labelKey}
            onClick={() => navigate(to)}
            className="flex items-center gap-2.5 px-3.5 py-2 min-h-[52px] sm:h-[52px] sm:py-0 rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon size={16} className={iconColor} />
            </div>
            <span className="text-sm font-medium text-[#1A1F36] leading-snug sm:truncate">{t(labelKey, lang)}</span>
          </button>
        ))}
        <button
          onClick={openModal}
          className="flex items-center gap-2.5 px-3.5 py-2 min-h-[52px] sm:h-[52px] sm:py-0 rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#DCFCE7]">
            <Timer size={16} className="text-[#16A34A]" />
          </div>
          <span className="text-sm font-medium text-[#1A1F36] leading-snug sm:truncate">{t('dash.action.timer', lang)}</span>
        </button>
      </div>
    </Card>
  )
}
