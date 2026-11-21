import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'

/**
 * The single scripted "day in the life" sequence shared by the hero's
 * phone screen (AppPreviewMock) and the floating feature cards around
 * it, so a task completing inside the phone and the matching stat
 * ticking up in the floating Tasks card happen on the same beat.
 *
 * `step` is -1 once, for a brief "Welcome to Kivora!" beat the very
 * first time the demo plays, then runs 0–6 (see AppPreviewMock for what
 * each step means) and loops from 0 onward — the welcome beat is never
 * repeated on later loops. Playback is gated on both the pause/play
 * control and an IntersectionObserver on the returned `containerRef` —
 * losing either just freezes `step` in place rather than skipping
 * ahead. Under prefers-reduced-motion it never auto-advances at all,
 * and skips straight past the welcome beat to the static step-0 view.
 */
const WELCOME_STEP = -1
const WELCOME_MS = 1600
const STEP_COUNT = 7
const STEP_HOLD_MS = [1100, 1700, 1700, 1700, 1700, 2100, 2500]

export function useHeroDemoSequence() {
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { amount: 0.3 })
  const [playing, setPlaying] = useState(true)
  const [step, setStep] = useState(WELCOME_STEP)

  // Reduced motion never shows the welcome beat either — jump straight
  // to the plain static baseline, same as before this feature existed.
  useEffect(() => {
    if (shouldReduceMotion && step === WELCOME_STEP) setStep(0)
  }, [shouldReduceMotion, step])

  useEffect(() => {
    if (shouldReduceMotion || !playing || !inView) return
    if (step === WELCOME_STEP) {
      const timer = setTimeout(() => setStep(0), WELCOME_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setStep((s) => (s + 1) % STEP_COUNT)
    }, STEP_HOLD_MS[step])
    return () => clearTimeout(timer)
  }, [step, playing, inView, shouldReduceMotion])

  return {
    containerRef,
    step,
    playing,
    togglePlaying: () => setPlaying((p) => !p),
    shouldReduceMotion: !!shouldReduceMotion,
  }
}
