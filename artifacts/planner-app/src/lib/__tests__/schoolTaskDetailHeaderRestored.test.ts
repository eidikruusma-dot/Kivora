/**
 * Regression fix — live testing after commit a40ee18 (the task-parts
 * readability fix) showed the School task detail modal's header (title,
 * three-dot menu, close X) had disappeared, with the modal appearing to
 * start directly at the task content.
 *
 * Root cause: TaskDetailModal's outer card had no max-height/overflow
 * containment (unlike TaskEditModal/TaskAddModal, which already use the
 * `flex flex-col max-h-[90vh]` + header `flex-shrink-0` + body
 * `flex-1 overflow-y-auto` + footer `flex-shrink-0` pattern). Once the
 * modal's content grew tall enough (wider modal, taller task-parts rows,
 * web links, the collapsible More section), the fixed, vertically-centered
 * overlay had nowhere to scroll: the top of the card — including the
 * header, since it's the first child — was pushed above the visible
 * viewport with no way to bring it back into view.
 *
 * Fix: adopt the same established containment pattern already used by the
 * other School task modals in this file, so the header stays pinned at the
 * top and only the body scrolls.
 *
 * No render harness exists for SchoolPage.tsx in this repo — verified via
 * structural regex assertions against the raw source, matching the pattern
 * used throughout this session's other School tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskDetailHeaderRestored.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

const DETAIL_BLOCK =
  SCHOOL_PAGE_SRC.match(/function TaskDetailModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''

describe('TaskDetailModal: header (title, menu, close) renders unconditionally at the top', () => {
  it('the header row — title, three-dot menu, close X — appears before the confirmDelete branch and current layout sections', () => {
    const headerIdx = DETAIL_BLOCK.indexOf('tr("school.modal.taskData", lang)')
    const menuIdx = DETAIL_BLOCK.indexOf('<MoreHorizontal')
    const closeXIdx = DETAIL_BLOCK.indexOf('<X size={18} />')
    const confirmDeleteBranchIdx = DETAIL_BLOCK.indexOf('{confirmDelete ? (')
    const partsIdx = DETAIL_BLOCK.indexOf('school.task.parts"')
    const moreOpenGateIdx = DETAIL_BLOCK.indexOf('{moreOpen && (')

    expect(headerIdx).toBeGreaterThan(-1)
    expect(menuIdx).toBeGreaterThan(-1)
    expect(closeXIdx).toBeGreaterThan(-1)
    expect(confirmDeleteBranchIdx).toBeGreaterThan(-1)
    expect(partsIdx).toBeGreaterThan(-1)
    expect(moreOpenGateIdx).toBeGreaterThan(-1)

    // Header (title + menu + close) all appear together, before the
    // confirmDelete/content branch — i.e. it is not nested inside either
    // side of that ternary, so it always renders regardless of state.
    expect(headerIdx).toBeLessThan(menuIdx)
    expect(menuIdx).toBeLessThan(closeXIdx)
    expect(closeXIdx).toBeLessThan(confirmDeleteBranchIdx)
    expect(confirmDeleteBranchIdx).toBeLessThan(partsIdx)
    expect(partsIdx).toBeLessThan(moreOpenGateIdx)
  })

  it('the title uses the unchanged school.modal.taskData key (Ülesande andmed / Task details)', () => {
    expect(DETAIL_BLOCK).toMatch(/<h2 className="text-base font-semibold text-\[#1A1F36\]">\s*\{tr\("school\.modal\.taskData", lang\)\}/)
  })

  it('the three-dot menu button and its onClick toggle are present', () => {
    expect(DETAIL_BLOCK).toMatch(/onClick=\{\(\) => setMenuOpen\(\(v\) => !v\)\}/)
    expect(DETAIL_BLOCK).toMatch(/<MoreHorizontal size=\{18\} \/>/)
  })

  it('the close X button and its onClick={onClose} are present', () => {
    expect(DETAIL_BLOCK).toMatch(/onClick=\{onClose\}[\s\S]{0,200}<X size=\{18\} \/>/)
  })
})

describe('TaskDetailModal: header stays pinned — card is height-contained and only the body scrolls', () => {
  it('the outer card caps its height and lays out header/body/footer as a column, like TaskEditModal/TaskAddModal already do', () => {
    expect(DETAIL_BLOCK).toMatch(/w-full max-w-md md:max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-\[90vh\]/)
  })

  it('the header row does not shrink or scroll away (flex-shrink-0)', () => {
    expect(DETAIL_BLOCK).toMatch(/flex items-center justify-between px-5 py-4 border-b border-\[#ECECF2\] flex-shrink-0/)
  })

  it('the scrollable task-content body is the one that grows/scrolls (flex-1 overflow-y-auto), not the header', () => {
    expect(DETAIL_BLOCK).toMatch(/px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto/)
  })

  it('the confirm-delete panel is also height-contained the same way', () => {
    expect(DETAIL_BLOCK).toMatch(/px-5 py-6 flex-1 overflow-y-auto/)
  })

  it('the footer close button row does not shrink or scroll away (flex-shrink-0)', () => {
    expect(DETAIL_BLOCK).toMatch(/flex items-center justify-end px-5 py-4 border-t border-\[#ECECF2\] flex-shrink-0/)
  })
})

describe('Regression guard: header + task-parts layout + collapsible More section all still coexist', () => {
  it('the readability fix from a40ee18 (items-start row, wrapping text) is preserved alongside the restored header', () => {
    expect(DETAIL_BLOCK).toMatch(/tr\("school\.modal\.taskData", lang\)/)
    expect(DETAIL_BLOCK).toMatch(/flex items-start gap-2\.5 px-3 py-2\.5 rounded-lg/)
    expect(DETAIL_BLOCK).toMatch(/flex-1 min-w-0 text-sm leading-snug break-words/)
  })

  it('the collapsible "More" section from 7d6c946 is preserved alongside the restored header', () => {
    expect(DETAIL_BLOCK).toMatch(/tr\("school\.modal\.taskData", lang\)/)
    expect(DETAIL_BLOCK).toMatch(/const \[moreOpen, setMoreOpen\] = useState\(false\)/)
    expect(DETAIL_BLOCK).toMatch(/tr\("school\.section\.more", lang\)/)
  })

  it('no data/content/action was removed: edit, mark done/undone, delete, and close actions are all still wired', () => {
    expect(DETAIL_BLOCK).toMatch(/onEdit\(task\)/)
    expect(DETAIL_BLOCK).toMatch(/onMarkDone\(task\.id\)/)
    expect(DETAIL_BLOCK).toMatch(/onMarkUndone\(task\.id\)/)
    expect(DETAIL_BLOCK).toMatch(/onDelete\(task\.id\)/)
    expect(DETAIL_BLOCK).toMatch(/onClick=\{onClose\}/)
  })
})

describe('Scope: sibling modals (edit/add) already had this containment pattern and are untouched', () => {
  it('TaskEditModal keeps its own separate, pre-existing max-h-[90vh] card', () => {
    const editBlock = SCHOOL_PAGE_SRC.match(/function TaskEditModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(editBlock).toMatch(/w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-\[90vh\]/)
  })

  it('TaskAddModal keeps its own separate, pre-existing max-h-[90vh] card', () => {
    const addBlock = SCHOOL_PAGE_SRC.match(/function TaskAddModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(addBlock).toMatch(/w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-\[90vh\]/)
  })
})
