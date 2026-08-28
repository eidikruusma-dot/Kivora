/**
 * Regression tests for the Plans module empty-state visual-only improvement,
 * matching the warmer style already used in Goals/Tasks (see
 * goalsEmptyStateEnliven.test.ts / tasksEmptyStateEnliven.test.ts).
 *
 * Change (PlansPage.tsx + translations.ts only — plan templates, the
 * PlanFormModal creation flow, plan detail view, items, progress, editing,
 * deletion, and Firestore-facing store logic are all untouched):
 *   - The plain "no plans" text block became a centered composition: a
 *     larger lavender icon circle with an existing plan/clipboard icon
 *     (ClipboardList, newly imported from lucide-react — no new deps), a
 *     subtle solid lavender-tinted inner surface, refreshed ET/EN copy, and
 *     a compact soft-lavender CTA ("+ Loo plaan" / "+ Create plan").
 *   - The CTA reuses the EXACT same existing flow as the top-right
 *     "+ Loo uus plaan" button: onClick={() => setActiveTab('templates')}.
 *     No new modal, no duplicate creation logic — the same PlanFormModal,
 *     openCreateModal, and addPlan path handle every plan creation.
 *   - The CTA is a native <button> (keyboard accessible by default) and
 *     carries the same focus-visible ring classes already used elsewhere
 *     in this file (the plan cards and template buttons), so it has a
 *     visible focus state consistent with the existing Kivora UI.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component and translations source, consistent
 * with every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansEmptyStateEnliven.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/PlansPage.tsx'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

function extractEmptyStateBlock(): string {
  const start = SRC.indexOf('plans.length === 0 ? (')
  const end = SRC.indexOf(') : (', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('translation keys: refreshed ET/EN empty-state copy', () => {
  it('ET title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.title":\s*"Loo oma esimene plaan"/)
  })

  it('ET supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.desc":\s*"Pane mõtted sammudeks ja vii plaan päriselt ellu\."/)
  })

  it('ET CTA label matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.cta":\s*"Loo plaan"/)
  })

  it('EN title matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.title":\s*"Create your first plan"/)
  })

  it('EN supporting text matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.desc":\s*"Turn your ideas into steps and bring your plan to life\."/)
  })

  it('EN CTA label matches the exact approved copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"plans\.empty\.cta":\s*"Create plan"/)
  })

  it('plans.empty.cta is declared in the TranslationKey union exactly once', () => {
    expect((TRANSLATIONS_SRC.match(/\| "plans\.empty\.cta"/g) ?? []).length).toBe(1)
  })
})

describe('the empty state renders a centered visual composition when there are no plans', () => {
  it('uses a 64px lavender circle with an existing plan/clipboard icon (no new icon dependency)', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/w-16 h-16 rounded-full bg-\[#EDE9FB\]/)
    expect(block).toMatch(/<ClipboardList size=\{28\} className="text-\[#6F5AE8\]"/)
    expect(SRC).toMatch(/import \{ Plus, Loader2, ClipboardList \} from 'lucide-react'/)
  })

  it('renders the heading and supporting text via the refreshed translation keys', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/\{t\('plans\.empty\.title', lang\)\}/)
    expect(block).toMatch(/\{t\('plans\.empty\.desc', lang\)\}/)
  })

  it('sits on a subtle solid lavender-tinted inner surface — no gradient, no new images', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#F8F7FC\]/)
    expect(block).not.toMatch(/gradient/i)
    expect(block).not.toMatch(/<img/)
  })
})

describe('the empty-state CTA reuses the existing plan creation/template flow', () => {
  it('the CTA renders the compact soft-lavender "+ Loo plaan" / "+ Create plan" button', () => {
    const block = extractEmptyStateBlock()
    expect(block).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\] rounded-xl text-sm font-semibold hover:opacity-80/)
    expect(block).toMatch(/<Plus size=\{14\} \/>/)
    expect(block).toMatch(/\{t\('plans\.empty\.cta', lang\)\}/)
  })

  it('the CTA calls the exact same handler as the existing top-right "+ Loo uus plaan" button', () => {
    const block = extractEmptyStateBlock()
    const ctaOnClick = block.match(/onClick=\{\(\) => setActiveTab\('templates'\)\}/)
    expect(ctaOnClick).not.toBeNull()
    // Exactly two call sites share this handler: the top-right button and the new empty-state CTA.
    expect((SRC.match(/onClick=\{\(\) => setActiveTab\('templates'\)\}/g) ?? []).length).toBe(2)
  })

  it('no second modal or duplicate creation logic was introduced', () => {
    expect((SRC.match(/const \[modalOpen, setModalOpen\] = useState\(false\)/g) ?? []).length).toBe(1)
    expect((SRC.match(/function openCreateModal\(template: PlanTemplate \| null\) \{/g) ?? []).length).toBe(1)
    expect((SRC.match(/<PlanFormModal/g) ?? []).length).toBe(1)
  })

  it('the CTA is a native, keyboard-accessible <button> with a visible focus state matching the existing Kivora convention in this file', () => {
    const block = extractEmptyStateBlock()
    const ctaButton = block.match(/<button\s*\n\s*onClick=\{\(\) => setActiveTab\('templates'\)\}\s*\n\s*className="[^"]*"/)
    expect(ctaButton).not.toBeNull()
    expect(ctaButton![0]).toMatch(/focus:outline-none/)
    expect(ctaButton![0]).toMatch(/focus-visible:ring-2 focus-visible:ring-\[#6F5AE8\] focus-visible:ring-offset-2/)
  })
})

describe('the existing top-right "+ Loo uus plaan" button still works, unchanged', () => {
  it('is still present, still switches to the templates tab, and still uses the original plans.create label', () => {
    expect(SRC).toMatch(/\{t\('plans\.create', lang\)\}/)
    const headerButton = SRC.match(/<button\s*\n\s*onClick=\{\(\) => setActiveTab\('templates'\)\}\s*\n\s*className="flex items-center gap-2 px-4 py-2\.5 bg-\[#6F5AE8\] text-white[\s\S]*?<\/button>/)
    expect(headerButton).not.toBeNull()
    expect(headerButton![0]).toMatch(/\{t\('plans\.create', lang\)\}/)
  })
})

describe('everything else on the Plans page is untouched', () => {
  it('both tabs ("Minu plaanid" / "Mallid") are still present, unchanged', () => {
    expect(SRC).toMatch(/id: 'myPlans', labelKey: 'plans\.tab\.myPlans'/)
    expect(SRC).toMatch(/id: 'templates', labelKey: 'plans\.tab\.templates'/)
  })

  it('the templates grid and its own creation entry points are untouched', () => {
    expect(SRC).toMatch(/\{PLAN_TEMPLATES\.map\(\(template\) => \{/)
    expect(SRC).toMatch(/onClick=\{\(\) => openCreateModal\(isBlank \? null : template\)\}/)
  })

  it('the plans list (non-empty state), progress bars, and navigation to plan detail are untouched', () => {
    expect(SRC).toMatch(/\{plans\.map\(\(plan\) => \{/)
    expect(SRC).toMatch(/onClick=\{\(\) => navigate\(`\/app\/plans\/\$\{plan\.id\}`\)\}/)
    expect(SRC).toMatch(/<ProgressBar value=\{percent\} color=\{plan\.color\} \/>/)
  })

  it('plan creation still goes through addPlan with the same Plan shape, unchanged', () => {
    const submitFn = SRC.match(/onSubmit=\{async \(values\) => \{[\s\S]*?\n\s*\}\}/)?.[0] ?? ''
    expect(submitFn).toMatch(/await addPlan\(newPlan\)/)
    expect(submitFn).toMatch(/id: generatePlanId\(\)/)
  })
})
