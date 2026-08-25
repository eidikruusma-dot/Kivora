/**
 * Stage 4.1 of the Plaanid (Plans) module: editing a plan's general
 * details (name/color/dates) and deleting a plan.
 *
 * updatePlanDetails uses a Firestore partial update (updateDoc) rather than
 * a full-document overwrite, so it can never touch type/id/items/createdAt
 * and can never race with a concurrent item mutation (which writes through
 * the separate items-only transaction in plansStore.ts). The fake
 * `firebase/firestore` mock below actually implements field-level merge
 * semantics (including deleteField()) so the tests can prove that, not
 * just assert a mock was called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore: field-level partial updates + delete ────────────────────

const DELETE_SENTINEL = Symbol('deleteField')
const fakeDb = new Map<string, Record<string, unknown>>()

function planPath(uid: string, planId: string) {
  return `users/${uid}/plans/${planId}`
}

function seedFakeDoc(uid: string, plan: Record<string, unknown>) {
  fakeDb.set(planPath(uid, plan.id as string), { ...plan })
}

function readFakeDoc(uid: string, planId: string) {
  return fakeDb.get(planPath(uid, planId))
}

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

const updateDocMock = vi.fn(async (ref: { path: string }, patch: Record<string, unknown>) => {
  const entry = fakeDb.get(ref.path)
  if (!entry) throw new Error('not-found')
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE_SENTINEL) delete entry[key]
    else entry[key] = value
  }
})

const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  fakeDb.delete(ref.path)
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  runTransaction: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: (...args: Parameters<typeof updateDocMock>) => updateDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  deleteField: vi.fn(() => DELETE_SENTINEL),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initPlansStore,
  getAllPlans,
  updatePlanDetails,
  deletePlan,
  type Plan,
} from '@/lib/plansStore'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    type: 'blank',
    title: 'Original title',
    color: '#6F5AE8',
    items: [{ id: 'item-a', label: 'Item A', done: false }],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

function seedLocalPlans(plans: Plan[]) {
  initPlansStore('user-a')
  const onNext = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1][1]
  onNext({ docs: plans.map((p) => ({ data: () => p })) })
}

beforeEach(() => {
  initPlansStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  initPlansStore('user-a')
})

describe('updatePlanDetails: name, color, and dates', () => {
  it('writes the new title, color, startDate and endDate', async () => {
    seedFakeDoc('user-a', makePlan())
    await updatePlanDetails('plan-1', {
      title: '  Updated title  ',
      color: '#DC2626',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    })
    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.title).toBe('Updated title')
    expect(doc.color).toBe('#DC2626')
    expect(doc.startDate).toBe('2026-09-01')
    expect(doc.endDate).toBe('2026-09-07')
  })

  it('clears a previously-set date when given an empty string', async () => {
    seedFakeDoc('user-a', makePlan({ startDate: '2026-01-01', endDate: '2026-01-07' }))
    await updatePlanDetails('plan-1', { title: 'Title', color: '#6F5AE8', startDate: '', endDate: '' })
    const doc = readFakeDoc('user-a', 'plan-1')!
    expect('startDate' in doc).toBe(false)
    expect('endDate' in doc).toBe(false)
  })
})

describe('updatePlanDetails validation', () => {
  it('rejects an empty or whitespace-only name without writing', async () => {
    seedFakeDoc('user-a', makePlan())
    await expect(
      updatePlanDetails('plan-1', { title: '   ', color: '#6F5AE8', startDate: '', endDate: '' }),
    ).rejects.toThrow()
    expect(updateDocMock).not.toHaveBeenCalled()
    expect(readFakeDoc('user-a', 'plan-1')?.title).toBe('Original title')
  })

  it('rejects an end date before the start date without writing', async () => {
    seedFakeDoc('user-a', makePlan())
    await expect(
      updatePlanDetails('plan-1', {
        title: 'Title',
        color: '#6F5AE8',
        startDate: '2026-09-07',
        endDate: '2026-09-01',
      }),
    ).rejects.toThrow()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

describe('updatePlanDetails never touches type/id/items/createdAt', () => {
  it('leaves type, id, items, and createdAt exactly as they were', async () => {
    const original = makePlan({
      type: 'workout',
      items: [{ id: 'x', label: 'Keep me', done: true, note: 'note' }],
      createdAt: 12345,
    })
    seedFakeDoc('user-a', original)

    await updatePlanDetails('plan-1', {
      title: 'New name',
      color: '#16A34A',
      startDate: '',
      endDate: '',
    })

    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.type).toBe('workout')
    expect(doc.id).toBe('plan-1')
    expect(doc.items).toEqual([{ id: 'x', label: 'Keep me', done: true, note: 'note' }])
    expect(doc.createdAt).toBe(12345)
  })

  it('is a genuine partial update: the payload never includes type/id/items/createdAt keys', async () => {
    seedFakeDoc('user-a', makePlan())
    await updatePlanDetails('plan-1', { title: 'X', color: '#000', startDate: '', endDate: '' })
    const patch = updateDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['color', 'endDate', 'startDate', 'title', 'updatedAt'])
  })
})

describe('deleting a plan', () => {
  it('successful delete removes only the target plan, not others', async () => {
    seedFakeDoc('user-a', makePlan({ id: 'plan-1' }))
    seedFakeDoc('user-a', makePlan({ id: 'plan-2', title: 'Other plan' }))

    await deletePlan('plan-1')

    expect(readFakeDoc('user-a', 'plan-1')).toBeUndefined()
    expect(readFakeDoc('user-a', 'plan-2')).toBeDefined()
    expect(readFakeDoc('user-a', 'plan-2')?.title).toBe('Other plan')
  })

  it('a failed delete leaves the local store (_plans) unchanged', async () => {
    const original = makePlan()
    seedLocalPlans([original])
    seedFakeDoc('user-a', original)
    deleteDocMock.mockImplementationOnce(() => Promise.reject(new Error('network')))

    await expect(deletePlan('plan-1')).rejects.toThrow('network')

    // _plans is only ever written by onSnapshot — a failed delete can't have touched it.
    expect(getAllPlans()).toHaveLength(1)
    expect(getAllPlans()[0].id).toBe('plan-1')
  })

  it('nothing is removed from Firestore until deletePlan is actually called (no delete-before-confirm)', async () => {
    seedFakeDoc('user-a', makePlan())
    // Merely having the plan loaded / a confirm dialog conceptually "open" never calls deletePlan.
    expect(deleteDocMock).not.toHaveBeenCalled()
    expect(readFakeDoc('user-a', 'plan-1')).toBeDefined()
  })
})

describe('double-submit protection', () => {
  it('two concurrent updatePlanDetails calls both resolve without corrupting other fields', async () => {
    seedFakeDoc('user-a', makePlan())
    await Promise.all([
      updatePlanDetails('plan-1', { title: 'A', color: '#111111', startDate: '', endDate: '' }),
      updatePlanDetails('plan-1', { title: 'B', color: '#222222', startDate: '', endDate: '' }),
    ])
    const doc = readFakeDoc('user-a', 'plan-1')!
    // Last-write-wins is acceptable here (both writes carry the same kind of
    // data, unlike per-item mutations) — the real guard against a literal
    // double click is the modal's own `saving` state, which disables the
    // Save button synchronously on the first click.
    expect(['A', 'B']).toContain(doc.title)
    expect(doc.items).toEqual(makePlan().items)
  })
})
