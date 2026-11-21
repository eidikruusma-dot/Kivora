import type { ReactNode } from 'react'

/**
 * One of the four small cards shown around the phone mockup in the hero
 * (Tasks / Goals / Calendar / Habits). This component only owns the
 * card's own look — the caller decides layout via `className`: an
 * absolutely-positioned, gently-floating instance on desktop (enough
 * horizontal room around the phone), and a plain instance inside a
 * normal 2-up grid on mobile (no absolute positioning, no float, so
 * nothing can push the page into horizontal scroll on small screens).
 */
export default function FloatingFeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  children,
  className = '',
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white/65 backdrop-blur-xl rounded-[22px] border border-white/70 shadow-[0_35px_70px_-25px_rgba(111,90,232,0.5)] px-5 py-4 ${className}`}
      style={{ boxShadow: '0 35px 70px -25px rgba(111,90,232,0.5), inset 0 1px 0 rgba(255,255,255,0.6)' }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon size={17} className={iconColor} />
        </div>
        <span className="text-sm font-bold text-[#1A1F36] truncate">{title}</span>
      </div>
      {children}
    </div>
  )
}
