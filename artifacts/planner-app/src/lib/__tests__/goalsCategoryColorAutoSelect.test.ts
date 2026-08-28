/**
 * Regression tests for automatic color selection from category on the Goals
 * creation/edit form, matching the existing Habits form behavior
 * (see CATEGORY_DEFAULTS / handleCategoryChange in HabitsPage.tsx).
 *
 * Change (GoalsPage.tsx only — the goal model, Firestore actions, deadlines,
 * status, steps, validation, filtering, and delete flow are all untouched):
 *   - CATEGORY_COLOR_INDEX maps every one of the goal's 12 "category" values
 *     (the existing `icon` field) to an index into the existing 6-color
 *     makeColorOptions palette — no new colors were introduced.
 *   - In create mode, changing the category (handleCategoryChange) applies
 *     that category's default color, UNLESS the user already picked a color
 *     by hand (form.colorCustomized), in which case the manual choice is
 *     preserved.
 *   - The manual color picker still exists, unchanged in behavior, but now
 *     sits behind a collapsed "Kohanda välimust" / "Customize appearance"
 *     control in both the create and edit modals — no second modal, no
 *     persisted customization flag (colorCustomized is form-local UI state
 *     only, never written to the Goal model or Firestore).
 *   - In edit mode, changing the category never touches color — the
 *     category <select> there still calls a plain setEditGoal({ ...editGoal,
 *     icon }) exactly as before this change, so an existing goal's color is
 *     always preserved.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here (e.g. habitsAppearanceSimplification-style tests).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/goalsCategoryColorAutoSelect.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/GoalsPage.tsx'), 'utf8')

const GOAL_ICON_VALUES = [
  'personal', 'career', 'learning', 'health', 'money', 'home',
  'family', 'travel', 'reading', 'sport', 'project', 'other',
]

function extractCategoryColorMap(): string {
  const match = SRC.match(/const CATEGORY_COLOR_INDEX: Record<Goal\['icon'\], number> = \{[\s\S]*?\n\}/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('CATEGORY_COLOR_INDEX: every category maps to one deterministic existing-palette color', () => {
  const map = extractCategoryColorMap()

  it('defines an entry for every one of the 12 goal categories, each a valid palette index (0-5)', () => {
    for (const category of GOAL_ICON_VALUES) {
      const entryMatch = map.match(new RegExp(`\\b${category}:\\s*(\\d)`))
      expect(entryMatch, `expected an entry for category "${category}"`).not.toBeNull()
      const index = Number(entryMatch![1])
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThanOrEqual(5)
    }
  })

  it('defines exactly 12 entries — no category is missing and none was invented', () => {
    const entries = map.match(/^\s*\w+:\s*\d,?\s*(\/\/.*)?$/gm) ?? []
    expect(entries.length).toBe(12)
  })

  it('reuses the existing 6-color makeColorOptions palette — no new color values were introduced', () => {
    expect(SRC).toMatch(/function makeColorOptions\(lang: AppLang\) \{/)
    const paletteEntries = (SRC.match(/barColor: '#[0-9A-F]{6}'/g) ?? []).length
    // 6 defined once in makeColorOptions
    expect(paletteEntries).toBe(6)
  })

  it('the mapping is deterministic — a fixed object literal, not computed at runtime', () => {
    expect(map).not.toMatch(/Math\.random/)
    expect(map).not.toMatch(/Date\.now/)
  })
})

describe('create mode: changing category automatically applies its default color', () => {
  it('handleCategoryChange exists and applies CATEGORY_COLOR_INDEX unless the color was manually customized', () => {
    const fn = SRC.match(/const handleCategoryChange = \(icon: Goal\['icon'\]\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/colorIndex: form\.colorCustomized \? form\.colorIndex : CATEGORY_COLOR_INDEX\[icon\]/)
  })

  it('the create-form category <select> calls handleCategoryChange, not a raw setForm', () => {
    const createSelect = SRC.match(/value=\{form\.icon\}\s*\n\s*onChange=\{[^\n]*\}/)?.[0] ?? ''
    expect(createSelect).toMatch(/onChange=\{\(e\) => handleCategoryChange\(e\.target\.value as Goal\['icon'\]\)\}/)
  })

  it('the empty/default form already reflects its default category\'s color (no stale mismatch before any interaction)', () => {
    expect(SRC).toMatch(/colorIndex: CATEGORY_COLOR_INDEX\.other,/)
  })
})

describe('manual override: a user-picked color survives later category changes', () => {
  it('NewGoalForm tracks colorCustomized as form-local UI state only', () => {
    expect(SRC).toMatch(/colorCustomized: boolean/)
    expect(SRC).toMatch(/colorCustomized: false,\s*\n\}/)
  })

  it('clicking a swatch in the create form sets colorCustomized to true', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setForm\(\{ \.\.\.form, colorIndex: i, colorCustomized: true \}\)\}/)
  })

  it('colorCustomized is never written to the Goal model or passed to addGoal/updateGoal', () => {
    const addGoalCall = SRC.match(/const newGoal: Goal = \{[\s\S]*?\n {6}\}/)?.[0] ?? ''
    expect(addGoalCall).not.toBe('')
    expect(addGoalCall).not.toMatch(/colorCustomized/)
  })
})

describe('edit mode: category changes never touch an existing goal\'s color', () => {
  it('the edit-form category <select> still only sets icon, exactly as before this change', () => {
    expect(SRC).toMatch(/onChange=\{\(e\) => setEditGoal\(\{ \.\.\.editGoal, icon: e\.target\.value as Goal\['icon'\] \}\)\}/)
  })

  it('no edit-mode code path references CATEGORY_COLOR_INDEX — auto color selection is create-mode only', () => {
    const editModalMatch = SRC.match(/\{\/\* ── Edit Goal modal[\s\S]*?\n {6}\)\}\n\n {6}\{\/\* ── Goal Detail View/)
    expect(editModalMatch).not.toBeNull()
    expect(editModalMatch![0]).not.toMatch(/CATEGORY_COLOR_INDEX/)
  })

  it('the manual color picker in edit mode still directly sets barColor/iconBg/iconColor on the existing goal, unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setEditGoal\(\{ \.\.\.editGoal, barColor: c\.barColor, iconBg: c\.iconBg, iconColor: c\.iconColor \}\)\}/)
  })
})

describe('the manual color picker is collapsed behind a "Customize appearance" control, in both forms', () => {
  it('exactly two collapse toggles exist (create + edit), both driven by the same appearanceExpanded state', () => {
    expect((SRC.match(/const \[appearanceExpanded, setAppearanceExpanded\] = useState\(false\)/g) ?? []).length).toBe(1)
    expect((SRC.match(/onClick=\{\(\) => setAppearanceExpanded\(\(v\) => !v\)\}/g) ?? []).length).toBe(2)
  })

  it('both toggles are labeled via the goals.modal.customizeAppearance translation key', () => {
    expect((SRC.match(/t\('goals\.modal\.customizeAppearance', lang\)/g) ?? []).length).toBe(2)
  })

  it('the color picker only renders when appearanceExpanded is true, in both modals', () => {
    expect((SRC.match(/\{appearanceExpanded && \(/g) ?? []).length).toBe(2)
  })

  it('opening the create modal resets appearanceExpanded to collapsed', () => {
    const fn = SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/setAppearanceExpanded\(false\)/)
  })

  it('opening the edit modal (via the row menu) also resets appearanceExpanded to collapsed', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => \{ setEditGoal\(\{ \.\.\.goal \}\); setAppearanceExpanded\(false\); setMenuOpenId\(null\) \}\}/)
  })

  it('no second modal or duplicate creation/edit logic was introduced by this change', () => {
    expect((SRC.match(/const \[showAddModal, setShowAddModal\] = useState\(false\)/g) ?? []).length).toBe(1)
    expect((SRC.match(/const \[editGoal, setEditGoal\] = useState<Goal \| null>\(null\)/g) ?? []).length).toBe(1)
  })
})

describe('translation keys for the collapsed customize-appearance control', () => {
  const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

  it('ET and EN both define goals.modal.customizeAppearance', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.customizeAppearance":\s*"Kohanda välimust"/)
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.modal\.customizeAppearance":\s*"Customize appearance"/)
  })

  it('the key is declared in the TranslationKey union exactly once', () => {
    expect((TRANSLATIONS_SRC.match(/\| "goals\.modal\.customizeAppearance"/g) ?? []).length).toBe(1)
  })
})

describe('everything else on the Goals page is untouched by this change', () => {
  it('deadline, status, steps, and validation fields are unchanged', () => {
    expect(SRC).toMatch(/t\('goals\.modal\.deadlineLabel', lang\)/)
    expect(SRC).toMatch(/t\('goals\.modal\.statusLabel', lang\)/)
    expect(SRC).toMatch(/t\('goals\.modal\.stepsLabel', lang\)/)
    expect(SRC).toMatch(/setFormError\(t\('goals\.modal\.error', lang\)\)/)
  })

  it('filtering and the goal model/Firestore-facing store actions are unchanged', () => {
    expect(SRC).toMatch(/import \{ useGoals, useGoalsLoading, addGoal, updateGoal, deleteGoal as deleteGoalStore, toggleStep, addStep, deleteStep \} from '@\/lib\/goalsStore'/)
    expect(SRC).toMatch(/const filtered = goals\.filter\(\(g\) => \{/)
  })

  it('the delete flow is unchanged', () => {
    expect(SRC).toMatch(/const handleDeleteGoal = \(\) => \{/)
    expect(SRC).toMatch(/deleteGoalStore\(deleteGoal\.id\)/)
  })

  it('handleSaveEdit still saves the whole editGoal object through the existing updateGoal action, unchanged', () => {
    const fn = SRC.match(/const handleSaveEdit = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/updateGoal\(editGoal\.id, editGoal\)/)
  })
})
