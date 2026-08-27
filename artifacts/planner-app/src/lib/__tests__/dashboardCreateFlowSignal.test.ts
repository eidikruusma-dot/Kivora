/**
 * Regression tests for the dashboard "Loo harjumus" / "Sea eesmärk"
 * empty-state CTA fix.
 *
 * Prior defect: HabitsWidget/GoalsWidget's empty-state CTAs (which read
 * "Loo harjumus" / "Sea eesmärk" — an imperative "create/open" verb) only
 * called `navigate('/app/habits')` / `navigate('/app/goals')`, landing the
 * user on the page without opening its creation form. That does not
 * satisfy "a CTA labelled 'Loo'/'Sea' must open the existing creation
 * flow."
 *
 * Fix: the widgets now navigate with an explicit one-time signal
 * (`location.state.openCreate`). HabitsPage/GoalsPage consume that signal
 * in a `useEffect` keyed on `location.key`, call their existing
 * `openCreateModal()` (the exact same function/inline logic the page's own
 * header "Add" button already used — GoalsPage's inline handler was
 * extracted into a named `openCreateModal` so both call sites share one
 * implementation, no duplicate modal/store logic was introduced), and
 * immediately clear the signal via `window.history.replaceState` — the
 * same clear-after-consume technique this codebase already uses for the
 * pre-existing `openId` deep-link signal on both pages — so refresh, Back,
 * or later plain navigation never reopens the modal.
 *
 * No React rendering harness exists in this repo (same precedent as every
 * other structural regression test here), so this is verified structurally
 * against the component/page source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/dashboardCreateFlowSignal.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const HABITS_WIDGET_SRC = readSrc('src/components/dashboard/HabitsWidget.tsx')
const GOALS_WIDGET_SRC = readSrc('src/components/dashboard/GoalsWidget.tsx')
const HABITS_PAGE_SRC = readSrc('src/views/HabitsPage.tsx')
const GOALS_PAGE_SRC = readSrc('src/views/GoalsPage.tsx')

describe('dashboard CTA sends the openCreate navigation signal', () => {
  it('HabitsWidget empty-state CTA navigates to /app/habits with { state: { openCreate: true } }', () => {
    expect(HABITS_WIDGET_SRC).toMatch(
      /onClick=\{\(\) => navigate\('\/app\/habits', \{ state: \{ openCreate: true \} \}\)\}[\s\S]{0,400}t\('dash\.habits\.emptyCta', lang\)/,
    )
  })

  it('GoalsWidget empty-state CTA navigates to /app/goals with { state: { openCreate: true } }', () => {
    expect(GOALS_WIDGET_SRC).toMatch(
      /onClick=\{\(\) => navigate\('\/app\/goals', \{ state: \{ openCreate: true \} \}\)\}[\s\S]{0,400}t\('dash\.goals\.emptyCta', lang\)/,
    )
  })
})

describe('target page opens its existing creation flow from the openCreate signal', () => {
  it('HabitsPage consumes openCreate and calls the same openCreateModal() the header "Add" button uses', () => {
    expect(HABITS_PAGE_SRC).toMatch(
      /const openCreate = \(location\.state as \{ openCreate\?: boolean \} \| null\)\?\.openCreate;\s*\n\s*if \(!openCreate\) return;\s*\n\s*window\.history\.replaceState\([\s\S]*?\);\s*\n\s*openCreateModal\(\);/,
    )
    // The header "Add habit" button calls the very same function — no second implementation.
    expect(HABITS_PAGE_SRC).toMatch(/onClick=\{openCreateModal\}/)
    const openCreateModalDeclCount = (HABITS_PAGE_SRC.match(/const openCreateModal = \(\) => \{/g) ?? []).length
    expect(openCreateModalDeclCount).toBe(1)
  })

  it('GoalsPage consumes openCreate and calls the same openCreateModal() the header "Add" button uses', () => {
    expect(GOALS_PAGE_SRC).toMatch(
      /const openCreate = \(location\.state as \{ openCreate\?: boolean \} \| null\)\?\.openCreate\s*\n\s*if \(!openCreate\) return\s*\n\s*window\.history\.replaceState\([\s\S]*?\)\s*\n\s*openCreateModal\(\)/,
    )
    expect(GOALS_PAGE_SRC).toMatch(/onClick=\{openCreateModal\}/)
    const openCreateModalDeclCount = (GOALS_PAGE_SRC.match(/const openCreateModal = \(\) => \{/g) ?? []).length
    expect(openCreateModalDeclCount).toBe(1)
  })

  it('GoalsWidget openCreateModal performs the exact same three steps the pre-existing header button used (no store/modal duplication)', () => {
    const fn = GOALS_PAGE_SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/setForm\(emptyForm\)/)
    expect(fn).toMatch(/setFormError\(''\)/)
    expect(fn).toMatch(/setShowAddModal\(true\)/)
  })

  it('HabitsPage openCreateModal is unchanged: still resets editingId/form/error and opens the same modal', () => {
    const fn = HABITS_PAGE_SRC.match(/const openCreateModal = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/setEditingId\(null\)/)
    expect(fn).toMatch(/setForm\(EMPTY_FORM\)/)
    expect(fn).toMatch(/setModalOpen\(true\)/)
  })
})

describe('the openCreate signal is consumed only once (cleared from history state before acting)', () => {
  it('HabitsPage clears window.history state before calling openCreateModal, mirroring the pre-existing openId deep-link pattern', () => {
    const effect = HABITS_PAGE_SRC.match(
      /useEffect\(\(\) => \{\s*\n\s*const openCreate[\s\S]*?\n\s*\}, \[location\.key\]\);/,
    )?.[0] ?? ''
    const replaceStateIdx = effect.indexOf('window.history.replaceState')
    const openCreateModalCallIdx = effect.indexOf('openCreateModal();')
    expect(replaceStateIdx).toBeGreaterThan(-1)
    expect(openCreateModalCallIdx).toBeGreaterThan(-1)
    expect(replaceStateIdx).toBeLessThan(openCreateModalCallIdx)
  })

  it('GoalsPage clears window.history state before calling openCreateModal, mirroring the pre-existing openId deep-link pattern', () => {
    const effect = GOALS_PAGE_SRC.match(
      /useEffect\(\(\) => \{\s*\n\s*const openCreate[\s\S]*?\n\s*\}, \[location\.key\]\)/,
    )?.[0] ?? ''
    const replaceStateIdx = effect.indexOf('window.history.replaceState')
    const openCreateModalCallIdx = effect.indexOf('openCreateModal()')
    expect(replaceStateIdx).toBeGreaterThan(-1)
    expect(openCreateModalCallIdx).toBeGreaterThan(-1)
    expect(replaceStateIdx).toBeLessThan(openCreateModalCallIdx)
  })

  it('both effects guard on the presence of the signal, so a location.state without openCreate is a no-op', () => {
    expect(HABITS_PAGE_SRC).toMatch(/if \(!openCreate\) return;/)
    expect(GOALS_PAGE_SRC).toMatch(/if \(!openCreate\) return/)
  })
})

describe('ordinary navigation to Habits/Goals does not auto-open the creation modal', () => {
  it('only two useEffect blocks in HabitsPage read location.state, and neither opens the modal unconditionally', () => {
    const stateReads = [...HABITS_PAGE_SRC.matchAll(/location\.state as \{[^}]*\}/g)]
    // openId (existing deep-link) + openCreate (this fix) — no third, broader read of location.state.
    expect(stateReads.length).toBe(2)
    // The unconditional "reset to default view" effect must not touch modalOpen.
    const resetEffect = HABITS_PAGE_SRC.match(/\/\/ Reset to default view[\s\S]*?\n  \}, \[location\.key\]\);/)?.[0] ?? ''
    expect(resetEffect).not.toMatch(/setModalOpen/)
  })

  it('only two useEffect blocks in GoalsPage read location.state, and neither opens the modal unconditionally', () => {
    const stateReads = [...GOALS_PAGE_SRC.matchAll(/location\.state as \{[^}]*\}/g)]
    expect(stateReads.length).toBe(2)
    const resetEffect = GOALS_PAGE_SRC.match(/\/\/ Reset to default view[\s\S]*?\n  \}, \[location\.key\]\)/)?.[0] ?? ''
    // The reset effect explicitly closes the add modal on every navigation to Goals — it never opens it.
    expect(resetEffect).toMatch(/setShowAddModal\(false\)/)
    expect(resetEffect).not.toMatch(/setShowAddModal\(true\)/)
  })

  it('plain <button>/<Link> navigation elsewhere in the app to /app/habits or /app/goals passes no state (sidebar links are untouched)', () => {
    const navFiles = [
      readSrc('src/components/layout/Sidebar.tsx'),
    ]
    for (const src of navFiles) {
      const habitLinks = [...src.matchAll(/to:\s*['"]\/app\/habits['"]/g)]
      const goalLinks = [...src.matchAll(/to:\s*['"]\/app\/goals['"]/g)]
      expect(habitLinks.length + goalLinks.length).toBeGreaterThan(0)
      expect(src).not.toMatch(/\/app\/habits['"],\s*\{\s*state/)
      expect(src).not.toMatch(/\/app\/goals['"],\s*\{\s*state/)
    }
  })
})
