/**
 * Regression tests for the Goals module empty-state visual-only improvement,
 * matching the warmer style already used in Tasks (tasksEmptyStateEnliven
 * .test.ts) and the "Minu päev" dashboard.
 *
 * Change: the "no goals" empty state on GoalsPage.tsx got a larger, warmer
 * lavender icon container (kept the existing Target icon), refreshed ET/EN
 * copy, a soft-lavender CTA matching the Tasks/dashboard empty-state CTA
 * style, and a subtle solid lavender-tinted inner surface instead of a
 * plain white bordered box. No gradients, generated images, or new assets
 * were introduced. The CTA now opens the goal creation modal through the
 * existing openCreateModal handler (the same one the top "+ Lisa eesmärk"
 * button already uses) instead of calling setShowAddModal directly — no
 * second modal or duplicate creation logic was added. Everything else
 * (top button, filters, statistics/right-side cards, goal model, Firestore
 * logic, edit/delete flows) is untouched.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component and translations source, consistent
 * with tasksEmptyStateEnliven.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/goalsEmptyStateEnliven.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const GOALS_PAGE_SRC = readSrc('src/views/GoalsPage.tsx')
const TRANSLATIONS_SRC = readSrc('src/lib/translations.ts')

function extractEmptyStateBlock(): string {
  const match = GOALS_PAGE_SRC.match(/\{filtered\.length === 0 && \([\s\S]*?\n {10}\)\}/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('translation keys: refreshed ET/EN empty-state copy', () => {
  it('ET title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.empty\.title":\s*"Sea oma esimene eesmärk"/)
  })

  it('ET supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.empty\.body":\s*"Alusta väikesest sammust — Kivora aitab sul edenemist jälgida\."/)
  })

  it('EN title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.empty\.title":\s*"Set your first goal"/)
  })

  it('EN supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"goals\.empty\.body":\s*"Start with one small step — Kivora will help you track your progress\."/)
  })

  it('no other consumer of these keys exists — the copy change is scoped to the Goals empty state', () => {
    const titleOccurrences = (GOALS_PAGE_SRC.match(/t\('goals\.empty\.title', lang\)/g) ?? []).length
    const bodyOccurrences = (GOALS_PAGE_SRC.match(/t\('goals\.empty\.body', lang\)/g) ?? []).length
    expect(titleOccurrences).toBe(1)
    expect(bodyOccurrences).toBe(1)
  })
})

describe('the empty-state icon container is larger and warmer (lavender, not neutral gray), same Target icon', () => {
  it('uses a 64px lavender circle (up from 48px neutral gray) with the existing Target icon', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/w-16 h-16 rounded-full bg-\[#EDE9FB\]/)
    expect(block).toMatch(/<Target size=\{28\} className="text-\[#6F5AE8\]"/)
    expect(block).not.toMatch(/w-12 h-12 rounded-full bg-\[#F8F7F4\]/)
    expect(block).not.toMatch(/<Target size=\{20\} className="text-\[#94A3B8\]"/)
  })
})

describe('a subtle solid lavender-tinted inner surface replaces the plain white bordered box', () => {
  it('the empty-state block sits on a solid, subtly tinted surface (no gradient, no border)', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#F8F7FC\]/)
    expect(block).not.toMatch(/gradient/i)
    expect(block).not.toMatch(/bg-white rounded-2xl border border-\[#ECECF2\] flex flex-col items-center/)
  })
})

describe('the empty-state CTA is soft lavender, matching the redesigned Tasks empty-state CTA style', () => {
  it('uses a lavender background with purple text instead of the old solid-purple/white button', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\] rounded-xl text-sm font-semibold hover:opacity-80/)
    expect(block).not.toMatch(/bg-\[#6F5AE8\] text-white rounded-xl text-sm font-medium hover:bg-\[#5B48D8\]/)
  })

  it('the CTA opens the existing goal creation modal via the existing openCreateModal handler — no second/duplicate creation path', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/onClick=\{openCreateModal\}/)
    expect(block).not.toMatch(/onClick=\{\(\) => setShowAddModal\(true\)\}/)
  })

  it('openCreateModal is the same single function the top "+ Lisa eesmärk" header button already uses', () => {
    expect((GOALS_PAGE_SRC.match(/onClick=\{openCreateModal\}/g) ?? []).length).toBe(2) // header button + empty-state CTA
    const fn = GOALS_PAGE_SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/setForm\(emptyForm\)/)
    expect(fn).toMatch(/setFormError\(''\)/)
    expect(fn).toMatch(/setShowAddModal\(true\)/)
  })

  it('the CTA label text is unchanged', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/\{lang === 'et' \? 'Lisa eesmärk' : 'Add goal'\}/)
  })
})

describe('no gradients, generated images, or new assets were introduced', () => {
  it('the empty-state block contains no gradient and no <img>', () => {
    const block = extractEmptyStateBlock()
    expect(block).not.toMatch(/gradient/i)
    expect(block).not.toMatch(/<img/)
  })
})

describe('everything else on the Goals page is untouched', () => {
  it('the top "+ Lisa eesmärk" header button is still present with its own unchanged action', () => {
    expect(GOALS_PAGE_SRC).toMatch(/const \[showAddModal, setShowAddModal\] = useState\(false\)/)
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.add', lang\)/)
  })

  it('all four filter tabs (all/active/paused/completed) are still present with their counts, unchanged', () => {
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.filter\.all',\s*lang\)\.replace\('\{n\}', String\(goals\.length\)\)/)
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.filter\.active',\s*lang\)\.replace\('\{active\}', String\(activeCount\)\)/)
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.filter\.paused',\s*lang\)\.replace\('\{n\}', String\(pausedCount\)\)/)
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.filter\.done',\s*lang\)\.replace\('\{n\}', String\(completedCount\)\)/)
  })

  it('the right-side statistics/summary cards are still present, unchanged', () => {
    const rightCards = (GOALS_PAGE_SRC.match(/bg-white rounded-2xl border border-\[#ECECF2\] p-5/g) ?? []).length
    expect(rightCards).toBeGreaterThanOrEqual(4)
  })

  it('the goal model, Firestore-facing store actions, and edit/delete flows are untouched', () => {
    expect(GOALS_PAGE_SRC).toMatch(/import \{ useGoals, useGoalsLoading, addGoal, updateGoal, deleteGoal as deleteGoalStore, toggleStep, addStep, deleteStep \} from '@\/lib\/goalsStore'/)
    expect(GOALS_PAGE_SRC).toMatch(/const handleAddGoal = async \(\) => \{/)
    expect(GOALS_PAGE_SRC).toMatch(/setDeleteGoal\(goal\)/)
    expect(GOALS_PAGE_SRC).toMatch(/t\('goals\.menu\.delete', lang\)/)
  })

  it('the goal creation/edit modal itself is untouched — still the same single modal driven by showAddModal', () => {
    expect(GOALS_PAGE_SRC).toMatch(/\{showAddModal && \(/)
    expect((GOALS_PAGE_SRC.match(/const \[showAddModal, setShowAddModal\] = useState/g) ?? []).length).toBe(1)
  })
})
