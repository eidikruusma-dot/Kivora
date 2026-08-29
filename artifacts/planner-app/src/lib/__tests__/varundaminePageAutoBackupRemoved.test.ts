/**
 * Backup settings — inactive Automatic Backup UI removal.
 *
 * The Automatic Backup SectionCard's own copy admitted it did nothing
 * ("backup.auto.notActive" — enabling it only saved a preference; no
 * scheduler/timer/background job anywhere read autoBackup/frequency to
 * actually trigger a backup, verified during inspection). Since autoBackup
 * and frequency were the only two editable fields on this page, removing
 * them also makes the generic update() helper and the "Save bar" (saving/
 * saved state, handleSave()) dead — all removed together.
 *
 * Kept for backward compatibility: BackupSettings/DEFAULTS still declare
 * autoBackup, frequency, and lastBackupAt exactly as before, so
 * loadSettings<BackupSettings>(uid, 'backup', DEFAULTS) keeps round-
 * tripping any existing Firestore document's autoBackup/frequency values
 * without needing a migration — they're just never edited here anymore.
 *
 * backupService.ts is untouched — its own independent inline settings
 * type/defaults (used only to preserve autoBackup/frequency across a
 * lastBackupAt update) never depended on this page's types.
 *
 * No React rendering harness exists for VarundaminePage.tsx in this
 * repo — verified via structural regex assertions against the raw
 * source, matching the pattern used throughout this session's other
 * Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/varundaminePageAutoBackupRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/VarundaminePage.tsx'),
  'utf8',
)
const BACKUP_SERVICE_SRC_PATH = resolve(process.cwd(), 'src/lib/backupService.ts')
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

describe('automatic-backup UI and frequency selector are gone', () => {
  it('FrequencySelector, FREQ_OPTIONS, and the local Frequency type no longer exist', () => {
    expect(PAGE_SRC).not.toMatch(/FrequencySelector/)
    expect(PAGE_SRC).not.toMatch(/FREQ_OPTIONS/)
    expect(PAGE_SRC).not.toMatch(/type Frequency =/)
  })

  it('no backup.auto.* / backup.freq.* key is referenced anymore', () => {
    expect(PAGE_SRC).not.toMatch(/backup\.auto\./)
    expect(PAGE_SRC).not.toMatch(/backup\.freq\./)
  })

  it('the now-unused RefreshCw icon import is gone', () => {
    const importBlock = PAGE_SRC.match(/import\s*\{[\s\S]*?\}\s*from 'lucide-react'/)?.[0] ?? ''
    expect(importBlock).not.toMatch(/\bRefreshCw\b/)
    expect(PAGE_SRC).not.toMatch(/<RefreshCw/)
  })

  it('Info remains imported (still used by the unrelated Backup history "habits" note)', () => {
    const importBlock = PAGE_SRC.match(/import\s*\{[\s\S]*?\}\s*from 'lucide-react'/)?.[0] ?? ''
    expect(importBlock).toMatch(/\bInfo\b/)
    expect(PAGE_SRC).toMatch(/<Info size=\{12\} className="flex-shrink-0" \/>/)
  })
})

describe('the Save bar is gone', () => {
  it('handleSave, the update() helper, and saving/saved state no longer exist', () => {
    expect(PAGE_SRC).not.toMatch(/function handleSave/)
    expect(PAGE_SRC).not.toMatch(/function update</)
    expect(PAGE_SRC).not.toMatch(/\[saving, setSaving\]/)
    expect(PAGE_SRC).not.toMatch(/\[saved, setSaved\]/)
  })

  it('no backup.save / backup.saving / backup.saved key is referenced anymore', () => {
    expect(PAGE_SRC).not.toMatch(/backup\.save['"]/)
    expect(PAGE_SRC).not.toMatch(/backup\.saving/)
    expect(PAGE_SRC).not.toMatch(/backup\.saved/)
  })

  it('the now-unused saveSettings import is gone; loadSettings remains (still used to load/refresh settings)', () => {
    const importLine = PAGE_SRC.match(/import \{[^}]*\} from '@\/lib\/settingsStore'/)?.[0] ?? ''
    expect(importLine).not.toMatch(/saveSettings/)
    expect(importLine).toMatch(/loadSettings/)
  })
})

describe('BackupSettings / DEFAULTS still preserve legacy autoBackup and frequency', () => {
  it('interface BackupSettings still declares all three fields', () => {
    const block = PAGE_SRC.match(/interface BackupSettings \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/autoBackup: boolean/)
    expect(block).toMatch(/frequency: 'daily' \| 'weekly' \| 'monthly'/)
    expect(block).toMatch(/lastBackupAt: string \| null/)
  })

  it('DEFAULTS still initializes all three fields', () => {
    const block = PAGE_SRC.match(/const DEFAULTS: BackupSettings = \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/autoBackup: false,/)
    expect(block).toMatch(/frequency: 'weekly',/)
    expect(block).toMatch(/lastBackupAt: null,/)
  })

  it('loadSettings<BackupSettings>(uid, \'backup\', DEFAULTS) is still called on mount, unchanged', () => {
    expect(PAGE_SRC).toMatch(/loadSettings<BackupSettings>\(uid, 'backup', DEFAULTS\)\.then\(setSettings\)/)
  })
})

describe('real manual backup/status/history/restore/delete UI and handlers remain', () => {
  it('Backup status section (hasBackup/lastBackup/statusLabel) is intact', () => {
    expect(PAGE_SRC).toMatch(/const hasBackup = lastBackup !== null/)
    expect(PAGE_SRC).toMatch(/t\('backup\.status\.title', lang\)/)
    expect(PAGE_SRC).toMatch(/t\('backup\.status\.lastBackup', lang\)/)
  })

  it('manual Create Backup button and handler are intact', () => {
    expect(PAGE_SRC).toMatch(/async function handleCreateBackup\(\)/)
    expect(PAGE_SRC).toMatch(/onClick=\{handleCreateBackup\}/)
    expect(PAGE_SRC).toMatch(/const meta = await createBackup\(uid\)/)
  })

  it('backup history list, delete, and restore-click wiring are intact', () => {
    expect(PAGE_SRC).toMatch(/async function handleDeleteBackup\(backupId: string\)/)
    expect(PAGE_SRC).toMatch(/await deleteBackup\(uid, backupId\)/)
    expect(PAGE_SRC).toMatch(/function handleRestoreClick\(backup: BackupMeta\)/)
    expect(PAGE_SRC).toMatch(/onClick=\{\(\) => handleRestoreClick\(backup\)\}/)
    expect(PAGE_SRC).toMatch(/onClick=\{\(\) => handleDeleteBackup\(backup\.id\)\}/)
  })

  it('restore confirmation flow and pre-restore safety backup are intact', () => {
    const restoreBlock = PAGE_SRC.match(/async function handleConfirmRestore\(\)[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(restoreBlock).toMatch(/\/\/ 1\. Create safety backup of current state/)
    expect(restoreBlock).toMatch(/await createBackup\(uid\)/)
    expect(restoreBlock).toMatch(/await restoreBackup\(uid, restoreTarget\.id\)/)
    expect(PAGE_SRC).toMatch(/<RestoreModal/)
  })

  it('the four Backup SectionCards render in order: status, manual, history — plus the restore modal', () => {
    const statusIdx = PAGE_SRC.indexOf('1. Backup status')
    const manualIdx = PAGE_SRC.indexOf('2. Manual backup')
    const historyIdx = PAGE_SRC.indexOf('3. Backup history')
    expect(statusIdx).toBeGreaterThan(-1)
    expect(manualIdx).toBeGreaterThan(statusIdx)
    expect(historyIdx).toBeGreaterThan(manualIdx)
  })
})

describe('backupService.ts is untouched', () => {
  it('createBackup/listBackups/deleteBackup/restoreBackup exports and its own settings round-trip are unchanged', () => {
    const src = readFileSync(BACKUP_SERVICE_SRC_PATH, 'utf8')
    expect(src).toMatch(/export async function createBackup\(uid: string\): Promise<BackupMeta>/)
    expect(src).toMatch(/export async function listBackups/)
    expect(src).toMatch(/export async function deleteBackup/)
    expect(src).toMatch(/export async function restoreBackup/)
    expect(src).toMatch(
      /loadSettings<\{ autoBackup: boolean; frequency: string; lastBackupAt: string \| null \}>\(/,
    )
    expect(src).toMatch(
      /await saveSettings\(uid, 'backup', \{ \.\.\.currentBackupSettings, lastBackupAt: createdAt \}\)/,
    )
  })
})

describe('removed translation keys are gone', () => {
  const REMOVED_KEYS = [
    'backup.auto.title', 'backup.auto.desc', 'backup.auto.toggle', 'backup.auto.toggle.desc',
    'backup.auto.notActive',
    'backup.freq.title', 'backup.freq.desc',
    'backup.freq.daily', 'backup.freq.weekly', 'backup.freq.monthly',
    'backup.save', 'backup.saving', 'backup.saved',
  ]

  it('none of the 13 removed keys appear anywhere in translations.ts', () => {
    for (const key of REMOVED_KEYS) {
      expect(TRANSLATIONS_SRC).not.toContain(`"${key}"`)
    }
  })

  it('unrelated backup.* keys (status/manual/history/restore) are untouched', () => {
    expect(TRANSLATIONS_SRC).toContain('"backup.status.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.manual.button"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.restore.confirm.title"')
  })
})
