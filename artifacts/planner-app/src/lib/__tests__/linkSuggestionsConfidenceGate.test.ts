/**
 * Regression tests for the stricter automatic-linking confidence gate in
 * linkSuggestions.ts (Kivora's "automaatne seostamine" redesign).
 *
 * Approved behavior being tested:
 *   1. Two generic/filler shared words (WEAK_WORDS) plus a category or date
 *      match must NOT be enough to auto-link — they stay a suggestion.
 *   2. An exact (normalized) title match IS enough to auto-link on its own.
 *   3. The gate is a fixed word list + exact-title check, not a frequency
 *      statistic — it must behave identically with 1, 2, or 3 total items
 *      in the user's data, never treating "this word happens to be rare in
 *      my tiny dataset" as evidence by itself.
 *   4. A task/school source never auto-links to a calendar candidate (to
 *      avoid a duplicate `scheduled` link alongside automaticLinking.ts's
 *      own dedicated calendar-event step) — but the candidate is still
 *      returned as an ordinary, manually-linkable suggestion. Every other
 *      source type can still auto-link to a calendar candidate normally.
 *   5. The "show suggestion" floor is raised (0.20 -> 0.30), filtering out
 *      the very weakest single-generic-word-only matches.
 *   6. Existing task <-> calendar sync (automaticLinking.ts) and link
 *      removability (entityLinksStore.ts) are completely untouched.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/linkSuggestionsConfidenceGate.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Task } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/tasksStore', () => ({ getAllTasks: vi.fn(() => []) }))
vi.mock('@/lib/quickNotesStore', () => ({ getAllNotes: vi.fn(() => []) }))
vi.mock('@/lib/goalsStore', () => ({ getAllGoals: vi.fn(() => []) }))
vi.mock('@/lib/habitsStore', () => ({ getAllHabits: vi.fn(() => []) }))
vi.mock('@/lib/calendarStore', () => ({ getAllEvents: vi.fn(() => []) }))
vi.mock('@/lib/aiConversationsStore', () => ({ getAllChats: vi.fn(() => []) }))
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolTasks: vi.fn(() => []),
  getAllSchoolExams: vi.fn(() => []),
}))
vi.mock('@/lib/entityLinksStore', () => ({ getLinksForEntity: vi.fn(() => []) }))

import { getAllTasks } from '@/lib/tasksStore'
import { getAllEvents } from '@/lib/calendarStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getLinksForEntity } from '@/lib/entityLinksStore'
import { computeSuggestions, computeIsHighConfidence } from '@/lib/linkSuggestions'

interface NoteFixture {
  id: string
  title: string
  preview?: string
  folder?: string
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-x', title: 'Task', completed: false, priority: 'medium',
    ...overrides,
  } as Task
}

function note(overrides: Partial<NoteFixture> = {}): NoteFixture {
  return { id: 'n-x', title: 'Note', ...overrides }
}

function event(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return {
    id: 'e-x', title: 'Event', date: '2026-08-30', startTime: '', endTime: '', color: '#6F5AE8',
    ...overrides,
  } as MockCalendarEvent
}

beforeEach(() => {
  vi.mocked(getAllTasks).mockReturnValue([])
  vi.mocked(getAllEvents).mockReturnValue([])
  vi.mocked(getAllNotes).mockReturnValue([])
  vi.mocked(getLinksForEntity).mockReturnValue([])
})

// ── 1. The core requirement: generic words + category/date is not enough ────

describe('computeIsHighConfidence: two generic shared words + category/date is never enough', () => {
  it('rejects 2 WEAK_WORDS-only shared words even with a very high total score', () => {
    const result = computeIsHighConfidence({
      sharedWords: ['kohtumine', 'homme'], // both in WEAK_WORDS
      totalScore: 0.70, // would have cleared the old 0.65 bar
      srcTitle: 'Kohtumine homme kell 10',
      candidateTitle: 'Homme kohtumine kontoris',
      candidateType: 'note',
      fromType: 'task',
    })
    expect(result).toBe(false)
  })

  it('accepts 2 genuinely specific (non-generic) shared words at the same total score', () => {
    const result = computeIsHighConfidence({
      sharedWords: ['hambaarst', 'tamm'], // specific/rare terms
      totalScore: 0.70,
      srcTitle: 'Hambaarst Tamm visiit',
      candidateTitle: 'Dr Tamm hambaarst',
      candidateType: 'note',
      fromType: 'task',
    })
    expect(result).toBe(true)
  })

  it('rejects when only 1 specific shared word exists, even above 0.65', () => {
    const result = computeIsHighConfidence({
      sharedWords: ['hambaarst'],
      totalScore: 0.77, // e.g. 0.22 overlap + 0.30 category + 0.25 date
      srcTitle: 'Hambaarst visiit',
      candidateTitle: 'Unrelated hambaarst teema',
      candidateType: 'note',
      fromType: 'task',
    })
    expect(result).toBe(false)
  })

  it('a mix of 1 specific + 1 generic shared word is still not enough (needs 2 specific)', () => {
    const result = computeIsHighConfidence({
      sharedWords: ['hambaarst', 'homme'],
      totalScore: 0.70,
      srcTitle: 'Hambaarst homme',
      candidateTitle: 'Homme hambaarst',
      candidateType: 'note',
      fromType: 'task',
    })
    expect(result).toBe(false)
  })
})

// ── 2. Exact title match is independently sufficient ────────────────────────

describe('computeIsHighConfidence: exact title match is sufficient on its own', () => {
  it('accepts an identical title with zero word-overlap score contribution and no category/date', () => {
    const result = computeIsHighConfidence({
      sharedWords: [],
      totalScore: 0, // no overlap/category/date score at all
      srcTitle: 'Hambaarsti visiit',
      candidateTitle: 'Hambaarsti visiit',
      candidateType: 'note',
      fromType: 'task',
    })
    expect(result).toBe(true)
  })

  it('is case- and whitespace-insensitive', () => {
    const result = computeIsHighConfidence({
      sharedWords: [], totalScore: 0,
      srcTitle: '  Hambaarsti Visiit  ', candidateTitle: 'hambaarsti visiit',
      candidateType: 'note', fromType: 'task',
    })
    expect(result).toBe(true)
  })

  it('does not treat a short (<3 char) or empty title as an exact match', () => {
    expect(computeIsHighConfidence({
      sharedWords: [], totalScore: 0, srcTitle: '', candidateTitle: '',
      candidateType: 'note', fromType: 'task',
    })).toBe(false)
  })
})

// ── 3. Sparse-data robustness: identical behavior with 1, 2, 3 total items ──

describe('computeSuggestions: the confidence gate behaves identically regardless of corpus size (1/2/3 items)', () => {
  // A task source is paired against note candidates throughout (the engine
  // never suggests linking a task to another task — unrelated, pre-existing
  // behavior — so cross-type candidates are used to exercise the gate).

  it('with exactly 1 other item in the whole store: 2 shared generic words + same category does NOT auto-link', () => {
    vi.mocked(getAllNotes).mockReturnValue([
      note({ id: 'only-other-note', title: 'Kohtumine homme', folder: 'Töö' }) as never,
    ])
    const results = computeSuggestions(
      'task', 'src-task', 'et', new Set(),
      { title: 'Homme on kohtumine', category: 'Töö' },
    )
    const match = results.find((r) => r.id === 'only-other-note')
    expect(match).toBeTruthy()
    expect(match!.isHighConfidence).toBe(false)
  })

  it('with exactly 2 items in the whole store: an exact-title match auto-links even though the corpus is tiny', () => {
    vi.mocked(getAllNotes).mockReturnValue([
      note({ id: 'exact-match', title: 'Hambaarsti visiit', folder: 'Tervis' }) as never,
      note({ id: 'unrelated', title: 'Autoremont', folder: 'Muu' }) as never,
    ])
    const results = computeSuggestions(
      'task', 'src-task', 'et', new Set(),
      { title: 'Hambaarsti visiit' },
    )
    const match = results.find((r) => r.id === 'exact-match')
    expect(match).toBeTruthy()
    expect(match!.isHighConfidence).toBe(true)
  })

  it('with exactly 3 items in the whole store: 2 specific shared words auto-link; nothing about the tiny corpus changes the outcome', () => {
    vi.mocked(getAllNotes).mockReturnValue([
      note({ id: 'a', title: 'Autoremont homme' }) as never,
      note({ id: 'specific-match', title: 'Hambaarst Tamm visiit', folder: 'Tervis' }) as never,
      note({ id: 'b', title: 'Poodi minek' }) as never,
    ])
    const results = computeSuggestions(
      'task', 'src-task', 'et', new Set(),
      { title: 'Dr Tamm hambaarst kohtumine', category: 'Tervis' },
    )
    const match = results.find((r) => r.id === 'specific-match')
    expect(match).toBeTruthy()
    expect(match!.isHighConfidence).toBe(true)
  })

  it('a single generic shared word alone no longer even appears as a suggestion (raised display floor)', () => {
    vi.mocked(getAllNotes).mockReturnValue([
      note({ id: 'weak-only', title: 'Homme on vaba' }) as never,
    ])
    const results = computeSuggestions(
      'task', 'src-task', 'et', new Set(),
      { title: 'Homme sõidame' },
    )
    expect(results.find((r) => r.id === 'weak-only')).toBeUndefined()
  })
})

// ── 4. Calendar double-link prevention, scoped correctly ────────────────────

describe('computeSuggestions: calendar candidates never auto-link for task/school sources, but stay visible', () => {
  it('a task never gets isHighConfidence=true for a calendar candidate, even on an exact title match', () => {
    vi.mocked(getAllEvents).mockReturnValue([
      event({ id: 'cal-exact', title: 'Hambaarsti visiit', date: '2026-08-30' }),
    ])
    const results = computeSuggestions(
      'task', 'src-task', 'et', new Set(),
      { title: 'Hambaarsti visiit', date: '2026-08-30' },
    )
    const match = results.find((r) => r.id === 'cal-exact')
    // Still returned as an ordinary suggestion — not hidden, just never auto-linked.
    expect(match).toBeTruthy()
    expect(match!.isHighConfidence).toBe(false)
    expect(match!.suggestedRelation).toBe('scheduled')
  })

  it('a school item also never auto-links to a calendar candidate', () => {
    vi.mocked(getAllEvents).mockReturnValue([
      event({ id: 'cal-exact-2', title: 'Matemaatika eksam', date: '2026-09-01' }),
    ])
    const results = computeSuggestions(
      'school', 'src-school:task:1', 'et', new Set(),
      { title: 'Matemaatika eksam', date: '2026-09-01' },
    )
    const match = results.find((r) => r.id === 'cal-exact-2')
    expect(match?.isHighConfidence).toBe(false)
  })

  it('a NOTE source can still auto-link to a calendar candidate normally (guard is scoped to task/school only)', () => {
    vi.mocked(getAllEvents).mockReturnValue([
      event({ id: 'cal-for-note', title: 'Hambaarsti visiit', date: '2026-08-30' }),
    ])
    const results = computeSuggestions(
      'note', 'src-note', 'et', new Set(),
      { title: 'Hambaarsti visiit' },
    )
    const match = results.find((r) => r.id === 'cal-for-note')
    expect(match?.isHighConfidence).toBe(true)
  })
})

// ── 5. Removability / calendar-sync boundaries are untouched ────────────────

describe('scope boundaries: nothing about link removal or calendar sync is touched by this change', () => {
  it('automaticLinking.ts (the calendar-sync module) is not imported by linkSuggestions.ts', () => {
    // linkSuggestions.ts has no CODE dependency on automaticLinking.ts —
    // the two are decoupled; automaticLinking.ts just reads
    // LinkSuggestion.isHighConfidence as a plain boolean. A comment may
    // still mention it by name to explain the calendar-duplicate guard.
    const src = readFileSync(resolve(process.cwd(), 'src/lib/linkSuggestions.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]@\/lib\/automaticLinking['"]/)
  })

  it('entityLinksStore.ts\'s removeLink is not referenced by linkSuggestions.ts (removal stays exclusively in LinkedItemsPanel)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/linkSuggestions.ts'), 'utf8')
    expect(src).not.toMatch(/removeLink/)
  })
})
