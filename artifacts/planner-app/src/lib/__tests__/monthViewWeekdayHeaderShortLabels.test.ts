/**
 * Calendar mobile fix #2 from the inspection report: MonthView.tsx's
 * weekday header always rendered full weekday names (WEEKDAYS_ET_FULL /
 * WEEKDAYS_EN_FULL, e.g. "Esmaspäev", "Neljapäev") in a 7-column grid with
 * minmax(0,1fr) tracks that don't grow for overflowing content. Reproduced
 * with a real Chromium render of the compiled Tailwind output at 320/360/
 * 390px: adjacent weekday labels visibly overlapped and were unreadable —
 * confirmed even at 390px, not just 320px.
 *
 * Fix: each header cell now renders both the short label (existing
 * WEEKDAYS_ET/WEEKDAYS_EN — already used by MiniCalendar.tsx and
 * habitsData.ts, not created for this fix) and the full label (existing
 * WEEKDAYS_ET_FULL/WEEKDAYS_EN_FULL), toggled with sm:hidden /
 * hidden sm:inline — the same CSS-only responsive-swap pattern already
 * used elsewhere in this codebase (e.g. CalendarHeader.tsx's view
 * switcher). No new weekday constants, no JS viewport checks, no parallel
 * component.
 *
 * Re-verified visually after the fix: at 320/360/390px the header shows
 * "E T K N R L P" (or "M T W T F S S" in English) with zero overlap and no
 * document-level horizontal overflow; at 1024px (desktop) the full names
 * render exactly as before.
 *
 * No React rendering harness exists for MonthView.tsx in this repo (see
 * planGoalCalendarIntegration.test.ts, which reads this same file as raw
 * source) — verified via structural regex assertions, matching that
 * established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/monthViewWeekdayHeaderShortLabels.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/MonthView.tsx'),
  'utf8',
)

function weekdayHeaderBlock(): string {
  return SRC.match(/\{\/\* Weekday header[\s\S]*?\n {6}<\/div>/)?.[0] ?? ''
}

describe('mobile MonthView uses the existing short weekday labels', () => {
  it('reuses WEEKDAYS_ET/WEEKDAYS_EN — no new weekday constants were created', () => {
    expect(SRC).toMatch(/import \{ formatEventTime, getMonthMatrix,\s*\n\s*isToday,\s*\n\s*isSameMonth,\s*\n\s*WEEKDAYS_ET,\s*\n\s*WEEKDAYS_EN,\s*\n\s*WEEKDAYS_ET_FULL,\s*\n\s*WEEKDAYS_EN_FULL,\s*\n\} from '@\/lib\/calendar\/dateUtils'/)
  })

  it('a short label span (sm:hidden) is rendered per weekday cell, indexed from WEEKDAYS_ET/EN', () => {
    const block = weekdayHeaderBlock()
    expect(block).not.toBe('')
    expect(block).toMatch(/<span className="sm:hidden">\{\(lang === 'en' \? WEEKDAYS_EN : WEEKDAYS_ET\)\[i\]\}<\/span>/)
  })
})

describe('desktop MonthView still uses the full weekday labels', () => {
  it('a full-name span (hidden sm:inline) rendering {wd} is still present per cell', () => {
    const block = weekdayHeaderBlock()
    expect(block).toMatch(/<span className="hidden sm:inline">\{wd\}<\/span>/)
  })

  it('the header still maps over WEEKDAYS_ET_FULL/WEEKDAYS_EN_FULL for the full-name source', () => {
    const block = weekdayHeaderBlock()
    expect(block).toMatch(/\(lang === 'en' \? WEEKDAYS_EN_FULL : WEEKDAYS_ET_FULL\)\.map\(\(wd, i\) => \(/)
  })
})

describe('the month grid and existing date/event logic are untouched', () => {
  it('day-cell rendering, today/selection styling, and the 6-row grid are unchanged', () => {
    expect(SRC).toMatch(/const weeks = getMonthMatrix\(/)
    expect(SRC).toMatch(/const inMonth = isSameMonth\(day, currentMonth\)/)
    expect(SRC).toMatch(/const today = isToday\(day\)/)
    expect(SRC).toMatch(/className="grid grid-rows-6 min-h-\[40vh\]"/)
    expect(SRC).toMatch(/style=\{\{ minHeight: '70px' \}\}/)
  })

  it('event lookup, the 3-event-per-day cap, and onDayClick/onEventClick wiring are unchanged', () => {
    expect(SRC).toMatch(/const eventsByDate = new Map<string, MockCalendarEvent\[\]>\(\)/)
    expect(SRC).toMatch(/eventDateKeys\(evt\)/)
    expect(SRC).toMatch(/\.slice\(0, 3\)/)
    expect(SRC).toMatch(/onClick=\{\(\) => onDayClick\?\.\(day\)\}/)
    expect(SRC).toMatch(/onEventClick\?\.\(evt\.id\)/)
  })

  it('the weekday header still has exactly 7 cells with the same border/height classes', () => {
    const block = weekdayHeaderBlock()
    expect(block).toMatch(/className="grid grid-cols-7 border-b border-\[#EBEBEB\] h-10"/)
    expect(block).toMatch(/i < 6 \? 'border-r border-\[#F0F0F0\]' : ''/)
  })
})

describe('no weekday-label overlap at real phone widths (visually verified separately)', () => {
  it('each header cell renders exactly one short-label span and one full-label span, not both visible at once via CSS', () => {
    const block = weekdayHeaderBlock()
    const shortSpans = block.match(/<span className="sm:hidden">/g) ?? []
    const fullSpans = block.match(/<span className="hidden sm:inline">/g) ?? []
    // One of each per cell template (rendered once per weekday via .map)
    expect(shortSpans.length).toBe(1)
    expect(fullSpans.length).toBe(1)
  })
})
