/**
 * HabitsPage.tsx's weekly day/date row rendered each of the 7 columns'
 * full date label (wd.date, e.g. "24. august", from
 * getCurrentWeekDays()/habitsData.ts) unconditionally, inside a tight
 * 7-column grid (gap-0.5 sm:gap-1, px-0.5 sm:px-1). Reproduced with a real
 * Chromium render of the compiled Tailwind output: at 320/360/390px the
 * seven full-date labels crowd/overlap each other. The weekday initials
 * (wd.short, e.g. "E") were already fine and are untouched.
 *
 * Fix: the date span now renders two children — a compact day-number-only
 * label (sm:hidden, using `date.getDate()` from the Date object already in
 * scope for that column) and the existing full "24. august" label
 * (hidden sm:inline, still wd.date from getCurrentWeekDays() — no new
 * date-format helper was added). Same CSS-only responsive-swap pattern
 * already used for the Calendar module's mobile fixes in this session
 * (CalendarHeader.tsx's view switcher, MonthView.tsx's weekday header).
 *
 * Habit completion logic, streaks, filters, recurrence, day-selection, and
 * Firestore persistence are untouched — only the date span's two children
 * changed.
 *
 * Re-verified visually after the fix: at 320/360/390px the row shows plain
 * day numbers (e.g. "24", "25", ... "30") with no overlap and no
 * document-level horizontal overflow; at 1024px (desktop) the full
 * "24. august"-style labels render exactly as before.
 *
 * No React rendering harness exists for HabitsPage.tsx in this repo (see
 * habitsWeekViewDate.test.ts, which reads this same file as raw source) —
 * verified via structural regex assertions, matching that established
 * pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsWeekRowMobileDateOverlap.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')

function dateSpanBlock(): string {
  return SRC.match(/<span className="text-\[10px\] text-\[#94A3B8\]">[\s\S]*?<\/span>\n\n {20}\{\/\* Circle indicator/)?.[0]
    ?? SRC.match(/<span className="text-\[10px\] text-\[#94A3B8\]">[\s\S]*?\n {20}<\/span>/)?.[0] ?? ''
}

describe('mobile uses the compact day-number date representation', () => {
  it('a sm:hidden span rendering date.getDate() exists inside the date span', () => {
    const block = dateSpanBlock()
    expect(block).not.toBe('')
    expect(block).toMatch(/<span className="sm:hidden">\{date\.getDate\(\)\}<\/span>/)
  })

  it('no new date-format helper/constant was introduced — date.getDate() reuses the Date object already in scope', () => {
    expect(SRC).toMatch(/const date = weekDates\[i\];/)
    expect(SRC).not.toMatch(/function formatCompactDate|getShortDate|getDayNumber/)
  })
})

describe('larger screens keep the existing full date representation', () => {
  it('a hidden sm:inline span rendering {wd.date} still exists', () => {
    const block = dateSpanBlock()
    expect(block).toMatch(/<span className="hidden sm:inline">\{wd\.date\}<\/span>/)
  })

  it('getCurrentWeekDays() (the existing "24. august"-style formatter) is still the source for wd.date', () => {
    expect(SRC).toMatch(/const WEEK_DAYS = getCurrentWeekDays\(weekReferenceDate\);/)
  })
})

describe('weekday labels and habit interaction logic are unchanged', () => {
  it('the weekday-initial span (wd.short) is untouched', () => {
    expect(SRC).toMatch(/<span className="text-\[11px\] sm:text-xs font-semibold text-\[#1A1F36\]">\s*\{wd\.short\}\s*<\/span>/)
  })

  it('the 7-column grid, week navigation, and today/past styling are unchanged', () => {
    expect(SRC).toMatch(/className="flex-1 grid grid-cols-7 gap-0\.5 sm:gap-1"/)
    expect(SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o - 1\)\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o \+ 1\)\}/)
    expect(SRC).toMatch(/const isToday = dateKey === todayKey;/)
    expect(SRC).toMatch(/const isPast = dateKey < todayKey;/)
  })

  it('completion-circle rendering (anyDone/hasData) is unchanged', () => {
    expect(SRC).toMatch(/const anyDone = done > 0;/)
    expect(SRC).toMatch(/const hasData = total > 0;/)
    expect(SRC).toMatch(/\{hasData && \(isPast \|\| isToday\) \? \(/)
  })
})
