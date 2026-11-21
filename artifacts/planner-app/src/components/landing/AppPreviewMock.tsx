import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckSquare,
  Calendar as CalendarIcon,
  Target,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
  CheckCircle2,
  LayoutDashboard,
  StickyNote,
} from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// Same three actions, icons and colours as the real dashboard's
// QuickActionsWidget — reused here so the bottom of the phone screen
// stays filled with an authentic piece of real UI rather than empty
// space, instead of inventing a new "feature" that doesn't exist.
const QUICK_ACTIONS: { icon: React.ElementType; labelKey: 'dash.action.newTask' | 'dash.action.newEvent' | 'dash.action.quickNote'; iconBg: string; iconColor: string }[] = [
  { icon: CheckSquare, labelKey: 'dash.action.newTask', iconBg: 'bg-[#EDE9FB]', iconColor: 'text-[#6F5AE8]' },
  { icon: CalendarIcon, labelKey: 'dash.action.newEvent', iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
  { icon: StickyNote, labelKey: 'dash.action.quickNote', iconBg: 'bg-[#FFEDD5]', iconColor: 'text-[#F97316]' },
]

/**
 * The phone screen's live content — a clearly-illustrative, auto-playing
 * preview of the real Kivora dashboard (never a live screenshot; no
 * account is created or read to produce this). Every panel mirrors the
 * real app's own navigation labels, icons and visual language (the real
 * nav.* route labels, TasksWidget's checkbox/priority rows, Calendar's
 * colour-coded event rows), with sample, non-real data that cycles
 * through a short scripted "day in the life" sequence. `step` is owned
 * by the parent (useHeroDemoSequence) so the floating feature cards
 * around the phone can animate on the same beat. The "Näidis" badge
 * labels it explicitly as a sample.
 */

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

const NAV_ITEMS: { labelKey: 'nav.myDay' | 'nav.tasks' | 'nav.calendar' | 'nav.goals' | 'nav.assistant'; icon: React.ElementType }[] = [
  { labelKey: 'nav.myDay', icon: LayoutDashboard },
  { labelKey: 'nav.tasks', icon: CheckSquare },
  { labelKey: 'nav.calendar', icon: CalendarIcon },
  { labelKey: 'nav.goals', icon: Target },
  { labelKey: 'nav.assistant', icon: Sparkles },
]

function FocusRing({ pct }: { pct: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" className="flex-shrink-0">
      <circle cx="23" cy="23" r={r} fill="none" stroke="#F1EFFB" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke="#6F5AE8"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 23 23)"
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <text x="23" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1F36">
        {pct}%
      </text>
    </svg>
  )
}

