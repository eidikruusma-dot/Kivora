/**
 * Regression tests for filterLessonsForToday (ScheduleTab.tsx) — the second
 * half of the "Today's schedule" stale-date defect: before this fix,
 * SchoolPage.tsx's TodaySchedule received ALL lessons unfiltered (no
 * date/weekday filtering existed at all), on top of a hardcoded literal
 * "27. juuli 2026, esmaspäev" display string (covered by dateUtils.test.ts).
 *
 * Deterministic — every case passes an explicit todayISO/todayWeekdayET
 * pair, no dependency on the machine's actual current date.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabTodayFilter.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ScheduleTab.tsx imports schoolStore.tsx (for useSchoolSubjectsFromLessons/
// addSchoolSubject/classifySubject), which imports @/lib/firebase at module
// scope — mock it out so importing ScheduleTab doesn't try to initialize a
// real Firebase app (this test only exercises the pure filterLessonsForToday
// export).
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

import { filterLessonsForToday, DAYS_ET, type ScheduleLesson } from '@/components/school/ScheduleTab'

const TODAY_ISO = '2026-08-26'       // Wednesday
const TODAY_WEEKDAY_ET = DAYS_ET[2]  // 'Kolmapäev'

function makeLesson(overrides: Partial<ScheduleLesson> = {}): ScheduleLesson {
  return {
    id: `lesson-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Matemaatika',
    dotColor: '#6F5AE8',
    cardBg: '#EDE9FB',
    ...overrides,
  }
}

describe('filterLessonsForToday', () => {
  it('includes a one-time block whose explicit date equals today', () => {
    const block = makeLesson({ id: 'today-block', date: TODAY_ISO })
    const result = filterLessonsForToday([block], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result.map((l) => l.id)).toEqual(['today-block'])
  })

  it('excludes a one-time block for another explicit date', () => {
    const block = makeLesson({ id: 'other-date-block', date: '2026-07-27' })
    const result = filterLessonsForToday([block], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result).toEqual([])
  })

  it('includes a recurring lesson whose weekday equals today (Wednesday)', () => {
    const lesson = makeLesson({ id: 'wed-lesson', day: 'Kolmapäev' })
    const result = filterLessonsForToday([lesson], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result.map((l) => l.id)).toEqual(['wed-lesson'])
  })

  it('excludes a recurring lesson for another weekday (Monday) when today is Wednesday', () => {
    const lesson = makeLesson({ id: 'mon-lesson', day: 'Esmaspäev' })
    const result = filterLessonsForToday([lesson], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result).toEqual([])
  })

  it('explicit date takes precedence over day when both happen to be set', () => {
    const matchesByDate = makeLesson({ id: 'date-wins', date: TODAY_ISO, day: 'Esmaspäev' })
    const excludedByDate = makeLesson({ id: 'date-excludes', date: '2026-07-27', day: 'Kolmapäev' })
    const result = filterLessonsForToday([matchesByDate, excludedByDate], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result.map((l) => l.id)).toEqual(['date-wins'])
  })

  it('excludes an entry with neither date nor day (no anchor to compare against)', () => {
    const undated = makeLesson({ id: 'undated' })
    const result = filterLessonsForToday([undated], TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result).toEqual([])
  })

  it('mixed list: only the genuinely-today entries survive', () => {
    const lessons = [
      makeLesson({ id: 'a', date: TODAY_ISO }),
      makeLesson({ id: 'b', date: '2026-09-01' }),
      makeLesson({ id: 'c', day: 'Kolmapäev' }),
      makeLesson({ id: 'd', day: 'Reede' }),
      makeLesson({ id: 'e' }),
    ]
    const result = filterLessonsForToday(lessons, TODAY_ISO, TODAY_WEEKDAY_ET)
    expect(result.map((l) => l.id).sort()).toEqual(['a', 'c'])
  })
})

// ── Structural checks: SchoolPage wires display + filtering to the same source ──

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('SchoolPage "Today\'s schedule" wiring (structural)', () => {
  it('no hardcoded July 2026 date remains anywhere in SchoolPage.tsx', () => {
    expect(SCHOOL_PAGE_SRC).not.toMatch(/27\.\s*juuli\s*2026/i)
    // the exact old hardcoded literal (date + weekday together) is gone —
    // "esmaspäev" alone is a legitimate weekday name that may still appear
    // elsewhere in the file unrelated to this defect
    expect(SCHOOL_PAGE_SRC).not.toMatch(/27\.\s*juuli\s*2026,\s*esmaspäev/i)
  })

  it('todayISO, todayWeekdayET, and todayLabel are all derived from the same getLocalDateString() call', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/const todayISO = getLocalDateString\(\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const todayWeekdayET = DAYS_ET\[getLocalWeekdayIndex\(\)\];/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const todayLabel = formatDateWithWeekday\(todayISO, lang\);/)
  })

  it('the today-filter and the display label both consume todayISO (same source), not two independent date computations', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/filterLessonsForToday\(scheduleLessons, todayISO, todayWeekdayET\)/)
    // only ONE getLocalDateString() call feeds both — not a second independent "now" for display
    const calls = (SCHOOL_PAGE_SRC.match(/getLocalDateString\(\)/g) ?? []).length
    expect(calls).toBe(1)
  })

  it('TodaySchedule is passed the filtered lessons and the shared label, not the raw unfiltered scheduleLessons', () => {
    const callSite = SCHOOL_PAGE_SRC.match(/<TodaySchedule[\s\S]*?\/>/)?.[0] ?? ''
    expect(callSite).toMatch(/lessons=\{todayLessons\}/)
    expect(callSite).toMatch(/todayLabel=\{todayLabel\}/)
    expect(callSite).not.toMatch(/lessons=\{scheduleLessons\}/)
  })

  it('the date label is rendered from the todayLabel prop, not a literal string', () => {
    const componentBody = SCHOOL_PAGE_SRC.match(/function TodaySchedule\([\s\S]*?\n}\n/)?.[0] ?? ''
    expect(componentBody).toMatch(/\{todayLabel\}/)
  })

  it('does not use toISOString/UTC slicing anywhere in the new wiring', () => {
    const relevantSection = SCHOOL_PAGE_SRC.slice(
      SCHOOL_PAGE_SRC.indexOf('const scheduleLessons = useSchoolLessons();'),
      SCHOOL_PAGE_SRC.indexOf('const scheduleLessons = useSchoolLessons();') + 1500,
    )
    expect(relevantSection).not.toMatch(/toISOString\(\)\.slice/)
  })
})

describe('midnight refresh scheduling and cleanup', () => {
  it('a single one-shot setTimeout (not setInterval) is used, scheduled via msUntilNextLocalMidnight', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/msUntilNextLocalMidnight\(\)/)
    expect(SCHOOL_PAGE_SRC).toMatch(/setTimeout\(\(\) => \{\s*forceMidnightTick/)
  })

  it('the timer is cleared on unmount (useEffect cleanup)', () => {
    const effectBlock = SCHOOL_PAGE_SRC.match(/useEffect\(\(\) => \{\s*let timer[\s\S]*?\}, \[\]\);/)?.[0] ?? ''
    expect(effectBlock).toMatch(/return \(\) => clearTimeout\(timer\);/)
  })

  it('reschedules itself after each fire — a chain of one-shot timers, not a fixed-interval poll', () => {
    const effectBlock = SCHOOL_PAGE_SRC.match(/useEffect\(\(\) => \{\s*let timer[\s\S]*?\}, \[\]\);/)?.[0] ?? ''
    expect(effectBlock).not.toMatch(/setInterval/)
    expect(effectBlock).toMatch(/scheduleNext\(\);\s*\}, msUntilNextLocalMidnight\(\)\);/)
  })
})
