/**
 * HabitsPage.tsx and GoalsPage.tsx both render their 4-tab filter strip
 * ("Kõik (n)" / "Aktiivsed (n)" / "Pausil (n)" / "Lõpetatud (n)") in a
 * `w-fit` container with no width cap and no horizontal scroll. Confirmed
 * with a real Chromium render of the compiled Tailwind output: at 320px
 * this strip is wider than the page's available content width, so the
 * last tab ("Lõpetatud (n)") gets clipped off the right edge and the
 * whole page becomes horizontally scrollable to reach it — the same
 * "unwrapped w-fit strip" defect, independently, in both files.
 *
 * Fix: the strip itself now owns its own horizontal scroll, mobile-only,
 * reverted at sm: (640px) and up — the exact same overflow-x-auto
 * pattern already used correctly for the Plans (PlansPage.tsx) and
 * School (SchoolPage.tsx) tab strips:
 *   - the strip's wrapper gains `max-w-full overflow-x-auto` (capping it
 *     to the available width and letting it scroll internally instead
 *     of pushing the page wider) and drops the always-on `w-fit` for
 *     `sm:w-fit` (restoring the exact original fit-content sizing at
 *     sm: and up, where the strip already fits and never needs to
 *     scroll);
 *   - each tab button gains `whitespace-nowrap` (previously implicit/
 *     absent — with the strip now scrollable, this guarantees the four
 *     labels can never wrap onto a second line, only scroll).
 *
 * All four tabs (all/active/paused/completed), their labelKeys/counts,
 * order, active-state styling (`bg-[#EDE9FB] text-[#6F5AE8]` vs
 * `text-[#64748B] hover:...`), onClick handlers (setFilter), the
 * `filter` state, and the surrounding page (header, week-view/goals
 * list, add-habit/add-goal button, all Firestore-backed data) are
 * completely untouched — only the strip wrapper's and each button's
 * className changed, identically in both files.
 *
 * Re-verified visually after the fix: at 320/360/390px the strip scrolls
 * within itself with zero page-level horizontal overflow (confirmed via
 * document.documentElement.scrollWidth === window.innerWidth at all
 * three widths), and every tab — including the previously-clipped last
 * one — becomes fully visible after scrolling the strip; at 1024px
 * desktop the strip renders its original fit-content, single-row,
 * no-scroll layout unchanged (scrollWidth === clientWidth, i.e. no
 * internal overflow at all there).
 *
 * No React rendering harness exists for HabitsPage.tsx/GoalsPage.tsx in
 * this repo — verified via structural regex assertions against the raw
 * source, matching the pattern used throughout this codebase's other
 * page-level mobile-responsive regression tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsGoalsFilterTabStripMobileOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HABITS_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/HabitsPage.tsx'),
  'utf8',
)
const GOALS_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/GoalsPage.tsx'),
  'utf8',
)

describe.each([
  { name: 'HabitsPage', SRC: HABITS_SRC, filterKey: 'filter' },
  { name: 'GoalsPage', SRC: GOALS_SRC, filterKey: 'filter' },
])('$name filter-tab strip owns its own horizontal scroll on mobile', ({ SRC }) => {
  it('the strip wrapper caps its width and scrolls internally on mobile, restoring fit-content sizing at sm: and up', () => {
    expect(SRC).toMatch(
      /className="flex items-center gap-1 p-1 bg-white rounded-xl border border-\[#ECECF2\] max-w-full overflow-x-auto sm:w-fit"/,
    )
    // the old always-on, non-scrolling w-fit wrapper is gone
    expect(SRC).not.toMatch(
      /className="flex items-center gap-1 p-1 bg-white rounded-xl border border-\[#ECECF2\] w-fit"/,
    )
  })

  it('tab buttons are whitespace-nowrap — they scroll, they never wrap onto a second line', () => {
    expect(SRC).toMatch(
      /className=\{`px-3\.5 py-1\.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors \$\{/,
    )
  })

  it('active-state styling (selected vs unselected tab) is unchanged', () => {
    expect(SRC).toMatch(/\? ['"]bg-\[#EDE9FB\] text-\[#6F5AE8\]['"]/)
    expect(SRC).toMatch(/: ['"]text-\[#64748B\] hover:bg-\[#F8F7F4\] hover:text-\[#1A1F36\]['"]/)
  })

  it('the onClick handler still calls setFilter(key) for each tab, unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setFilter\(key\)\}/)
  })
})

describe('tab order/keys/labels remain intact for HabitsPage', () => {
  it('keeps all/active/paused/completed keys in order, with their original label sources', () => {
    const filterTabsBlock = HABITS_SRC.match(/key: "all",[\s\S]*?\] as const/)?.[0] ?? ''
    const order = [...filterTabsBlock.matchAll(/key: "([a-z]+)",/g)].map((m) => m[1])
    expect(order).toEqual(['all', 'active', 'paused', 'completed'])
    expect(HABITS_SRC).toMatch(/t\("habits\.filter\.all", lang\)\.replace\(\s*"\{n\}",\s*String\(habits\.length\),?\s*\)/)
    expect(HABITS_SRC).toMatch(/t\("habits\.filter\.active", lang\)\.replace\(\s*"\{active\}",\s*String\(activeCount\),?\s*\)/)
    expect(HABITS_SRC).toMatch(/t\("habits\.filter\.paused", lang\)\.replace\(\s*"\{n\}",\s*String\(pausedCount\),?\s*\)/)
    expect(HABITS_SRC).toMatch(/t\("habits\.filter\.done", lang\)\.replace\(\s*"\{n\}",\s*String\(completedCount\),?\s*\)/)
  })
})

describe('tab order/keys/labels remain intact for GoalsPage', () => {
  it('keeps all/active/paused/completed keys in order, with their original label sources', () => {
    const order = [...GOALS_SRC.matchAll(/key: ['"]([a-z]+)['"],/g)].map((m) => m[1])
    expect(order).toEqual(['all', 'active', 'paused', 'completed'])
    expect(GOALS_SRC).toMatch(/t\('goals\.filter\.all',\s*lang\)\.replace\('\{n\}', String\(goals\.length\)\)/)
    expect(GOALS_SRC).toMatch(/t\('goals\.filter\.active', lang\)\.replace\('\{active\}', String\(activeCount\)\)/)
    expect(GOALS_SRC).toMatch(/t\('goals\.filter\.paused', lang\)\.replace\('\{n\}', String\(pausedCount\)\)/)
    expect(GOALS_SRC).toMatch(/t\('goals\.filter\.done',\s*lang\)\.replace\('\{n\}', String\(completedCount\)\)/)
  })
})

describe('no unrelated responsive classes changed', () => {
  it('HabitsPage: the page-level wrapper, header row, and week-view grid are unchanged', () => {
    expect(HABITS_SRC).toMatch(
      /className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-\[1400px\] mx-auto w-full"/,
    )
    expect(HABITS_SRC).toMatch(/className="flex items-center justify-between flex-wrap gap-3"/)
    expect(HABITS_SRC).toMatch(/className="flex-1 grid grid-cols-7 gap-0\.5 sm:gap-1"/)
  })

  it('GoalsPage: the page-level wrapper and header row are unchanged', () => {
    expect(GOALS_SRC).toMatch(
      /className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-\[1400px\] mx-auto w-full"/,
    )
    expect(GOALS_SRC).toMatch(/className="flex items-center justify-between flex-wrap gap-3"/)
  })
})
