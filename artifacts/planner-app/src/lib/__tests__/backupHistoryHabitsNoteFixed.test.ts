/**
 * backup.history.habits (ET/EN) claimed habits "are not backed up
 * (memory only)" — stale since backupService.ts's readAllUserData() now
 * reads the real users/{uid}/habits collection and createBackup()/
 * restoreBackup() include habits like any other collection (see
 * backupServiceHabits.test.ts). This only corrects this one key's wording;
 * it does not touch backup.manual.note (a distinct, already-fixed key) or
 * any production backup logic.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/backupHistoryHabitsNoteFixed.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

function historyHabitsValueFor(lang: 'ET' | 'EN'): string {
  const marker = lang === 'ET' ? '"backup.history.habits": "Harjumused' : '"backup.history.habits": "Habits'
  const idx = TRANSLATIONS_SRC.indexOf(marker)
  expect(idx).toBeGreaterThan(-1)
  const lineEnd = TRANSLATIONS_SRC.indexOf('\n', idx)
  return TRANSLATIONS_SRC.slice(idx, lineEnd)
}

describe('backup.history.habits no longer claims habits are excluded/memory-only', () => {
  it('ET value drops the "pole varundatud"/"ainult mälus" claim', () => {
    const line = historyHabitsValueFor('ET')
    expect(line).not.toMatch(/pole varundatud/i)
    expect(line).not.toMatch(/ainult mälus/i)
    expect(line).toMatch(/harjumused/i)
  })

  it('EN value drops the "not backed up"/"memory only" claim', () => {
    const line = historyHabitsValueFor('EN')
    expect(line).not.toMatch(/not backed up/i)
    expect(line).not.toMatch(/memory only/i)
    expect(line).toMatch(/\bhabits\b/i)
  })
})

describe('backup.history.habits key still exists in both languages', () => {
  it('the key appears exactly twice (ET + EN)', () => {
    const matches = TRANSLATIONS_SRC.match(/"backup\.history\.habits":/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('the key is still declared in the TranslationKey union', () => {
    expect(TRANSLATIONS_SRC).toMatch(/\| "backup\.history\.habits"/)
  })
})

describe('unrelated backup translations are unchanged', () => {
  it('backup.manual.note keeps its previously-fixed (separate, out-of-scope) wording', () => {
    expect(TRANSLATIONS_SRC).toContain(
      '"backup.manual.note": "Sisaldab ülesandeid, märkmeid, kalendrisündmusi, harjumusi, eesmärke, kooliandmeid, AI-vestlusi, teatisi ja seoseid."',
    )
    expect(TRANSLATIONS_SRC).toContain(
      '"backup.manual.note": "Includes tasks, notes, calendar events, habits, goals, school items, AI conversations, notifications, and entity links."',
    )
  })

  it('other backup.history.* keys (title/desc/empty/loading/items/delete/restore/deleting) are untouched', () => {
    expect(TRANSLATIONS_SRC).toContain('"backup.history.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.desc"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.empty"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.loading"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.items"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.delete"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.restore"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.deleting"')
  })

  it('backup.status.* and backup.restore.* keys are untouched', () => {
    expect(TRANSLATIONS_SRC).toContain('"backup.status.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.restore.confirm.title"')
  })
})