export default function AppPreviewMock({
  lang,
  step,
  playing,
  onTogglePlay,
  shouldReduceMotion,
}: {
  lang: AppLang
  step: number
  playing: boolean
  onTogglePlay: () => void
  shouldReduceMotion: boolean
}) {
  const welcomeVisible = step === -1
  const newTaskVisible = step >= 1
  const newTaskDone = step >= 2
  const thirdEventVisible = step >= 4
  const focusPct = step >= 2 ? 82 : 68
  const summaryVisible = step === 6
  const aiBannerKey = step <= 2 ? 'landing.preview.aiBannerPlanning' : 'landing.preview.aiBannerPlanned'

  const taskRows = [
    ...(newTaskVisible ? [{ key: 'landing.preview.newTask' as const, priority: 'medium' as const, done: newTaskDone }] : []),
    ...BASE_TASK_ROWS,
  ]
  const eventRows = [
    ...BASE_EVENTS,
    ...(thirdEventVisible ? [{ key: 'landing.preview.event3' as const, time: '15:00', color: '#10B981' }] : []),
  ]

  return (
    <div className="relative h-full flex flex-col bg-white overflow-hidden">
      {/* Greeting row */}
      <div className="px-4 pt-5 pb-2 flex items-start justify-between flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[#1A1F36] leading-tight">{t('landing.preview.greeting', lang)}</p>
          <p className="text-[10px] text-[#94A3B8] mt-0.5">{t('landing.preview.greetingSubtitle', lang)}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
          {!shouldReduceMotion && (
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={t(playing ? 'landing.preview.pauseLabel' : 'landing.preview.playLabel', lang)}
              className="w-6 h-6 rounded-full bg-[#F6F3FE] border border-[#EEE9FB] flex items-center justify-center text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors"
            >
              {playing ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
            </button>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#2E1065] text-white text-[7px] font-bold tracking-wide uppercase">
            {t('landing.preview.sampleBadge', lang)}
          </span>
        </div>
      </div>

      {/* In-screen nav row */}
      <div className="px-3 flex items-center gap-1 mb-3 flex-shrink-0">
        {NAV_ITEMS.map((item, i) => (
          <div
            key={item.labelKey}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl ${i === 0 ? 'bg-[#6F5AE8] text-white' : 'text-[#94A3B8]'}`}
          >
            <item.icon size={13} />
            <span className="text-[6.5px] font-semibold truncate max-w-full px-0.5">{t(item.labelKey, lang)}</span>
          </div>
        ))}
      </div>

      {/* AI banner */}
      <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-r from-[#6F5AE8] to-[#8B5CF6] px-3.5 py-3 flex items-center gap-2.5 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={15} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-white leading-tight truncate">{t('nav.assistant', lang)}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={aiBannerKey}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.3 }}
              className="text-[8.5px] text-white/80 leading-tight truncate"
            >
              {t(aiBannerKey, lang)}
            </motion.p>
          </AnimatePresence>
        </div>
        <ArrowRight size={13} className="text-white flex-shrink-0" />
      </div>

      {/* Tänane fookus */}
      <div className="mx-3 mb-3 rounded-2xl border border-[#F1EFFB] px-3.5 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#1A1F36]">{t('landing.preview.todayFocus', lang)}</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5 truncate">
              {taskRows.length} {t('landing.preview.tasksCountLabel', lang)} · {eventRows.length} {t('landing.preview.eventsCountLabel', lang)}
            </p>
          </div>
          <FocusRing pct={focusPct} />
        </div>
        <div className="space-y-1.5">
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

      {/* Minu päev */}
      <div className="mx-3 mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[#1A1F36]">{t('nav.myDay', lang)}</p>
          <span className="text-[9px] text-[#6F5AE8] font-medium flex items-center gap-0.5">
            {t('dash.viewAll', lang)} <ArrowRight size={9} />
          </span>
        </div>
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {eventRows.map((ev) => (
              <motion.div
                key={ev.key}
                layout
                initial={{ opacity: 0, x: 8, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center gap-2 rounded-lg bg-[#FAF9FF] px-2.5 py-1.5 overflow-hidden"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                <span className="text-[9px] text-[#94A3B8] flex-shrink-0">{ev.time}</span>
                <span className="text-[10.5px] text-[#1A1F36] font-medium truncate">{t(ev.key, lang)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick actions — same three real actions as the dashboard's
          QuickActionsWidget, pinned to the bottom so the screen is never
          left with a large empty area below the real content. */}
      <div className="mx-3 mb-4 mt-auto grid grid-cols-3 gap-2 flex-shrink-0">
        {QUICK_ACTIONS.map(({ icon: Icon, labelKey, iconBg, iconColor }) => (
          <div key={labelKey} className="flex flex-col items-center gap-1 rounded-xl bg-[#FAF9FF] py-2.5">
            <div className={`w-6 h-6 rounded-lg ${iconBg} flex items-center justify-center`}>
              <Icon size={12} className={iconColor} />
            </div>
            <span className="text-[8px] font-medium text-[#64748B] text-center leading-tight px-0.5">{t(labelKey, lang)}</span>
          </div>
        ))}
      </div>

      {/* Welcome overlay — a one-time beat before the demo sequence
          starts, reusing the exact same overlay pattern as the
          day-summary beat below rather than inventing a new one. */}
      <AnimatePresence>
        {welcomeVisible && (
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
              <Sparkles size={22} className="text-white" />
            </motion.div>
            <p className="text-sm font-bold text-[#1A1F36]">{t('landing.preview.welcomeTitle', lang)}</p>
          </motion.div>
        )}
      </AnimatePresence>

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
  )
}
