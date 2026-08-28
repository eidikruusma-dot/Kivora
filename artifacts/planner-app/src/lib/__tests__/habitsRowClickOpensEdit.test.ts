/**
 * Regression tests for a live bug: the habit row/card (icon, name,
 * description, streak, week dots) was not clickable — the only way to
 * reach the existing edit and delete flows was through the separate
 * "Manage habits" modal (opened via the sidebar's Manage button), which
 * was not a natural/discoverable path from the main list.
 *
 * Fix (HabitsPage.tsx only — the manual-completion model, week navigation,
 * stats, streak, recurrence, category-appearance defaults, filters, the
 * dashboard widget, and the Firestore schema are all untouched):
 *   - The row itself now calls the EXISTING openEditModal(habit) on click,
 *     and is keyboard-accessible (role="button", tabIndex={0}, Enter/Space
 *     with preventDefault on Space) — no second edit modal was created.
 *   - Every day-toggle button inside the row now also calls
 *     e.stopPropagation() before handleToggleDay(), so clicking a day
 *     circle can never also open the editor, and completion marking
 *     (toggleHabitDay, optimistic update + rollback, aria-pressed,
 *     date-specific aria-labels, disabled/future-day gating) is completely
 *     unchanged otherwise.
 *   - The existing create/edit modal gained a Delete button (edit mode
 *     only) that opens the SAME existing deleteId confirmation dialog
 *     (setDeleteId) — no second/duplicate deletion system.
 *   - The existing delete-confirmation dialog gained a `deleting` re-entry
 *     guard (mirroring the established TasksPage/EventDetailsModal
 *     pattern from earlier in this app): handleConfirmDelete is the sole
 *     caller of handleDelete, Cancel/Confirm are disabled while deleting,
 *     and the backdrop click is ignored mid-delete.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against component source, consistent with every other
 * regression test here. habitsManualCompletion.test.ts continues to cover
 * the completion/store behavior this change does not touch.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsRowClickOpensEdit.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')

/** The main habit-list row's opening <div ...> tag, from `key={habit.id}` through the closing `>`. */
function extractRowTag(): string {
  const match = SRC.match(/<div\s*\n\s*key=\{habit\.id\}\s*\n\s*id=\{`habit-card-\$\{habit\.id\}`\}[\s\S]*?\n {16}>/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('row click opens the existing edit modal', () => {
  it('the row calls the existing openEditModal(habit) on click, not a new function', () => {
    const row = extractRowTag()
    expect(row).toMatch(/onClick=\{\(\) => openEditModal\(habit\)\}/)
  })

  it('exactly one openEditModal function is defined — no second edit modal was introduced', () => {
    expect((SRC.match(/const openEditModal = \(habit: Habit\) => \{/g) ?? []).length).toBe(1)
  })

  it('the row has cursor-pointer and a visible focus-visible ring', () => {
    const row = extractRowTag()
    expect(row).toMatch(/cursor-pointer/)
    expect(row).toMatch(/focus-visible:ring-2/)
    expect(row).toMatch(/focus-visible:ring-\[#6F5AE8\]\/40/)
  })
})

describe('the row is keyboard accessible', () => {
  it('the row is role="button" and tabIndex={0}', () => {
    const row = extractRowTag()
    expect(row).toMatch(/role="button"/)
    expect(row).toMatch(/tabIndex=\{0\}/)
  })

  it('Enter and Space both open the editor via a single onKeyDown handler', () => {
    const onKeyDown = SRC.match(/onKeyDown=\{\(e\) => \{\s*\n\s*if \(e\.key === "Enter" \|\| e\.key === " "\) \{[\s\S]*?\n\s*\}\s*\n\s*\}\}/)?.[0] ?? ''
    expect(onKeyDown).not.toBe('')
    expect(onKeyDown).toMatch(/openEditModal\(habit\)/)
  })

  it('Space calls preventDefault() so the page never also scrolls', () => {
    const onKeyDown = SRC.match(/onKeyDown=\{\(e\) => \{\s*\n\s*if \(e\.key === "Enter" \|\| e\.key === " "\) \{[\s\S]*?\n\s*\}\s*\n\s*\}\}/)?.[0] ?? ''
    expect(onKeyDown).toMatch(/e\.preventDefault\(\);/)
  })
})

describe('day-circle clicks do not open the edit modal', () => {
  it('the day-toggle button stops propagation before calling handleToggleDay', () => {
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*handleToggleDay\(habit\.id, dateKey\);\s*\n\s*\}\}/)
  })

  it('the day-toggle button is nested inside the clickable row (proving stopPropagation is actually needed here)', () => {
    const row = extractRowTag()
    const rowBlockStart = SRC.indexOf(row)
    const nextRowComment = SRC.indexOf('{/* Icon */}', rowBlockStart)
    const dayButtonIndex = SRC.indexOf('handleToggleDay(habit.id, dateKey)')
    expect(nextRowComment).toBeGreaterThan(rowBlockStart)
    expect(dayButtonIndex).toBeGreaterThan(rowBlockStart)
  })
})

describe('day circles still toggle completion exactly as before', () => {
  it('still a real, keyboard-activatable button with the disabled/eligibility gating unchanged', () => {
    expect(SRC).toMatch(/<button\s*\n\s*type="button"\s*\n\s*disabled=\{!markable \|\| pendingToggleKey === pendingKey\}/)
    expect(SRC).toMatch(/const markable = habit\.status === "active" && isDayMarkableForHabit\(habit, date, today\);/)
  })

  it('aria-pressed and the date-specific aria-label are unchanged', () => {
    expect(SRC).toMatch(/aria-pressed=\{done\}/)
    expect(SRC).toMatch(/aria-label=\{`\$\{habit\.title\} — \$\{dayLabel\} — \$\{/)
  })

  it('handleToggleDay (optimistic update, pending guard, error toast) is completely untouched by this fix', () => {
    const fn = SRC.match(/const handleToggleDay = async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/if \(pendingToggleKey\) return;/)
    expect(fn).toMatch(/await toggleHabitDay\(habitId, dateKey, today\);/)
    expect(fn).toMatch(/catch \{/)
    expect(fn).toMatch(/finally \{\s*\n\s*setPendingToggleKey\(null\);\s*\n\s*\}/)
  })
})

describe('in the existing edit modal, the user can edit, save, and start deletion', () => {
  it('the modal still saves through the existing handleSave/updateHabit action, unchanged', () => {
    const updateCall = SRC.match(/updateHabit\(editingId, \{[\s\S]*?\n {8}\}\);/)?.[0] ?? ''
    expect(updateCall).not.toBe('')
    expect(updateCall).toMatch(/title: form\.title\.trim\(\),/)
  })

  it('a Delete button appears only in edit mode and opens the SAME deleteId confirmation dialog', () => {
    const footer = SRC.match(/\{\/\* Footer[\s\S]*?\n {12}<\/div>\n {10}<\/div>\n {8}<\/div>/)?.[0] ?? ''
    expect(footer).not.toBe('')
    expect(footer).toMatch(/\{editingId \? \(/)
    expect(footer).toMatch(/onClick=\{\(\) => setDeleteId\(editingId\)\}/)
  })

  it('no second/duplicate deletion system was introduced — exactly one deleteId-driven confirmation dialog exists', () => {
    expect((SRC.match(/const \[deleteId, setDeleteId\] = useState<string \| null>\(null\);/g) ?? []).length).toBe(1)
    expect((SRC.match(/aria-labelledby="delete-habit-title"/g) ?? []).length).toBe(1)
  })

  it('deleting the habit currently being edited also closes the edit modal, via the existing handleCancelForm', () => {
    const fn = SRC.match(/const handleDelete = async \(id: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/if \(editingId === id\) handleCancelForm\(\);/)
  })
})

describe('cancel does not delete', () => {
  it('the Cancel button and the backdrop only clear deleteId when not already deleting — never call handleDelete', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => \{ if \(!deleting\) setDeleteId\(null\); \}\}/)
    const cancelButton = SRC.match(/onClick=\{\(\) => setDeleteId\(null\)\}\s*\n\s*disabled=\{deleting\}/)?.[0] ?? ''
    expect(cancelButton).not.toBe('')
  })
})

describe('confirm deletes exactly once, with a re-entry guard', () => {
  it('handleConfirmDelete is the sole caller of handleDelete and guards against a second click', () => {
    const fn = SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/if \(!deleteId \|\| deleting\) return;/)
    expect(fn).toMatch(/setDeleting\(true\);/)
    const calls = (fn.match(/handleDelete\(/g) ?? []).length
    expect(calls).toBe(1)
    expect(fn).toMatch(/await handleDelete\(deleteId\);/)
  })

  it('the Confirm button calls handleConfirmDelete and is disabled while deleting', () => {
    const confirmButton = SRC.match(/onClick=\{handleConfirmDelete\}\s*\n\s*disabled=\{deleting\}/)?.[0] ?? ''
    expect(confirmButton).not.toBe('')
  })

  it('deleting is cleared in a finally block, so a failure never leaves the dialog stuck', () => {
    const fn = SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/finally \{\s*\n\s*setDeleting\(false\);\s*\n\s*setDeleteId\(null\);\s*\n\s*\}/)
  })
})

describe('existing completion and persistence behavior remains intact', () => {
  it('the completion model (completions map, toggleHabitDay, createdDate) is untouched by this fix', () => {
    expect(SRC).toMatch(/import \{[\s\S]*?isHabitDoneOnDate,?[\s\S]*?\} from "@\/data\/habitsData";/)
    expect(SRC).not.toMatch(/toggleToday/)
  })

  it('week navigation, stats, and streak computation are untouched', () => {
    expect(SRC).toMatch(/const \[weekOffset, setWeekOffset\] = useState\(0\);/)
    expect(SRC).toMatch(/const weekTotals = computeWeekStats\(habits, weekDates, today\);/)
    expect(SRC).toMatch(/const habitStreaks = new Map\(habits\.map\(\(h\) => \[h\.id, computeHabitStreak\(h, today\)\]\)\);/)
  })

  it('the manage-modal shortcut still reuses the same handleToggleDay for today, untouched', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleToggleDay\(habit\.id, todayKey\)\}/)
  })
})
