import { describe, it, expect } from 'vitest'
import { ONBOARDING_TIME_LIMIT_MS, ONBOARDING_NUDGE_AT_MS, formatCountdown } from '@/lib/onboardingCountdown'

describe('onboardingCountdown', () => {
  it('10-minute limit and 9-minute nudge are expressed in ms, nudge strictly before the limit', () => {
    expect(ONBOARDING_TIME_LIMIT_MS).toBe(10 * 60 * 1000)
    expect(ONBOARDING_NUDGE_AT_MS).toBe(9 * 60 * 1000)
    expect(ONBOARDING_NUDGE_AT_MS).toBeLessThan(ONBOARDING_TIME_LIMIT_MS)
  })

  it('formats whole minutes exactly', () => {
    expect(formatCountdown(10 * 60 * 1000)).toBe('10:00')
    expect(formatCountdown(9 * 60 * 1000)).toBe('9:00')
    expect(formatCountdown(60 * 1000)).toBe('1:00')
  })

  it('pads seconds under 10 with a leading zero', () => {
    expect(formatCountdown(65 * 1000)).toBe('1:05')
    expect(formatCountdown(9 * 1000)).toBe('0:09')
  })

  it('never goes negative — clamps to 0:00 for zero or negative remaining time', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-5000)).toBe('0:00')
    expect(formatCountdown(-ONBOARDING_TIME_LIMIT_MS)).toBe('0:00')
  })

  it('rounds up partial seconds so the display never shows 0:00 while time technically remains', () => {
    expect(formatCountdown(1500)).toBe('0:02')
    expect(formatCountdown(100)).toBe('0:01')
  })
})
