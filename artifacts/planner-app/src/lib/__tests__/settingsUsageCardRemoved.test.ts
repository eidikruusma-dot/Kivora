/**
 * Settings sidebar Usage/Statistics card removal.
 *
 * getUsageStats() returned three permanently hardcoded placeholder rows
 * (Storage/AI usage/Projects, each with used/total: '—' and pct: 0) with
 * no real data source anywhere in the codebase — verified during
 * inspection. Removed:
 *   - interface UsageStat, getUsageStats(), UsageCard, and the single
 *     <UsageCard ... /> render call in SettingsPage.tsx
 *   - the now-unused HardDrive/Cloud icon imports (Sparkles is used
 *     elsewhere in the file — the "Mis on uut?" card — and stays)
 *   - the four settings.usage.* translation keys (type union + ET/EN
 *     map values)
 *
 * Left untouched: the <aside> wrapper, QuickActionsCard and all four of
 * its existing Quick Actions, and every other Settings card/route.
 *
 * No React rendering harness exists for SettingsPage.tsx in this repo —
 * verified via structural regex assertions against the raw source and
 * direct translation-key assertions, matching the pattern used
 * throughout this session's other Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/settingsUsageCardRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SETTINGS_PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/SettingsPage.tsx'),
  'utf8',
)
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

describe('UsageStat / getUsageStats / UsageCard / settings.usage. are gone from SettingsPage.tsx', () => {
  it('none of the identifiers remain', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/UsageStat/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/getUsageStats/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/UsageCard/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/settings\.usage\./)
  })
})

describe('HardDrive and Cloud are no longer imported', () => {
  it('the lucide-react import block does not list HardDrive or Cloud', () => {
    const importBlock = SETTINGS_PAGE_SRC.match(/import\s*\{[\s\S]*?\}\s*from 'lucide-react'/)?.[0] ?? ''
    expect(importBlock.length).toBeGreaterThan(0)
    expect(importBlock).not.toMatch(/\bHardDrive\b/)
    expect(importBlock).not.toMatch(/\bCloud\b/)
  })

  it('no <HardDrive or <Cloud JSX usage remains anywhere in the file', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/<HardDrive/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/<Cloud\b/)
  })
})

describe('Sparkles remains imported and the "Mis on uut?" card is untouched', () => {
  it('Sparkles is still in the lucide-react import block', () => {
    const importBlock = SETTINGS_PAGE_SRC.match(/import\s*\{[\s\S]*?\}\s*from 'lucide-react'/)?.[0] ?? ''
    expect(importBlock).toMatch(/\bSparkles\b/)
  })

  it('the whatsNew card still uses Sparkles as its icon', () => {
    const cardMatch = SETTINGS_PAGE_SRC.match(
      /icon: <Sparkles size=\{22\}[^/]*\/>[\s\S]*?routeKey: 'Mis on uut\?'/,
    )
    expect(cardMatch).not.toBeNull()
  })
})

describe('the <aside> still contains QuickActionsCard', () => {
  it('aside renders QuickActionsCard as its content', () => {
    const asideMatch = SETTINGS_PAGE_SRC.match(
      /<aside className="w-full md:w-72 flex-shrink-0 flex flex-col gap-4">([\s\S]*?)<\/aside>/,
    )
    expect(asideMatch).not.toBeNull()
    expect(asideMatch![1]).toMatch(/<QuickActionsCard/)
  })

  it('the aside wrapper classes are unchanged (no resize/redesign)', () => {
    expect(SETTINGS_PAGE_SRC).toMatch(
      /<aside className="w-full md:w-72 flex-shrink-0 flex flex-col gap-4">/,
    )
  })
})

describe('all four existing Quick Actions remain unchanged', () => {
  it('changePassword, downloadData, and contactSupport quick actions are all still present with their routeKeys', () => {
    const quickActionsBlock = SETTINGS_PAGE_SRC.slice(
      SETTINGS_PAGE_SRC.indexOf('function getQuickActions'),
      SETTINGS_PAGE_SRC.indexOf('function getQuickActions') + 1000,
    )
    const routeKeys = [...quickActionsBlock.matchAll(/routeKey: '([^']+)'/g)].map((m) => m[1])
    expect(routeKeys).toEqual(['Turvalisus', 'Andmete eksport', 'Abi ja tugi'])
  })

  it('exactly three Quick Action labels are wired to their translation keys', () => {
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.changePassword', lang\)/)
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.downloadData', lang\)/)
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.contactSupport', lang\)/)
  })
})

describe('the four removed translation keys no longer exist', () => {
  const REMOVED_KEYS = [
    'settings.usage.title',
    'settings.usage.storage',
    'settings.usage.ai',
    'settings.usage.projects',
  ]

  it('none of the keys appear anywhere in translations.ts', () => {
    for (const key of REMOVED_KEYS) {
      expect(TRANSLATIONS_SRC).not.toContain(`"${key}"`)
    }
  })
})

describe('scope: other Settings sections are untouched', () => {
  it('all four Settings sections (account, app, data, support) still exist with their headings', () => {
    expect(t('settings.section.account', 'et')).not.toBe('')
    expect(t('settings.section.app', 'et')).not.toBe('')
    expect(t('settings.section.data', 'et')).not.toBe('')
    expect(t('settings.section.support', 'et')).not.toBe('')
  })

  it('settings.quick.title (the QuickActionsCard heading) is unchanged', () => {
    expect(t('settings.quick.title', 'et')).toBe('Kiirtoimingud')
    expect(t('settings.quick.title', 'en')).toBe('Quick Actions')
  })
})
