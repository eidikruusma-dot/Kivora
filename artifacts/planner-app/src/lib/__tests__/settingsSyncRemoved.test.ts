/**
 * Settings → Synchronization removal.
 *
 * The Synchronization settings page (SünkroonimisePage.tsx) was a fully
 * simulated feature — "Sync now" only wrote a fresh lastSyncedAt timestamp
 * to users/{uid}/settings/sync via the generic settingsStore helpers, and
 * autoSync/mobileData were stored but read by nothing. No real Firestore-
 * backed module store, and no other production file, depended on any of
 * it (verified during inspection). Removed:
 *   - SünkroonimisePage.tsx (deleted entirely)
 *   - its import, Data-section card, openView branch, and Quick Action in
 *     SettingsPage.tsx (plus the now-unused RefreshCw icon import)
 *   - the sync.* translation keys, and settings.card.sync /
 *     settings.desc.sync / settings.quick.checkSync
 *   - the two "Synchronization settings" release-note items in
 *     MisOnUutPage.tsx (1.0.0 and 0.9.0) — every other release note in
 *     both entries is left exactly as it was.
 *
 * Left untouched, deliberately: any existing users/{uid}/settings/sync
 * Firestore document (no migration/deletion), settingsStore.ts itself
 * (shared by several unrelated settings pages), and every other Settings
 * card/route.
 *
 * No React rendering harness exists for SettingsPage.tsx/MisOnUutPage.tsx
 * in this repo — verified via structural regex assertions against the raw
 * source and direct translation-key assertions, matching the pattern used
 * throughout this session's other Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/settingsSyncRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SETTINGS_PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/SettingsPage.tsx'),
  'utf8',
)
const MIS_ON_UUT_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/MisOnUutPage.tsx'),
  'utf8',
)
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

describe('SünkroonimisePage.tsx no longer exists and is not imported', () => {
  it('the file was deleted', () => {
    const pagePath = resolve(
      process.cwd(),
      'src/views/settings/SünkroonimisePage.tsx',
    )
    expect(existsSync(pagePath)).toBe(false)
  })

  it('SettingsPage.tsx no longer imports it', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/SünkroonimisePage/)
  })
})

describe('no Synchronization card, openView branch, or Quick Action remains', () => {
  it('no routeKey/openView string "Sünkroonimine" appears anywhere in SettingsPage.tsx', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/Sünkroonimine/)
  })

  it('the settings.quick.checkSync Quick Action call site is gone', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/settings\.quick\.checkSync/)
  })

  it('the settings.card.sync / settings.desc.sync card call sites are gone', () => {
    expect(SETTINGS_PAGE_SRC).not.toMatch(/settings\.card\.sync/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/settings\.desc\.sync/)
  })

  it('RefreshCw is no longer imported (its only two uses were the removed card/quick-action icons)', () => {
    const importBlock = SETTINGS_PAGE_SRC.match(/from 'lucide-react'\)?[\s\S]*?\}\s*from 'lucide-react'/)?.[0]
      ?? SETTINGS_PAGE_SRC.match(/import\s*\{[\s\S]*?\}\s*from 'lucide-react'/)?.[0] ?? ''
    expect(importBlock).not.toMatch(/\bRefreshCw\b/)
    expect(SETTINGS_PAGE_SRC).not.toMatch(/<RefreshCw/)
  })
})

describe('Data section still contains Backup -> Export -> Delete, in the same order', () => {
  it('routeKeys appear in that exact order, with no Sünkroonimine card before Backup', () => {
    const dataSectionMatch = SETTINGS_PAGE_SRC.match(
      /heading: t\('settings\.section\.data', lang\),\s*cards: \[([\s\S]*?)\],\s*\},/,
    )
    expect(dataSectionMatch).not.toBeNull()
    const dataSection = dataSectionMatch![1]

    const routeKeys = [...dataSection.matchAll(/routeKey: '([^']+)'/g)].map((m) => m[1])
    expect(routeKeys).toEqual(['Varundamine', 'Andmete eksport', 'Andmete kustutamine'])
  })
})

describe('the other three Quick Actions remain unchanged', () => {
  it('changePassword, downloadData, and contactSupport quick actions are all still present', () => {
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.changePassword', lang\)/)
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.downloadData', lang\)/)
    expect(SETTINGS_PAGE_SRC).toMatch(/t\('settings\.quick\.contactSupport', lang\)/)
  })

  it('exactly three Quick Action entries remain (routeKey occurrences in the quick actions list)', () => {
    const quickActionsMatch = SETTINGS_PAGE_SRC.match(
      /return \[\s*\{\s*icon: <Lock[\s\S]*?\]\s*\}\s*\n\s*\/\/[\s\S]*?Main component/,
    )
    // Fall back to a looser bound if the surrounding comment text ever
    // shifts — the key fact under test is just the count of quick-action
    // routeKeys, found via their shared 15px icon size convention.
    const quickActionBlock = quickActionsMatch?.[0]
      ?? SETTINGS_PAGE_SRC.slice(SETTINGS_PAGE_SRC.indexOf('settings.quick.changePassword') - 200)
    const routeKeys = [...quickActionBlock.matchAll(/routeKey: '([^']+)'/g)].map((m) => m[1])
    expect(routeKeys).toEqual(['Turvalisus', 'Andmete eksport', 'Abi ja tugi'])
  })
})

describe('removed translation keys are gone', () => {
  const REMOVED_KEYS = [
    'sync.title', 'sync.subtitle',
    'sync.status.title', 'sync.status.desc', 'sync.status.active', 'sync.status.inactive',
    'sync.status.lastSync', 'sync.status.never',
    'sync.auto.title', 'sync.auto.desc', 'sync.auto.toggle', 'sync.auto.toggle.desc',
    'sync.mobile.title', 'sync.mobile.desc', 'sync.mobile.toggle', 'sync.mobile.toggle.desc',
    'sync.manual.title', 'sync.manual.desc', 'sync.manual.button', 'sync.manual.syncing',
    'sync.manual.done', 'sync.manual.note',
    'sync.save', 'sync.saved', 'sync.saving',
    'settings.card.sync', 'settings.desc.sync', 'settings.quick.checkSync',
  ]

  it('none of the removed keys appear anywhere in translations.ts', () => {
    for (const key of REMOVED_KEYS) {
      expect(TRANSLATIONS_SRC).not.toContain(`"${key}"`)
    }
  })
})

describe('synchronization release-note items are gone while unrelated release notes remain', () => {
  it('no release-note item promises Synchronization settings, in either language', () => {
    expect(MIS_ON_UUT_SRC).not.toMatch(/Sünkroonimise seaded/)
    expect(MIS_ON_UUT_SRC).not.toMatch(/Synchronization settings/)
    expect(MIS_ON_UUT_SRC).not.toMatch(/Sync settings/)
  })

  it('the 1.0.0 release entry keeps its other items untouched', () => {
    const v1Block = MIS_ON_UUT_SRC.match(/version: '1\.0\.0',[\s\S]*?items: \[([\s\S]*?)\],/)
    expect(v1Block).not.toBeNull()
    const items = v1Block![1]
    expect(items).toContain('Andmete eksport ja varundamine')
    expect(items).toContain('Privaatsuse, turvalisuse ja teavituste seaded')
    expect(items).toContain('AI Assistant')
  })

  it('the 0.9.0 release entry keeps its other items untouched', () => {
    const v09Block = MIS_ON_UUT_SRC.match(/version: '0\.9\.0',[\s\S]*?items: \[([\s\S]*?)\],/)
    expect(v09Block).not.toBeNull()
    const items = v09Block![1]
    expect(items).toContain('Varundamise haldus')
    expect(items).toContain('Backup management')
    expect(items).toContain('Mis on uut leht')
    expect(items).toContain('New page')
  })

  it('an unrelated older release (0.8.0) is completely untouched', () => {
    expect(MIS_ON_UUT_SRC).toMatch(/version: '0\.8\.0'/)
    expect(MIS_ON_UUT_SRC).toMatch(/Firebase autentimine/)
  })
})

describe('scope: settingsStore.ts and Firestore data are untouched', () => {
  it('settingsStore.ts still exports its generic load/save/subscribe helpers, unmodified in shape', () => {
    const settingsStoreSrc = readFileSync(
      resolve(process.cwd(), 'src/lib/settingsStore.ts'),
      'utf8',
    )
    expect(settingsStoreSrc).toMatch(/export async function loadSettings/)
    expect(settingsStoreSrc).toMatch(/export async function saveSettings/)
    expect(settingsStoreSrc).toMatch(/export function subscribeSettings/)
    expect(settingsStoreSrc).toMatch(/export async function loadSettingsStrict/)
  })
})
