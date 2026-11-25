/**
 * QuickActionsWidget.tsx (Minu päev / Dashboard "Kiired tegevused" card)
 * has gone through two redesign passes:
 *   1. The original 2x2 grid-cols-2, icon+label-in-a-row layout (what this
 *      file originally covered) was replaced by a single horizontal row
 *      of 4 icon-over-label tiles with small tinted icon chips.
 *   2. To match the confirmed design reference far more closely, each
 *      tile became its own fully solid-colored gradient button card
 *      (purple / blue / peach / green fill the whole button, not just a
 *      small icon chip), still a single horizontal row of 4.
 *
 * This file now guards the structural invariant the original mobile-
 * label-wrap fix protected: no action label is ever forced into
 * single-line ellipsis truncation on narrow phones. That still holds by
 * construction in the current layout — the label is a short, centered
 * span with no `truncate` class and no fixed-height container — so this
 * file asserts that invariant against the current markup, plus the
 * unchanged action semantics (labelKeys, routes, handlers, dark-mode
 * gradients, and the "Kiired tegevused" title).
 *
 * No React rendering harness exists for QuickActionsWidget.tsx in this
 * repo (see dashboardEmptyStateRedesign.test.ts, which reads this same
 * file as raw source) — verified via structural regex assertions,
 * matching that established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/quickActionsWidgetMobileLabelWrap.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/QuickActionsWidget.tsx'),
  'utf8',
)

describe('mobile labels are never forced into ellipsis truncation', () => {
  it('no label span carries a `truncate` or `line-clamp` class', () => {
    expect(SRC).not.toMatch(/\btruncate\b/)
    expect(SRC).not.toMatch(/line-clamp/)
  })

  it('the label span uses leading-tight so it can wrap instead of being clipped', () => {
    expect(SRC).toMatch(/<span className=\{`text-\[10\.5px\] sm:text-xs font-semibold leading-tight \$\{color\}`\}>/)
  })

  it('each button has no fixed height (natural height, free to grow for a wrapped label)', () => {
    expect(SRC).not.toMatch(/\bh-\[\d+px\]/)
    expect(SRC).not.toMatch(/\bmin-h-\[\d+px\]/)
  })
})

describe('all four Quick Action tiles keep their exact labelKey/route/handler pairing', () => {
  it('New task → /app/tasks', () => {
    expect(SRC).toMatch(/icon: CheckSquare, labelKey: 'dash\.action\.newTask' as const, onClick: \(\) => navigate\('\/app\/tasks'\)/)
  })

  it('New event → /app/calendar', () => {
    expect(SRC).toMatch(/icon: Calendar, labelKey: 'dash\.action\.newEvent' as const, onClick: \(\) => navigate\('\/app\/calendar'\)/)
  })

  it('Quick note → /app/notes', () => {
    expect(SRC).toMatch(/icon: StickyNote, labelKey: 'dash\.action\.quickNote' as const, onClick: \(\) => navigate\('\/app\/notes'\)/)
  })

  it('Focus timer opens the real FocusTimer modal via useFocusTimer(), not a new/duplicate modal', () => {
    expect(SRC).toMatch(/const \{ openModal \} = useFocusTimer\(\)/)
    expect(SRC).toMatch(/icon: Timer, labelKey: 'dash\.action\.timer' as const, onClick: openModal/)
  })

  it('every tile renders through the single shared button template (no per-action JSX duplication)', () => {
    const buttonCount = (SRC.match(/<button\b/g) ?? []).length
    expect(buttonCount).toBe(1) // one <button> inside actions.map()
  })
})

describe('icon/button colors are distinct per-action and dark-mode aware', () => {
  it('each action defines both a light and dark gradient background, and a matching dark-mode-aware icon/text color', () => {
    const bgStyles = [...SRC.matchAll(/bg: '([^']+)',/g)].map((m) => m[1])
    const colorStyles = [...SRC.matchAll(/color: '([^']+)',/g)].map((m) => m[1])
    expect(bgStyles.length).toBe(4)
    expect(colorStyles.length).toBe(4)
    for (const bg of bgStyles) expect(bg).toMatch(/\bdark:/)
    for (const color of colorStyles) expect(color).toMatch(/\bdark:/)
  })

  it('the icon reuses the same per-action color as its label (one consistent accent per tile)', () => {
    expect(SRC).toMatch(/<Icon size=\{20\} className=\{color\} strokeWidth=\{2\.2\} \/>/)
  })
})

describe('card chrome: title and glass styling', () => {
  it('renders the "Kiired tegevused" / "Quick actions" title via the existing dash.actions.title key', () => {
    expect(SRC).toMatch(/t\('dash\.actions\.title', lang\)/)
  })

  it('uses a near-opaque white/glass card background (dark-mode aware), distinct from the fully-colored action buttons inside it', () => {
    expect(SRC).toMatch(/bg-white\/85 dark:bg-\[#1E1B33\]\/80 backdrop-blur-xl/)
  })
})
