/**
 * Regression tests for SuggestedLinksPanel.tsx's two approved UX fixes
 * (Kivora automatic-linking redesign, round 2):
 *
 *   1. The panel starts COLLAPSED into one compact summary row — it never
 *      auto-expands and shows full suggestion cards the instant a form
 *      opens. Nothing is ever hidden permanently; one click expands it.
 *   2. computeSuggestions() only re-runs when the links RELEVANT to this
 *      entity actually change (a content-based signature), not on every
 *      unrelated mutation anywhere in the app's shared link store — the
 *      previous `useMemo` dependency was the raw array reference from
 *      useLinksForEntity(), which useEntityLinks() replaces with a new
 *      array on every single global link-store change.
 *
 * No React rendering harness exists for this component in this repo
 * (same precedent as every other structural links/test file) — verified
 * against the component source, matching the established pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/suggestedLinksPanelCollapsedByDefault.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/links/SuggestedLinksPanel.tsx'),
  'utf8',
)

describe('SuggestedLinksPanel starts collapsed and never auto-expands', () => {
  it('sectionOpen defaults to false', () => {
    expect(SRC).toMatch(/const \[sectionOpen, setSectionOpen\] = useState\(false\)/)
  })

  it('renders a single compact summary row (with a chevron to expand) when collapsed, before any suggestion card markup', () => {
    const collapsedBranch = SRC.match(/if \(!sectionOpen\) \{[\s\S]*?\n {2}\}/)?.[0] ?? ''
    expect(collapsedBranch).toMatch(/onClick=\{\(\) => setSectionOpen\(true\)\}/)
    expect(collapsedBranch).toMatch(/<ChevronDown/)
    // The collapsed branch must not render the "Seo"/"Seo kõik" action buttons.
    expect(collapsedBranch).not.toMatch(/linkAll|onClick=\{\(\) => link\(s\)\}/)
  })

  it('the expanded view can collapse back via the header, and still has the "Link all confident" + per-row actions', () => {
    const expandedSrc = SRC.slice(SRC.indexOf('return (\n    <div className={className}>\n      {/* Header'))
    expect(expandedSrc).toMatch(/onClick=\{\(\) => setSectionOpen\(false\)\}/)
    expect(expandedSrc).toMatch(/onClick=\{linkAll\}/)
    expect(expandedSrc).toMatch(/onClick=\{\(\) => link\(s\)\}/)
    expect(expandedSrc).toMatch(/onClick=\{\(\) => dismiss\(s\)\}/)
  })
})

describe('SuggestedLinksPanel recomputes suggestions only when this entity\'s own links change', () => {
  it('derives a content-based signature from existingLinks instead of using the raw array as the useMemo dependency', () => {
    expect(SRC).toMatch(/const linksSignature = existingLinks\.map\(\(l\) => l\.id\)\.sort\(\)\.join\(','\)/)
    expect(SRC).toMatch(/\[type, entityId, lang, dismissed, linksSignature\]/)
    // The old, reference-identity-sensitive dependency is gone.
    expect(SRC).not.toMatch(/\[type, entityId, lang, dismissed, existingLinks\]/)
  })
})

describe('regression: link removal stays exclusively in LinkedItemsPanel, untouched by this change', () => {
  it('LinkedItemsPanel.tsx\'s remove (X) button and removeLink call are unchanged', () => {
    const panelSrc = readFileSync(
      resolve(process.cwd(), 'src/components/links/LinkedItemsPanel.tsx'),
      'utf8',
    )
    expect(panelSrc).toMatch(/onClick=\{\(\) => handleRemove\(link\.id\)\}/)
    expect(panelSrc).toMatch(/function handleRemove\(id: string\) \{/)
    expect(panelSrc).toMatch(/removeLink\(id\)/)
    // Every link row — regardless of how it was created — keeps its remove button.
    expect(panelSrc).toMatch(/\{\/\* Remove × — always visible \*\/\}/)
  })
})
