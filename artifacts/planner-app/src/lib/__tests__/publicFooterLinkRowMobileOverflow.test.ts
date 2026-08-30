/**
 * PublicFooter.tsx's link row ("Privaatsuspoliitika" / "Kasutustingimused" /
 * "Kontakt") sat in one non-wrapping flex row (flex items-center gap-6, no
 * flex-wrap). Confirmed with a real Chromium render of the compiled
 * Tailwind output, both against an isolated reproduction and the actual
 * live app (Landing, Contact, Privacy, Terms — every public route that
 * renders this footer): at 320px the three Estonian labels don't fit on
 * one line and pushed the whole page ~21px past the viewport edge
 * (document.documentElement.scrollWidth > window.innerWidth). 360px and
 * 390px already rendered this row without visible page-level overflow.
 *
 * Fix: mobile-only override, reverted at exactly 360px (not a plain sm:/
 * 640px breakpoint — the outer row only switches from column to row layout
 * at md:/768px, so a sm: override would still have force-wrapped this row
 * all the way up through 639px, well past where it already fit) —
 *   - the link row gains flex-wrap (was implicitly nowrap), so the labels
 *     can wrap onto a second line instead of overflowing the page;
 *   - the row's gap-6 (24px, used as both horizontal and vertical gap when
 *     wrapped) is split into gap-x-6 (unchanged 24px horizontal spacing on
 *     the same line) + gap-y-2 (8px vertical spacing between wrapped
 *     lines only — irrelevant on a single line);
 *   - justify-center is added so the two wrapped lines center under each
 *     other, matching the already-centered logo/copyright above and below
 *     it in the same column layout;
 *   - min-[360px]:flex-nowrap / min-[360px]:justify-start /
 *     min-[360px]:gap-6 revert all three of the above back to the exact
 *     original single-line row starting at 360px, the width already
 *     confirmed to render this row with no page-level overflow.
 *
 * All three link targets/order (/privacy, /terms, /contact), their exact
 * translation keys, hover-color classes, and everything else on these
 * pages (headers, page content, the logo link, the copyright line) are
 * completely untouched — only the one link-row wrapper's className
 * changed.
 *
 * Re-verified visually after the fix, both in isolation and on the real
 * live app: at 320px the three links wrap cleanly onto two centered lines
 * with zero page-level horizontal overflow and all three links reachable/
 * visible; at 360/390px and 1024px desktop the row renders the exact
 * original single-line, left-aligned layout unchanged.
 *
 * No React rendering harness exists for PublicFooter.tsx in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the pattern used throughout this codebase's other page-level
 * mobile-responsive regression tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/publicFooterLinkRowMobileOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/layout/PublicFooter.tsx'),
  'utf8',
)

describe('no page-level overflow at 320px: the link row can wrap', () => {
  it('the link row wrapper gains flex-wrap and a mobile-safe gap, with the original row restored at min-[360px]:', () => {
    expect(SRC).toMatch(
      /className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 min-\[360px\]:flex-nowrap min-\[360px\]:justify-start min-\[360px\]:gap-6 text-sm text-\[#64748B\]"/,
    )
    // the old always-on, non-wrapping row is gone
    expect(SRC).not.toMatch(/className="flex items-center gap-6 text-sm text-\[#64748B\]"/)
  })
})

describe('all three links remain present/visible and reachable', () => {
  it('all three <Link> elements are still rendered inside the (now-wrappable) row', () => {
    const rowMatch = SRC.match(
      /<div className="flex flex-wrap[^"]*text-sm text-\[#64748B\]">([\s\S]*?)<\/div>/,
    )
    expect(rowMatch).not.toBeNull()
    const row = rowMatch![1]
    expect(row).toMatch(/<Link to="\/privacy"/)
    expect(row).toMatch(/<Link to="\/terms"/)
    expect(row).toMatch(/<Link to="\/contact"/)
  })
})

describe('360px/390px and desktop remain unchanged where they already fit', () => {
  it('min-[360px]: reverts flex-wrap, justify-center, and the gap split back to the exact original single-line row', () => {
    expect(SRC).toMatch(/min-\[360px\]:flex-nowrap/)
    expect(SRC).toMatch(/min-\[360px\]:justify-start/)
    expect(SRC).toMatch(/min-\[360px\]:gap-6/)
  })

  it('the outer footer layout (logo / links / copyright row, column-to-row switch) is unchanged', () => {
    expect(SRC).toMatch(/className="border-t border-\[#EBEBEB\] bg-\[#F4F3EF\]"/)
    expect(SRC).toMatch(/className="max-w-6xl mx-auto px-4 sm:px-6 py-10"/)
    expect(SRC).toMatch(
      /className="flex flex-col md:flex-row items-center justify-between gap-6"/,
    )
  })
})

describe('Privacy/Terms/Contact routes and link labels/hover styles remain intact', () => {
  it('link targets, order, and translation keys are unchanged', () => {
    expect(SRC).toMatch(
      /<Link to="\/privacy" className="hover:text-\[#1A1F36\] transition-colors">\{t\('footer\.privacy', lang\)\}<\/Link>/,
    )
    expect(SRC).toMatch(
      /<Link to="\/terms"\s+className="hover:text-\[#1A1F36\] transition-colors">\{t\('footer\.terms',\s+lang\)\}<\/Link>/,
    )
    expect(SRC).toMatch(
      /<Link to="\/contact" className="hover:text-\[#1A1F36\] transition-colors">\{t\('footer\.contact', lang\)\}<\/Link>/,
    )
  })

  it('the logo link and copyright line are unchanged', () => {
    expect(SRC).toMatch(
      /<Link to="\/" className="inline-flex items-center hover:opacity-80 transition-opacity">/,
    )
    expect(SRC).toMatch(
      /<p className="text-xs text-\[#94A3B8\]">© \{new Date\(\)\.getFullYear\(\)\} Kivora\. \{t\('footer\.copyright', lang\)\}<\/p>/,
    )
  })
})
