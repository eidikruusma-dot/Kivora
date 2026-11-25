import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface DashboardProgressRingProps {
  value: number
  lang: AppLang
  size?: number
  stroke?: number
  color?: string
}

/**
 * Dark-mode-aware progress ring for the "Minu päev" Habits widget ONLY —
 * a separate component from components/ui/ProgressRing.tsx on purpose:
 * that one is also used by SchoolPage, FinancePage, GoalsPage,
 * PlanDetailPage and PlansPage, which must keep their current,
 * unmodified look. It also properly translates its center label (the
 * shared ProgressRing hardcodes the Estonian word "Täidetud" regardless
 * of language — a pre-existing issue in that file, left untouched here,
 * and simply not repeated in this new component).
 */
export default function DashboardProgressRing({
  value,
  lang,
  size = 80,
  stroke = 7,
  color = '#22C55E',
}: DashboardProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-[#E8E6E0] dark:stroke-white/10"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">{value}%</span>
        <span className="text-[9px] text-slate-400 dark:text-[#9C96C2] mt-0.5">{t('dash.habits.done', lang)}</span>
      </div>
    </div>
  )
}
