/**
 * Stage 2 of the Plaanid (Plans) module: plansStore's Firestore lifecycle
 * (init/subscribe/unsubscribe), the blank-plan create flow's guard rails,
 * and derived (never persisted) progress.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initPlansStore,
  addPlan,
  getAllPlans,
  computePlanProgress,
  isValidPlanTitle,
  isValidPlanDateRange,
  type Plan,
} from '@/lib/plansStore'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-test',
    type: 'blank',
    title: 'Synthetic plan',
    color: '#6F5AE8',
    items: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  // Reset the module singleton left over from the previous test, then clear
  // mocks so that reset call itself doesn't pollute this test's assertions.
  initPlansStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
})

describe('plansStore lifecycle (goalsStore pattern)', () => {
  it('subscribes via onSnapshot exactly once for a given uid', () => {
    initPlansStore('user-a')
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })

  it('re-emits the collection into getAllPlans() on snapshot delivery', () => {
    initPlansStore('user-a')
    const onNext = onSnapshotMock.mock.calls[0][1]
    const plan = makePlan({ id: 'p1' })
    onNext({ docs: [{ data: () => plan }] })
    expect(getAllPlans()).toEqual([plan])
  })

  it('unsubscribes the previous listener and clears state on logout', () => {
    initPlansStore('user-a')
    const onNext = onSnapshotMock.mock.calls[0][1]
    onNext({ docs: [{ data: () => makePlan() }] })
    expect(getAllPlans()).toHaveLength(1)

    initPlansStore(null)
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(getAllPlans()).toEqual([])
  })

  it('unsubscribes the previous user\'s listener before subscribing the next user\'s', () => {
    initPlansStore('user-a')
    initPlansStore('user-b')
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(onSnapshotMock).toHaveBeenCalledTimes(2)
  })

  it('is a no-op when called again with the same uid (matches goalsStore)', () => {
    initPlansStore('user-a')
    initPlansStore('user-a')
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })
})

describe('addPlan', () => {
  it('rejects when the store has no authenticated user', async () => {
    initPlansStore(null)
    await expect(addPlan(makePlan())).rejects.toThrow('STORE_NOT_INITIALIZED')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('writes the plan via setDoc once initialized', async () => {
    initPlansStore('user-a')
    const plan = makePlan({ id: 'p2', title: 'My blank plan' })
    await addPlan(plan)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocMock.mock.calls[0][1]).toEqual(plan)
  })
})

describe('computePlanProgress (derived, never stored)', () => {
  it('is 0% for a brand-new plan with no items — matches the "just created" card', () => {
    expect(computePlanProgress(makePlan({ items: [] }))).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('computes percent from done/total items', () => {
    const plan = makePlan({
      items: [
        { id: 'a', label: 'A', done: true },
        { id: 'b', label: 'B', done: false },
        { id: 'c', label: 'C', done: true },
        { id: 'd', label: 'D', done: false },
      ],
    })
    expect(computePlanProgress(plan)).toEqual({ done: 2, total: 4, percent: 50 })
  })

  it('cannot drift from items — recomputing after mutating items changes the result', () => {
    const plan = makePlan({ items: [{ id: 'a', label: 'A', done: false }] })
    expect(computePlanProgress(plan).percent).toBe(0)
    const updated = { ...plan, items: [{ ...plan.items[0], done: true }] }
    expect(computePlanProgress(updated).percent).toBe(100)
  })
})

describe('blank-plan creation validation', () => {
  it('rejects an empty or whitespace-only title', () => {
    expect(isValidPlanTitle('')).toBe(false)
    expect(isValidPlanTitle('   ')).toBe(false)
  })

  it('accepts a non-empty title', () => {
    expect(isValidPlanTitle('Minu plaan')).toBe(true)
  })

  it('accepts a missing start and/or end date', () => {
    expect(isValidPlanDateRange('', '')).toBe(true)
    expect(isValidPlanDateRange('2026-09-01', '')).toBe(true)
    expect(isValidPlanDateRange('', '2026-09-07')).toBe(true)
  })

  it('accepts an end date on or after the start date', () => {
    expect(isValidPlanDateRange('2026-09-01', '2026-09-07')).toBe(true)
    expect(isValidPlanDateRange('2026-09-01', '2026-09-01')).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    expect(isValidPlanDateRange('2026-09-07', '2026-09-01')).toBe(false)
  })
})
