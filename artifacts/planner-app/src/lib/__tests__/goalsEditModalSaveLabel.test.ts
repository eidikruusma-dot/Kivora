/**
 * Regression test for a live bug: the Goals edit modal's primary submit
 * button reused the create modal's `goals.modal.save` translation key
 * ("Lisa eesmärk" / "Add goal"), so editing an existing goal showed
 * "Lisa eesmärk" instead of a save/update label.
 *
 * Fix (GoalsPage.tsx + translations.ts only):
 *   - A new `goals.modal.saveEdit` key ("Salvesta muudatused" / "Save
 *     changes") was added, reusing the existing translations structure.
 *   - The create modal's submit button still uses `goals.modal.save`
 *     ("Lisa eesmärk" / "Add goal") — untouched.
 *   - The edit modal's submit button now uses `goals.modal.saveEdit`
 *     instead — no new modal, no separate editing flow, no change to
 *     handleAddGoal/handleSaveEdit or any other Goals behavior.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component and translations source, consistent
 * with every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/goalsEditModalSaveLabel.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/GoalsPage.tsx'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

function extractCreateModal(): string {
  const match = SRC.match(/\{\/\* ── Add Goal modal[\s\S]*?\n {6}\)\}\n\n {6}\{\/\* ── Edit Goal modal/)
  expect(match).not.toBeNull()
  return match![0]
}

function extractEditModal(): string {
  const match = SRC.match(/\{\/\* ── Edit Goal modal[\s\S]*?\n {6}\)\}\n\n {6}\{\/\* ── Goal Detail View/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('create mode: submit button still shows "Lisa eesmärk" / "Add goal"', () => {
  it('the create-modal submit button calls handleAddGoal and renders goals.modal.save', () => {
    const modal = extractCreateModal()
    expect(modal).toMatch(/onClick=\{handleAddGoal\}/)
    expect(modal).toMatch(/\{t\('goals\.modal\.save', lang\)\}/)
    expect(modal).not.toMatch(/\{t\('goals\.modal\.saveEdit', lang\)\}/)
  })

  it('goals.modal.save is exactly "Lisa eesmärk" (ET) / "Add goal" (EN)', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.save":\s*"Lisa eesmärk"/)
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.save":\s*"Add goal"/)
  })
})

describe('edit mode: submit button shows "Salvesta muudatused" / "Save changes"', () => {
  it('the edit-modal submit button calls handleSaveEdit and renders the new goals.modal.saveEdit key', () => {
    const modal = extractEditModal()
    expect(modal).toMatch(/onClick=\{handleSaveEdit\}/)
    expect(modal).toMatch(/\{t\('goals\.modal\.saveEdit', lang\)\}/)
    expect(modal).not.toMatch(/\{t\('goals\.modal\.save', lang\)\}/)
  })

  it('goals.modal.saveEdit is exactly "Salvesta muudatused" (ET) / "Save changes" (EN)', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.saveEdit":\s*"Salvesta muudatused"/)
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.saveEdit":\s*"Save changes"/)
  })

  it('goals.modal.saveEdit is declared in the TranslationKey union exactly once', () => {
    expect((TRANSLATIONS_SRC.match(/\| "goals\.modal\.saveEdit"/g) ?? []).length).toBe(1)
  })
})

describe('no duplicate modal or separate editing flow was introduced', () => {
  it('exactly one showAddModal-driven create modal and one editGoal-driven edit modal exist', () => {
    expect((SRC.match(/const \[showAddModal, setShowAddModal\] = useState\(false\)/g) ?? []).length).toBe(1)
    expect((SRC.match(/const \[editGoal, setEditGoal\] = useState<Goal \| null>\(null\)/g) ?? []).length).toBe(1)
  })

  it('handleAddGoal and handleSaveEdit remain the sole create/save handlers, unchanged in signature', () => {
    expect(SRC).toMatch(/const handleAddGoal = async \(\) => \{/)
    expect(SRC).toMatch(/const handleSaveEdit = async \(\) => \{/)
    const saveEditFn = SRC.match(/const handleSaveEdit = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(saveEditFn).toMatch(/updateGoal\(editGoal\.id, editGoal\)/)
  })
})
