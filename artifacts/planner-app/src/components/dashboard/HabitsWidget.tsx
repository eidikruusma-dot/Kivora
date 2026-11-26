import { useState, useEffect } from 'react'
import { Check, ArrowRight, Leaf } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardProgressRing from '@/components/dashboard/DashboardProgressRing'
import { getAllHabits, getDashboardPercent, subscribeHabits, toggleHabitDay } from '@/lib/habitsStore'
import type { Habit } from '@/data/habitsData'
import { toDateKey, isHabitDoneOnDate, getCurrentWeekDates, computeHabitDateRangeStats } from '@/data/habitsData'
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
  const today = new Date()
  const weekDates = getCurrentWeekDates(today)

  return (
    <DashboardCard className={activeHabits.length === 0 ? 'flex flex-col self-start' : 'h-full flex flex-col'}>
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">
          <Leaf size={17} className="text-[#16A34A] dark:text-green-300" />
          {t('dash.habits.title', lang)}
        </h2>
        <button
          onClick={() => navigate('/app/habits')}
          className="text-[11px] text-[#6F5AE8] dark:text-[#A78BFA] font-medium flex items-center gap-0.5 hover:underline"
        >
          {t('dash.viewAll', lang)} <ArrowRight size={11} />
        </button>
      </div>
      {activeHabits.length === 0 ? (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-3 py-3">
            <div className="w-8 h-8 rounded-full bg-[#DCFCE7] dark:bg-green-400/15 flex items-center justify-center flex-shrink-0">
              <Leaf size={16} className="text-[#16A34A] dark:text-green-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#94A3B8] dark:text-[#9C96C2] leading-snug">{t('dash.habits.empty', lang)}</p>
              <button
                onClick={() => navigate('/app/habits', { state: { openCreate: true } })}
                className="text-xs font-semibold text-[#16A34A] dark:text-green-300 hover:underline py-1"
              >
                {t('dash.habits.emptyCta', lang)}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex-1 flex items-center px-5 pb-4 gap-4 min-h-0">
        {/* Habits list */}
        <div className="flex-1 space-y-2 min-w-0 overflow-y-auto scrollbar-thin">
          {activeHabits.slice(0, 4).map((habit) => {
            const done = isHabitDoneOnDate(habit, today)
            const { done: weekDone, total: weekTotal } = computeHabitDateRangeStats(habit, weekDates, today)
            return (
              <div
                key={habit.id}
                onClick={() => navigate('/app/habits')}
                className="flex items-center gap-2.5 rounded-lg px-1 -mx-1 py-0.5 cursor-pointer hover:bg-[#F8F7F4] dark:hover:bg-white/5 transition-colors group"
              >
                {/* Checkbox — toggles today's completion, does not navigate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleHabitDay(habit.id, toDateKey(today)).catch(() => {
                      // The store already reverts its own optimistic update
                      // on failure; nothing further to do here.
                    })
                  }}
                  title={done ? t('dash.habits.unmark', lang) : t('dash.habits.markDone', lang)}
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    done
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'border border-[#D1D5DB] dark:border-white/20 bg-white dark:bg-transparent hover:border-green-500'
                  }`}
                >
                  {done && <Check size={10} className="text-white" />}
                </button>

                <span className={`flex-1 min-w-0 text-sm break-words ${done ? 'text-[#94A3B8] dark:text-[#6B6485]' : 'text-[#1A1F36] dark:text-[#F1EFFB]'}`}>
                  {habit.title}
                </span>

                {done ? (
                  <span className="text-xs text-green-500 dark:text-green-300 font-medium flex-shrink-0">{t('dash.habits.done', lang)}</span>
                ) : (
                  <span className="text-xs text-[#94A3B8] dark:text-[#9C96C2] flex-shrink-0">{weekDone} / {weekTotal}</span>
                )}
              </div>
            )
          })}
        </div>
        {/* Progress ring */}
        <DashboardProgressRing value={percent} lang={lang} size={88} stroke={8} />
      </div>
      )}
    </DashboardCard>
  )
}
