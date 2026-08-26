/**
 * Structural regression test for BUG-01 (Tasks page mobile layout).
 *
 * This repo's test infra is vitest with no component-rendering harness
 * (no @testing-library/react, no jsdom layout engine, no Playwright wired
 * into this package) — so real pixel/overflow measurement isn't available
 * here. That verification was instead done out-of-band with a real
 * Chromium (Playwright) render of the exact compiled Tailwind output at
 * 320/375/390/430/1440px, see the implementation report.
 *
 * What *is* checkable at this level, and what this file asserts, is the
 * responsive markup contract the fix relies on: the previously-reported
 * failure mode (header/row rendered as a single non-wrapping flex row with
 * several flex-shrink-0 siblings and no mobile-specific handling) cannot
 * silently return, and the "fix" wasn't a global overflow-x-hidden band-aid.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksPageResponsive.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/TasksPage.tsx'), 'utf8')

describe('TasksPage responsive markup (BUG-01)', () => {
  it('does not band-aid the bug with a blanket overflow-x-hidden', () => {
    expect(SRC).not.toMatch(/overflow-x-hidden/)
  })

  it('the page header stacks vertically on mobile and reverts to a row at sm:', () => {
    // flex-col by default (mobile), sm:flex-row restores the original single-row desktop layout
    expect(SRC).toMatch(/flex flex-col gap-3 sm:flex-row/)
  })

  it('the Add-task button is full-width on mobile and reverts to auto-width at sm: (desktop)', () => {
    expect(SRC).toMatch(/w-full items-center justify-center gap-2[^"]*sm:w-auto/)
  })

  it('the task-card row stacks vertically on mobile and reverts to the original single row at sm:', () => {
    expect(SRC).toMatch(/flex flex-col gap-2 px-4 py-3\.5[^`]*sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4/)
  })

  it('uses display:contents wrappers (sm:contents) so desktop reassembles the exact original flat row', () => {
    // Two contents wrappers: [checkbox+title] and [category?+priority+edit+delete]
    const contentsCount = (SRC.match(/sm:contents/g) ?? []).length
    expect(contentsCount).toBeGreaterThanOrEqual(2)
  })

  it('the task title wraps (break-words) instead of being force-truncated into unreadability', () => {
    expect(SRC).toMatch(/text-sm font-medium break-words/)
  })

  it('metadata chips (category/priority) and actions can wrap onto their own row on mobile', () => {
    expect(SRC).toMatch(/flex flex-wrap items-center gap-2 pl-8 sm:pl-0 sm:contents/)
  })

  it('edit/delete action buttons keep their 40x40 (w-10 h-10) touch target on both mobile and desktop', () => {
    const editDeleteButtons = SRC.match(/flex-shrink-0 w-10 h-10 rounded-lg/g) ?? []
    expect(editDeleteButtons.length).toBe(2)
  })

  it('desktop hover-reveal behavior for edit/delete is unchanged (sm:opacity-0 sm:group-hover:opacity-100)', () => {
    expect(SRC).toMatch(/sm:opacity-0 sm:group-hover:opacity-100/)
  })

  it('AppLayout.tsx was not modified by this fix (scope: TasksPage only)', () => {
    const appLayoutSrc = readFileSync(
      resolve(process.cwd(), 'src/components/layout/AppLayout.tsx'),
      'utf8',
    )
    // The known pre-existing implicit overflow-x:auto on <main> (from
    // overflow-y-auto with no overflow-x set) is left exactly as-is —
    // no overflow-x-hidden, no new wrapper, no structural change here.
    expect(appLayoutSrc).toMatch(/<main key=\{location\.pathname\} className="flex-1 overflow-y-auto kv-page-enter">\{children\}<\/main>/)
    expect(appLayoutSrc).not.toMatch(/overflow-x/)
  })
})
