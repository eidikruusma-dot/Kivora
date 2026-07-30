import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

interface TimerState {
  status: TimerStatus
  durationSec: number
  remainingSec: number
  taskTitle: string | null
}

interface FocusTimerContextValue {
  state: TimerState
  modalOpen: boolean
  openModal: () => void
  closeModal: () => void
  start: (durationMin: number, taskTitle?: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null)

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [status, setStatus] = useState<TimerStatus>('idle')
  const [durationSec, setDurationSec] = useState(0)
  const [remainingSec, setRemainingSec] = useState(0)
  const [taskTitle, setTaskTitle] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    if (status === 'running') {
      intervalRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            clearTick()
            setStatus('finished')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return clearTick
  }, [status])

  const start = useCallback((durationMin: number, task?: string) => {
    const sec = durationMin * 60
    setDurationSec(sec)
    setRemainingSec(sec)
    setTaskTitle(task ?? null)
    setStatus('running')
    setModalOpen(false)
  }, [])

  const pause = useCallback(() => setStatus('paused'), [])
  const resume = useCallback(() => setStatus('running'), [])
  const stop = useCallback(() => {
    clearTick()
    setStatus('idle')
    setRemainingSec(0)
    setTaskTitle(null)
  }, [])
  const reset = useCallback(() => {
    clearTick()
    setStatus('idle')
    setRemainingSec(0)
    setDurationSec(0)
    setTaskTitle(null)
  }, [])

  const openModal = useCallback(() => setModalOpen(true), [])
  const closeModal = useCallback(() => setModalOpen(false), [])

  const value: FocusTimerContextValue = {
    state: { status, durationSec, remainingSec, taskTitle },
    modalOpen,
    openModal,
    closeModal,
    start,
    pause,
    resume,
    stop,
    reset,
  }

  return <FocusTimerContext.Provider value={value}>{children}</FocusTimerContext.Provider>
}

export function useFocusTimer(): FocusTimerContextValue {
  const ctx = useContext(FocusTimerContext)
  if (!ctx) throw new Error('useFocusTimer must be used within FocusTimerProvider')
  return ctx
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
