import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_TIME_LIMIT_MS,
  ONBOARDING_NUDGE_AT_MS,
  formatCountdown,
  extendStartedAtBy,
  resumeStartedAt,
} from '@/lib/onboardingCountdown'

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

  describe('extendStartedAtBy', () => {
    it('pushes startedAt forward by exactly the given number of ms', () => {
      const result = extendStartedAtBy('2026-01-01T00:00:00.000Z', 45_000)
      expect(result).toBe('2026-01-01T00:00:45.000Z')
    })

    it('zero wasted ms leaves startedAt unchanged', () => {
      expect(extendStartedAtBy('2026-01-01T00:00:00.000Z', 0)).toBe('2026-01-01T00:00:00.000Z')
    })

    it('never mutates its input and always returns a valid ISO string', () => {
      const input = '2026-06-15T12:30:00.000Z'
      const result = extendStartedAtBy(input, 90_000)
      expect(input).toBe('2026-06-15T12:30:00.000Z')
      expect(new Date(result).toISOString()).toBe(result)
    })
  })

  describe('resumeStartedAt', () => {
    const now = new Date('2026-06-15T12:30:00.000Z').getTime()

    it('keeps the real startedAt when still within the 10-minute budget', () => {
      const savedStartedAt = new Date(now - 5 * 60 * 1000).toISOString() // 5 min ago
      expect(resumeStartedAt(savedStartedAt, now)).toBe(savedStartedAt)
    })

    it('keeps the real startedAt exactly at the boundary (just under the limit)', () => {
      const savedStartedAt = new Date(now - (ONBOARDING_TIME_LIMIT_MS - 1)).toISOString()
      expect(resumeStartedAt(savedStartedAt, now)).toBe(savedStartedAt)
    })

    it('resets to a fresh budget (now) once the saved conversation is already past the 10-minute limit', () => {
      const savedStartedAt = new Date(now - ONBOARDING_TIME_LIMIT_MS).toISOString() // exactly at the limit
      expect(resumeStartedAt(savedStartedAt, now)).toBe(new Date(now).toISOString())
    })

    it('resets to a fresh budget for a conversation resumed hours later (within localStorage\'s 24h expiry)', () => {
      const savedStartedAt = new Date(now - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
      expect(resumeStartedAt(savedStartedAt, now)).toBe(new Date(now).toISOString())
    })
  })
})
