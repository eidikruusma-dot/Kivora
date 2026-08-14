import { useState, useEffect } from 'react'
import { X, Play, Pause, Square, CheckCircle2 } from 'lucide-react'
import { useFocusTimer, formatTime } from '@/context/FocusTimerContext'
import { mockTasks } from '@/data/mockData'

const DURATIONS = [15, 25, 45, 60]

export default function FocusTimerModal() {
  const { state, modalOpen, closeModal, start, pause, resume, stop } = useFocusTimer()
  const [duration, setDuration] = useState(25)
  const [taskIdx, setTaskIdx] = useState(-1)

  useEffect(() => {
    if (modalOpen) {
      setDuration(25)
      setTaskIdx(-1)
    }
  }, [modalOpen])

  if (!modalOpen) return null

  const isRunning = state.status === 'running'
  const isPaused = state.status === 'paused'
  const isFinished = state.status === 'finished'
  const isActive = isRunning || isPaused || isFinished

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onMouseDown={closeModal}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[420px] bg-white rounded-2xl border border-[#E8E6E0] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <h3 className="text-base font-bold text-[#1A1F36]">Fookustaimer</h3>
          <button onClick={closeModal} className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          {isFinished ? (
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 size={40} className="text-[#16A34A] mb-3" />
              <p className="text-sm font-medium text-[#1A1F36]">Fookusaeg sai läbi.</p>
              <button
                onClick={stop}
                className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: '#6F5AE8' }}
              >
                Sulge
              </button>
            </div>
          ) : isActive ? (
            <div className="flex flex-col items-center py-4">
              <p className="text-5xl font-bold text-[#1A1F36] tabular-nums tracking-tight">
                {formatTime(state.remainingSec)}
              </p>
              {state.taskTitle && (
                <p className="text-xs text-[#94A3B8] mt-2 text-center">{state.taskTitle}</p>
              )}
              <div className="flex items-center gap-2 mt-5">
                {isRunning ? (
                  <button
                    onClick={pause}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#1A1F36] bg-[#F8F7F4] rounded-lg hover:bg-[#EDE9FB] transition-colors"
                  >
                    <Pause size={15} /> Paus
                  </button>
                ) : (
                  <button
                    onClick={resume}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg"
                    style={{ backgroundColor: '#6F5AE8' }}
                  >
                    <Play size={15} /> Jätka
                  </button>
                )}
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#DC2626] bg-[#FEE2E2] rounded-lg hover:bg-[#FECACA] transition-colors"
                >
                  <Square size={14} /> Lõpeta
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="text-xs font-medium text-[#94A3B8] mb-1.5 block">Ülesanne (valikuline)</label>
                <select
                  value={taskIdx}
                  onChange={(e) => setTaskIdx(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm bg-[#F8F7F4] border border-[#EBEBEB] rounded-lg text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
                >
                  <option value={-1}>— ülesandeta —</option>
                  {mockTasks.map((t, i) => (
                    <option key={t.id} value={i}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div className="mb-5">
                <label className="text-xs font-medium text-[#94A3B8] mb-1.5 block">Kestus</label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className="h-10 rounded-lg text-sm font-medium transition-colors"
                      style={
                        duration === d
                          ? { backgroundColor: '#6F5AE8', color: '#fff' }
                          : { backgroundColor: '#F8F7F4', color: '#1A1F36' }
                      }
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => start(duration, taskIdx >= 0 ? mockTasks[taskIdx].title : undefined)}
                className="w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-lg transition-colors"
                style={{ backgroundColor: '#6F5AE8' }}
              >
                <Play size={16} /> Alusta
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
