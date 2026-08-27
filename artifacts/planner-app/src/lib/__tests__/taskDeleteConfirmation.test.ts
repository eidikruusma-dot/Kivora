/**
 * Regression tests for a live Tasks-module safety bug: clicking the row
 * trash icon deleted a task immediately, with no confirmation.
 *
 * Fix: the trash icon now only opens a confirmation dialog (the same
 * hand-rolled dialog pattern already used by HabitsPage.tsx/NotesPage.tsx —
 * local `deleteId` state + an inline modal — reused here, not a new modal
 * system, and not window.confirm). The dialog's Confirm button is the sole
 * caller of the existing `deleteTask` action; Cancel (and the backdrop)
 * just clears `deleteId` without calling it. No second delete button was
 * added to AddTaskModal — the existing row trash icon is unchanged.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/taskDeleteConfirmation.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/TasksPage.tsx'), 'utf8')
const ADD_TASK_MODAL_SRC = readFileSync(resolve(process.cwd(), 'src/components/tasks/AddTaskModal.tsx'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

describe('the row trash icon opens the confirmation dialog instead of deleting immediately', () => {
  it('the trash button now calls setDeleteId, not deleteTask, directly', () => {
    const trashButton = SRC.match(/onClick=\{\(\) => setDeleteId\(task\.id\)\}[\s\S]{0,650}/)?.[0] ?? ''
    expect(trashButton).not.toBe('')
    expect(trashButton).toMatch(/aria-label=\{t\('tasks\.action\.delete', lang\)\}/)
    // Same icon, same button — only the click target changed.
    expect(trashButton).toMatch(/M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2/)
  })

  it('no remaining call site invokes deleteTask directly from a row click', () => {
    expect(SRC).not.toMatch(/onClick=\{\(\) => deleteTask\(task\.id\)\}/)
  })

  it('no second delete control was added to AddTaskModal — it has no deleteTask/onDelete of its own', () => {
    expect(ADD_TASK_MODAL_SRC).not.toMatch(/deleteTask|onDelete/)
  })
})

describe('the existing confirmation-dialog pattern is reused, not a new system or window.confirm', () => {
  it('uses the same hand-rolled dialog structure as HabitsPage/NotesPage (local deleteId state + inline modal)', () => {
    expect(SRC).toMatch(/const \[deleteId, setDeleteId\] = useState<string \| null>\(null\)/)
    expect(SRC).toMatch(/\{deleteId && \(/)
    expect(SRC).toMatch(/role="dialog"/)
    expect(SRC).toMatch(/aria-modal="true"/)
  })

  it('does not use window.confirm anywhere', () => {
    expect(SRC).not.toMatch(/window\.confirm/)
  })

  it('does not introduce a separate/duplicate modal component for this', () => {
    // No new import of a generic Dialog/AlertDialog/Modal primitive was added.
    expect(SRC).not.toMatch(/from '@\/components\/ui\/(dialog|alert-dialog)'/)
  })
})

describe('ET/EN copy for the confirmation dialog', () => {
  it('ET strings match exactly', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.title":\s*"Kustuta ülesanne\?"/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.body":\s*"Seda toimingut ei saa tagasi võtta\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.cancel":\s*"Tühista"/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.confirm":\s*"Kustuta"/)
  })

  it('EN equivalents exist for every key', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.title":\s*"Delete task\?"/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.body":\s*"This action cannot be undone\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.cancel":\s*"Cancel"/)
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.deleteConfirm\.confirm":\s*"Delete"/)
  })

  it('all four keys are declared in the TranslationKey union', () => {
    for (const key of ['title', 'body', 'confirm', 'cancel']) {
      expect(TRANSLATIONS_SRC).toMatch(new RegExp(`\\| "tasks\\.deleteConfirm\\.${key}"`))
    }
  })
})

describe('cancel leaves the task untouched', () => {
  it('the Cancel button only clears deleteId — it never calls deleteTask', () => {
    const cancelButton = SRC.match(/onClick=\{\(\) => setDeleteId\(null\)\}\s*\n\s*disabled=\{deleting\}[\s\S]{0,200}tasks\.deleteConfirm\.cancel/)?.[0] ?? ''
    expect(cancelButton).not.toBe('')
    expect(cancelButton).not.toMatch(/deleteTask/)
  })

  it('clicking the backdrop also just closes the dialog, not a delete', () => {
    const backdropBlock = SRC.match(/style=\{\{ background: 'rgba\(15, 23, 42, 0\.4\)' \}\}[\s\S]{0,100}/)?.[0] ?? ''
    expect(backdropBlock).toMatch(/setDeleteId\(null\)/)
    expect(backdropBlock).not.toMatch(/deleteTask/)
  })
})

describe('confirm calls the existing deletion action exactly once, and repeated clicks cannot double-delete', () => {
  it('handleConfirmDelete calls deleteTask (the existing, unchanged action) exactly once', () => {
    const fn = SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    const calls = (fn.match(/deleteTask\(/g) ?? []).length
    expect(calls).toBe(1)
    expect(fn).toMatch(/await deleteTask\(deleteId\)/)
  })

  it('handleConfirmDelete guards re-entrancy with the deleting flag before doing anything else', () => {
    const fn = SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/if \(!deleteId \|\| deleting\) return/)
    expect(fn).toMatch(/setDeleting\(true\)/)
  })

  it('the Confirm button is disabled while a delete is in flight, preventing a second click', () => {
    const confirmButton = SRC.match(/onClick=\{handleConfirmDelete\}[\s\S]{0,200}/)?.[0] ?? ''
    expect(confirmButton).toMatch(/disabled=\{deleting\}/)
  })

  it('the dialog closes (deleteId cleared) only after the delete settles, in a finally block', () => {
    const fn = SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/finally \{[\s\S]*?setDeleting\(false\)[\s\S]*?setDeleteId\(null\)[\s\S]*?\}/)
  })
})

describe('failure leaves the task visible and shows the existing generic error toast', () => {
  it('deleteTask (unchanged) still awaits the store call and shows the existing failure toast on rejection', () => {
    const fn = SRC.match(/const deleteTask = async \(id: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/await storeDeleteTask\(id\)/)
    expect(fn).toMatch(/catch \{/)
    expect(fn).toMatch(/toast\.error\(lang === 'et' \? 'Ülesande kustutamine ebaõnnestus' : 'Failed to delete task'\)/)
  })

  it('a rejection from deleteTask does not throw out of handleConfirmDelete (deleteTask swallows its own error)', () => {
    // deleteTask's try/catch means it never rejects; nothing in
    // handleConfirmDelete assumes/needs a throw to keep the task visible —
    // the task simply was never removed from the store on failure.
    const deleteTaskFn = SRC.match(/const deleteTask = async \(id: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(deleteTaskFn).toMatch(/try \{[\s\S]*?\} catch \{/)
  })
})

describe('the linked-calendar-event deletion cascade is preserved, unchanged', () => {
  it('deleteTask still delegates to the same storeDeleteTask (tasksStore.ts), whose cascade is untouched', () => {
    expect(SRC).toMatch(/deleteTask as storeDeleteTask/)
    const fn = SRC.match(/const deleteTask = async \(id: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/storeDeleteTask cascades to the task's auto-created calendar event/)
  })
})

describe('unrelated task behavior is untouched by this fix', () => {
  it('creation, editing, completion toggling, all-day handling, and calendar sync are all still wired the same way', () => {
    expect(SRC).toMatch(/const handleAddTask = async \(task: Task\) => \{/)
    expect(SRC).toMatch(/const handleEditTask = async \(task: Task\) => \{/)
    expect(SRC).toMatch(/const toggleTask = \(id: string\) => \{/)
    expect(SRC).toMatch(/syncTaskCalendarEvent\(task\)/)
  })

  it('filters and the row edit button are untouched', () => {
    expect(SRC).toMatch(/const filteredTasks = tasks\.filter\(\(task\) => \{/)
    expect(SRC).toMatch(/onClick=\{\(\) => openEdit\(task\)\}/)
  })
})
