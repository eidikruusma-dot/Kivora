/**
 * Regression tests for a Notes-module interaction-consistency bug: clicking
 * a note card did nothing — the note could only be opened via its
 * three-dot menu's "Open" action. Tasks and calendar events already open by
 * clicking the item itself, so Notes now behaves the same way.
 *
 * Fix (NotesPage.tsx only):
 *   - The note card div gained onClick={() => setDetailNote(note)} — the
 *     exact same action the three-dot menu's existing "Open" item already
 *     called (setDetailNote), so no second detail view or duplicate note
 *     logic was introduced.
 *   - The card is now keyboard-accessible: role="button", tabIndex={0}, and
 *     an onKeyDown handler that opens the note on Enter or Space
 *     (preventDefault on Space so the page doesn't also scroll).
 *   - The star button and the three-dot button (and everything inside its
 *     dropdown/move-submenu) already called e.stopPropagation() in their
 *     onClick handlers before this fix — verified below that this is still
 *     true, so clicking them cannot also trigger the new card click.
 *   - The three-dot menu itself, its items, the edit/create modal, the
 *     delete-confirmation modal, filtering, folders, and the store calls
 *     (addNote/updateNote/moveNote/toggleStar/deleteNote) are untouched.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/notesCardClickOpen.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/NotesPage.tsx'), 'utf8')

/** The note card's opening <div ...> tag, from `role="button"` through the closing `>`. */
function extractCardTag(): string {
  const match = SRC.match(/<div\s*\n\s*key=\{note\.id\}[\s\S]*?\n\s*>/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('clicking the note card opens the existing edit/view flow', () => {
  it('the card div now has an onClick that opens the note via setDetailNote', () => {
    const card = extractCardTag()
    expect(card).toMatch(/onClick=\{\(\) => setDetailNote\(note\)\}/)
  })

  it('opening via the card calls the same setDetailNote action the three-dot menu\'s "Open" item already used — no second detail view', () => {
    const openMenuItem = SRC.match(/<Eye size=\{14\} \/> \{t\('notes\.menu\.open', lang\)\}/)
    expect(openMenuItem).not.toBeNull()
    // Both call sites set the same piece of state.
    expect((SRC.match(/setDetailNote\(note\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // Still exactly one detail-view modal block in the whole file.
    expect((SRC.match(/\{detailNote && \(/g) ?? []).length).toBe(1)
  })

  it('no duplicate note-editing logic was introduced — openEditModal/handleSave remain the sole edit path', () => {
    expect((SRC.match(/const openEditModal = /g) ?? []).length).toBe(1)
    expect((SRC.match(/const handleSave = /g) ?? []).length).toBe(1)
  })
})

describe('keyboard accessibility: the card is focusable and opens with Enter or Space', () => {
  it('the card is a focusable, semantically-button element', () => {
    const card = extractCardTag()
    expect(card).toMatch(/role="button"/)
    expect(card).toMatch(/tabIndex=\{0\}/)
  })

  it('Enter and Space both open the note, via a single onKeyDown handler', () => {
    const card = extractCardTag()
    expect(card).toMatch(/onKeyDown=\{/)
    const onKeyDown = SRC.match(/onKeyDown=\{\(e\) => \{[\s\S]*?\n\s*\}\}/)?.[0] ?? ''
    expect(onKeyDown).toMatch(/e\.key === 'Enter' \|\| e\.key === ' '/)
    expect(onKeyDown).toMatch(/setDetailNote\(note\)/)
  })

  it('Space is preventDefault-ed so activating the card never also scrolls the page', () => {
    const onKeyDown = SRC.match(/onKeyDown=\{\(e\) => \{[\s\S]*?\n\s*\}\}/)?.[0] ?? ''
    expect(onKeyDown).toMatch(/e\.preventDefault\(\)/)
  })

  it('the card shows a visible focus ring for keyboard users', () => {
    const card = extractCardTag()
    expect(card).toMatch(/focus-visible:ring/)
  })
})

describe('the star and three-dot actions do not accidentally open the note', () => {
  it('the star button stops propagation before toggling the star', () => {
    const starButton = SRC.match(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*handleToggleStar\(note\.id\)\s*\n\s*\}\}/)
    expect(starButton).not.toBeNull()
  })

  it('the three-dot menu trigger stops propagation before opening the menu', () => {
    const menuTrigger = SRC.match(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*setMenuOpenId\(menuOpenId === note\.id \? null : note\.id\)/)
    expect(menuTrigger).not.toBeNull()
  })

  it('every action inside the open dropdown menu (Open/Edit/Move/Delete) stops propagation', () => {
    const menuBlock = SRC.match(/\{\/\* Action menu \*\/\}[\s\S]*?\{\/\* Move submenu \*\/\}/)?.[0] ?? ''
    const stopPropagationCount = (menuBlock.match(/e\.stopPropagation\(\)/g) ?? []).length
    // Open, Edit, Move-trigger, Delete — 4 buttons in the action menu itself.
    expect(stopPropagationCount).toBeGreaterThanOrEqual(4)
  })

  it('every folder option inside the move submenu also stops propagation', () => {
    const moveSubmenu = SRC.match(/\{\/\* Move submenu \*\/\}[\s\S]*?\n {22}\)\}/)?.[0] ?? ''
    expect(moveSubmenu).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*handleMove\(note\.id, f\)/)
  })
})

describe('existing menu actions still work, unchanged', () => {
  it('the three-dot menu\'s Open/Edit/Move/Delete items still call the same existing actions', () => {
    expect(SRC).toMatch(/setDetailNote\(note\)\s*\n\s*setMenuOpenId\(null\)/) // Open
    expect(SRC).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\)\s*\n\s*openEditModal\(note\)\s*\n\s*\}\}/) // Edit
    expect(SRC).toMatch(/setMoveMenuId\(note\.id\)/) // Move
    expect(SRC).toMatch(/setDeleteId\(note\.id\)\s*\n\s*setMenuOpenId\(null\)/) // Delete
  })

  it('deletion still cleans up EntityLinks via the existing store action, untouched by this fix', () => {
    const fn = SRC.match(/const handleDelete = \(id: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/removeLinksForEntity\('note', id\)/)
    expect(fn).toMatch(/deleteNote\(id\)/)
  })

  it('filtering, folders, and saving are all untouched by this fix', () => {
    expect(SRC).toMatch(/const filteredNotes = notes\.filter\(\(n\) => \{/)
    expect(SRC).toMatch(/const handleMove = \(id: string, folder: NoteFolder\) => \{/)
    expect(SRC).toMatch(/const handleSave = async \(\) => \{/)
    expect(SRC).toMatch(/updateNote\(editingId, \{/)
    expect(SRC).toMatch(/await addNote\(form\.title, form\.content, form\.folder, form\.starred\)/)
  })
})
