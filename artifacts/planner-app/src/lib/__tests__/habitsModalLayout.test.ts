/**
 * Regression tests for the Add/Edit Habit modal layout bug: with "Kohanda
 * välimust" expanded, the modal grew too tall, the recurrence/weekday
 * controls were partly hidden, and the sticky header/footer competed with
 * form content for space.
 *
 * Root cause: the outer dialog itself was the single scrolling region
 * (`max-h-[90dvh] overflow-y-auto` on the outer <div>), with the header and
 * footer merely `sticky top-0`/`sticky bottom-0` *inside* that same
 * scrolling content. A sticky footer that is also the last flowed child has
 * no reserved space below the preceding fields, so once the user scrolled
 * near the end, the footer visually sat on top of the final recurrence/
 * weekday row instead of making room for it.
 *
 * Fix (HabitsPage.tsx only, layout-only — no form logic changed):
 *   - The outer dialog is now a bounded flex column that clips instead of
 *     scrolling itself: `max-h-[90dvh] flex flex-col overflow-hidden`.
 *   - The header is a true flex item (`flex-shrink-0`), no longer `sticky`.
 *   - The form body (name/description/category/appearance toggle/icon+
 *     color/goal/recurrence/weekdays/error/LinkedItemsPanel) is the ONE
 *     scrolling region: `min-h-0 flex-1 overflow-y-auto`.
 *   - The footer (Tühista/Salvesta) is a true flex item (`flex-shrink-0`),
 *     no longer `sticky` — it can never be scrolled under or overlapped.
 *   - LinkedItemsPanel moved from being a separate sibling between the body
 *     and footer into the scrollable body itself, so there is exactly one
 *     scrolling region, never two nested/independent ones.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here. habitsAppearanceSimplification.test.ts continues to
 * cover the category/icon/color behavior this change does not touch.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsModalLayout.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')

/** The Add/Edit Habit dialog's own <div role="dialog" ...> opening tag. */
function extractDialogTag(): string {
  const match = SRC.match(/<div\s*\n\s*role="dialog"\s*\n\s*aria-modal="true"\s*\n\s*aria-labelledby="habit-modal-title"\s*\n\s*className="[^"]*"/)
  expect(match).not.toBeNull()
  return match![0]
}

