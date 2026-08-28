/**
 * Regression tests for simplifying the Habits add/edit modal's category,
 * icon, and color selection.
 *
 * Approved behavior:
 *   - Choosing a category auto-applies a sensible default icon+color,
 *     reusing the existing COLOR_OPTIONS palette entries and lucide-react
 *     icons (no new colors, no image assets/gradients):
 *       Isiklik (Personal) -> purple (#6F5AE8 / #EDE9FB) + Flame
 *       Tervis  (Health)   -> green  (#16A34A / #DCFCE7) + Apple
 *       Töö     (Work)     -> orange (#F97316 / #FFF0E6) + Briefcase
 *       Kool    (School)   -> blue   (#2563EB / #DBEAFE) + BookOpen
 *   - The Icon/Color selectors are hidden by default behind a
 *     "Kohanda välimust" / "Customize appearance" toggle button; clicking
 *     it reveals the existing (unduplicated) selectors.
 *   - In create mode, picking a category updates icon+color automatically
 *     UNLESS the user already manually picked one — iconCustomized and
 *     colorCustomized are tracked independently, so overriding only the
 *     icon (for example) still lets later category changes keep updating
 *     the color, and vice versa.
 *   - In edit mode, handleCategoryChange never touches icon/color at all —
 *     opening or saving an existing habit must never silently replace its
 *     saved appearance.
 *   - iconCustomized/colorCustomized are HabitForm-only (component-local)
 *     fields — never part of the persisted Habit model, never sent to
 *     addHabit/updateHabit.
 *   - Recurrence, custom weekdays, validation, and the save payload are
 *     otherwise completely unchanged.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsAppearanceSimplification.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')
const HABITS_DATA_SRC = readFileSync(resolve(process.cwd(), 'src/data/habitsData.ts'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

function extractBlock(name: string): string {
  const re = new RegExp(`const ${name}[^\\n]*\\{[\\s\\S]*?\\n\\};`)
  const match = SRC.match(re)
  expect(match, `expected to find ${name}`).not.toBeNull()
  return match![0]
}

describe('all four category default mappings reuse the existing palette and lucide icons', () => {
  const CATEGORY_DEFAULTS_BLOCK = extractBlock('CATEGORY_DEFAULTS')

  it('Isiklik (Personal) maps to the existing purple palette entry + Flame', () => {
    expect(CATEGORY_DEFAULTS_BLOCK).toMatch(/Isiklik:\s*\{\s*icon:\s*"flame",\s*iconColor:\s*COLOR_OPTIONS\[0\]\.color,\s*iconBg:\s*COLOR_OPTIONS\[0\]\.bg\s*\}/)
    expect(SRC).toMatch(/COLOR_OPTIONS = \[\s*\n\s*\{ color: "#6F5AE8", bg: "#EDE9FB" \}/)
  })

  it('Tervis (Health) maps to the existing green palette entry + Apple', () => {
    expect(CATEGORY_DEFAULTS_BLOCK).toMatch(/Tervis:\s*\{\s*icon:\s*"apple",\s*iconColor:\s*COLOR_OPTIONS\[1\]\.color,\s*iconBg:\s*COLOR_OPTIONS\[1\]\.bg\s*\}/)
    expect(SRC).toMatch(/\{ color: "#16A34A", bg: "#DCFCE7" \}/)
  })

  it('Töö (Work) maps to the existing orange palette entry + Briefcase', () => {
    expect(CATEGORY_DEFAULTS_BLOCK).toMatch(/Töö:\s*\{\s*icon:\s*"briefcase",\s*iconColor:\s*COLOR_OPTIONS\[6\]\.color,\s*iconBg:\s*COLOR_OPTIONS\[6\]\.bg\s*\}/)
    expect(SRC).toMatch(/\{ color: "#F97316", bg: "#FFF0E6" \}/)
  })

  it('Kool (School) maps to the existing blue palette entry + BookOpen', () => {
    expect(CATEGORY_DEFAULTS_BLOCK).toMatch(/Kool:\s*\{\s*icon:\s*"book",\s*iconColor:\s*COLOR_OPTIONS\[2\]\.color,\s*iconBg:\s*COLOR_OPTIONS\[2\]\.bg\s*\}/)
    expect(SRC).toMatch(/\{ color: "#2563EB", bg: "#DBEAFE" \}/)
  })

  it('Flame and Briefcase are imported from lucide-react, not a new image asset or gradient', () => {
    expect(SRC).toMatch(/import \{[\s\S]*?\bFlame\b[\s\S]*?\} from "lucide-react"/)
    expect(SRC).toMatch(/import \{[\s\S]*?\bBriefcase\b[\s\S]*?\} from "lucide-react"/)
    expect(SRC).not.toMatch(/gradient/i)
    expect(SRC).not.toMatch(/<img\b/)
  })

  it('book (BookOpen) and apple (Apple) are reused as-is — no duplicate icon definitions were introduced', () => {
    expect((SRC.match(/book: <BookOpen/g) ?? []).length).toBe(1)
    expect((SRC.match(/apple: <Apple/g) ?? []).length).toBe(1)
  })
})

describe('the new icon ids extend the existing closed union, without changing the Firestore schema', () => {
  it('flame and briefcase are added to Habit["icon"] alongside the existing values', () => {
    expect(HABITS_DATA_SRC).toMatch(
      /icon: 'droplet' \| 'run' \| 'book' \| 'meditation' \| 'apple' \| 'moon' \| 'flame' \| 'briefcase'/,
    )
  })

  it('the Habit interface gained no new persisted fields for this feature', () => {
    const habitInterface = HABITS_DATA_SRC.match(/export interface Habit \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(habitInterface).not.toMatch(/Customized/)
    expect(habitInterface).not.toMatch(/appearanceExpanded/)
  })
})

describe('automatic selection in create mode', () => {
  const handleCategoryChangeFn = SRC.match(/const handleCategoryChange = \(category: HabitCategory\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''

  it('handleCategoryChange exists and is wired to every category button', () => {
    expect(handleCategoryChangeFn).not.toBe('')
    expect(SRC).toMatch(/onClick=\{\(\) => handleCategoryChange\(cat\.value\)\}/)
    expect(SRC).not.toMatch(/onClick=\{\(\) => setForm\(\{ \.\.\.form, category: cat\.value \}\)\}/)
  })

  it('in create mode it applies CATEGORY_DEFAULTS for icon and color when neither was customized', () => {
    expect(handleCategoryChangeFn).toMatch(/const defaults = CATEGORY_DEFAULTS\[category\];/)
    expect(handleCategoryChangeFn).toMatch(/icon: form\.iconCustomized \? form\.icon : defaults\.icon,/)
    expect(handleCategoryChangeFn).toMatch(/iconColor: form\.colorCustomized \? form\.iconColor : defaults\.iconColor,/)
    expect(handleCategoryChangeFn).toMatch(/iconBg: form\.colorCustomized \? form\.iconBg : defaults\.iconBg,/)
  })

  it('EMPTY_FORM (the initial create-mode state) starts from the Isiklik/Personal default, not a hardcoded unrelated icon', () => {
    expect(SRC).toMatch(/icon: CATEGORY_DEFAULTS\.Isiklik\.icon,/)
    expect(SRC).toMatch(/iconColor: CATEGORY_DEFAULTS\.Isiklik\.iconColor,/)
    expect(SRC).toMatch(/iconBg: CATEGORY_DEFAULTS\.Isiklik\.iconBg,/)
  })

  it('openCreateModal resets to EMPTY_FORM, so iconCustomized/colorCustomized both start false for a fresh habit', () => {
    const fn = SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/setForm\(EMPTY_FORM\);/)
    expect(SRC).toMatch(/iconCustomized: false,\s*\n\s*colorCustomized: false,/)
  })
})

describe('manual icon override preservation', () => {
  it('picking an icon by hand sets iconCustomized — and only that flag, leaving colorCustomized untouched', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setForm\(\{ \.\.\.form, icon: opt\.id, iconCustomized: true \}\)\}/)
  })

  it('handleCategoryChange keeps a customized icon even when the color still auto-updates', () => {
    const fn = SRC.match(/const handleCategoryChange = \(category: HabitCategory\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    // icon and color are gated by two DIFFERENT flags, not a single shared one.
    expect(fn).toMatch(/form\.iconCustomized/)
    expect(fn).toMatch(/form\.colorCustomized/)
    expect(fn.match(/form\.iconCustomized/g)?.length).toBe(1)
    expect(fn.match(/form\.colorCustomized/g)?.length).toBe(2) // iconColor + iconBg
  })
})

describe('manual color override preservation', () => {
  it('picking a color by hand sets colorCustomized — and only that flag, leaving iconCustomized untouched', () => {
    expect(SRC).toMatch(
      /onClick=\{\(\) =>\s*\n\s*setForm\(\{ \.\.\.form, iconColor: c\.color, iconBg: c\.bg, colorCustomized: true \}\)\s*\n\s*\}/,
    )
  })

  it('icon and color customization are tracked as two independent booleans on HabitForm', () => {
    const habitFormInterface = SRC.match(/interface HabitForm \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(habitFormInterface).toMatch(/iconCustomized: boolean;/)
    expect(habitFormInterface).toMatch(/colorCustomized: boolean;/)
  })
})

describe('existing habit appearance preservation in edit mode', () => {
  it('handleCategoryChange returns early while editingId is set, before touching icon or color at all', () => {
    const fn = SRC.match(/const handleCategoryChange = \(category: HabitCategory\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    const editBranch = fn.match(/if \(editingId\) \{[\s\S]*?\n {4}\}/)?.[0] ?? ''
    expect(editBranch).not.toBe('')
    expect(editBranch).toMatch(/setForm\(\{ \.\.\.form, category \}\);/)
    expect(editBranch).not.toMatch(/icon|iconColor|iconBg/)
    expect(editBranch).toMatch(/return;/)
  })

  it('openEditModal pre-fills icon/color exactly from the habit being edited, not from CATEGORY_DEFAULTS', () => {
    const fn = SRC.match(/const openEditModal = \(habit: Habit\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/icon: habit\.icon,/)
    expect(fn).toMatch(/iconColor: habit\.iconColor,/)
    expect(fn).toMatch(/iconBg: habit\.iconBg,/)
    expect(fn).not.toMatch(/CATEGORY_DEFAULTS/)
  })

  it('saving an edited habit still writes back exactly the form\'s icon/color — unchanged unless the user opened the customizer and changed them', () => {
    const updateCall = SRC.match(/updateHabit\(editingId, \{[\s\S]*?\n {8}\}\);/)?.[0] ?? ''
    expect(updateCall).toMatch(/icon: form\.icon,/)
    expect(updateCall).toMatch(/iconColor: form\.iconColor,/)
    expect(updateCall).toMatch(/iconBg: form\.iconBg,/)
  })
})

describe('collapsed/expanded customization section', () => {
  it('a dedicated appearanceExpanded state gates the Icon and Color sections, defaulting to collapsed', () => {
    expect(SRC).toMatch(/const \[appearanceExpanded, setAppearanceExpanded\] = useState\(false\);/)
    expect(SRC).toMatch(/\{appearanceExpanded && \(/)
  })

  it('the toggle button uses the exact requested ET/EN copy key and flips the boolean', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setAppearanceExpanded\(\(v\) => !v\)\}/)
    expect(SRC).toMatch(/\{t\("habits\.modal\.customizeAppearance", lang\)\}/)
  })

  it('opening the create or edit modal always starts with the section collapsed', () => {
    const createFn = SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    const editFn = SRC.match(/const openEditModal = \(habit: Habit\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(createFn).toMatch(/setAppearanceExpanded\(false\);/)
    expect(editFn).toMatch(/setAppearanceExpanded\(false\);/)
  })

  it('the Icon and Color selectors themselves are not duplicated — exactly one of each in the file', () => {
    expect((SRC.match(/\{t\("habits\.modal\.iconLabel", lang\)\}/g) ?? []).length).toBe(1)
    expect((SRC.match(/\{t\("habits\.modal\.colorLabel", lang\)\}/g) ?? []).length).toBe(1)
    expect((SRC.match(/ICON_OPTIONS\.map\(/g) ?? []).length).toBe(1)
    expect((SRC.match(/COLOR_OPTIONS\.map\(/g) ?? []).length).toBe(1)
  })
})

describe('ET/EN translations for the new toggle button', () => {
  it('ET copy matches exactly', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"habits\.modal\.customizeAppearance":\s*"Kohanda välimust"/)
  })

  it('EN copy matches exactly', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"habits\.modal\.customizeAppearance":\s*"Customize appearance"/)
  })

  it('the key is declared in the TranslationKey union', () => {
    expect(TRANSLATIONS_SRC).toMatch(/\| "habits\.modal\.customizeAppearance"/)
  })
})

describe('no changes to recurrence or save payload behavior', () => {
  it('recurrence options and custom weekdays are untouched', () => {
    expect(SRC).toMatch(/\{ key: "daily", label: t\("habits\.modal\.daily", lang\) \}/)
    expect(SRC).toMatch(/\{\s*key: "weekdays",\s*\n\s*label: t\("habits\.modal\.weekdays", lang\),\s*\n\s*\}/)
    expect(SRC).toMatch(/\{ key: "custom", label: t\("habits\.modal\.custom", lang\) \}/)
    expect(SRC).toMatch(/form\.recurrence === "custom"/)
    expect(SRC).toMatch(/onClick=\{\(\) => setForm\(\{ \.\.\.form, recurrence: opt\.key \}\)\}/)
  })

  it('addHabit is still called with exactly the same fields as before — no iconCustomized/colorCustomized leak into the save payload', () => {
    const addCall = SRC.match(/const habit = await addHabit\(\{[\s\S]*?\n {8}\}\);/)?.[0] ?? ''
    expect(addCall).toMatch(/title: form\.title,/)
    expect(addCall).toMatch(/description: form\.description,/)
    expect(addCall).toMatch(/category: form\.category,/)
    expect(addCall).toMatch(/icon: form\.icon,/)
    expect(addCall).toMatch(/iconColor: form\.iconColor,/)
    expect(addCall).toMatch(/iconBg: form\.iconBg,/)
    expect(addCall).toMatch(/recurrence: form\.recurrence,/)
    expect(addCall).toMatch(/customDays: form\.customDays,/)
    expect(addCall).not.toMatch(/Customized/)
  })

  it('name/description validation, goal-per-day, edit/delete flows, and the weekly date strip are untouched', () => {
    expect(SRC).toMatch(/if \(!form\.title\.trim\(\)\) \{/)
    expect(SRC).toMatch(/goalPerDay: Math\.max\(1, Number\(e\.target\.value\)\),/)
    expect(SRC).toMatch(/const handleDelete = \(id: string\) => \{/)
    expect(SRC).toMatch(/function computeWeekTotals\(habits: Habit\[\]\) \{/)
    expect(SRC).toMatch(/const weekTotals = computeWeekTotals\(habits\);/)
  })
})
