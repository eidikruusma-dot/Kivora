import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { CheckSquare, Calendar as CalendarIcon, Target, Flame, Play, Pause, CheckCircle2 } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A clearly-illustrative, auto-playing preview of the real Kivora
 * dashboard — never a live screenshot (no account is created or read to
 * produce this). Every panel mirrors the real app's own visual language
 * exactly (HeroCard's stat tiles, TasksWidget's checkbox/priority rows,
 * GoalsWidget's progress bars, CalendarWidget's colour-coded event rows),
 * but with sample, non-real data that cycles through a short scripted
 * "day in the life" sequence. The "Näidis" badge and the caption
 * underneath both label it explicitly as a sample.
 *
 * The sequence is a single `step` index (0–6); every piece of UI below
 * just derives its appearance from `step`, so the whole demo is one
 * small state machine rather than several independent timers. Playback
 * is gated on both `playing` (the pause/play control) and `inView` (an
 * IntersectionObserver via framer-motion's useInView) — losing either
 * condition clears the pending timeout and simply freezes the sequence
 * in place, so nothing continues animating off-screen or after pause.
 * Under prefers-reduced-motion it never auto-advances at all: `step`
 * stays at 0 and the card reads as a normal static sample.
 */

const STEP_COUNT = 7
// Hold time (ms) at each step before advancing to the next; index 6's
// value is the pause at the day-summary step before looping back to 0.
const STEP_HOLD_MS = [1100, 1700, 1700, 1700, 1700, 2100, 2500]

const BASE_TASK_ROWS: { key: 'landing.preview.task1' | 'landing.preview.task2' | 'landing.preview.task3'; priority: 'high' | 'medium' | 'low'; done: boolean }[] = [
  { key: 'landing.preview.task1', priority: 'high', done: false },
  { key: 'landing.preview.task2', priority: 'medium', done: false },
  { key: 'landing.preview.task3', priority: 'low', done: true },
]

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-orange-500',
  medium: 'text-orange-400',
  low: 'text-slate-400',
}

const BASE_EVENTS: { key: 'landing.preview.event1' | 'landing.preview.event2'; time: string; color: string }[] = [
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={value}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            className="text-sm font-bold text-[#1A1F36] leading-none"
          >
            {value}
          </motion.p>
        </AnimatePresence>
        <p className="text-[10px] text-[#94A3B8] mt-0.5 truncate">{label}</p>
      </div>
    </div>
  )
}

