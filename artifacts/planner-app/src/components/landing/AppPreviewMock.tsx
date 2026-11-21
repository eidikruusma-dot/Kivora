import { CheckSquare, Calendar as CalendarIcon, Target, Flame } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A clearly-illustrative, static preview of the real Kivora dashboard —
 * never a live screenshot (no account is created or read to produce
 * this). Every panel mirrors the real app's own visual language exactly
 * (HeroCard's stat tiles, TasksWidget's checkbox/priority rows,
 * GoalsWidget's progress bars, CalendarWidget's colour-coded event rows),
 * but with sample, non-real data. The "Näidis" badge and the caption
 * underneath both label it explicitly as a sample.
 */

const TASK_ROWS: { key: 'landing.preview.task1' | 'landing.preview.task2' | 'landing.preview.task3'; priority: 'high' | 'medium' | 'low'; done: boolean }[] = [
  { key: 'landing.preview.task1', priority: 'high', done: false },
  { key: 'landing.preview.task2', priority: 'medium', done: false },
  { key: 'landing.preview.task3', priority: 'low', done: true },
]

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-orange-500',
  medium: 'text-orange-400',
  low: 'text-slate-400',
}

const GOAL_ROWS: { key: 'landing.preview.goal1' | 'landing.preview.goal2'; pct: number; color: string }[] = [
  { key: 'landing.preview.goal1', pct: 65, color: '#6F5AE8' },
  { key: 'landing.preview.goal2', pct: 40, color: '#F97316' },
]

const EVENT_ROWS: { key: 'landing.preview.event1' | 'landing.preview.event2'; time: string; color: string }[] = [
  { key: 'landing.preview.event1', time: '10:00', color: '#6F5AE8' },
  { key: 'landing.preview.event2', time: '18:30', color: '#EC4899' },
]

function StatTile({ icon: Icon, color, bg, value, label }: { icon: typeof CheckSquare; color: string; bg: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={15} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#1A1F36] leading-none">{value}</p>
        <p className="text-[10px] text-[#94A3B8] mt-0.5 truncate">{label}</p>
      </div>
    </div>
  )
}

export default function AppPreviewMock({ lang }: { lang: AppLang }) {
  const stats = [
    { icon: CheckSquare, color: 'text-blue-500', bg: 'bg-blue-50', value: '5/8', label: t('hero.tasks', lang) },
    { icon: CalendarIcon, color: 'text-sky-500', bg: 'bg-sky-50', value: '2', label: t('hero.events', lang) },
    { icon: Target, color: 'text-orange-500', bg: 'bg-orange-50', value: '52%', label: t('hero.goals', lang) },
    { icon: Flame, color: 'text-emerald-500', bg: 'bg-emerald-50', value: '80%', label: t('hero.habits', lang) },
  ]

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative bg-white/90 backdrop-blur rounded-[28px] border border-[#EEE9FB] shadow-[0_40px_90px_-30px_rgba(111,90,232,0.4)] overflow-hidden">
        {/* Chrome bar */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#F3F0FC] bg-gradient-to-r from-[#FBFAFF] to-[#F6F3FE]">
          <span className="text-xs font-bold text-[#1A1F36]">{t('landing.preview.today', lang)}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#2E1065] text-white text-[9px] font-bold tracking-wide uppercase">
            {t('landing.preview.sampleBadge', lang)}
          </span>
        </div>

        {/* Stat row — mirrors the real dashboard's day-overview tiles */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 px-5 py-4">
          {stats.map((s) => (
            <StatTile key={s.label} {...s} />
          ))}
        </div>

        <div className="h-px bg-[#F3F0FC]" />

        {/* Tasks + Goals side by side (stack would be too tall on mobile, so keep 2-up) */}
        <div className="grid grid-cols-2 divide-x divide-[#F3F0FC]">
          <div className="px-4 py-3.5">
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wide mb-2">{t('dash.tasks.title', lang)}</p>
            <div className="space-y-2">
              {TASK_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-1.5">
                  <div
                    className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      row.done ? 'bg-[#6F5AE8] border-[#6F5AE8]' : 'border-[#D1D5DB] bg-white'
                    }`}
                  >
                    {row.done && (
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 text-[11px] leading-tight truncate ${row.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                    {t(row.key, lang)}
                  </span>
                  {!row.done && <span className={`text-[9px] font-semibold flex-shrink-0 ${PRIORITY_COLOR[row.priority]}`}>{t(`tasks.priority.${row.priority}`, lang)}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wide mb-2">{t('dash.goals.title', lang)}</p>
            <div className="space-y-2.5">
              {GOAL_ROWS.map((goal) => (
                <div key={goal.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#1A1F36] truncate pr-1">{t(goal.key, lang)}</span>
                    <span className="text-[10px] font-bold flex-shrink-0" style={{ color: goal.color }}>{goal.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#F1EFFB] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${goal.pct}%`, backgroundColor: goal.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-px bg-[#F3F0FC]" />

        {/* Today's events strip */}
        <div className="px-5 py-3.5 flex items-center gap-4 overflow-x-auto">
          {EVENT_ROWS.map((ev) => (
            <div key={ev.key} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
              <span className="text-[10px] text-[#94A3B8] flex-shrink-0">{ev.time}</span>
              <span className="text-[11px] text-[#1A1F36] font-medium">{t(ev.key, lang)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-[#94A3B8] mt-3">{t('landing.preview.caption', lang)}</p>
    </div>
  )
}