/** The whole Create/Edit modal JSX block, from its wrapping `{modalOpen && (` to the matching close. */
function extractModalBlock(): string {
  const start = SRC.indexOf('{/* Create/Edit modal */}')
  const end = SRC.indexOf('{/* Manage modal */}')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('the dialog is viewport-bounded', () => {
  it('the dialog has a responsive max-height based on 100dvh', () => {
    const dialogTag = extractDialogTag()
    expect(dialogTag).toMatch(/max-h-\[90dvh\]/)
  })

  it('the outer dialog is a flex column that clips its own overflow instead of scrolling itself', () => {
    const dialogTag = extractDialogTag()
    expect(dialogTag).toMatch(/flex flex-col/)
    expect(dialogTag).toMatch(/overflow-hidden/)
    expect(dialogTag).not.toMatch(/overflow-y-auto/)
  })
})

describe('only the body scrolls — no nested or double scrollbars', () => {
  it('exactly one element inside the modal is the scrolling region (min-h-0 + flex-1 + overflow-y-auto together)', () => {
    const modalBlock = extractModalBlock()
    const scrollRegions = modalBlock.match(/className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto[^"]*"/g) ?? []
    expect(scrollRegions).toHaveLength(1)
  })

  it('no other element inside the modal declares its own overflow-y-auto/overflow-auto', () => {
    const modalBlock = extractModalBlock()
    const allOverflowAuto = modalBlock.match(/overflow-y-auto|overflow-auto/g) ?? []
    expect(allOverflowAuto).toHaveLength(1)
  })
})

describe('header and footer remain fixed within the dialog', () => {
  it('the header is flex-shrink-0 and no longer sticky', () => {
    const header = SRC.match(/<div className="flex items-center justify-between px-5 py-4 border-b border-\[#F4F4F0\][^"]*">/)?.[0] ?? ''
    expect(header).not.toBe('')
    expect(header).toMatch(/flex-shrink-0/)
    expect(header).not.toMatch(/sticky/)
  })

  it('the footer (Tühista/Salvesta) is flex-shrink-0 and no longer sticky', () => {
    const footer = SRC.match(/<div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-\[#F4F4F0\][^"]*">/)?.[0] ?? ''
    expect(footer).not.toBe('')
    expect(footer).toMatch(/flex-shrink-0/)
    expect(footer).not.toMatch(/sticky/)
  })

  it('Save and Cancel are both inside that same fixed footer element', () => {
    const footerBlock = SRC.match(/\{\/\* Footer[\s\S]*?\n {12}<\/div>\n {10}<\/div>\n {8}<\/div>/)?.[0] ?? ''
    expect(footerBlock).toMatch(/\{t\("habits\.modal\.cancel", lang\)\}/)
    expect(footerBlock).toMatch(/\{t\("habits\.modal\.save", lang\)\}/)
    expect(footerBlock).toMatch(/onClick=\{handleCancelForm\}/)
    expect(footerBlock).toMatch(/onClick=\{handleSave\}/)
  })
})

describe('the body has min-h-0 and overflow-y-auto, and is the sole scroll container', () => {
  it('the form body div declares min-h-0, flex-1, and overflow-y-auto together', () => {
    expect(SRC).toMatch(/className="px-5 py-4 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto"/)
  })

  it('this is the same body div that previously only had "flex flex-col gap-4" — confirming it is the pre-existing form body, not a new element', () => {
    // The body still opens right after the header and contains the Name field first.
    const afterHeader = SRC.slice(SRC.indexOf('Form body'), SRC.indexOf('Form body') + 400)
    expect(afterHeader).toMatch(/habit-modal-input/)
  })
})

describe('recurrence and custom weekdays remain inside the scrollable body', () => {
  it('the Recurrence section and the custom-weekday buttons are nested inside the scrollable body div, before its closing tag', () => {
    const bodyStart = SRC.indexOf('px-5 py-4 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto')
    const bodyContent = SRC.slice(bodyStart, SRC.indexOf('{/* Footer'))
    expect(bodyContent).toMatch(/habits\.modal\.recurrenceLabel/)
    expect(bodyContent).toMatch(/form\.recurrence === "custom"/)
    expect(bodyContent).toMatch(/WEEK_DAYS\.map\(\(wd, i\) => \(/)
  })

  it('LinkedItemsPanel (edit mode) is also inside the scrollable body now, not a separate sibling between body and footer', () => {
    const bodyStart = SRC.indexOf('px-5 py-4 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto')
    const bodyEnd = SRC.indexOf('{/* Footer')
    const bodyContent = SRC.slice(bodyStart, bodyEnd)
    expect(bodyContent).toMatch(/<LinkedItemsPanel/)
    // Exactly one LinkedItemsPanel usage for this modal (no duplicate).
    const habitModalBlock = extractModalBlock()
    expect((habitModalBlock.match(/<LinkedItemsPanel/g) ?? []).length).toBe(1)
  })
})

describe('appearance controls exist only once — no duplicated form controls, no second modal', () => {
  it('exactly one Icon selector and one Color selector exist in the whole file', () => {
    expect((SRC.match(/\{t\("habits\.modal\.iconLabel", lang\)\}/g) ?? []).length).toBe(1)
    expect((SRC.match(/\{t\("habits\.modal\.colorLabel", lang\)\}/g) ?? []).length).toBe(1)
    expect((SRC.match(/ICON_OPTIONS\.map\(/g) ?? []).length).toBe(1)
    expect((SRC.match(/COLOR_OPTIONS\.map\(/g) ?? []).length).toBe(1)
  })

  it('exactly one Create/Edit habit dialog exists (role="dialog" with this aria-labelledby)', () => {
    expect((SRC.match(/aria-labelledby="habit-modal-title"/g) ?? []).length).toBe(1)
  })

  it('the "Kohanda välimust" toggle button still exists exactly once, unduplicated', () => {
    expect((SRC.match(/setAppearanceExpanded\(\(v\) => !v\)/g) ?? []).length).toBe(1)
  })
})

describe('all existing category-default and customization behavior remains intact (layout-only change)', () => {
  it('handleCategoryChange, CATEGORY_DEFAULTS, and the customized flags are untouched', () => {
    expect(SRC).toMatch(/const handleCategoryChange = \(category: HabitCategory\) => \{/)
    expect(SRC).toMatch(/const CATEGORY_DEFAULTS: Record<HabitCategory/)
    expect(SRC).toMatch(/iconCustomized: boolean;/)
    expect(SRC).toMatch(/colorCustomized: boolean;/)
  })

  it('manual icon/color overrides still set their respective customized flag', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setForm\(\{ \.\.\.form, icon: opt\.id, iconCustomized: true \}\)\}/)
    expect(SRC).toMatch(/setForm\(\{ \.\.\.form, iconColor: c\.color, iconBg: c\.bg, colorCustomized: true \}\)/)
  })

  it('edit-mode appearance preservation (openEditModal reading from the habit, not CATEGORY_DEFAULTS) is untouched', () => {
    const fn = SRC.match(/const openEditModal = \(habit: Habit\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/icon: habit\.icon,/)
    expect(fn).toMatch(/iconColor: habit\.iconColor,/)
    expect(fn).toMatch(/iconBg: habit\.iconBg,/)
  })

  it('goal-per-day, recurrence, save payload, and validation are unchanged', () => {
    expect(SRC).toMatch(/goalPerDay: Math\.max\(1, Number\(e\.target\.value\)\),/)
    expect(SRC).toMatch(/if \(!form\.title\.trim\(\)\) \{/)
    const addCall = SRC.match(/const habit = await addHabit\(\{[\s\S]*?\n {8}\}\);/)?.[0] ?? ''
    expect(addCall).toMatch(/recurrence: form\.recurrence,/)
    expect(addCall).toMatch(/customDays: form\.customDays,/)
  })

  it('Close (X), Escape, Cancel, and Save wiring are unchanged', () => {
    expect(SRC).toMatch(/onClick=\{handleCancelForm\}\s*\n\s*aria-label="Close"/)
    expect(SRC).toMatch(/if \(e\.key === "Escape"\) \{/)
    expect(SRC).toMatch(/onClick=\{handleCancelForm\}\s*\n\s*disabled=\{saving\}/)
    expect(SRC).toMatch(/onClick=\{handleSave\}\s*\n\s*disabled=\{!form\.title\.trim\(\) \|\| saving\}/)
  })

  it('the weekly date strip, filters, and stats are untouched by this layout fix', () => {
    expect(SRC).toMatch(/computeWeekStats\(habits, weekDates, today\)/)
    expect(SRC).toMatch(/const filtered = habits\.filter\(\(h\) => \{/)
    expect(SRC).toMatch(/const longestStreak = habits\.reduce<Habit \| null>/)
  })
})
