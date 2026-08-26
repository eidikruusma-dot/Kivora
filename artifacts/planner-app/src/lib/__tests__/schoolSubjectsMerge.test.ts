/**
 * Unit tests for mergeStoredAndLessonSubjects — the pure merge function
 * extracted from useSchoolSubjectsFromLessons (schoolStore.tsx). This is
 * the fix for BUG-03: a real stored SchoolSubject document must appear in
 * every subject picker/list even when zero lessons reference it yet, while
 * legacy lesson-only subjects (no stored document) keep working, and
 * stored/lesson-derived duplicates of the same case-insensitive name
 * collapse to a single entry with the stored subject winning.
 *
 * Pure-function tests only — no Firestore mocking needed here (that's
 * covered separately in schoolSubjectCreate.test.ts).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectsMerge.test.ts
 */

import { describe, it, expect, vi } from 'vitest'

// schoolStore.tsx imports @/lib/firebase and firebase/firestore at module
// scope (for db/collection/doc/etc.) even though this file only exercises
// the pure mergeStoredAndLessonSubjects function — mock them out so
// importing the module doesn't try to initialize a real Firebase app.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { mergeStoredAndLessonSubjects, type SchoolSubject, type SchoolLesson } from '@/lib/schoolStore'

function makeSubject(overrides: Partial<SchoolSubject> = {}): SchoolSubject {
  return {
    id: 'sub-1',
    name: 'Matemaatika',
    color: '#6F5AE8',
    bg: '#EDE9FB',
    icon: null,
    ...overrides,
  }
}

function makeLesson(overrides: Partial<SchoolLesson> = {}): SchoolLesson {
  return {
    id: 'lesson-1',
    subject: 'Matemaatika',
    dotColor: '#6F5AE8',
    cardBg: '#EDE9FB',
    ...overrides,
  }
}

describe('mergeStoredAndLessonSubjects (BUG-03)', () => {
  it('a stored subject with zero lessons still appears (the core bug fix)', () => {
    const stored = makeSubject({ id: 'sub-new', name: 'Bioloogia' })
    const result = mergeStoredAndLessonSubjects([], [stored])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(stored)
  })

  it('a legacy lesson-only subject (no stored document) is preserved', () => {
    const lesson = makeLesson({ subject: 'Ajalugu' })
    const result = mergeStoredAndLessonSubjects([lesson], [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Ajalugu')
    // synthesized, not a real stored id
    expect(result[0].id).toMatch(/^lsub-/)
  })

  it('a stored subject and a lesson-derived subject with the same case-insensitive name collapse to one, stored wins', () => {
    const stored = makeSubject({ id: 'sub-real', name: 'Keemia', color: '#16A34A' })
    const lesson = makeLesson({ subject: 'KEEMIA' }) // different case
    const result = mergeStoredAndLessonSubjects([lesson], [stored])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(stored) // stored subject's data wins verbatim
    expect(result[0].id).toBe('sub-real')
  })

  it('two stored subjects whose names differ only by case collapse to one (no duplicate/ghost)', () => {
    const a = makeSubject({ id: 'sub-a', name: 'Füüsika' })
    const b = makeSubject({ id: 'sub-b', name: 'füüsika ' }) // trailing space + different case
    const result = mergeStoredAndLessonSubjects([], [a, b])
    expect(result).toHaveLength(1)
  })

  it('a lesson matched by subjectId to a stored subject uses the stored subject even if names differ in case', () => {
    const stored = makeSubject({ id: 'sub-x', name: 'Inglise keel' })
    const lesson = makeLesson({ subject: 'INGLISE KEEL', subjectId: 'sub-x' })
    const result = mergeStoredAndLessonSubjects([lesson], [stored])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(stored)
  })

  it('independent subjects (different names) all appear, mixed stored + lesson-only', () => {
    const stored = makeSubject({ id: 'sub-1', name: 'Matemaatika' })
    const lesson1 = makeLesson({ subject: 'Ajalugu' })
    const lesson2 = makeLesson({ subject: 'Kunst' })
    const result = mergeStoredAndLessonSubjects([lesson1, lesson2], [stored])
    const names = result.map((s) => s.name).sort()
    expect(names).toEqual(['Ajalugu', 'Kunst', 'Matemaatika'])
  })

  it('lessons with an empty subject string are skipped, not synthesized as a blank subject', () => {
    const lesson = makeLesson({ subject: '' })
    const result = mergeStoredAndLessonSubjects([lesson], [])
    expect(result).toHaveLength(0)
  })

  it('empty inputs produce an empty list', () => {
    expect(mergeStoredAndLessonSubjects([], [])).toEqual([])
  })
})
