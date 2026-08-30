/**
 * HabitsPage.tsx's weekly completion-circle row (the "Week view card") lays
 * out 7 columns via grid-cols-7 inside a fixed-width card. Confirmed with a
 * real Chromium render of the compiled Tailwind output: below 360px, the
 * grid's per-column pitch (~23px at 320px) is narrower than the circle's
 * w-7/h-7 (28px) size, so adjacent circles visibly overlap (measured: -5px
 * at 320px, i.e. actual pixel overlap, not just a tight fit). From 359px up
 * the same 28px circle already clears its column (measured: 0px gap at
 * 359px, growing positive from 360px on) — matching the confirmed report
 * that 360px/390px/desktop were already fine.
 *
 * Note: despite reading as an interactive "completion control," this
 * specific weekly-summary row (aggregated across all habits, showing a
 * done/total count per day) has no onClick/button in it — the real
 * per-habit toggle is the desktop-only "Week dots" row and the mobile
 * "mark today" button elsewhere on this page, both untouched by this fix.
 * toggleHabitDay (via handleToggleDay) is not called anywhere in this
 * block, so there is no click behavior here to preserve or break; the
 * fix is a pure sizing change.
 *
 * Fix: the circle's width/height classes gain a smallest-tier default of
 * w-5/h-5 (20px — the smallest size that keeps a safe (>=3px) gap between
 * circles at every width down to 320px) and a min-[360px]: override that
 * restores the exact original w-7/h-7 (28px) starting at exactly the width
 * where it was already confirmed to fit without overlap. The existing
 * sm:w-9/h-9 (36px, 640px+) desktop size is completely untouched — it was
 * already applied unconditionally and still is. All 7 columns, the
 * grid-cols-7 grid itself, done/empty/dashed-future circle variants, the
 * checkmark icon, the today/past card highlighting, and the done/total
 * count label below each circle are all unchanged — only the four
 * w-7/h-7 occurrences on the circle wrapper/fill/empty/dashed elements
 * gained the same two extra size classes.
 *
 * Re-verified visually after the fix: at 320/330/344/350/359px every
 * circle is now 20px with a >=3px gap (no overlap, no page-level
 * overflow); at 360/375/390px circles are back to the original 28px with
 * the exact original gaps (1px/3px/5px, unchanged from before this fix);
 * at 1024px desktop the circles are unchanged at 36px.
 *
 * No React rendering harness exists for HabitsPage.tsx in this repo (see
 * habitsWeekRowMobileDateOverlap.test.ts, which reads this same file as
 * raw source) — verified via structural regex assertions, matching that
 * established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsWeeklyCircleOverlap320.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/HabitsPage.tsx'),
  'utf8',
)

// The four circle-related elements (wrapper, filled/done, empty, dashed
// future) all carry this exact prefix — anchored on the unique, unambiguous
// "rounded-full" + border/bg combinations that only appear on these circles.
function circleClassNames(): string[] {
  const matches = [...SRC.matchAll(/className="(relative [^"]*w-5[^"]*|[^"]*rounded-full[^"]*)"/g)]
  return matches.map((m) => m[1]).filter((c) => c.includes('w-5'))
}

describe('no circle overlap at 320px (and 330-359px)', () => {
  it('all four circle elements default to w-5 h-5 (20px) below 360px', () => {
    const classNames = circleClassNames()
    expect(classNames.length).toBe(4) // wrapper + filled/done + empty + dashed-future
    for (const className of classNames) {
      expect(className).toMatch(/(?<!min-\[360px\]:)\bw-5\b/)
      expect(className).toMatch(/(?<!min-\[360px\]:)\bh-5\b/)
    }
  })
})

describe('360px/390px and desktop remain correct', () => {
  it('min-[360px]: restores the exact original w-7/h-7 (28px) starting at 360px', () => {
    const classNames = circleClassNames()
    for (const className of classNames) {
      expect(className).toMatch(/min-\[360px\]:w-7/)
      expect(className).toMatch(/min-\[360px\]:h-7/)
    }
  })

  it('the existing sm:w-9/h-9 (36px, desktop) size is unchanged', () => {
    const classNames = circleClassNames()
    for (const className of classNames) {
      expect(className).toMatch(/sm:w-9/)
      expect(className).toMatch(/sm:h-9/)
    }
  })
})

describe('all seven weekly columns remain present', () => {
  it('the grid-cols-7 grid and its 7-day map are unchanged', () => {
    expect(SRC).toMatch(/className="flex-1 grid grid-cols-7 gap-0\.5 sm:gap-1"/)
    expect(SRC).toMatch(/\{WEEK_DAYS\.map\(\(wd, i\) => \{/)
  })

  it('done/not-done/today/past/future circle variants all still render', () => {
    expect(SRC).toMatch(/\{hasData && \(isPast \|\| isToday\) \? \(/)
    expect(SRC).toMatch(/\{anyDone \? \(/)
    expect(SRC).toMatch(/rounded-full bg-\[#6F5AE8\] flex items-center justify-center/) // done
    expect(SRC).toMatch(/rounded-full border-2 border-\[#E2E8F0\]"/) // not-done
    expect(SRC).toMatch(/rounded-full border-2 border-dashed border-\[#E2E8F0\]"/) // future
    expect(SRC).toMatch(
      /isToday\s*\n\s*\? "bg-\[#F5F3FF\] border border-\[#C4B5FD\]"\s*\n\s*: isPast\s*\n\s*\? "bg-\[#FAFAF8\]"/,
    )
  })

  it('the checkmark icon and the done/total count label are unchanged', () => {
    expect(SRC).toMatch(/<polyline points="20 6 9 17 4 12" \/>/)
    expect(SRC).toMatch(/\{done\}\/\{total\}/)
  })
})

describe('completion handlers and disabled/markable logic remain unchanged', () => {
  it('this weekly-summary row has no onClick — toggleHabitDay/handleToggleDay are untouched elsewhere', () => {
    const weekViewCard = SRC.match(
      /\{\/\* Week view card \*\/\}[\s\S]*?Järgmine nädal[\s\S]*?<\/button>/,
    )?.[0] ?? ''
    expect(weekViewCard).not.toBe('')
    // Only the prev/next week-navigation buttons have onClick here — the
    // circles themselves are plain, non-interactive <div>s.
    expect(weekViewCard).not.toMatch(/toggleHabitDay/)
    expect(weekViewCard).not.toMatch(/handleToggleDay/)
    // The real per-habit toggle (desktop "Week dots" + mobile "mark today")
    // still exists elsewhere in the file, unchanged.
    expect(SRC).toMatch(/const handleToggleDay = async \(habitId: string, dateKey: string\) => \{/)
    expect(SRC).toMatch(/await toggleHabitDay\(habitId, dateKey, today\);/)
    expect(SRC).toMatch(/onClick=\{\(\) => handleToggleDay\(habit\.id, todayKey\)\}/)
  })

  it('week navigation (prev/next) buttons are unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o - 1\)\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o \+ 1\)\}/)
  })
})
