import { Timer, Pause, Play, X } from 'lucide-react'
import { useFocusTimer, formatTime } from '@/context/FocusTimerContext'

export default function FocusTimerIndicator() {
  const { state, openModal, pause, resume, stop } = useFocusTimer()

  if (state.status === 'idle' || state.status === 'finished') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-[#E8E6E0] shadow-lg">
      <button
        onClick={openModal}
        className="flex items-center gap-2 text-sm text-[#1A1F36] hover:text-[#6F5AE8] transition-colors"
      >
        <Timer size={16} className="text-[#6F5AE8]" />
        <span className="tabular-nums font-medium">{formatTime(state.remainingSec)}</span>
      </button>
      <div className="w-px h-4 bg-[#E8E6E0]" />
      {state.status === 'running' ? (
        <button onClick={pause} className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors p-0.5">
          <Pause size={14} />
        </button>
      ) : (
        <button onClick={resume} className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors p-0.5">
          <Play size={14} />
        </button>
      )}
      <button onClick={stop} className="text-[#94A3B8] hover:text-[#DC2626] transition-colors p-0.5">
        <X size={14} />
      </button>
    </div>
  )
}
