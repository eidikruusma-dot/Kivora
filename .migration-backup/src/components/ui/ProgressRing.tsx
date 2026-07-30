interface ProgressRingProps {
  value: number
  size?: number
  stroke?: number
  color?: string
}

export default function ProgressRing({
  value,
  size = 80,
  stroke = 7,
  color = '#22C55E',
}: ProgressRingProps) {
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
          stroke="#E8E6E0"
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
        <span className="text-sm font-bold text-[#1A1F36]">{value}%</span>
        <span className="text-[9px] text-slate-400 mt-0.5">Täidetud</span>
      </div>
    </div>
  )
}
