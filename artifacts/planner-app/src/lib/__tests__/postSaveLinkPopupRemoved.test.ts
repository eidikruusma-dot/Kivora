/**
 * Kivora 2.0 — "automaatsete seoste kasutajakogemuse parandamine": adding a
 * task (or any other entity) must never end with a blocking "Leidsin
 * võimalikud seosed" popup that forces the user to pick or skip link
 * suggestions. That popup (PostSaveLinkSuggestionsDialog.tsx) is now
 * deleted entirely and removed from all 7 pages that used to render it.
 *
 * What stays, unchanged:
 *   - runAutomaticLinking() — the silent, high-confidence-only auto-linker
 *     (its own confidence gate is untouched by this change).
 *   - AutoLinkToast — the non-blocking, auto-dismissing toast shown after a
 *     successful silent auto-link.
 *   - SuggestedLinksPanel (reached via LinkedItemsPanel in each entity's
 *     detail/edit view) — still there for a user who wants to review
 *     weaker suggestions later, at their own pace, never forced.
 *
 * These tests read each page's real source file (same technique already
 * used by tasksEmptyStateEnliven.test.ts and friends) rather than mounting
 * the full page, since these pages pull in large amounts of unrelated
 * store/router context — a source check is the right level of test for "is
 * this wiring present/absent", without re-testing runAutomaticLinking's own
 * behavior (covered elsewhere).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const PAGES = [
  { name: 'TasksPage', path: 'src/views/TasksPage.tsx' },
  { name: 'GoalsPage', path: 'src/views/GoalsPage.tsx' },
  { name: 'HabitsPage', path: 'src/views/HabitsPage.tsx' },
  { name: 'NotesPage', path: 'src/views/NotesPage.tsx' },
  { name: 'SchoolPage', path: 'src/views/SchoolPage.tsx' },
  { name: 'CalendarPage', path: 'src/views/CalendarPage.tsx' },
  { name: 'AIAssistantPage', path: 'src/views/AIAssistantPage.tsx' },
] as const

describe('the forced post-save link-suggestions popup is removed from every page that used to show it', () => {
  for (const page of PAGES) {
    const src = readSrc(page.path)

    it(`${page.name}: no PostSaveLinkSuggestionsDialog import, render, or postSave state`, () => {
      expect(src).not.toMatch(/PostSaveLinkSuggestionsDialog/)
      expect(src).not.toMatch(/\bpostSave\b/)
      expect(src).not.toMatch(/setPostSave/)
    })

    it(`${page.name}: runAutomaticLinking and AutoLinkToast wiring are untouched`, () => {
      expect(src).toMatch(/runAutomaticLinking/)
      expect(src).toMatch(/AutoLinkToast/)
    })
  }
})

describe('the deleted component is gone, and nothing else in the app still imports it', () => {
  it('PostSaveLinkSuggestionsDialog.tsx no longer exists on disk', () => {
    expect(() => readSrc('src/components/links/PostSaveLinkSuggestionsDialog.tsx')).toThrow()
  })

  it('no file in src/ imports or mentions PostSaveLinkSuggestionsDialog', () => {
    for (const page of PAGES) {
      expect(readSrc(page.path)).not.toContain('PostSaveLinkSuggestionsDialog')
    }
  })
})

describe('SuggestedLinksPanel remains reachable for later, non-forced review', () => {
  it('AddTaskModal still mounts LinkedItemsPanel (which renders SuggestedLinksPanel) in edit mode', () => {
    const src = readSrc('src/components/tasks/AddTaskModal.tsx')
    expect(src).toMatch(/LinkedItemsPanel/)
  })

  it('SuggestedLinksPanel.tsx itself still exists and is unmodified in its confidence/collapse behavior', () => {
    const src = readSrc('src/components/links/SuggestedLinksPanel.tsx')
    expect(src).toMatch(/sectionOpen/) // collapsed-by-default state, from the earlier confidence-gate work
  })
})