export default function AppPreviewMock({ lang }: { lang: AppLang }) {
  const shouldReduceMotion = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const inView = useInView(cardRef, { amount: 0.4 })
  const [playing, setPlaying] = useState(true)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (shouldReduceMotion || !playing || !inView) return
    const timer = setTimeout(() => {
      setStep((s) => (s + 1) % STEP_COUNT)
    }, STEP_HOLD_MS[step])
    return () => clearTimeout(timer)
  }, [step, playing, inView, shouldReduceMotion])

  const newTaskVisible = step >= 1
  const newTaskDone = step >= 2
  const tasksStatValue = step >= 3 ? '6/8' : '5/8'
  const thirdEventVisible = step >= 4
  const goal1Pct = step >= 5 ? 78 : 65
  const summaryVisible = step === 6

  const taskRows = [
    ...(newTaskVisible ? [{ key: 'landing.preview.newTask' as const, priority: 'medium' as const, done: newTaskDone }] : []),
    ...BASE_TASK_ROWS,
  ]
  const eventRows = [
    ...BASE_EVENTS,
    ...(thirdEventVisible ? [{ key: 'landing.preview.event3' as const, time: '15:00', color: '#10B981' }] : []),
  ]

  const goalsAveragePct = Math.round((goal1Pct + 40) / 2)

  const stats = [
    { icon: CheckSquare, color: 'text-blue-500', bg: 'bg-blue-50', value: tasksStatValue, label: t('hero.tasks', lang) },
    { icon: CalendarIcon, color: 'text-sky-500', bg: 'bg-sky-50', value: String(eventRows.length), label: t('hero.events', lang) },
    { icon: Target, color: 'text-orange-500', bg: 'bg-orange-50', value: `${goalsAveragePct}%`, label: t('hero.goals', lang) },
    { icon: Flame, color: 'text-emerald-500', bg: 'bg-emerald-50', value: '80%', label: t('hero.habits', lang) },
  ]

  const togglePlaying = () => setPlaying((p) => !p)

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        ref={cardRef}
        className="relative bg-white/90 backdrop-blur rounded-[28px] border border-[#EEE9FB] shadow-[0_40px_90px_-30px_rgba(111,90,232,0.4)] overflow-hidden"
      >
        {/* Chrome bar */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#F3F0FC] bg-gradient-to-r from-[#FBFAFF] to-[#F6F3FE]">
          <span className="text-xs font-bold text-[#1A1F36]">{t('landing.preview.today', lang)}</span>
          <div className="flex items-center gap-2">
            {!shouldReduceMotion && (
              <button
                type="button"
                onClick={togglePlaying}
                aria-label={t(playing ? 'landing.preview.pauseLabel' : 'landing.preview.playLabel', lang)}
                className="w-6 h-6 rounded-full bg-white border border-[#EEE9FB] flex items-center justify-center text-[#6F5AE8] hover:bg-[#F6F3FE] transition-colors"
              >
                {playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" className="ml-0.5" />}
              </button>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#2E1065] text-white text-[9px] font-bold tracking-wide uppercase">
              {t('landing.preview.sampleBadge', lang)}
            </span>
          </div>
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
              <AnimatePresence initial={false}>
                {taskRows.map((row) => (
                  <motion.div
                    key={row.key}
                    layout
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-1.5 overflow-hidden"
                  >
                    <div
                      className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors duration-300 ${
                        row.done ? 'bg-[#6F5AE8] border-[#6F5AE8]' : 'border-[#D1D5DB] bg-white'
                      }`}
                    >
                      {row.done && (
                        <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={`flex-1 text-[11px] leading-tight truncate transition-colors duration-300 ${row.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                      {t(row.key, lang)}
                    </span>
                    {!row.done && <span className={`text-[9px] font-semibold flex-shrink-0 ${PRIORITY_COLOR[row.priority]}`}>{t(`tasks.priority.${row.priority}`, lang)}</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wide mb-2">{t('dash.goals.title', lang)}</p>
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-[#1A1F36] truncate pr-1">{t('landing.preview.goal1', lang)}</span>
                  <span className="text-[10px] font-bold flex-shrink-0 text-[#6F5AE8]">{goal1Pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#F1EFFB] overflow-hidden">
                  <div className="h-full rounded-full bg-[#6F5AE8] transition-[width] duration-700 ease-out" style={{ width: `${goal1Pct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-[#1A1F36] truncate pr-1">{t('landing.preview.goal2', lang)}</span>
                  <span className="text-[10px] font-bold flex-shrink-0 text-orange-500">40%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#F1EFFB] overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: '40%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-[#F3F0FC]" />

        {/* Today's events strip */}
        <div className="px-5 py-3.5 flex items-center gap-4 overflow-x-auto">
          <AnimatePresence initial={false}>
            {eventRows.map((ev) => (
              <motion.div
                key={ev.key}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center gap-1.5 flex-shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                <span className="text-[10px] text-[#94A3B8] flex-shrink-0">{ev.time}</span>
                <span className="text-[11px] text-[#1A1F36] font-medium">{t(ev.key, lang)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Day-summary overlay — the final beat of the sequence */}
        <AnimatePresence>
          {summaryVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 bg-white/92 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6F5AE8] to-[#8B5CF6] flex items-center justify-center mb-3 shadow-[0_10px_24px_-8px_rgba(111,90,232,0.5)]"
              >
                <CheckCircle2 size={24} className="text-white" />
              </motion.div>
              <p className="text-sm font-bold text-[#1A1F36]">{t('landing.preview.summaryTitle', lang)}</p>
              <p className="text-xs text-[#94A3B8] mt-1">{t('landing.preview.summarySubtitle', lang)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-center text-[11px] text-[#94A3B8] mt-3">{t('landing.preview.caption', lang)}</p>
    </div>
  )
}
