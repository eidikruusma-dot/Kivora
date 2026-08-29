/**
 * School task detail UX cleanup — make secondary sections (Recommendations /
 * Connected items, rendered together via LinkedItemsPanel) visually more
 * compact by collapsing them behind a "More" disclosure toggle, while core
 * task info, task parts and Web links stay immediately visible.
 *
 * No render harness exists for SchoolPage.tsx in this repo (established
 * throughout this session) — verified via structural regex assertions
 * against the raw source, matching the pattern used by
 * schoolTaskWebLinks.test.ts and others.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskDetailCompactSecondary.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

const DETAIL_BLOCK =
  SCHOOL_PAGE_SRC.match(/function TaskDetailModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
// The JSX render body only — excludes the hook declarations at the top of
// the function (e.g. `const [moreOpen, setMoreOpen] = useState(false)`),
// so "does X render before the moreOpen gate" checks aren't tripped up by
// the state declaration itself mentioning "moreOpen".
const DETAIL_RENDER_BODY = DETAIL_BLOCK.slice(DETAIL_BLOCK.indexOf('return ('))

describe('school.section.more translation', () => {
  it('ET reads "Rohkem"', () => {
    expect(t('school.section.more', 'et')).toBe('Rohkem')
  })
  it('EN reads "More"', () => {
    expect(t('school.section.more', 'en')).toBe('More')
  })
})

describe('TaskDetailModal: Recommendations + Connected items are collapsed by default', () => {
  it('has a moreOpen toggle state, defaulting to false (collapsed)', () => {
    expect(DETAIL_BLOCK).toMatch(/const \[moreOpen, setMoreOpen\] = useState\(false\)/)
  })

  it('LinkedItemsPanel (Recommendations + Connected items) is gated behind moreOpen', () => {
    const linkedPanelIdx = DETAIL_BLOCK.indexOf('<LinkedItemsPanel')
    expect(linkedPanelIdx).toBeGreaterThan(-1)
    const before = DETAIL_BLOCK.slice(0, linkedPanelIdx)
    // The nearest preceding conditional-render gate must be moreOpen, not
    // some unrelated flag — i.e. `{moreOpen && (` appears after the last
    // unrelated closing `)}` before the panel.
    const lastMoreOpenGate = before.lastIndexOf('{moreOpen && (')
    expect(lastMoreOpenGate).toBeGreaterThan(-1)
    // and there is no closing of that gate's block before LinkedItemsPanel
    const betweenGateAndPanel = DETAIL_BLOCK.slice(lastMoreOpenGate, linkedPanelIdx)
    expect(betweenGateAndPanel).not.toMatch(/\n\s*\)\}/)
  })

  it('the toggle button flips moreOpen and shows a rotating chevron', () => {
    expect(DETAIL_BLOCK).toMatch(/onClick=\{\(\) => setMoreOpen\(\(v\) => !v\)\}/)
    expect(DETAIL_BLOCK).toMatch(/ChevronDown[\s\S]{0,200}moreOpen \? "rotate-180" : ""/)
  })

  it('the toggle label uses the shared school.section.more translation key', () => {
    expect(DETAIL_BLOCK).toMatch(/tr\("school\.section\.more", lang\)/)
  })
})

describe('TaskDetailModal: primary content stays immediately visible, not gated by moreOpen', () => {
  it('task parts block renders unconditionally on hasParts, not on moreOpen', () => {
    const partsIdx = DETAIL_RENDER_BODY.indexOf('school.task.parts')
    expect(partsIdx).toBeGreaterThan(-1)
    const before = DETAIL_RENDER_BODY.slice(0, partsIdx)
    expect(before).not.toMatch(/moreOpen/)
  })

  it('web links block renders unconditionally on webLinks.length, not on moreOpen', () => {
    const webLinksIdx = DETAIL_RENDER_BODY.indexOf('webLinks.length > 0 && (')
    expect(webLinksIdx).toBeGreaterThan(-1)
    const before = DETAIL_RENDER_BODY.slice(0, webLinksIdx)
    expect(before).not.toMatch(/moreOpen/)
  })

  it('web links block still appears before the moreOpen disclosure in source order', () => {
    const webLinksIdx = DETAIL_RENDER_BODY.indexOf('webLinks.length > 0 && (')
    const moreGateIdx = DETAIL_RENDER_BODY.indexOf('{moreOpen && (')
    expect(webLinksIdx).toBeGreaterThan(-1)
    expect(moreGateIdx).toBeGreaterThan(webLinksIdx)
  })
})

describe('No data or behavior removed — only visibility deferred behind the toggle', () => {
  it('LinkedItemsPanel is still passed the same props (type, entityId, lang) as before', () => {
    const block = DETAIL_BLOCK.match(/<LinkedItemsPanel[\s\S]*?\/>/)?.[0] ?? ''
    expect(block).toMatch(/type="school"/)
    expect(block).toMatch(/entityId=\{encodeSchoolId\("task", task\.id\)\}/)
    expect(block).toMatch(/lang=\{lang\}/)
  })

  it('the modal max-width from the previous widening change is untouched (not increased further)', () => {
    expect(DETAIL_BLOCK).toMatch(/w-full max-w-md md:max-w-2xl bg-white rounded-2xl shadow-xl/)
  })
})

describe('Scope: other LinkedItemsPanel call sites (exam/subject/lesson modals) are unchanged', () => {
  it('exactly 4 LinkedItemsPanel usages exist in total, and only the task detail one is collapsible', () => {
    const allUses = SCHOOL_PAGE_SRC.match(/<LinkedItemsPanel/g) ?? []
    expect(allUses.length).toBe(4)
    const collapsedUses = SCHOOL_PAGE_SRC.match(/\{moreOpen && \(\s*<div className="mt-2\.5">\s*<LinkedItemsPanel/g) ?? []
    expect(collapsedUses.length).toBe(1)
  })
})
