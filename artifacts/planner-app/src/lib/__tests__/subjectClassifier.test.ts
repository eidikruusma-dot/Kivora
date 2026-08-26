/**
 * Unit tests for classifySubject — the one shared, deterministic subject
 * categorizer + automatic-color helper (schoolStore.tsx), reused by both
 * subject-creation UIs (SchoolPage.tsx standalone form, ScheduleTab.tsx
 * inline "Add learning block" creator). Reuses SUBJECT_COLOR_PALETTE — no
 * new color system.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/subjectClassifier.test.ts
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

describe('classifySubject — stability', () => {
  it('"Matemaatika" and "matemaatika" produce the same category and color', () => {
    const a = classifySubject('Matemaatika')
    const b = classifySubject('matemaatika')
    expect(a).toEqual(b)
    expect(a.category).toBe('mathematics')
  })

  it('is stable across surrounding/duplicated whitespace', () => {
    const a = classifySubject('Matemaatika')
    const b = classifySubject('  Matemaatika   ')
    expect(a).toEqual(b)
  })

  it('English maps to a different category and color than Mathematics', () => {
    const math = classifySubject('Matemaatika')
    const eng = classifySubject('Inglise keel')
    expect(eng.category).not.toBe(math.category)
    expect(eng.color).not.toBe(math.color)
    expect(eng.category).toBe('english')
  })

  it('is a pure function: repeated calls with the same input always agree', () => {
    for (const name of ['Füüsika', 'Random Subject Xyz', 'Muusika', '']) {
      const first = classifySubject(name)
      for (let i = 0; i < 5; i++) {
        expect(classifySubject(name)).toEqual(first)
      }
    }
  })
})

describe('classifySubject — documented category → palette color mapping', () => {
  const cases: [string, string, string][] = [
    ['Matemaatika', 'mathematics', '#6F5AE8'],
    ['math', 'mathematics', '#6F5AE8'],
    ['Algebra', 'mathematics', '#6F5AE8'],
    ['Geomeetria', 'mathematics', '#6F5AE8'],
    ['Eesti keel', 'estonian', '#DC2626'],
    ['Eesti kirjandus', 'estonian', '#DC2626'],
    ['Inglise keel', 'english', '#2563EB'],
    ['English', 'english', '#2563EB'],
    ['Vene keel', 'other_languages', '#2563EB'],
    ['Saksa keel', 'other_languages', '#2563EB'],
    ['French', 'other_languages', '#2563EB'],
    ['Füüsika', 'natural_sciences', '#16A34A'],
    ['Bioloogia', 'natural_sciences', '#16A34A'],
    ['Keemia', 'natural_sciences', '#16A34A'],
    ['Loodusõpetus', 'natural_sciences', '#16A34A'],
    ['Geograafia', 'natural_sciences', '#16A34A'],
    ['Ajalugu', 'humanities_social', '#CA8A04'],
    ['Ühiskonnaõpetus', 'humanities_social', '#CA8A04'],
    ['Social studies', 'humanities_social', '#CA8A04'],
    ['Informaatika', 'information_technology', '#2563EB'],
    ['Programmeerimine', 'information_technology', '#2563EB'],
    ['Kunst', 'arts', '#6F5AE8'],
    ['Käsitöö', 'arts', '#6F5AE8'],
    ['Muusika', 'music', '#6F5AE8'],
    ['Music', 'music', '#6F5AE8'],
    ['Kehaline kasvatus', 'physical_education', '#16A34A'],
    ['Sport', 'physical_education', '#16A34A'],
    ['Iseseisev õppimine', 'general_study', '#CA8A04'],
    ['Moodle ülesanne', 'general_study', '#CA8A04'],
    ['Projektitöö', 'general_study', '#CA8A04'],
    ['Homework', 'general_study', '#CA8A04'],
  ]

  for (const [name, category, color] of cases) {
    it(`"${name}" → ${category} / ${color}`, () => {
      const result = classifySubject(name)
      expect(result.category).toBe(category)
      expect(result.color).toBe(color)
      expect(result.bg).toBe(SUBJECT_COLOR_PALETTE[result.colorIndex].bg)
    })
  }

  it('every returned color/bg comes from the existing SUBJECT_COLOR_PALETTE — no new colors are introduced', () => {
    const paletteColors = new Set(SUBJECT_COLOR_PALETTE.map((p) => p.color))
    const paletteBgs = new Set(SUBJECT_COLOR_PALETTE.map((p) => p.bg))
    for (const [name] of cases) {
      const result = classifySubject(name)
      expect(paletteColors.has(result.color)).toBe(true)
      expect(paletteBgs.has(result.bg)).toBe(true)
    }
  })
})

describe('classifySubject — short-keyword false-positive guard', () => {
  it('"Käsitöö" (arts) is not misclassified as information_technology despite containing the letters "it"', () => {
    expect(classifySubject('Käsitöö').category).toBe('arts')
  })

  it('a subject literally named "IT" is classified as information_technology', () => {
    expect(classifySubject('IT').category).toBe('information_technology')
  })
})

describe('classifySubject — unknown subjects (deterministic fallback)', () => {
  it('an unrecognised subject gets category "other"', () => {
    expect(classifySubject('Klaveriõpe').category).toBe('other')
  })

  it('the same unknown subject always gets the same fallback color (stable, not random)', () => {
    const a = classifySubject('Some Totally Unknown Subject')
    const b = classifySubject('Some Totally Unknown Subject')
    const c = classifySubject('some totally unknown subject') // case-insensitive
    expect(a).toEqual(b)
    expect(a).toEqual(c)
  })

  it('the fallback color is one of the existing palette colors, not a new/random value', () => {
    const result = classifySubject('Zzz Unrecognised')
    expect(SUBJECT_COLOR_PALETTE.map((p) => p.color)).toContain(result.color)
  })

  it('different unknown subjects can land on different fallback colors (spread, not one fixed unknown color)', () => {
    const names = ['Klaveriõpe', 'Male', 'Robootika', 'Draama', 'Fotograafia', 'Tsirkus', 'Näitlemine', 'Filmikunst']
    const colors = new Set(names.map((n) => classifySubject(n).colorIndex))
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('classifySubject — name + description (for callers that have a description field)', () => {
  it('a description can supply the classifying keyword when the name alone does not', () => {
    const withoutDescription = classifySubject('Block A')
    const withDescription = classifySubject('Block A', 'Matemaatika harjutused')
    expect(withoutDescription.category).toBe('other')
    expect(withDescription.category).toBe('mathematics')
  })

  it('an empty/omitted description does not affect classification', () => {
    expect(classifySubject('Füüsika')).toEqual(classifySubject('Füüsika', ''))
    expect(classifySubject('Füüsika')).toEqual(classifySubject('Füüsika', undefined))
  })
})
