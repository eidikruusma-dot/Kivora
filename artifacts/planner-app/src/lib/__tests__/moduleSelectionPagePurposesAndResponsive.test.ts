/**
 * ModuleSelectionPage.tsx:
 *   1. Mobile-responsive module grid (one card per row on phones, two side
 *      by side on larger screens) with no hard truncation on module names
 *      or descriptions, and the selection checkmark no longer overlapping
 *      wrapped text.
 *   2. Usage-purpose chips pre-selected from the AI conversation's own
 *      judgment (recommendedPurposes), not derived from which modules
 *      happen to be recommended.
 *
 * No React rendering harness exists for this page in this repo (useAuth/
 * useLocation/useNavigate all need real app context) — verified via
 * structural source assertions, the same pattern used for
 * settingsUsageCardRemoved.test.ts and modulesPageRestartOnboarding.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/moduleSelectionPagePurposesAndResponsive.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/onboarding/ModuleSelectionPage.tsx'),
  'utf8',
)

describe('ModuleSelectionPage: mobile-responsive module grid, full text', () => {
  it('the module grid is one column on mobile and two columns from the sm breakpoint up', () => {
    expect(PAGE_SRC).toMatch(/grid-cols-1\s+sm:grid-cols-2/)
    // The old unconditional two-column class must be gone, not just
    // superseded — a leftover `grid-cols-2` with no `grid-cols-1` before
    // it would still force two columns on mobile.
    expect(PAGE_SRC).not.toMatch(/className="grid grid-cols-2 gap-2"/)
  })

  it('the module description is never hard-truncated to one line', () => {
    // The old `line-clamp-1` on the description <p> must be gone —
    // matched narrowly (immediately followed by the description's own
    // translation call) so this doesn't accidentally pass by matching an
    // unrelated element elsewhere in the file.
    expect(PAGE_SRC).not.toMatch(/line-clamp-1[^>]*>\s*\{t\(\('modules\.desc\./)
  })

  it('module name and description sit in a flexible (flex-1) column, not a fixed-width one that could force wrapping into the checkmark', () => {
    expect(PAGE_SRC).toMatch(/className="min-w-0 flex-1">/)
  })
})

describe('ModuleSelectionPage: purposes pre-selected from the AI conversation, not from module overlap', () => {
  it('selectedPurposes initializes from recommendedPurposes (the AI summary field), not from an empty set unconditionally', () => {
    expect(PAGE_SRC).toMatch(
      /useState<Set<OnboardingPurposeId>>\(\(\) =>\s*\n?\s*recommendedPurposes && recommendedPurposes\.length > 0 \? new Set\(recommendedPurposes\) : new Set\(\),?\s*\n?\s*\)/,
    )
  })

  it('recommendedPurposes is read from the router handoff state, clamped to the selectable purpose ids', () => {
    expect(PAGE_SRC).toMatch(/handoff\?\.recommendedPurposes\?\.filter\(/)
    expect(PAGE_SRC).toMatch(/SELECTABLE_PURPOSE_IDS\.includes\(id\)/)
  })

  it('the purpose pre-selection is never derived from enabledModules/recommendedModules — no module-overlap guessing', () => {
    // The initializer for selectedPurposes must not reference module ids
    // or PURPOSE_MODULES at all; only recommendedPurposes.
    const initMatch = PAGE_SRC.match(/const \[selectedPurposes, setSelectedPurposes\] = useState<Set<OnboardingPurposeId>>\(([\s\S]*?)\)\n/)
    expect(initMatch).not.toBeNull()
    const initializer = initMatch?.[1] ?? ''
    expect(initializer).not.toMatch(/PURPOSE_MODULES/)
    expect(initializer).not.toMatch(/enabledModules/)
    expect(initializer).not.toMatch(/recommendedModules/)
  })

  it('purposes stay user-editable afterwards via togglePurpose, typed to the real purpose id union', () => {
    expect(PAGE_SRC).toMatch(/function togglePurpose\(purposeKey: OnboardingPurposeId\)/)
  })
})
