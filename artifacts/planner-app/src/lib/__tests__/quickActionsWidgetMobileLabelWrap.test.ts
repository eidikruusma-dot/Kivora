/**
 * QuickActionsWidget.tsx (Minu päev / Dashboard "Kiired tegevused" card)
 * forced every action label into single-line ellipsis truncation
 * (`truncate` on the label span) inside a fixed-height button (`h-[52px]`),
 * unconditionally at every viewport width. Confirmed on a real Android
 * phone, and reproduced with a real Chromium render of the compiled
 * Tailwind output at 320/360/390px: labels like "Uus ülesanne"/"New task"
 * and "Uus sündmus"/"New event" rendered as "Uus ..."/"Uus s..." etc. —
 * unreadable, even though there was ample vertical space for a second
 * line (the Dashboard's mobile layout gives this card the full row width,
 * grid-cols-1, well before the desktop/tablet lg:/sm: breakpoints).
 *
 * Fix: mobile-only override, reverted at sm: and up —
 *   - the label span drops `truncate` and gains `leading-snug`, restoring
 *     `sm:truncate` so desktop/tablet single-line ellipsis behavior (the
 *     card is narrower and denser there, never actually overflowing with
 *     the current labels — sm:truncate is a no-op today, exactly as
 *     before this fix) is completely unchanged;
 *   - each button drops the fixed `h-[52px]` for `min-h-[52px]` (so a
 *     single-line label still renders at exactly the original 52px) plus
 *     `py-2` or breathing room when a label wraps to two lines, restoring
 *     `sm:h-[52px] sm:py-0` (the exact original fixed height) at sm: and
 *     up.
 *
 * Nothing else changed: action order, labelKeys, routes (`to`), the
 * onClick handlers (navigate/openModal), icon components/colors, the
 * outer grid-cols-2 layout, and the Focus-timer button's separate JSX are
 * all untouched.
 *
 * Re-verified visually after the fix: at 320/360/390px every label now
 * wraps to (at most) two lines with no ellipsis truncation, icons stay
 * vertically centered via the same `items-center` flex row (now simply
 * taller for two-line buttons), and both columns/rows stay evenly
 * aligned; at 1024px desktop, `sm:truncate`/`sm:h-[52px]` restore the
 * exact original fixed-height single-line row.
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

describe('mobile labels are no longer forced into ellipsis truncation', () => {
  it('no label span carries an unconditional `truncate` class', () => {
    const labelSpans = SRC.match(/<span className="text-sm font-medium text-\[#1A1F36\][^"]*">/g) ?? []
    expect(labelSpans.length).toBeGreaterThan(0)
    for (const span of labelSpans) {
      expect(span).not.toMatch(/(?<!sm:)\btruncate\b/) // bare "truncate", not "sm:truncate"
    }
  })

  it('no action button carries an unconditional fixed `h-[52px]` (only the sm:-scoped one)', () => {
    const buttonClassNames = [...SRC.matchAll(/className="(flex items-center gap-2\.5[^"]*)"/g)].map((m) => m[1])
    expect(buttonClassNames.length).toBe(2) // one JSX button in the actions.map(), one for the Focus-timer
    for (const className of buttonClassNames) {
      expect(className).not.toMatch(/(?<!sm:)\bh-\[52px\]\b/) // never a bare, unconditional h-[52px]
    }
  })
})

describe('longer labels can wrap safely', () => {
  it('each label span has leading-snug and can wrap by default (no nowrap-forcing truncate on mobile)', () => {
    const labelSpans = SRC.match(/<span className="text-sm font-medium text-\[#1A1F36\][^"]*">/g) ?? []
    for (const span of labelSpans) {
      expect(span).toMatch(/leading-snug/)
    }
  })

  it('each action button uses min-h-[52px] so it can grow taller for a wrapped two-line label', () => {
    const buttonClassNames = [...SRC.matchAll(/className="(flex items-center gap-2\.5[^"]*)"/g)].map((m) => m[1])
    for (const className of buttonClassNames) {
      expect(className).toMatch(/min-h-\[52px\]/)
    }
  })

  it('icons stay vertically centered via the unchanged items-center flex row', () => {
    const buttonClassNames = [...SRC.matchAll(/className="(flex items-center gap-2\.5[^"]*)"/g)].map((m) => m[1])
    for (const className of buttonClassNames) {
      expect(className).toMatch(/^flex items-center gap-2\.5/)
    }
  })
})

describe('desktop styling and all existing Quick Action handlers/actions remain unchanged', () => {
  it('sm:truncate and sm:h-[52px] sm:py-0 restore the original single-line fixed-height row at sm: and up', () => {
    const buttonClassNames = [...SRC.matchAll(/className="(flex items-center gap-2\.5[^"]*)"/g)].map((m) => m[1])
    for (const className of buttonClassNames) {
      expect(className).toMatch(/sm:h-\[52px\]/)
      expect(className).toMatch(/sm:py-0/)
    }
    const labelSpans = SRC.match(/<span className="text-sm font-medium text-\[#1A1F36\][^"]*">/g) ?? []
    for (const span of labelSpans) {
      expect(span).toMatch(/sm:truncate/)
    }
  })

  it('the three mapped actions keep their exact labelKey/route/icon/color pairing', () => {
    expect(SRC).toMatch(/icon: CheckSquare, labelKey: 'dash\.action\.newTask'\s*as const, to: '\/app\/tasks',\s*iconBg: 'bg-\[#EDE9FB\]', iconColor: 'text-\[#6F5AE8\]'/)
    expect(SRC).toMatch(/icon: Calendar,\s*labelKey: 'dash\.action\.newEvent'\s*as const, to: '\/app\/calendar', iconBg: 'bg-\[#EFF6FF\]', iconColor: 'text-\[#3B82F6\]'/)
    expect(SRC).toMatch(/icon: StickyNote,\s*labelKey: 'dash\.action\.quickNote' as const, to: '\/app\/notes',\s*iconBg: 'bg-\[#FFEDD5\]', iconColor: 'text-\[#F97316\]'/)
  })

  it('onClick handlers (navigate for mapped actions, openModal for the timer) are unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => navigate\(to\)\}/)
    expect(SRC).toMatch(/onClick=\{openModal\}/)
  })

  it('the Focus-timer button keeps its own icon/color and label key, unchanged', () => {
    expect(SRC).toMatch(/<Timer size=\{16\} className="text-\[#16A34A\]" \/>/)
    expect(SRC).toMatch(/bg-\[#DCFCE7\]/)
    expect(SRC).toMatch(/t\('dash\.action\.timer', lang\)/)
  })

  it('the outer grid-cols-2 layout and card title are unchanged', () => {
    expect(SRC).toMatch(/className="flex-1 px-4 pb-4 grid grid-cols-2 gap-2\.5 content-center"/)
    expect(SRC).toMatch(/t\('dash\.actions\.title', lang\)/)
  })
})
