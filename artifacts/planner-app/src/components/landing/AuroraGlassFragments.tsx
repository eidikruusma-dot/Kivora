import type { CSSProperties } from 'react'
import { Sparkles, Check } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * The five floating frosted-glass UI fragments from the approved Kavand D
 * mockup (`.glass.frag-*`) — small, real pieces of Kivora's interface
 * (an AI-assistant pill, a calendar day chip, a finished task, a goal
 * progress ring, a habit streak) shown as independent floating cards
 * around the main dashboard panel, each with its own slow float
 * animation (`kv-aurora-float-a`/`-b`, src/index.css; disabled under
 * prefers-reduced-motion). Position/size/rotation/animation timing are
 * supplied by the caller via `className`/`style` so the same components
 * are reused, unchanged, in both the desktop composition and the
 * simplified mobile chip row.
 *
 * Sample content only — the panel each of these echoes already carries
 * its own "NÄIDIS"/"Sample" badge; these fragments are illustrative UI,
 * not a second source of real data.
 */
const GLASS = 'bg-white/[.52] backdrop-blur-xl border border-white/70 rounded-[20px] shadow-[0_18px_40px_rgba(99,69,181,0.18),0_4px_14px_rgba(99,69,181,0.1)]'

type FragmentProps = { lang: AppLang; className?: string; style?: CSSProperties }

export function AiFragment({ lang, className = '', style }: FragmentProps) {
  return (
    <div aria-hidden="true" className={`${GLASS} flex items-center gap-3 px-[18px] py-[14px] ${className}`} style={style}>
      <div className="w-[34px] h-[34px] rounded-[10px] flex-shrink-0 bg-gradient-to-br from-[#A78BFA] to-[#6D28D9] flex items-center justify-center text-white">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-[#2E1065] leading-tight truncate">{t('nav.assistant', lang)}</div>
        <div className="text-[11.5px] font-medium text-[#6B5B95] mt-0.5 truncate">{t('landing.aurora.aiSub', lang)}</div>
      </div>
    </div>
  )
}

export function CalendarFragment({ lang, className = '', style }: FragmentProps) {
  return (
    <div aria-hidden="true" className={`${GLASS} px-5 py-[18px] ${className}`} style={style}>
      <div className="text-[32px] font-extrabold text-[#2E1065] leading-none">14</div>
      <div className="text-xs font-semibold text-[#6B5B95] mt-[3px] uppercase tracking-wide">{t('landing.aurora.calDayLabel', lang)}</div>
      <div className="flex items-center gap-[7px] mt-[11px] text-[11.5px] font-medium text-[#44366B]">
        <span className="w-2 h-2 rounded-full bg-[#F472B6] flex-shrink-0" />
        {t('landing.aurora.calEvent', lang)}
      </div>
    </div>
  )
}

export function TaskFragment({ lang, className = '', style }: FragmentProps) {
  return (
    <div aria-hidden="true" className={`${GLASS} px-4 py-4 ${className}`} style={style}>
      <div className="flex items-center gap-[9px] text-[12.5px] font-semibold text-[#30264D]">
        <span className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center text-white bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]">
          <Check size={11} strokeWidth={3} />
        </span>
        <span className="truncate">{t('landing.aurora.presentationDone', lang)}</span>
      </div>
    </div>
  )
}

export function GoalFragment({ lang, className = '', style }: FragmentProps) {
  return (
    <div aria-hidden="true" className={`${GLASS} px-5 py-5 text-center ${className}`} style={style}>
      <div
        className="relative mx-auto w-[88px] h-[88px] rounded-full flex items-center justify-center"
        style={{ background: 'conic-gradient(#7C3AED 0deg 266deg, rgba(124,58,237,.15) 266deg 360deg)' }}
      >
        <div className="absolute w-16 h-16 rounded-full bg-white/[.94]" />
        <span className="relative text-lg font-extrabold text-[#2E1065]">74%</span>
      </div>
      <div className="mt-2.5 text-xs font-semibold text-[#5B4D86]">{t('landing.aurora.yearGoal', lang)}</div>
    </div>
  )
}

export function HabitFragment({ lang, className = '', style }: FragmentProps) {
  return (
    <div aria-hidden="true" className={`${GLASS} px-5 py-[18px] ${className}`} style={style}>
      <div className="text-[13px] font-bold text-[#2E1065] mb-2.5 truncate">{t('landing.aurora.morningYoga', lang)}</div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="w-5 h-5 rounded-[6px] flex items-center justify-center text-white bg-gradient-to-br from-[#FBCFE8] to-[#F472B6]">
            <Check size={11} strokeWidth={3} />
          </span>
        ))}
        <span className="w-5 h-5 rounded-[6px] bg-[#8B5CF6]/[.14]" />
      </div>
      <div className="mt-[9px] text-[11.5px] font-medium text-[#6B5B95]">4 {t('landing.aurora.streakSuffix', lang)} 🔥</div>
    </div>
  )
}
