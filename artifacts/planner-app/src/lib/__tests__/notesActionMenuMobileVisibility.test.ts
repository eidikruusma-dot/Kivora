/**
 * NotesPage.tsx's note-card action menu trigger (the "⋮" MoreHorizontal
 * button that opens Open/Edit/Move/Delete) used an unconditional
 * `opacity-0 group-hover:opacity-100` — visible only on :hover. Touch
 * devices have no reliable hover, so this menu — and with it Delete and
 * Move to folder, which have no other path to reach — was effectively
 * unreachable on phones. TasksPage's row Edit/Delete buttons already use
 * the correct mobile-first pattern for the identical situation: visible by
 * default, hover-revealed only at sm: (640px) and up.
 *
 * Fix: the menu button's className drops the unconditional `opacity-0
 * group-hover:opacity-100` for `sm:opacity-0 sm:group-hover:opacity-100`
 * — visible by default below sm: (touch-reachable), reverting to the
 * exact original hover-reveal behavior at sm: and up (unchanged desktop
 * appearance). Nothing else changed: the button's onClick (toggling
 * menuOpenId/moveMenuId), the star button beside it, the action-menu
 * items (Open/Edit/Move/Delete) and their handlers, the move submenu and
 * FOLDER_OPTIONS, the delete-confirmation flow (setDeleteId), and the
 * card's own click-to-open behavior are all untouched.
 *
 * Re-verified visually after the fix: at 320/360/390px the "⋮" button is
 * visible without any hover/touch interaction (computed opacity: 1); at
 * 1024px desktop it stays hidden until the card is hovered (computed
 * opacity: 0 with no hover), matching the original behavior exactly.
 *
 * No React rendering harness exists for NotesPage.tsx in this repo (see
 * notesCardClickOpen.test.ts, which reads this same file as raw source)
 * — verified via structural regex assertions, matching that established
 * pattern.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/notesActionMenuMobileVisibility.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/NotesPage.tsx'),
  'utf8',
)

describe('note actions are not hidden by default on mobile', () => {
  it('the menu-trigger button is visible by default (no unconditional opacity-0)', () => {
    expect(SRC).toMatch(
      /className="w-7 h-7 rounded-lg flex items-center justify-center text-\[#94A3B8\] hover:bg-\[#F8F7F4\] hover:text-\[#1A1F36\] transition-colors sm:opacity-0 sm:group-hover:opacity-100"/,
    )
    // the old always-hidden-until-hover button is gone
    expect(SRC).not.toMatch(
      /className="w-7 h-7 rounded-lg flex items-center justify-center text-\[#94A3B8\] hover:bg-\[#F8F7F4\] hover:text-\[#1A1F36\] transition-colors opacity-0 group-hover:opacity-100"/,
    )
  })
})

describe('desktop hover behavior remains', () => {
  it('sm:opacity-0 sm:group-hover:opacity-100 restores the original hover-reveal at sm: and up', () => {
    expect(SRC).toMatch(/sm:opacity-0 sm:group-hover:opacity-100/)
  })
})

describe('Delete and Move handlers/controls remain unchanged', () => {
  it('the menu-trigger button keeps its onClick toggling menuOpenId/moveMenuId', () => {
    const menuButtonBlock = SRC.match(
      /<button\s*\n\s*onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*setMenuOpenId\(menuOpenId === note\.id \? null : note\.id\)\s*\n\s*setMoveMenuId\(null\)\s*\n\s*\}\}[\s\S]*?<\/button>/,
    )?.[0] ?? ''
    expect(menuButtonBlock).not.toBe('')
    expect(menuButtonBlock).toMatch(/<MoreHorizontal size=\{15\} \/>/)
  })

  it('Delete sets deleteId and closes the menu, unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*setDeleteId\(note\.id\)\s*\n\s*setMenuOpenId\(null\)\s*\n\s*\}\}/)
    expect(SRC).toMatch(/<Trash2 size=\{14\} \/> \{t\('notes\.menu\.delete', lang\)\}/)
  })

  it('Move to folder opens the move submenu via setMoveMenuId, unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*setMoveMenuId\(note\.id\)\s*\n\s*\}\}/)
    expect(SRC).toMatch(/<FolderInput size=\{14\} \/> \{t\('notes\.menu\.move', lang\)\}/)
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*handleMove\(note\.id, f\)\s*\n\s*\}\}/)
  })

  it('Open and Edit menu items are unchanged', () => {
    expect(SRC).toMatch(/setDetailNote\(note\)\s*\n\s*setMenuOpenId\(null\)/)
    expect(SRC).toMatch(/<Eye size=\{14\} \/> \{t\('notes\.menu\.open', lang\)\}/)
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*openEditModal\(note\)\s*\n\s*\}\}/)
  })
})

describe('unrelated Notes behavior is untouched', () => {
  it('the star/favorite button is unchanged (never had the hover-only issue)', () => {
    expect(SRC).toMatch(
      /className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-\[#F8F7F4\]"/,
    )
    expect(SRC).toMatch(/handleToggleStar\(note\.id\)/)
  })

  it('the card itself keeps its click-to-open and layout classes unchanged', () => {
    expect(SRC).toMatch(
      /className="group bg-white rounded-2xl border border-\[#ECECF2\] p-4 hover:border-\[#6F5AE8\]\/30 hover:shadow-md transition-all cursor-pointer flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-\[#6F5AE8\]\/40"/,
    )
  })

  it('FOLDER_OPTIONS-driven move submenu rendering is unchanged', () => {
    expect(SRC).toMatch(/\{FOLDER_OPTIONS\.map\(\(f\) => \(/)
    expect(SRC).toMatch(/disabled=\{f === note\.folder\}/)
  })
})
