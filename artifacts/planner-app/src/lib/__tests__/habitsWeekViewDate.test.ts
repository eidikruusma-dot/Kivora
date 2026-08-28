/**
 * Regression tests for a live bug: on 28.08.2026 the Habits module's week
 * view still showed "21.–27. juuli" after a page refresh and pre-selected
 * 22. juuli as "today".
 *
 * Root cause (two hard-coded/demo values, both in habitsData.ts /
 * HabitsPage.tsx, neither ever recomputed from the real date):
 *   1. habitsData.ts exported a fixed WEEK_DAYS constant with literal
 *      dates ("21. juuli" … "27. juuli") baked in at module definition
 *      time — never the actual current week.
 *   2. HabitsPage.tsx's Week view card hard-coded `isPast = i < 2` and
 *      `isToday = i === 1`, i.e. always "Tuesday is today", regardless of
 *      the real date.
 *
 * Fix:
 *   - habitsData.ts now exports a pure function, getCurrentWeekDays(ref =
 *     new Date()), that computes the real Monday–Sunday week from local
 *     time (reusing the existing timezone-safe startOfWeek/addDays/
 *     WEEKDAYS_ET/MONTHS_ET helpers in @/lib/calendar/dateUtils — no new
 *     date-math was invented). HabitsPage.tsx calls it fresh on every
 *     render (`const WEEK_DAYS = getCurrentWeekDays();`), so it's correct
 *     on open, after a refresh, and even if the tab is left open across
 *     midnight.
 *   - The Week view card's isPast/isToday now use the existing, already-
 *     correct TODAY_INDEX (habitsStore.ts: `(new Date().getDay() + 6) % 7`,
 *     Monday=0…Sunday=6 local time) instead of hard-coded indices.
 *   - computeWeekTotals no longer depends on WEEK_DAYS at all — it only
 *     ever needed a fixed length of 7 (habit.weekDays is always a 7-slot
 *     array), never real dates, so it now just iterates 7 times directly.
 *
 * TODAY_INDEX is a module-level constant (evaluated once, at import time,
 * from the real `new Date()`) — so tests that need it to reflect a pinned
 * fake system time must `vi.setSystemTime` BEFORE importing it, via
 * `vi.resetModules()` + a fresh dynamic import, otherwise it would still
 * hold whatever the wall-clock time was when the test file's module graph
 * was first loaded.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsWeekViewDate.test.ts
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getCurrentWeekDays } from '@/data/habitsData'

// habitsStore.ts (imported dynamically below, for a fresh TODAY_INDEX under
// a pinned fake system time) pulls in @/lib/firebase — mock it the same way
// every other store-touching test in this repo does, so module load never
// hits the real Firebase SDK.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
}))

const HABITS_DATA_SRC = readFileSync(resolve(process.cwd(), 'src/data/habitsData.ts'), 'utf8')
const HABITS_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')

// Local-time constructor (year, monthIndex, day, ...) — never a UTC/ISO
// string — so this pins "now" to Friday 28 August 2026 regardless of the
// host machine's timezone.
const FRIDAY_2026_08_28 = new Date(2026, 7, 28, 9, 0, 0)

afterEach(() => {
  vi.useRealTimers()
})

describe('with system time fixed at 28.08.2026, the week view shows the real current week', () => {
  it('Mon 24 Aug – Sun 30 Aug 2026 is visible, not the old hard-coded 21.–27. juuli', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FRIDAY_2026_08_28)
    vi.resetModules()
    const { getCurrentWeekDays: freshGetCurrentWeekDays } = await import('@/data/habitsData')

    const week = freshGetCurrentWeekDays()
    expect(week).toEqual([
      { short: 'E', date: '24. august' },
      { short: 'T', date: '25. august' },
      { short: 'K', date: '26. august' },
      { short: 'N', date: '27. august' },
      { short: 'R', date: '28. august' },
      { short: 'L', date: '29. august' },
      { short: 'P', date: '30. august' },
    ])
  })

  it('the selected/current day is Friday 28. august, at index 4 — not 22. juuli at index 1', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FRIDAY_2026_08_28)
    vi.resetModules()
    const { getCurrentWeekDays: freshGetCurrentWeekDays } = await import('@/data/habitsData')
    const { TODAY_INDEX: freshTodayIndex } = await import('@/lib/habitsStore')

    expect(freshTodayIndex).toBe(4)
    const week = freshGetCurrentWeekDays()
    expect(week[freshTodayIndex]).toEqual({ short: 'R', date: '28. august' })
  })

  it('refreshing (re-evaluating the module fresh, as a page reload would) still resolves to the same correct week', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FRIDAY_2026_08_28)
    vi.resetModules()
    const first = (await import('@/data/habitsData')).getCurrentWeekDays()

    vi.resetModules()
    const second = (await import('@/data/habitsData')).getCurrentWeekDays()

    expect(first).toEqual(second)
    expect(first[0].date).toBe('24. august')
  })
})

describe('the arrows still move exactly one week — addWeeks/addDays math is untouched', () => {
  it('one week before 24–30 Aug is 17–23 Aug, and one week after is 31 Aug–6 Sep', () => {
    const prevWeekRef = new Date(2026, 7, 21) // any day in the previous week
    const nextWeekRef = new Date(2026, 8, 2)  // any day in the following week

    const prevWeek = getCurrentWeekDays(prevWeekRef)
    const nextWeek = getCurrentWeekDays(nextWeekRef)

    expect(prevWeek[0].date).toBe('17. august')
    expect(prevWeek[6].date).toBe('23. august')
    expect(nextWeek[0].date).toBe('31. august')
    expect(nextWeek[6].date).toBe('6. september')
  })
})

describe('the date computation is timezone-safe and never shifts due to UTC', () => {
  it('an explicit referenceDate produces the expected week regardless of the system clock', () => {
    const week = getCurrentWeekDays(new Date(2026, 7, 28, 23, 59, 59))
    expect(week[4]).toEqual({ short: 'R', date: '28. august' })
  })

  it('a reference time near local midnight does not roll over to the wrong day (local getDate/getDay only)', () => {
    const lateNight = new Date(2026, 7, 28, 23, 30, 0)
    const week = getCurrentWeekDays(lateNight)
    expect(week[0].date).toBe('24. august')
    expect(week[4].date).toBe('28. august')
    expect(week[6].date).toBe('30. august')
  })

  it('getCurrentWeekDays never uses UTC-based date methods', () => {
    expect(HABITS_DATA_SRC).not.toMatch(/toISOString|getUTCDate|getUTCDay|getUTCMonth|getUTCFullYear/)
  })

  it('reuses the existing timezone-safe calendar date helpers rather than inventing new date math', () => {
    expect(HABITS_DATA_SRC).toMatch(/import \{ startOfWeek, addDays, WEEKDAYS_ET, MONTHS_ET \} from '@\/lib\/calendar\/dateUtils'/)
    expect(HABITS_DATA_SRC).toMatch(/startOfWeek\(referenceDate, 'monday'\)/)
  })
})

describe('the hard-coded/demo week is gone', () => {
  it('habitsData.ts no longer exports a fixed WEEK_DAYS constant with baked-in literal dates', () => {
    expect(HABITS_DATA_SRC).not.toMatch(/export const WEEK_DAYS/)
    // The old array literally listed all seven demo days in sequence —
    // confirm that exact sequence is gone (a stray example date in a
    // doc-comment is fine and expected to remain).
    expect(HABITS_DATA_SRC).not.toMatch(/'21\. juuli'[\s\S]*?'27\. juuli'/)
  })

  it('HabitsPage.tsx computes WEEK_DAYS fresh from getCurrentWeekDays(), not a static import', () => {
    expect(HABITS_PAGE_SRC).toMatch(/import \{ getCurrentWeekDays \} from "@\/data\/habitsData";/)
    expect(HABITS_PAGE_SRC).toMatch(/const WEEK_DAYS = getCurrentWeekDays\(\);/)
    expect(HABITS_PAGE_SRC).not.toMatch(/import \{ WEEK_DAYS \}/)
  })

  it('the Week view card no longer hard-codes isPast/isToday to fixed indices', () => {
    expect(HABITS_PAGE_SRC).not.toMatch(/const isPast = i < 2;/)
    expect(HABITS_PAGE_SRC).not.toMatch(/const isToday = i === 1;/)
    expect(HABITS_PAGE_SRC).toMatch(/const isPast = i < TODAY_INDEX;/)
    expect(HABITS_PAGE_SRC).toMatch(/const isToday = i === TODAY_INDEX;/)
  })

  it('computeWeekTotals no longer depends on WEEK_DAYS at all', () => {
    const fn = HABITS_PAGE_SRC.match(/function computeWeekTotals\(habits: Habit\[\]\) \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).not.toMatch(/WEEK_DAYS/)
    expect(fn).toMatch(/Array\.from\(\{ length: 7 \}/)
  })
})

describe('unrelated Habits behavior is untouched by this fix', () => {
  it('the habit form, recurrence, custom weekdays, and category/icon/color selection are unaffected', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const handleCategoryChange = \(category: HabitCategory\) => \{/)
    expect(HABITS_PAGE_SRC).toMatch(/const CATEGORY_DEFAULTS: Record<HabitCategory/)
    expect(HABITS_PAGE_SRC).toMatch(/form\.recurrence === "custom"/)
  })

  it('filters and statistics computations are unaffected', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const filtered = habits\.filter\(\(h\) => \{/)
    expect(HABITS_PAGE_SRC).toMatch(/const longestStreak = habits\.reduce<Habit \| null>/)
  })

  it('the Habit interface and Firestore-facing fields are unchanged', () => {
    const habitInterface = HABITS_DATA_SRC.match(/export interface Habit \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(habitInterface).toMatch(/weekDays: \(boolean \| null\)\[\]/)
    expect(habitInterface).not.toMatch(/WEEK_DAYS|getCurrentWeekDays/)
  })
})
