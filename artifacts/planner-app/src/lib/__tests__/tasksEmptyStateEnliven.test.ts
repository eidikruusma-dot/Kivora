/**
 * Regression tests for the Tasks module empty-state visual-only improvement.
 *
 * Change: the large central "no tasks" state on TasksPage.tsx got a larger,
 * warmer lavender icon container, refreshed ET/EN copy, a soft-lavender CTA
 * matching the "Minu päev" dashboard empty-state CTA style, and a subtle
 * solid lavender-tinted inner surface so the center isn't a dead white area.
 * No gradients, generated images, animations, or new assets were introduced.
 * Everything else on the page (header, top "+ Lisa ülesanne" button, tabs/
 * filters, progress card, priority card, personalized-advice card, task
 * creation modal and all task logic) is untouched.
 *
 * No React rendering harness exists in this repo (same precedent as
 * tasksPageResponsive.test.ts), so this is verified structurally against
 * the component and translations source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksEmptyStateEnliven.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const TASKS_PAGE_SRC = readSrc('src/views/TasksPage.tsx')
const TRANSLATIONS_SRC = readSrc('src/lib/translations.ts')

function extractEmptyStateBlock(): string {
  const match = TASKS_PAGE_SRC.match(/filteredTasks\.length === 0 \? \([\s\S]*?\) : \(/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('translation keys: refreshed ET/EN empty-state copy', () => {
  it('ET title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.empty\.title":\s*"Alusta oma päeva esimese ülesandega"/)
  })

  it('ET supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.empty\.body":\s*"Lisa midagi väikest või tähtsat — Kivora aitab sul järge hoida\."/)
  })

  it('EN title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.empty\.title":\s*"Start your day with your first task"/)
  })

  it('EN supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"tasks\.empty\.body":\s*"Add something small or important — Kivora will help you stay on track\."/)
  })

  it('no other consumer of these keys exists — the copy change is scoped to the Tasks empty state', () => {
    const titleOccurrences = (TASKS_PAGE_SRC.match(/t\('tasks\.empty\.title', lang\)/g) ?? []).length
    const bodyOccurrences = (TASKS_PAGE_SRC.match(/t\('tasks\.empty\.body', lang\)/g) ?? []).length
    expect(titleOccurrences).toBe(1)
    expect(bodyOccurrences).toBe(1)
  })
})

describe('the empty-state icon container is larger and warmer (lavender, not neutral gray)', () => {
  it('uses a 64px lavender circle (up from 48px neutral gray) with the existing CheckSquare icon', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/w-16 h-16 rounded-full bg-\[#EDE9FB\]/)
    expect(block).toMatch(/<CheckSquare size=\{28\} className="text-\[#6F5AE8\]"/)
    expect(block).not.toMatch(/bg-\[#F8F7F4\]/)
    expect(block).not.toMatch(/text-\[#94A3B8\]" \/>/) // the old neutral-gray icon color is gone
  })
})

describe('a subtle lavender-tinted inner surface replaces the dead white center', () => {
  it('the empty-state block sits on a solid, subtly tinted surface (no gradient)', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#F8F7FC\]/)
    expect(block).not.toMatch(/gradient/i)
  })
})

describe('the empty-state CTA is soft lavender, matching the dashboard empty-state CTA style', () => {
  it('uses a lavender background with purple text instead of the old solid-purple/white button', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\] rounded-xl text-sm font-semibold hover:opacity-80/)
    expect(block).not.toMatch(/bg-\[#6F5AE8\] text-white/)
  })

  it('the CTA still opens the real Add Task modal via the same setModalOpen(true) handler and AddTaskModal component', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/onClick=\{\(\) => setModalOpen\(true\)\}/)
    expect(TASKS_PAGE_SRC).toMatch(/import AddTaskModal from '@\/components\/tasks\/AddTaskModal'/)
    expect(TASKS_PAGE_SRC).toMatch(/<AddTaskModal open=\{modalOpen\} onClose=\{\(\) => setModalOpen\(false\)\} onSave=\{handleAddTask\} lang=\{lang\} \/>/)
  })

  it('the CTA label still comes from the existing tasks.add translation key (copy unchanged)', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/t\('tasks\.add', lang\)/)
  })
})

describe('no gradients, generated images, animations, or new assets were introduced', () => {
  it('the empty-state block contains no gradient, no <img>, and no animation classes', () => {
    const block = extractEmptyStateBlock()
    expect(block).not.toMatch(/gradient/i)
    expect(block).not.toMatch(/<img/)
    expect(block).not.toMatch(/animate-/)
  })
})

describe('everything else on the Tasks page is untouched', () => {
  it('the top "+ Lisa ülesanne" header button is still present, unchanged action', () => {
    expect(TASKS_PAGE_SRC).toMatch(/setModalOpen\(true\)/)
    expect(TASKS_PAGE_SRC).toMatch(/t\('tasks\.add', lang\)/)
  })

  it('all three filter tabs (all/active/completed) are still present with their counts', () => {
    expect(TASKS_PAGE_SRC).toMatch(/t\('tasks\.filter\.all',\s*lang\)\.replace\('\{n\}', String\(tasks\.length\)\)/)
    expect(TASKS_PAGE_SRC).toMatch(/t\('tasks\.filter\.active',\s*lang\)\.replace\('\{n\}', String\(activeCount\)\)/)
    expect(TASKS_PAGE_SRC).toMatch(/t\('tasks\.filter\.done',\s*lang\)\.replace\('\{n\}', String\(completedCount\)\)/)
  })

  it('the progress card (completion ring) is still present', () => {
    expect(TASKS_PAGE_SRC).toMatch(/t\('tasks\.progress\.title', lang\)/)
    expect(TASKS_PAGE_SRC).toMatch(/const progress\s*=\s*tasks\.length > 0 \? Math\.round\(\(completedCount \/ tasks\.length\) \* 100\) : 0/)
  })

  it('the priority breakdown card is still present', () => {
    expect(TASKS_PAGE_SRC).toMatch(/PRIORITY_CONFIG\[task\.priority\]/)
    expect(TASKS_PAGE_SRC).toMatch(/tasks\.filter\(\(task\) => task\.priority === prio && !task\.completed\)\.length/)
  })

  it('the edit-task modal and automatic-linking wiring are still present, unchanged', () => {
    expect(TASKS_PAGE_SRC).toMatch(/<AddTaskModal open=\{editingTask !== undefined\} onClose=\{closeEdit\} onSave=\{handleEditTask\} initialTask=\{editingTask\} lang=\{lang\} \/>/)
    expect(TASKS_PAGE_SRC).toMatch(/runAutomaticLinking/)
    expect(TASKS_PAGE_SRC).toMatch(/PostSaveLinkSuggestionsDialog/)
  })

  it('the mobile-responsive row layout (BUG-01 fix) is untouched', () => {
    expect(TASKS_PAGE_SRC).not.toMatch(/overflow-x-hidden/)
    expect(TASKS_PAGE_SRC).toMatch(/flex flex-col gap-3 sm:flex-row/)
  })
})
