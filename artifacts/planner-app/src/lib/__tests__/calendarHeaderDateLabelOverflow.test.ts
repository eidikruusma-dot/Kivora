/**
 * CalendarHeader.tsx's date-label <span> forced mobile horizontal overflow:
 * it carried `flex-shrink-0` and a fixed `min-w-[130px]`, so on narrow
 * phones a long localized date (e.g. the Agenda-view default,
 * "26. veebruar 2026, neljapäev") could never shrink — it just overflowed
 * past the viewport, forcing the app shell's <main> (which has an implicit
 * overflow-x:auto from its explicit overflow-y-auto) into horizontal
 * scroll. Reproduced with a real Chromium render of the compiled Tailwind
 * output at 320/360/390px before this fix.
 *
 * Fix has two parts, both required — verified empirically that the span
 * change alone was not enough:
 *   1. The date-label span: dropped `flex-shrink-0`/`min-w-[130px]`, added
 *      `min-w-0 truncate` so it can shrink and ellipsize.
 *   2. Its immediate wrapper (the "left group" div holding Today/Prev/Next
 *      + the label) was itself `flex-shrink-0`, which blocked the outer
 *      flex-wrap row from ever asking that group to shrink in the first
 *      place — so the span's own min-w-0/truncate never got a chance to
 *      apply. Changed to `min-w-0` (no flex-shrink-0) so the group itself
 *      can compress on narrow rows; Today/Prev/Next keep their own
 *      `flex-shrink-0` and never compress — only the label does.
 *
 * Re-verified visually with Playwright/Chromium against the real compiled
 * CSS: at 320/360/390px the label now truncates with an ellipsis and stays
 * fully inside the viewport (main's scrollWidth === clientWidth); at
 * desktop width (1024px) the full, untruncated label renders exactly as
 * before.
 *
 * No React rendering harness exists for CalendarHeader.tsx in this repo
 * (see calendarCreationFlow.test.ts) — verified via structural regex
 * assertions against the raw source, matching that established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/calendarHeaderDateLabelOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/CalendarHeader.tsx'),
  'utf8',
)

describe('the date-label span uses the shrink/truncate pattern', () => {
  it('no longer carries flex-shrink-0 or the fixed min-w-[130px]', () => {
    expect(SRC).not.toMatch(/text-\[15px\] font-semibold text-\[#1A1F36\] flex-shrink-0 min-w-\[130px\]/)
  })

  it('carries min-w-0 and truncate instead', () => {
    expect(SRC).toMatch(/<span className="text-\[15px\] font-semibold text-\[#1A1F36\] min-w-0 truncate">/)
  })

  it('still renders {dateLabel} as its only content', () => {
    const span = SRC.match(/<span className="text-\[15px\] font-semibold text-\[#1A1F36\] min-w-0 truncate">([\s\S]*?)<\/span>/)?.[1] ?? ''
    expect(span.trim()).toBe('{dateLabel}')
  })
})

describe('the immediate wrapper group can actually shrink (required for the fix to take effect)', () => {
  it('the left group (nav + date label) is min-w-0, not flex-shrink-0', () => {
    const block = SRC.match(/Left group: navigation controls \+ date label[\s\S]{0,400}?<div className="([^"]*)">/)
    expect(block).not.toBeNull()
    expect(block![1]).toBe('flex items-center gap-2 min-w-0')
    expect(block![1]).not.toMatch(/flex-shrink-0/)
  })
})

describe('surrounding CalendarHeader controls remain intact', () => {
  it('Today/Prev/Next buttons keep their own flex-shrink-0, handlers, and order', () => {
    const leftGroupBlock = SRC.match(/<div className="flex items-center gap-2 min-w-0">([\s\S]*?)\n {6}<\/div>/)?.[1] ?? ''
    expect(leftGroupBlock).not.toBe('')
    const todayIdx = leftGroupBlock.indexOf('onClick={onToday}')
    const prevIdx = leftGroupBlock.indexOf('onClick={onPrev}')
    const nextIdx = leftGroupBlock.indexOf('onClick={onNext}')
    const labelIdx = leftGroupBlock.indexOf('{dateLabel}')
    expect(todayIdx).toBeGreaterThan(-1)
    expect(prevIdx).toBeGreaterThan(todayIdx)
    expect(nextIdx).toBeGreaterThan(prevIdx)
    expect(labelIdx).toBeGreaterThan(nextIdx)
    expect(leftGroupBlock.match(/flex-shrink-0/g)?.length).toBe(3) // Today, Prev, Next — not the label, not the group itself
  })

  it('date formatting logic (dateLabel computation) is unchanged', () => {
    expect(SRC).toMatch(/const dateLabel =\s*\n\s*viewType === 'week'\s*\n\s*\? formatWeekRange\(currentDate, lang\)/)
    expect(SRC).toMatch(/formatMonthYear\(currentDate, lang\)/)
    expect(SRC).toMatch(/formatDaySingle\(currentDate, lang\)/)
  })

  it('the view switcher (desktop + mobile compact) is unchanged', () => {
    expect(SRC).toMatch(/hidden sm:flex items-center border border-\[#D1D5DB\] rounded-md/)
    expect(SRC).toMatch(/sm:hidden relative/)
    expect(SRC).toMatch(/onClick=\{\(\) => onViewChange\(/)
  })

  it('the New menu (event/calendar) is unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => \{ setMenuOpen\(false\); onNewEvent\(\) \}\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => \{ setMenuOpen\(false\); onNewCalendar\(\) \}\}/)
  })
})
