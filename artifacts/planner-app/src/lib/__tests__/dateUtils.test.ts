/**
 * Regression tests for the "Today's schedule" stale-date defect in the
 * School module: TodaySchedule (SchoolPage.tsx) hardcoded the literal
 * string "27. juuli 2026, esmaspäev" and, separately, passed ALL lessons
 * (unfiltered) as "today's" lessons — no date filtering existed at all.
 *
 * These tests exercise the new pure helpers (src/lib/dateUtils.ts) that
 * replace both defects: getLocalDateString/getLocalWeekdayIndex for the
 * local-safe "what day is it" computation, and formatDateWithWeekday for
 * the exact display string. Deterministic — every helper accepts an
 * explicit Date, so no test depends on the machine's actual current date.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/dateUtils.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  getLocalDateString,
  getLocalWeekdayIndex,
  formatDateWithWeekday,
  msUntilNextLocalMidnight,
} from '@/lib/dateUtils'

const WEDNESDAY_AUG_26_2026 = new Date(2026, 7, 26) // month is 0-indexed: 7 = August

describe('getLocalDateString', () => {
  it('2026-08-26 (a Wednesday) formats as "2026-08-26"', () => {
    expect(getLocalDateString(WEDNESDAY_AUG_26_2026)).toBe('2026-08-26')
  })

  it('pads single-digit month and day', () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('defaults to the current date when called with no argument', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(getLocalDateString()).toBe(expected)
  })

  it('does NOT use toISOString/UTC slicing — differs from the UTC day near a timezone boundary', () => {
    // 2026-08-26T23:30 in UTC-05:00 is still 2026-08-26 local, but would be
    // 2026-08-27 if computed via toISOString().slice(0,10) (UTC). Construct
    // the Date from local components (as the app always does) and confirm
    // getLocalDateString reports the LOCAL day, not toISOString's UTC day.
    const localEvening = new Date(2026, 7, 26, 23, 30, 0)
    expect(getLocalDateString(localEvening)).toBe('2026-08-26')
    // The implementation itself must not contain the UTC-based pattern.
    expect(getLocalDateString.toString()).not.toMatch(/toISOString/)
  })
})

describe('getLocalWeekdayIndex (Monday-first, matches ScheduleTab.DAYS_ET ordering)', () => {
  it('2026-08-26 is a Wednesday → index 2', () => {
    expect(getLocalWeekdayIndex(WEDNESDAY_AUG_26_2026)).toBe(2)
  })

  it('Monday → 0, Sunday → 6', () => {
    expect(getLocalWeekdayIndex(new Date(2026, 7, 24))).toBe(0) // Mon
    expect(getLocalWeekdayIndex(new Date(2026, 7, 30))).toBe(6) // Sun
  })
})

describe('formatDateWithWeekday — exact required output', () => {
  it('2026-08-26 in Estonian → "26. august 2026, kolmapäev"', () => {
    expect(formatDateWithWeekday('2026-08-26', 'et')).toBe('26. august 2026, kolmapäev')
  })

  it('2026-08-26 in English is correctly localized (date + Wednesday)', () => {
    const result = formatDateWithWeekday('2026-08-26', 'en')
    expect(result).toContain('Wednesday')
    expect(result).toContain('26')
    expect(result).toContain('August')
    expect(result).toContain('2026')
  })

  it('no hardcoded July date leaks through for an August input', () => {
    expect(formatDateWithWeekday('2026-08-26', 'et')).not.toMatch(/juuli/i)
    expect(formatDateWithWeekday('2026-08-26', 'en')).not.toMatch(/july/i)
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('is always positive and less than 25 hours (handles a day with a DST-like buffer)', () => {
    const ms = msUntilNextLocalMidnight(new Date(2026, 7, 26, 12, 0, 0))
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThan(25 * 60 * 60 * 1000)
  })

  it('called just before midnight returns a small positive value', () => {
    const ms = msUntilNextLocalMidnight(new Date(2026, 7, 26, 23, 59, 50))
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThan(20 * 1000)
  })
})
