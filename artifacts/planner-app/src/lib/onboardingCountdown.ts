/**
 * onboardingCountdown.ts — the onboarding chat's 10-minute soft cap, as
 * pure, independently testable constants/functions. Extracted out of
 * OnboardingChatPage.tsx so the countdown math and formatting can be
 * tested directly, without rendering the component.
 */

export const ONBOARDING_TIME_LIMIT_MS = 10 * 60 * 1000
export const ONBOARDING_NUDGE_AT_MS = 9 * 60 * 1000

/** Formats a remaining-time value (ms) as "m:ss", clamped to never go below "0:00". */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
