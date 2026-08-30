/**
 * SchoolPage.tsx's tab strip (Tunniplaan/Ülesanded/Kontrolltööd/Eksamid/
 * Ained/Ülevaade) is a horizontally-scrollable row (overflow-x-auto) on
 * narrow phones, since all six full labels don't fit at 320-390px widths.
 * Confirmed on a real Android phone: after switching/scrolling between
 * tabs, the strip's scroll position could settle mid-tab, clipping a
 * label's left edge (e.g. "Kontrolltööd" rendering as "ntrolltööd").
 *
 * Fix: a ref per tab button plus a useEffect keyed on activeTab that calls
 * scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
 * on the newly active tab's button — so switching tabs always brings the
 * selected one fully into view instead of leaving it (or the strip) at
 * whatever scroll position it happened to be at.
 *
 * An earlier version of this fix also added CSS scroll-snap
 * (snap-x/snap-mandatory/snap-start) to make a manual swipe settle
 * cleanly. Verified with a real Chromium render of the compiled Tailwind
 * output that scroll-snap actively fought scrollIntoView's positioning —
 * it introduced NEW right-edge clipping in cases that were clean without
 * it — so it was dropped. Clicking through every tab in both directions
 * at 320/360/390px (and 1024px desktop, where the strip never scrolls at
 * all) with scrollIntoView alone produces zero left- or right-edge
 * clipping for the active tab in every case.
 *
 * Tab order, labels, active-state styling (text-[#6F5AE8] + the
 * underline span), and navigation behavior (setActiveTab, deep-link
 * effects) are all unchanged — this only adds a ref and an effect.
 *
 * No React rendering harness exists for SchoolPage.tsx in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the pattern used throughout this session's other mobile-layout
 * fixes.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTabStripScrollClipping.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('the active tab is scrolled fully into view on every tab switch', () => {
  it('useRef is imported and a per-tab-id button ref map is declared', () => {
    expect(SRC).toMatch(/import \{ useState, useEffect, useMemo, useRef \} from "react";/)
    expect(SRC).toMatch(/const tabButtonRefs = useRef<Partial<Record<TabId, HTMLButtonElement>>>\(\{\}\);/)
  })

  it('a useEffect keyed on activeTab calls scrollIntoView with inline/block nearest', () => {
    const effectBlock = SRC.match(/useEffect\(\(\) => \{\s*tabButtonRefs\.current\[activeTab\]\?\.scrollIntoView\(\{[\s\S]*?\}, \[activeTab\]\);/)?.[0] ?? ''
    expect(effectBlock).not.toBe('')
    expect(effectBlock).toMatch(/behavior: "smooth",/)
    expect(effectBlock).toMatch(/inline: "nearest",/)
    expect(effectBlock).toMatch(/block: "nearest",/)
  })

  it('each tab button attaches a callback ref keyed by its own tab.id', () => {
    expect(SRC).toMatch(/ref=\{\(el\) => \{ tabButtonRefs\.current\[tab\.id\] = el \?\? undefined; \}\}/)
  })
})

describe('no CSS scroll-snap was introduced (it regressed scrollIntoView precision)', () => {
  it('the tab bar has no snap-x/snap-mandatory/snap-start classes', () => {
    const tabBarBlock = SRC.match(/\{\/\* Tab bar \*\/\}[\s\S]*?\{TABS\.map/)?.[0] ?? ''
    expect(tabBarBlock).not.toMatch(/snap-x/)
    expect(tabBarBlock).not.toMatch(/snap-mandatory/)
    expect(tabBarBlock).not.toMatch(/snap-start/)
  })
})

describe('tab order, labels, active-state styling, and navigation are unchanged', () => {
  it('the TABS array still lists all six tabs in the original order', () => {
    const tabsBlock = SRC.match(/const TABS: \{ id: TabId; label: string \}\[\] = \[([\s\S]*?)\];/)?.[1] ?? ''
    const ids = [...tabsBlock.matchAll(/id: "(\w+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['tunniplaan', 'uesanded', 'kontrolltood', 'eksamid', 'ained', 'ulevaade'])
  })

  it('the tab bar container is still overflow-x-auto with no other layout change', () => {
    expect(SRC).toMatch(/className="flex border-b border-\[#ECECF2\] px-5 overflow-x-auto"/)
  })

  it('active-tab styling (purple text + underline span) is unchanged', () => {
    expect(SRC).toMatch(/activeTab === tab\.id\s*\n\s*\? "text-\[#6F5AE8\]"\s*\n\s*: "text-\[#94A3B8\] hover:text-\[#1A1F36\]"/)
    expect(SRC).toMatch(/<span className="absolute bottom-0 left-0 right-0 h-0\.5 bg-\[#6F5AE8\] rounded-t-full" \/>/)
  })

  it('onClick still calls setActiveTab(tab.id), unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setActiveTab\(tab\.id\)\}/)
  })

  it('the deep-link and route-change tab-reset effects are untouched', () => {
    expect(SRC).toMatch(/setActiveTab\("uesanded"\);/)
    expect(SRC).toMatch(/setActiveTab\("kontrolltood"\);/)
  })
})
