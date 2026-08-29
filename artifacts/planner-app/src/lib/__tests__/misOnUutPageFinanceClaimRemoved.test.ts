/**
 * MisOnUutPage.tsx's v1.0.0 release entry advertised a "Personal finance
 * module (income, expenses and budgets)" as a shipped feature, and its
 * description sentence listed "finances" among the things users can manage
 * — both stale, since the Finance/Money module is gated behind
 * MONEY_MODULE_ENABLED (featureFlags.ts, currently false — see
 * moneyModuleHidden.test.ts) and is not advertised to normal users as an
 * available V1 feature anywhere else in the app.
 *
 * Fix: removed the finance-module bullet from the v1.0.0 items list, and
 * reworded the v1.0.0 description sentence (ET+EN) to drop "finances"/
 * "rahandust" from the list of manageable things — the rest of that
 * sentence, and every other release-note item across v1.0.0, v0.9.0, and
 * v0.8.0, is untouched. The Finance implementation and MONEY_MODULE_ENABLED
 * itself are not touched by this fix.
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source, matching
 * the pattern used by settingsSyncRemoved.test.ts for this same file.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/misOnUutPageFinanceClaimRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/MisOnUutPage.tsx'),
  'utf8',
)

function releaseBlock(version: string): string {
  const re = new RegExp(`version: '${version.replace(/\./g, '\\.')}',[\\s\\S]*?items: \\[([\\s\\S]*?)\\],`)
  return SRC.match(re)?.[1] ?? ''
}

describe('Finance is no longer advertised as an active V1 feature', () => {
  it('no finance/money/rahandus/budget/income/expense claim remains anywhere in the page', () => {
    expect(SRC).not.toMatch(/finance/i)
    expect(SRC).not.toMatch(/\bmoney\b/i)
    expect(SRC).not.toMatch(/rahand/i)
    expect(SRC).not.toMatch(/budget/i)
    expect(SRC).not.toMatch(/\bincome\b/i)
    expect(SRC).not.toMatch(/\bexpense/i)
    expect(SRC).not.toMatch(/eelarve/i)
    expect(SRC).not.toMatch(/\btulu/i)
    expect(SRC).not.toMatch(/\bkulu/i)
  })

  it('the v1.0.0 items list no longer has a personal-finance-module bullet', () => {
    const items = releaseBlock('1.0.0')
    expect(items).not.toBe('')
    expect(items).not.toMatch(/finance module/i)
    expect(items).not.toMatch(/rahanduse moodul/i)
  })

  it('the v1.0.0 description no longer lists finances among manageable things', () => {
    const desc = SRC.match(/description: \{\s*et: '([^']*)',\s*en: '([^']*)',\s*\},\s*items: \[\s*\{ et: 'Ülesannete haldus/)
    expect(desc).not.toBeNull()
    const [, et, en] = desc!
    expect(et).not.toMatch(/rahand/i)
    expect(en).not.toMatch(/financ/i)
    // The rest of the sentence is preserved, just without the finance clause
    expect(et).toContain('Haldage ülesandeid, märkmeid, harjumusi, eesmärke, kalendrit ja palju muud ühes kohas.')
    expect(en).toContain('Manage your tasks, notes, habits, goals, calendar and more in one place.')
  })
})

describe('unrelated v1.0.0 release-note items remain intact', () => {
  it('every other v1.0.0 item is still present, unchanged', () => {
    const items = releaseBlock('1.0.0')
    expect(items).toContain('Ülesannete haldus prioriteetide, tähtaegade ja alamülesannetega')
    expect(items).toContain('Kalender päeva-, nädala- ja kuuvaadetega')
    expect(items).toContain('Rikkaliku tekstiga märkmete redaktor')
    expect(items).toContain('Harjumuste jälgimine')
    expect(items).toContain('Eesmärgid edusammude jälgimisega')
    expect(items).toContain('AI-assistent')
    expect(items).toContain('AI Assistant')
    expect(items).toContain('Täielik seadete süsteem')
    expect(items).toContain('Andmete eksport ja varundamine')
    expect(items).toContain('Mitmekeelne tugi (eesti ja inglise keel)')
    expect(items).toContain('Tume ja hele teema')
    expect(items).toContain('Privaatsuse, turvalisuse ja teavituste seaded')
  })

  it('the v1.0.0 title and date are unchanged', () => {
    expect(SRC).toMatch(/version: '1\.0\.0',\s*\n\s*date: '2026-08-06',/)
    expect(SRC).toMatch(/et: 'Ametlik avalik väljalase',/)
    expect(SRC).toMatch(/en: 'Official Public Release',/)
  })
})

describe('v0.9.0 and v0.8.0 release history are fully preserved', () => {
  it('v0.9.0 keeps all of its items', () => {
    const items = releaseBlock('0.9.0')
    expect(items).toContain('Täielik eesti ja inglise keele lokaliseerimine')
    expect(items).toContain('Teema ja välimuse seaded')
    expect(items).toContain('Kuupäeva ja kellaaja eelistused')
    expect(items).toContain('Teavituste seaded')
    expect(items).toContain('Turvalisuse ja privaatsuse seaded')
    expect(items).toContain('Andmete eksport')
    expect(items).toContain('Varundamise haldus')
    expect(items).toContain('Abi ja tugi')
    expect(items).toContain("Mis on uut leht")
  })

  it('v0.8.0 keeps all of its items and metadata', () => {
    const items = releaseBlock('0.8.0')
    expect(items).toContain('Ülesanded')
    expect(items).toContain('Märkmed')
    expect(items).toContain('Kalender')
    expect(items).toContain('Harjumused')
    expect(items).toContain('Eesmärgid')
    expect(items).toContain('Firebase autentimine')
    expect(items).toContain('Külgriba navigatsioon')
    expect(items).toContain('Kasutajaprofiil')
    expect(SRC).toMatch(/version: '0\.8\.0',\s*\n\s*date: '2026-05-01',/)
  })

  it('exactly three releases exist and no new release was added', () => {
    const versions = SRC.match(/version: '[\d.]+'/g) ?? []
    expect(versions).toEqual(["version: '1.0.0'", "version: '0.9.0'", "version: '0.8.0'"])
  })
})

describe('the Finance feature flag itself is untouched', () => {
  it('MisOnUutPage.tsx does not import or reference MONEY_MODULE_ENABLED', () => {
    expect(SRC).not.toMatch(/MONEY_MODULE_ENABLED/)
  })

  it('the flag stays disabled in featureFlags.ts (unrelated to this text-only fix)', () => {
    const flagsSrc = readFileSync(resolve(process.cwd(), 'src/lib/featureFlags.ts'), 'utf8')
    expect(flagsSrc).toMatch(/export const MONEY_MODULE_ENABLED = false;/)
  })
})
