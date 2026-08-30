/**
 * TasksPage.tsx renders its 3-tab filter strip ("Kõik (n)" / "Aktiivsed (n)"
 * / "Tehtud (n)") in a `w-fit` container with no width cap and no
 * horizontal scroll — the same defect already fixed on Habits/Goals
 * (commit aeb44fd). Confirmed with a real Chromium render of the compiled
 * Tailwind output: at 320-360px the strip is wider than the page's
 * available content width, so the last tab ("Tehtud (n)") gets clipped off
 * the right edge and the whole page becomes horizontally scrollable to
 * reach it.
 *
 * Fix: the strip itself now owns its own horizontal scroll, mobile-only,
 * reverted at sm: (640px) and up — the exact same overflow-x-auto pattern
 * already used correctly for Habits/Goals/Plans/School's tab strips:
 *   - the strip's wrapper gains `max-w-full overflow-x-auto` (capping it
 *     to the available width and letting it scroll internally instead of
 *     pushing the page wider) and drops the always-on `w-fit` for
 *     `sm:w-fit` (restoring the exact original fit-content sizing at sm:
 *     and up, where the strip already fits and never needs to scroll);
 *   - each tab button gains `whitespace-nowrap` (previously implicit/
 *     absent — with the strip now scrollable, this guarantees the three
 *     labels can never wrap onto a second line, only scroll).
 *
 * All three tabs (all/active/completed), their labelKeys/counts, order,
 * active-state styling (`bg-[#EDE9FB] text-[#6F5AE8]` vs
 * `text-[#64748B] hover:...`), the onClick handler (setFilter), the
 * `filter` state, and the surrounding page (header, add-task button, task
 * rows/actions, all Firestore-backed data) are completely untouched — only
 * the strip wrapper's and each button's className changed.
 *
 * Re-verified visually after the fix: at 320-360px the strip scrolls
 * within itself with zero page-level horizontal overflow (confirmed via
 * document.documentElement.scrollWidth === window.innerWidth), and the
 * previously-clipped last tab becomes fully visible after scrolling the
 * strip; at 360/390/1024px the strip renders its original fit-content,
 * single-row, no-scroll layout unchanged (it fits comfortably there —
 * unlike Habits/Goals' 4-tab strip, Tasks' shorter 3-tab strip already
 * clears 360px cleanly).
 *
 * No React rendering harness exists for TasksPage.tsx in this repo (see
 * tasksRowActionsWrapTogether.test.ts, which reads this same file as raw
 * source) — verified via structural regex assertions, matching that
 * established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksFilterTabStripMobileOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/TasksPage.tsx'),
  'utf8',
)

describe('Tasks filter strip owns horizontal scrolling on narrow mobile', () => {
  it('the strip wrapper caps its width and scrolls internally on mobile, restoring fit-content sizing at sm: and up', () => {
    expect(SRC).toMatch(
      /className="flex items-center gap-1 p-1 bg-white rounded-xl border border-\[#ECECF2\] max-w-full overflow-x-auto sm:w-fit"/,
    )
    // the old always-on, non-scrolling w-fit wrapper is gone
    expect(SRC).not.toMatch(
      /className="flex items-center gap-1 p-1 bg-white rounded-xl border border-\[#ECECF2\] w-fit"/,
    )
  })
})

describe('tabs remain whitespace-nowrap', () => {
  it('tab buttons are whitespace-nowrap — they scroll, they never wrap onto a second line', () => {
    expect(SRC).toMatch(
      /className=\{`px-3\.5 py-1\.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors \$\{/,
    )
  })
})

describe('existing tab order and handlers remain unchanged', () => {
  it('keeps all/active/completed keys in order, with their original label sources', () => {
    const filterTabsBlock = SRC.match(/\{\(\[\s*\{ key: 'all',[\s\S]*?\] as const\)\.map/)?.[0] ?? ''
    const order = [...filterTabsBlock.matchAll(/key: '([a-z]+)',/g)].map((m) => m[1])
    expect(order).toEqual(['all', 'active', 'completed'])
    expect(SRC).toMatch(/t\('tasks\.filter\.all',\s*lang\)\.replace\('\{n\}', String\(tasks\.length\)\)/)
    expect(SRC).toMatch(/t\('tasks\.filter\.active', lang\)\.replace\('\{n\}', String\(activeCount\)\)/)
    expect(SRC).toMatch(/t\('tasks\.filter\.done',\s*lang\)\.replace\('\{n\}', String\(completedCount\)\)/)
  })

  it('active-state styling and the setFilter handler are unchanged', () => {
    expect(SRC).toMatch(/\? 'bg-\[#EDE9FB\] text-\[#6F5AE8\]' : 'text-\[#64748B\] hover:bg-\[#F8F7F4\] hover:text-\[#1A1F36\]'/)
    expect(SRC).toMatch(/onClick=\{\(\) => setFilter\(key\)\}/)
  })
})

describe('no unrelated responsive layout, task data, or Firestore behavior changed', () => {
  it('the page-level wrapper and header row are unchanged', () => {
    expect(SRC).toMatch(
      /className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-\[1400px\] mx-auto w-full"/,
    )
    expect(SRC).toMatch(
      /className="flex w-full items-center justify-center gap-2 px-4 py-2\.5 bg-\[#6F5AE8\] text-white rounded-xl text-sm font-medium hover:bg-\[#5B48D8\] transition-colors shadow-sm sm:w-auto"/,
    )
  })
})

describe('the previously-fixed Tasks row/action mobile behavior remains intact', () => {
  it('Edit/Delete still share the sm:contents wrapper that keeps them from splitting apart on narrow phones', () => {
    expect(SRC).toMatch(/className="flex items-center gap-1 ml-auto sm:ml-0 sm:contents"/)
  })

  it('the row-level sm:contents dissolve pattern (checkbox+title, badges+actions) is unchanged', () => {
    expect(SRC).toMatch(/className="flex items-start gap-3 sm:contents"/)
    expect(SRC).toMatch(/className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0 sm:contents"/)
  })
})
