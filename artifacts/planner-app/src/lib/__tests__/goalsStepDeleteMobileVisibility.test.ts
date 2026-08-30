/**
 * GoalsPage.tsx's goal-step-delete control (inside the Goal Detail modal's
 * step list) used an unconditional `opacity-0 group-hover:opacity-100` —
 * visible only on :hover. Touch devices have no reliable hover, so this
 * button — the only way to remove a mis-added step — was effectively
 * unreachable on phones. TasksPage's row Edit/Delete buttons and
 * NotesPage's action-menu trigger already use the correct mobile-first
 * pattern for the identical situation: visible by default, hover-revealed
 * only at sm: (640px) and up.
 *
 * Fix: the button's className drops the unconditional
 * `opacity-0 group-hover:opacity-100` for
 * `sm:opacity-0 sm:group-hover:opacity-100` — visible by default below
 * sm: (touch-reachable), reverting to the exact original hover-reveal
 * behavior at sm: and up (unchanged desktop appearance). Nothing else
 * changed: the button's onClick (deleteStep), the step checkbox/toggleStep,
 * the step title/done-state styling, step ordering, and everything else on
 * the Goal Detail modal are all untouched.
 *
 * Re-verified visually after the fix: at 320/360/390px the delete (trash)
 * icon is visible without any hover/touch interaction (computed
 * opacity: 1); at 1024px desktop it stays hidden until the step row is
 * hovered (computed opacity: 0 with no hover), matching the original
 * behavior exactly.
 *
 * No React rendering harness exists for GoalsPage.tsx in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the pattern used throughout this codebase's other
 * page-level mobile-responsive regression tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/goalsStepDeleteMobileVisibility.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/GoalsPage.tsx'),
  'utf8',
)

describe('delete action is not hidden by default on mobile', () => {
  it('the step-delete button is visible by default (no unconditional opacity-0)', () => {
    expect(SRC).toMatch(
      /className="sm:opacity-0 sm:group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-\[#94A3B8\] hover:bg-\[#FEE2E2\] hover:text-\[#E11D48\] transition-all"/,
    )
    // the old always-hidden-until-hover button is gone
    expect(SRC).not.toMatch(
      /className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-\[#94A3B8\] hover:bg-\[#FEE2E2\] hover:text-\[#E11D48\] transition-all"/,
    )
  })
})

describe('desktop hover behavior remains', () => {
  it('sm:opacity-0 sm:group-hover:opacity-100 restores the original hover-reveal at sm: and up', () => {
    expect(SRC).toMatch(/sm:opacity-0 sm:group-hover:opacity-100/)
  })
})

describe('the existing delete handler/control is unchanged', () => {
  it('the button still calls deleteStep(detailGoal.id, step.id) and renders the Trash icon', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => deleteStep\(detailGoal\.id, step\.id\)\}/)
    expect(SRC).toMatch(/<Trash size=\{13\} \/>/)
  })
})

describe('unrelated goal-step behavior remains untouched', () => {
  it('the step checkbox/toggleStep behavior is unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => toggleStep\(detailGoal\.id, step\.id\)\}/)
    expect(SRC).toMatch(
      /className=\{`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors \$\{/,
    )
    expect(SRC).toMatch(/\{step\.done && <Check size=\{12\} className="text-white" strokeWidth=\{3\} \/>\}/)
  })

  it('the step title/done-state styling is unchanged', () => {
    expect(SRC).toMatch(
      /className=\{`flex-1 text-sm \$\{step\.done \? 'text-\[#94A3B8\] line-through' : 'text-\[#1A1F36\]'\}`\}/,
    )
    expect(SRC).toMatch(/\{step\.title\}/)
  })

  it('the step row and its wrapper are unchanged (group + hover background, steps.map ordering)', () => {
    expect(SRC).toMatch(
      /className="group flex items-center gap-3 px-3 py-2\.5 rounded-xl hover:bg-\[#F8F7F4\] transition-colors"/,
    )
    expect(SRC).toMatch(/\{detailGoal\.steps\.map\(\(step\) => \(/)
    expect(SRC).toMatch(
      /\{detailGoal\.steps\.filter\(\(s\) => s\.done\)\.length\} \/ \{detailGoal\.steps\.length\}/,
    )
  })
})
