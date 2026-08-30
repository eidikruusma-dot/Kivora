/**
 * School subject-color collision: "Kirjandus" (Literature) and "Ajalugu"
 * (History) resolved to the same palette color.
 *
 * Root cause, confirmed by inspecting classifySubject() (schoolStore.tsx),
 * the single source of truth for both subject-creation UIs' automatic
 * color suggestion:
 *   - "Ajalugu" deterministically matches the 'ajalugu' keyword under the
 *     'humanities_social' category (CATEGORY_KEYWORDS), which maps to
 *     palette index 2 (yellow, #CA8A04) via CATEGORY_COLOR_INDEX.
 *   - "Kirjandus" (bare, without an "Eesti " prefix) matched NO keyword —
 *     the 'estonian' category only listed the phrase 'eesti kirjandus',
 *     not the standalone word 'kirjandus' — so it fell through to
 *     fallbackColorIndex(), a deterministic string hash over the palette.
 *     That hash for "kirjandus" happens to land on index 2 as well —
 *     the exact same yellow as "Ajalugu", by coincidence.
 *
 * Fix: added 'kirjandus' (and 'literature', for the English case) as
 * keywords under the existing 'estonian' category in CATEGORY_KEYWORDS —
 * the same category "Eesti kirjandus" already belonged to. This reuses the
 * existing architecture exactly (SUBJECT_COLOR_PALETTE,
 * CATEGORY_COLOR_INDEX, the keyword-matching algorithm) — no parallel
 * color system, no new palette entries, no changes to any other
 * category's keywords or color index. "Kirjandus" now deterministically
 * gets palette index 3 (red, #DC2626), the same as every other
 * Estonian-language subject, and distinct from "Ajalugu"'s yellow.
 *
 * This fixes the color SUGGESTED for any newly-created "Kirjandus"
 * subject (and any existing one a user re-edits before the color is
 * marked "manually set") in both subject-creation UIs (SchoolPage.tsx's
 * standalone form, ScheduleTab.tsx's inline creator) — both call the same
 * classifySubject() this test exercises directly, so the fix propagates
 * to every place a subject's color is read from its stored
 * color/bg/icon fields (schedule cards, subject rows, task/context
 * badges, detail views, overview) without any further change, since all
 * of those already just render whatever color was stored at creation
 * time — see subjectClassifier.test.ts and subjectColorAutoSuggest.test.ts
 * for the existing coverage of that propagation path.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectKirjandusAjaluguColorCollision.test.ts
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

import { classifySubject, SUBJECT_COLOR_PALETTE } from '@/lib/schoolStore'

describe('Kirjandus no longer collides with Ajalugu', () => {
  it('Kirjandus and Ajalugu get different colors', () => {
    const kirjandus = classifySubject('Kirjandus')
    const ajalugu = classifySubject('Ajalugu')
    expect(kirjandus.color).not.toBe(ajalugu.color)
    expect(kirjandus.colorIndex).not.toBe(ajalugu.colorIndex)
    expect(kirjandus.bg).not.toBe(ajalugu.bg)
  })

  it('Ajalugu keeps its current color (yellow, humanities_social) — untouched by this fix', () => {
    const ajalugu = classifySubject('Ajalugu')
    expect(ajalugu.category).toBe('humanities_social')
    expect(ajalugu.color).toBe('#CA8A04')
  })

  it('Kirjandus gets a clearly different, existing palette color (red, joining the estonian category)', () => {
    const kirjandus = classifySubject('Kirjandus')
    expect(kirjandus.category).toBe('estonian')
    expect(kirjandus.color).toBe('#DC2626')
    expect(SUBJECT_COLOR_PALETTE.map((p) => p.color)).toContain(kirjandus.color)
  })

  it('is case-insensitive and whitespace-stable, matching the existing classifier behavior', () => {
    expect(classifySubject('kirjandus')).toEqual(classifySubject('Kirjandus'))
    expect(classifySubject('  Kirjandus  ')).toEqual(classifySubject('Kirjandus'))
  })

  it('"Eesti kirjandus" and bare "Kirjandus" now agree (both estonian/red) — the fix generalizes the existing phrase keyword', () => {
    expect(classifySubject('Eesti kirjandus').category).toBe(classifySubject('Kirjandus').category)
    expect(classifySubject('Eesti kirjandus').color).toBe(classifySubject('Kirjandus').color)
  })
})

describe('all unrelated subject-color mappings remain unchanged', () => {
  const unaffected: [string, string, string][] = [
    ['Matemaatika', 'mathematics', '#6F5AE8'],
    ['Eesti keel', 'estonian', '#DC2626'],
    ['Inglise keel', 'english', '#2563EB'],
    ['Vene keel', 'other_languages', '#2563EB'],
    ['Füüsika', 'natural_sciences', '#16A34A'],
    ['Ühiskonnaõpetus', 'humanities_social', '#CA8A04'],
    ['Informaatika', 'information_technology', '#2563EB'],
    ['Kunst', 'arts', '#6F5AE8'],
    ['Muusika', 'music', '#6F5AE8'],
    ['Kehaline kasvatus', 'physical_education', '#16A34A'],
    ['Iseseisev õppimine', 'general_study', '#CA8A04'],
  ]

  for (const [name, category, color] of unaffected) {
    it(`"${name}" still classifies as ${category} / ${color}`, () => {
      const result = classifySubject(name)
      expect(result.category).toBe(category)
      expect(result.color).toBe(color)
    })
  }

  it('"Käsitöö" is still not misclassified as estonian/information_technology by the new keyword', () => {
    expect(classifySubject('Käsitöö').category).toBe('arts')
  })

  it('the palette itself (5 colors) is unchanged — no new colors were introduced', () => {
    expect(SUBJECT_COLOR_PALETTE).toEqual([
      { color: '#6F5AE8', bg: '#EDE9FB' },
      { color: '#16A34A', bg: '#DCFCE7' },
      { color: '#CA8A04', bg: '#FEF9C3' },
      { color: '#DC2626', bg: '#FEE2E2' },
      { color: '#2563EB', bg: '#EFF6FF' },
    ])
  })
})
