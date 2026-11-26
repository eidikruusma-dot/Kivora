/**
 * Kivora AI card placement + module-gating (Kivora 2.0 round). No React
 * rendering harness exists in this repo (same precedent as
 * dashboardEmptyStateRedesign.test.ts), so this is verified structurally
 * against the component and Dashboard.tsx source.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const DASHBOARD_SRC = readSrc('src/views/Dashboard.tsx')
const CARD_SRC = readSrc('src/components/dashboard/KivoraAICard.tsx')

describe('KivoraAICard is placed directly below HeroCard, above the stat cards', () => {
  it('Dashboard.tsx renders <HeroCard /> immediately followed by the gated KivoraAICard, then DashboardStatCards', () => {
    expect(DASHBOARD_SRC).toMatch(
      /<HeroCard \/>\s*\n\s*\{modules\.assistant && <KivoraAICard \/>\}\s*\n\s*<DashboardStatCards \/>/,
    )
  })

  it('imports KivoraAICard from its own dashboard component file', () => {
    expect(DASHBOARD_SRC).toMatch(/import KivoraAICard from '@\/components\/dashboard\/KivoraAICard'/)
  })
})

describe('KivoraAICard is gated purely by the modules.assistant flag (same pattern as other module-gated widgets)', () => {
  it('is NOT rendered unconditionally (unlike QuickActionsWidget/DashboardStatCards, which always render)', () => {
    expect(DASHBOARD_SRC).not.toMatch(/\n\s*<KivoraAICard \/>\s*\n/)
  })
})

describe('KivoraAICard round 2: mascot at least 2x the original size, always row layout (never stacked, even at 320px)', () => {
  it('mascot is at least double the original 64px/80px size at every breakpoint', () => {
    expect(CARD_SRC).toMatch(/w-32 h-32 sm:w-40 sm:h-40 object-contain/)
  })

  it('the header row (mascot + title/subtitle/summary) is always a row — no flex-col/sm:flex-row stacking split', () => {
    expect(CARD_SRC).toMatch(/<div className=\{`flex gap-3 sm:gap-4 \$\{isLongText \? 'items-center' : 'items-start'\}`\}>/)
    expect(CARD_SRC).not.toMatch(/flex-col sm:flex-row/)
    expect(CARD_SRC).not.toMatch(/mx-auto sm:mx-0/)
    expect(CARD_SRC).not.toMatch(/text-center sm:text-left/)
  })

  it('round 4: the title/subtitle column is vertically centered against the mascot only when the suggestion is long (short case keeps its original top alignment)', () => {
    expect(CARD_SRC).toMatch(/isLongText \? 'items-center' : 'items-start'/)
    expect(CARD_SRC).toMatch(/\$\{isLongText \? '' : 'pt-1'\}/)
  })

  it('the three action buttons sit in their own full-width row below the mascot+text header, not nested inside the text column', () => {
    const headerRowEnd = CARD_SRC.indexOf('{/* Actions')
    const mascotIdx = CARD_SRC.indexOf('src={kivoraMascot}')
    expect(headerRowEnd).toBeGreaterThan(mascotIdx)
    expect(CARD_SRC).toMatch(/flex flex-wrap gap-2 justify-start mt-3/)
  })
})

describe('KivoraAICard round 3: summary/suggestion placement scales with text length AND viewport width, never truncating', () => {
  it('tracks viewport width via a resize-aware hook (not a fixed breakpoint check)', () => {
    expect(CARD_SRC).toMatch(/function useViewportWidth\(\): number/)
    expect(CARD_SRC).toMatch(/window\.addEventListener\('resize', onResize\)/)
    expect(CARD_SRC).toMatch(/const viewportWidth = useViewportWidth\(\)/)
  })

  it('the "switch to full width" length threshold scales across at least 3 viewport tiers (narrow phone / tablet / desktop)', () => {
    expect(CARD_SRC).toMatch(
      /const longTextThreshold = viewportWidth < 400 \? 70 : viewportWidth < 1024 \? 110 : 170/,
    )
  })

  it('isLongText is derived from the actual displayed text length, and never true while loading or erroring', () => {
    expect(CARD_SRC).toMatch(
      /const isLongText = !aiLoading && !aiError && bodyText\.length > longTextThreshold/,
    )
  })

  it('the same summaryBubble element is reused in both placements — never a second, divergent copy of the text', () => {
    const summaryBubbleCount = (CARD_SRC.match(/const summaryBubble = \(/g) ?? []).length
    expect(summaryBubbleCount).toBe(1)
    expect(CARD_SRC).toMatch(/\{!isLongText && summaryBubble\}/)
    expect(CARD_SRC).toMatch(/\{isLongText && <div className="mt-3">\{summaryBubble\}<\/div>\}/)
  })

  it('never truncates or clamps the body text (no line-clamp/truncate/substring/slice on bodyText)', () => {
    expect(CARD_SRC).not.toMatch(/line-clamp/)
    expect(CARD_SRC).not.toMatch(/\btruncate\b/)
    expect(CARD_SRC).not.toMatch(/bodyText\.(slice|substring|substr)\(/)
  })
})

describe('KivoraAICard uses the real, user-supplied mascot image asset (not a redrawn/replacement SVG icon)', () => {
  it('imports the optimized WebP mascot asset and renders it as an <img>, never an inline <svg>', () => {
    expect(CARD_SRC).toMatch(/import kivoraMascot from '@\/assets\/dashboard\/kivora-ai-mascot\.webp'/)
    expect(CARD_SRC).toMatch(/<img\s*\n\s*src=\{kivoraMascot\}/)
    expect(CARD_SRC).not.toMatch(/<svg/)
  })

  it('gives the mascot image a translated alt text (accessibility), not empty/decorative', () => {
    expect(CARD_SRC).toMatch(/alt=\{t\('dash\.ai\.mascotAlt', lang\)\}/)
  })
})
