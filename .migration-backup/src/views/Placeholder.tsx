import { type ReactNode } from 'react'

interface PlaceholderProps {
  title: string
  icon?: ReactNode
}

export default function Placeholder({ title, icon }: PlaceholderProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      {icon && <div className="mb-3 text-[#6F5AE8]">{icon}</div>}
      <h1 className="text-lg font-semibold text-[#1A1F36] mb-1">{title}</h1>
      <p className="text-sm text-slate-400">See vaade on veel arendamisel.</p>
    </div>
  )
}
