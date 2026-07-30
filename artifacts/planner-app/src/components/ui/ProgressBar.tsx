interface ProgressBarProps {
  value: number
  color?: string
  className?: string
}

export default function ProgressBar({ value, color = '#6F5AE8', className = '' }: ProgressBarProps) {
  return (
    <div className={`h-1.5 w-full bg-slate-100 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  )
}
