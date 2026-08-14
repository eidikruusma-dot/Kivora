import { useState, useEffect } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/AppCard'
import ProgressRing from '@/components/ui/ProgressRing'
import { getAllHabits, getDashboardPercent, subscribeHabits, toggleToday, TODAY_INDEX } from '@/lib/habitsStore'
import type { Habit } from '@/data/habitsData'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function HabitsWidget() {
  const navigate = useNavigate()
  const [habits, setHabits] = useState<Habit[]>(getAllHabits())
  const [percent, setPercent] = useState<number>(getDashboardPercent())
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => {
    return subscribeHabits(() => {
      setHabits(getAllHabits())
      setPercent(getDashboardPercent())
    })
  }, [])

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const activeHabits = habits.filter((h) => h.status === 'active')

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.habits.title', lang)}</h2>
        <button
          onClick={() => navigate('/app/habits')}
          className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline"
        >
          {t('dash.viewAll', lang)} <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 flex items-center px-5 pb-4 gap-4 min-h-0">
        {/* Habits list */}
        <div className="flex-1 space-y-2 min-w-0 overflow-y-auto scrollbar-thin">
          {activeHabits.slice(0, 4).map((habit) => {
            const done = habit.weekDays[TODAY_INDEX] === true
            const weekDone = habit.weekDays.filter((d) => d === true).length
            const weekTotal = habit.weekDays.filter((d) => d !== null).length
            return (
              <div
                key={habit.id}
                onClick={() => navigate('/app/habits')}
                className="flex items-center gap-2.5 rounded-lg px-1 -mx-1 py-0.5 cursor-pointer hover:bg-[#F8F7F4] transition-colors group"
              >
                {/* Checkbox — toggles today's completion, does not navigate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleToday(habit.id)
                  }}
                  title={done ? t('dash.habits.unmark', lang) : t('dash.habits.markDone', lang)}
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    done
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'border border-[#D1D5DB] bg-white hover:border-green-500'
                  }`}
                >
                  {done && <Check size={10} className="text-white" />}
                </button>

                <span className={`flex-1 text-sm truncate ${done ? 'text-[#94A3B8]' : 'text-[#1A1F36]'}`}>
                  {habit.title}
                </span>

                {done ? (
                  <span className="text-xs text-green-500 font-medium flex-shrink-0">{t('dash.habits.done', lang)}</span>
                ) : (
                  <span className="text-xs text-[#94A3B8] flex-shrink-0">{weekDone} / {weekTotal}</span>
                )}
              </div>
            )
          })}
          {activeHabits.length === 0 && (
            <p className="text-xs text-[#94A3B8] py-4 text-center">{t('dash.habits.empty', lang)}</p>
          )}
        </div>
        {/* Progress ring */}
        <ProgressRing value={percent} size={88} stroke={8} />
      </div>
    </Card>
  )
}
