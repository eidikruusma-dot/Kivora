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
    { icon: CheckSquare, labelKey: 'dash.action.newTask'  as const, to: '/app/tasks'    },
    { icon: Calendar,    labelKey: 'dash.action.newEvent' as const, to: '/app/calendar' },
    { icon: StickyNote,  labelKey: 'dash.action.quickNote' as const, to: '/app/notes'  },
  ]

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4">
        <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.actions.title', lang)}</h2>
      </div>
      <div className="flex-1 px-4 pb-4 grid grid-cols-2 gap-2.5 content-center">
        {actions.map(({ icon: Icon, labelKey, to }) => (
          <button
            key={labelKey}
            onClick={() => navigate(to)}
            className="flex items-center gap-2.5 px-3.5 h-[52px] rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
          >
            <Icon size={18} className="text-[#6F5AE8] flex-shrink-0" />
            <span className="text-sm font-medium text-[#1A1F36] truncate">{t(labelKey, lang)}</span>
          </button>
        ))}
        <button
          onClick={openModal}
          className="flex items-center gap-2.5 px-3.5 h-[52px] rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
        >
          <Timer size={18} className="text-[#6F5AE8] flex-shrink-0" />
          <span className="text-sm font-medium text-[#1A1F36] truncate">{t('dash.action.timer', lang)}</span>
        </button>
      </div>
    </Card>
  )
}
