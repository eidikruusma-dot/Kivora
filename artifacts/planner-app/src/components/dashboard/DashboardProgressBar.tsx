interface DashboardProgressBarProps {
  value: number
  color?: string
  className?: string
}

/**
 * Dark-mode-aware progress bar for the "Minu päev" Goals widget ONLY —
 * a separate component from components/ui/ProgressBar.tsx on purpose:
 * that one is also used by SchoolPage, FinancePage, GoalsPage,
 * PlanDetailPage and PlansPage, which must keep their current,
 * unmodified look.
 */
export default function DashboardProgressBar({ value, color = '#6F5AE8', className = '' }: DashboardProgressBarProps) {
  return (
    <div className={`h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  )
}
