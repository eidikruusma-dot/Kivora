/**
 * Follow-up to BUG-01 (tasksPageResponsive.test.ts): the prior mobile fix
 * already split the task row into two stacked mobile rows (checkbox+title,
 * then badges+actions) via sm:contents wrappers. But within that second
 * row, `flex-wrap` combined with `ml-auto` on the Edit button alone let the
 * wrap algorithm split Edit and Delete apart on narrow real phones (verified
 * at 320px CSS width with a category badge + a longer priority label like
 * "Keskmine"/"Medium" present): Edit would squeeze onto the badges' line
 * while Delete wrapped alone onto its own orphaned line below, far from its
 * pair — exactly the "actions consume too much horizontal space" /
 * "difficult to read" symptom reported from a real Android phone.
 *
 * Fix: Edit and Delete are now wrapped in one flex sub-container
 * (`flex items-center gap-1 ml-auto sm:ml-0 sm:contents`) so flex-wrap on
 * the row above treats them as a single atomic item — they either both fit
 * on the badges' line or both wrap together to the next one, never split.
 * The wrapper itself dissolves via sm:contents at sm: and up, so its
 * children flatten back into the exact same flat desktop row as before —
 * desktop/tablet layout, hover-reveal, and both buttons' own classes,
 * handlers, and touch-target size are otherwise unchanged.
 *
 * No React rendering harness exists for TasksPage.tsx in this repo (see
 * tasksPageResponsive.test.ts) — verified via structural regex assertions
 * against the raw source, and independently confirmed visually with a
 * Playwright/Chromium render of the actual compiled Tailwind output at
 * 320/360px (orphaned-Delete bug) and 1024px (desktop unchanged) before
 * and after this change.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksRowActionsWrapTogether.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/TasksPage.tsx'), 'utf8')

function badgesRowBlock(): string {
  return SRC.match(/flex flex-wrap items-center gap-2 pl-8 sm:pl-0 sm:contents"[\s\S]*?\n {20}<\/div>\n {18}<\/div>/)?.[0] ?? ''
}

describe('Edit and Delete are grouped so flex-wrap never splits them apart', () => {
  it('Edit and Delete share one wrapper div with ml-auto and sm:contents', () => {
    expect(SRC).toMatch(/<div className="flex items-center gap-1 ml-auto sm:ml-0 sm:contents">/)
  })

  it('ml-auto/sm:ml-0 no longer sit on the Edit button itself (moved to the wrapper)', () => {
    expect(SRC).not.toMatch(/ml-auto sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100/)
  })

  it('the wrapper contains exactly the Edit and Delete buttons, in that order', () => {
    const block = badgesRowBlock()
    expect(block).not.toBe('')
    const wrapperIdx = block.indexOf('<div className="flex items-center gap-1 ml-auto sm:ml-0 sm:contents">')
    const editIdx = block.indexOf('onClick={() => openEdit(task)}')
    const deleteIdx = block.indexOf('onClick={() => setDeleteId(task.id)}')
    expect(wrapperIdx).toBeGreaterThan(-1)
    expect(editIdx).toBeGreaterThan(wrapperIdx)
    expect(deleteIdx).toBeGreaterThan(editIdx)
  })
})

describe('desktop/tablet layout and existing behavior are unchanged', () => {
  it('both action buttons keep their 40x40 touch target and hover-reveal classes', () => {
    const editDeleteButtons = SRC.match(/flex-shrink-0 w-10 h-10 rounded-lg/g) ?? []
    expect(editDeleteButtons.length).toBe(2)
    const hoverReveal = SRC.match(/sm:opacity-0 sm:group-hover:opacity-100/g) ?? []
    expect(hoverReveal.length).toBe(2)
  })

  it('click handlers, aria-labels, and icons for Edit/Delete are unchanged', () => {
    expect(SRC).toMatch(/onClick={\(\) => openEdit\(task\)}/)
    expect(SRC).toMatch(/aria-label={t\('tasks\.action\.edit', lang\)}/)
    expect(SRC).toMatch(/<Pencil size=\{14\} \/>/)
    expect(SRC).toMatch(/onClick={\(\) => setDeleteId\(task\.id\)}/)
    expect(SRC).toMatch(/aria-label={t\('tasks\.action\.delete', lang\)}/)
  })

  it('at least three sm:contents wrappers now exist (checkbox+title, badges+actions, and the new action pair)', () => {
    const contentsCount = (SRC.match(/sm:contents/g) ?? []).length
    expect(contentsCount).toBeGreaterThanOrEqual(3)
  })

  it('completed-task title styling (line-through, muted color) is untouched', () => {
    expect(SRC).toMatch(/task\.completed \? 'text-\[#94A3B8\] line-through' : 'text-\[#1A1F36\]'/)
  })

  it('the checkbox toggle handler and row click-through are untouched', () => {
    expect(SRC).toMatch(/onClick={\(\) => toggleTask\(task\.id\)}/)
  })
})
