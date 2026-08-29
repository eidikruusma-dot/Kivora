/**
 * backup.manual.note (ET/EN) claimed habits "cannot be backed up" / "are
 * stored in memory only" — stale since backupService.ts's readAllUserData()
 * now reads the real users/{uid}/habits collection (see
 * backupServiceHabits.test.ts). This only corrects that one key's wording;
 * it does not touch backup.history.habits (a distinct, separate key still
 * describing the pre-restore-modal habits note, out of scope here) or any
 * production backup logic.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/backupManualNoteHabitsFixed.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

function noteValueFor(lang: 'ET' | 'EN'): string {
  const marker = lang === 'ET' ? '"backup.manual.note": "Sisaldab' : '"backup.manual.note": "Includes'
  const idx = TRANSLATIONS_SRC.indexOf(marker)
  expect(idx).toBeGreaterThan(-1)
  const lineEnd = TRANSLATIONS_SRC.indexOf('\n', idx)
  return TRANSLATIONS_SRC.slice(idx, lineEnd)
}

describe('backup.manual.note no longer claims habits are excluded', () => {
  it('ET value drops the in-memory/cannot-be-backed-up claim and mentions harjumusi', () => {
    const line = noteValueFor('ET')
    expect(line).not.toMatch(/ei saa varundada/i)
    expect(line).not.toMatch(/ainult mälus/i)
    expect(line).toMatch(/harjumusi/i)
  })

  it('EN value drops the in-memory/cannot-be-backed-up claim and mentions habits', () => {
    const line = noteValueFor('EN')
    expect(line).not.toMatch(/cannot be backed up/i)
    expect(line).not.toMatch(/stored in memory only/i)
    expect(line).toMatch(/\bhabits\b/i)
  })
})

describe('backup.manual.note key still exists in both languages', () => {
  it('the key appears exactly twice (ET + EN)', () => {
    const matches = TRANSLATIONS_SRC.match(/"backup\.manual\.note":/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('the key is still declared in the TranslationKey union', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"backup\.manual\.button" \| "backup\.manual\.creating" \| "backup\.manual\.done" \| "backup\.manual\.note"/)
  })
})

describe('unrelated backup translations are unchanged', () => {
  it('backup.history.habits key still exists (its own wording is covered by backupHistoryHabitsNoteFixed.test.ts)', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"backup\.history\.habits":/)
  })

  it('other backup.* keys (status/manual title-desc/history/restore) are untouched', () => {
    expect(TRANSLATIONS_SRC).toContain('"backup.status.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.manual.button"')
    expect(TRANSLATIONS_SRC).toContain('"backup.manual.creating"')
    expect(TRANSLATIONS_SRC).toContain('"backup.manual.done"')
    expect(TRANSLATIONS_SRC).toContain('"backup.history.title"')
    expect(TRANSLATIONS_SRC).toContain('"backup.restore.confirm.title"')
  })
})
