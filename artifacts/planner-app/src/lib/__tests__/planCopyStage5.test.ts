/**
 * Plaanid (Plans) module: "Copy plan".
 *
 * clonePlanForCreation is a pure helper — it never touches Firestore and
 * never mutates the original plan. The actual write only happens when the
 * shared PlanFormModal's onSubmit calls addPlan() with the (possibly
 * user-edited) draft, exactly like creating a blank/template plan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const setDocMock = vi.fn(() => Promise.resolve())
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: vi.fn(() => vi.fn()),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initPlansStore,
  clonePlanForCreation,
  shiftPlanDatesForward,
  addPlan,
  type Plan,
} from '@/lib/plansStore'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-original',
    type: 'workout',
    title: 'Nädala trenn',
    color: '#2563EB',
    items: [
      { id: 'item-1', label: 'Squats', done: true, note: '3x10' },
      { id: 'item-2', label: 'Push-ups', done: false },
    ],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  initPlansStore(null)
  setDocMock.mockClear()
  initPlansStore('user-a')
})

describe('shiftPlanDatesForward: date-only UTC arithmetic', () => {
  it('24–30 Aug becomes 31 Aug–6 Sep', () => {
    expect(shiftPlanDatesForward('2026-08-24', '2026-08-30')).toEqual({
      startDate: '2026-08-31',
      endDate: '2026-09-06',
    })
  })

  it('handles a month boundary mid-range (Jan 28 – Feb 3)', () => {
    // period length = 6 days
    expect(shiftPlanDatesForward('2026-01-28', '2026-02-03')).toEqual({
      startDate: '2026-02-04',
      endDate: '2026-02-10',
    })
  })

  it('handles a year boundary (Dec 28 – Jan 3)', () => {
    expect(shiftPlanDatesForward('2026-12-28', '2027-01-03')).toEqual({
      startDate: '2027-01-04',
      endDate: '2027-01-10',
    })
  })

  it('handles a single-day period', () => {
    expect(shiftPlanDatesForward('2026-08-24', '2026-08-24')).toEqual({
      startDate: '2026-08-25',
      endDate: '2026-08-25',
    })
  })

  it('is stable across a DST transition (EU spring-forward, late March)', () => {
    // 2026-03-27 (Fri) – 2026-03-29 (Sun) spans the EU DST change (2026-03-29).
    expect(shiftPlanDatesForward('2026-03-27', '2026-03-29')).toEqual({
      startDate: '2026-03-30',
      endDate: '2026-04-01',
    })
  })

  it('returns no dates when either side is missing', () => {
    expect(shiftPlanDatesForward('2026-08-24', undefined)).toEqual({})
    expect(shiftPlanDatesForward(undefined, '2026-08-30')).toEqual({})
    expect(shiftPlanDatesForward(undefined, undefined)).toEqual({})
    expect(shiftPlanDatesForward('', '')).toEqual({})
  })
})

describe('clonePlanForCreation', () => {
  it('never mutates the original plan', () => {
    const original = makePlan()
    const snapshot = JSON.parse(JSON.stringify(original))
    clonePlanForCreation(original, 'et')
    expect(original).toEqual(snapshot)
  })

  it('gives the clone a new, unique plan id, distinct from the original', () => {
    const original = makePlan()
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.id).not.toBe(original.id)
    expect(typeof clone.id).toBe('string')
    expect(clone.id.length).toBeGreaterThan(0)
  })

  it('gives every copied item a new id, unique from the originals and from each other', () => {
    const original = makePlan()
    const clone = clonePlanForCreation(original, 'et')
    const originalIds = new Set(original.items.map((i) => i.id))
    const cloneIds = clone.items.map((i) => i.id)
    expect(new Set(cloneIds).size).toBe(cloneIds.length) // unique among themselves
    for (const id of cloneIds) expect(originalIds.has(id)).toBe(false) // unique from originals
  })

  it('preserves item labels and notes', () => {
    const original = makePlan()
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.items.map((i) => i.label)).toEqual(['Squats', 'Push-ups'])
    expect(clone.items[0].note).toBe('3x10')
    expect(clone.items[1].note).toBeUndefined()
  })

  it('resets every copied item to done: false, regardless of the original state', () => {
    const original = makePlan()
    expect(original.items[0].done).toBe(true) // sanity: original has a done item
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.items.every((i) => i.done === false)).toBe(true)
  })

  it('keeps the same type, and gives fresh createdAt/updatedAt', () => {
    const original = makePlan({ type: 'menu', createdAt: 500, updatedAt: 500 })
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.type).toBe('menu')
    expect(clone.createdAt).toBeGreaterThanOrEqual(original.createdAt)
    expect(clone.updatedAt).toBeGreaterThanOrEqual(original.updatedAt)
  })

  it('prefixes the title with the translated "Copy:" label, in both languages', () => {
    const original = makePlan({ title: 'Nädala menüü' })
    expect(clonePlanForCreation(original, 'et').title).toBe('Koopia: Nädala menüü')
    expect(clonePlanForCreation(original, 'en').title).toBe('Copy: Nädala menüü')
  })

  it('shifts dates forward by one period when both are present', () => {
    const original = makePlan({ startDate: '2026-08-24', endDate: '2026-08-30' })
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.startDate).toBe('2026-08-31')
    expect(clone.endDate).toBe('2026-09-06')
  })

  it('leaves dates empty when the original has none', () => {
    const original = makePlan()
    delete original.startDate
    delete original.endDate
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.startDate).toBeUndefined()
    expect(clone.endDate).toBeUndefined()
  })

  it('leaves dates empty when the original only has a partial range', () => {
    const original = makePlan({ startDate: '2026-08-24' })
    const clone = clonePlanForCreation(original, 'et')
    expect(clone.startDate).toBeUndefined()
    expect(clone.endDate).toBeUndefined()
  })
})

describe('no Firestore write happens before the user confirms', () => {
  it('computing the clone (as "Copy plan" does when opening the modal) never calls setDoc', () => {
    const original = makePlan()
    clonePlanForCreation(original, 'et')
    clonePlanForCreation(original, 'en')
    expect(setDocMock).not.toHaveBeenCalled()
  })
})

describe('double submission cannot create two copies', () => {
  it('submitting the same computed draft twice writes to the same document, never two', async () => {
    const original = makePlan()
    const draft = clonePlanForCreation(original, 'et')

    // Simulate two rapid submits of the identical draft (what would happen
    // without PlanFormModal's own saving-state guard, which blocks this at
    // the UI layer before either call is made).
    await Promise.all([addPlan(draft), addPlan(draft)])

    const paths = setDocMock.mock.calls.map((call) => (call[0] as { path: string }).path)
    expect(new Set(paths).size).toBe(1) // both writes target the exact same plan id/path
    expect(setDocMock).toHaveBeenCalledTimes(2)
  })
})
