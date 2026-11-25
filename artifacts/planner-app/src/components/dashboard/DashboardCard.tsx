import { type ReactNode } from 'react'

interface DashboardCardProps {
  children: ReactNode
  className?: string
}

/**
 * Frosted-glass card for the "Minu päev" dashboard ONLY — a separate
 * component from components/ui/AppCard.tsx on purpose: AppCard is also
 * used by FinancePage, PlansPage and PlanDetailPage, which must keep
 * their current, unmodified look (see the dashboard redesign's explicit
 * scope). Changing AppCard itself would have changed those pages too.
 *
 * The glass token (background/blur/border/shadow) reuses the same
 * frosted-glass look already approved for the Aurora Living Premium
 * landing page (see AuroraGlassFragments.tsx's GLASS constant) so the
 * dashboard's new look is visually consistent with Kivora's existing
 * premium design language rather than inventing a third style.
 */
export default function DashboardCard({ children, className = '' }: DashboardCardProps) {
  return (
    <div
      className={`bg-white/85 dark:bg-[#1E1B33]/80 backdrop-blur-xl border border-white/70 dark:border-white/10 rounded-2xl overflow-hidden min-h-0 shadow-[0_10px_28px_rgba(99,69,181,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.3)] ${className}`}
    >
      {children}
    </div>
  )
}
