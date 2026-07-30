import type { Priority } from '@/types'

interface BadgeProps {
  priority: Priority
}

const config: Record<Priority, { label: string; className: string }> = {
  high: { label: 'Kõrge', className: 'bg-red-50 text-red-600' },
  medium: { label: 'Keskmine', className: 'bg-orange-50 text-orange-500' },
  low: { label: 'Madal', className: 'bg-slate-100 text-slate-500' },
}

export default function Badge({ priority }: BadgeProps) {
  const { label, className } = config[priority]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}
