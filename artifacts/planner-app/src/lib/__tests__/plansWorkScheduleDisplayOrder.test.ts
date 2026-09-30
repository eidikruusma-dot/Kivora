/**
 * Work Schedule shifts must always display chronologically (date ascending,
 * then startTime ascending on the same date) regardless of the order they
 * were added in or are stored in Firestore. sortWorkScheduleItemsForDisplay
 * (plansStore.ts) is a pure, display-only sort — it never mutates its input
 * and never touches persisted data; PlanDetailPage.tsx calls it only when
 * `plan.type === 'workSchedule'`, so every other template's items keep
 * their existing stored/insertion order untouched.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansWorkScheduleDisplayOrder.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  runTransaction: vi.fn(),
}))

import { sortWorkScheduleItemsForDisplay, type PlanItem } from '@/lib/plansStore'

function shift(overrides: Partial<PlanItem> = {}): PlanItem {
  return { id: `shift-${Math.random()}`, label: '', done: false, ...overrides }
}

describe('dates are displayed ascending, regardless of insertion order', () => {
  it('the example from the request: 15.10 → 03.10 → 11.10 → 01.10 becomes 01.10 → 03.10 → 11.10 → 15.10', () => {
    const items = [
      shift({ id: 'a', date: '2026-10-15', startTime: '09:00' }),
      shift({ id: 'b', date: '2026-10-03', startTime: '09:00' }),
      shift({ id: 'c', date: '2026-10-11', startTime: '09:00' }),
      shift({ id: 'd', date: '2026-10-01', startTime: '09:00' }),
    ]

    const sorted = sortWorkScheduleItemsForDisplay(items)

    expect(sorted.map((i) => i.id)).toEqual(['d', 'b', 'c', 'a'])
    expect(sorted.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-11', '2026-10-15'])
  })

  it('does not mutate the original array or its items', () => {
    const items = [shift({ id: 'a', date: '2026-10-15' }), shift({ id: 'b', date: '2026-10-01' })]
    const original = [...items]

    const sorted = sortWorkScheduleItemsForDisplay(items)

    expect(items).toEqual(original) // input array untouched
    expect(sorted).not.toBe(items) // a new array is returned
  })
})

describe('same-date shifts are ordered by startTime ascending', () => {
  it('two shifts on the same date sort by their start time', () => {
    const items = [
      shift({ id: 'late', date: '2026-10-05', startTime: '18:00' }),
      shift({ id: 'early', date: '2026-10-05', startTime: '06:00' }),
      shift({ id: 'mid', date: '2026-10-05', startTime: '12:00' }),
    ]

    const sorted = sortWorkScheduleItemsForDisplay(items)

    expect(sorted.map((i) => i.id)).toEqual(['early', 'mid', 'late'])
  })

  it('date takes priority over startTime — an earlier date with a later start time still comes first', () => {
    const items = [
      shift({ id: 'later-date-earlier-time', date: '2026-10-06', startTime: '05:00' }),
      shift({ id: 'earlier-date-later-time', date: '2026-10-05', startTime: '20:00' }),
    ]

    const sorted = sortWorkScheduleItemsForDisplay(items)

    expect(sorted.map((i) => i.id)).toEqual(['earlier-date-later-time', 'later-date-earlier-time'])
  })
})

describe('insertion order does not affect the resulting display order', () => {
  it('the same set of shifts sorts identically regardless of their original array order', () => {
    const a = shift({ id: 'a', date: '2026-10-01', startTime: '09:00' })
    const b = shift({ id: 'b', date: '2026-10-02', startTime: '09:00' })
    const c = shift({ id: 'c', date: '2026-10-03', startTime: '09:00' })

    const orderOne = sortWorkScheduleItemsForDisplay([c, a, b]).map((i) => i.id)
    const orderTwo = sortWorkScheduleItemsForDisplay([b, c, a]).map((i) => i.id)
    const orderThree = sortWorkScheduleItemsForDisplay([a, b, c]).map((i) => i.id)

    expect(orderOne).toEqual(['a', 'b', 'c'])
    expect(orderTwo).toEqual(['a', 'b', 'c'])
    expect(orderThree).toEqual(['a', 'b', 'c'])
  })
})

describe('missing/invalid date or startTime values are handled safely, never crash', () => {
  it('a shift with no date at all sorts after every dated shift, without throwing', () => {
    const items = [
      shift({ id: 'no-date', startTime: '09:00' }),
      shift({ id: 'dated', date: '2026-10-01', startTime: '09:00' }),
    ]

    expect(() => sortWorkScheduleItemsForDisplay(items)).not.toThrow()
    expect(sortWorkScheduleItemsForDisplay(items).map((i) => i.id)).toEqual(['dated', 'no-date'])
  })

  it('a shift with no startTime sorts after a timed shift on the same date, without throwing', () => {
    const items = [
      shift({ id: 'no-time', date: '2026-10-01' }),
      shift({ id: 'timed', date: '2026-10-01', startTime: '09:00' }),
    ]

    expect(() => sortWorkScheduleItemsForDisplay(items)).not.toThrow()
    expect(sortWorkScheduleItemsForDisplay(items).map((i) => i.id)).toEqual(['timed', 'no-time'])
  })

  it('a completely empty/incomplete shift (mid-add) never throws and lands at the end', () => {
    const items = [
      shift({ id: 'incomplete' }), // no date, no startTime — e.g. a row still being filled in
      shift({ id: 'complete', date: '2026-10-01', startTime: '09:00' }),
    ]

    expect(() => sortWorkScheduleItemsForDisplay(items)).not.toThrow()
    expect(sortWorkScheduleItemsForDisplay(items).map((i) => i.id)).toEqual(['complete', 'incomplete'])
  })

  it('an empty items array is handled safely', () => {
    expect(sortWorkScheduleItemsForDisplay([])).toEqual([])
  })
})

// ── Component wiring: only Work Schedule plans are sorted for display ──────

const PLAN_DETAIL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlanDetailPage.tsx'), 'utf8')

describe('PlanDetailPage wiring: the sort is applied only for Work Schedule, every other Plan type is unaffected', () => {
  it('displayItems only sorts when isWorkScheduleItem is true, otherwise renders plan.items as-is', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(
      /const displayItems = isWorkScheduleItem \? sortWorkScheduleItemsForDisplay\(plan\.items\) : plan\.items/,
    )
  })

  it('the items list renders displayItems, not the raw plan.items array directly', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/\{displayItems\.map\(\(item\) => \{/)
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/\{displayItems\.length === 0 && !addingItem && \(/)
  })
})
