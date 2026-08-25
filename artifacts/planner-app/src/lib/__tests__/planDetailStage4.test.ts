/**
 * Stage 4 of the Plaanid (Plans) module: the generic plan-detail item
 * operations (add/edit/toggle/delete). Every mutation runs inside a
 * Firestore transaction (mutatePlanItems) that reads the plan fresh from
 * the server and retries on conflict — this is what prevents the
 * lost-update race where two concurrent single-item writes, both built
 * from the same stale snapshot, would have one silently overwrite the
 * other.
 *
 * The `firebase/firestore` mock below is a small fake transactional store
 * (with a version counter per "document") so these tests can genuinely
 * exercise the read-fresh / retry-on-conflict behavior, not just assert
 * that a mock function was called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake transactional Firestore ─────────────────────────────────────────────

interface FakeDocEntry { version: number; data: unknown }
const fakeDb = new Map<string, FakeDocEntry>()

function planPath(uid: string, planId: string) {
  return `users/${uid}/plans/${planId}`
}

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

interface FakeTx {
  get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
  set: (ref: { path: string }, data: unknown) => void
}

const runTransactionMock = vi.fn(async (_db: unknown, updateFn: (tx: FakeTx) => Promise<void>) => {
  const MAX_ATTEMPTS = 10
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let readPath: string | null = null
    let readVersion = -1
    let pendingWrite: { path: string; data: unknown } | null = null

    const tx: FakeTx = {
      get: async (ref) => {
        const entry = fakeDb.get(ref.path)
        readPath = ref.path
        readVersion = entry ? entry.version : -1
        return { exists: () => entry !== undefined, data: () => entry?.data }
      },
      set: (ref, data) => {
        pendingWrite = { path: ref.path, data }
      },
    }

    // Errors thrown by the app's update function (validation, not-found)
    // abort immediately — only a version conflict below triggers a retry.
    await updateFn(tx)

    const current = readPath ? fakeDb.get(readPath) : undefined
    const currentVersion = current ? current.version : -1
    if (currentVersion === readVersion) {
      if (pendingWrite) {
        const write = pendingWrite as { path: string; data: unknown }
        fakeDb.set(write.path, { version: currentVersion + 1, data: write.data })
      }
      return
    }
    // Someone else committed since our read — retry with a fresh get().
  }
  throw new Error('TRANSACTION_RETRY_EXCEEDED')
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  runTransaction: (...args: Parameters<typeof runTransactionMock>) => runTransactionMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initPlansStore,
  getAllPlans,
  findPlanById,
  computePlanProgress,
  isValidItemLabel,
  mutatePlanItems,
  addPlanItem,
  updatePlanItem,
  togglePlanItem,
  deletePlanItem,
  type Plan,
  type PlanItem,
} from '@/lib/plansStore'

function makeItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return { id: 'item-a', label: 'Item A', done: false, ...overrides }
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    type: 'blank',
    title: 'Synthetic plan',
    color: '#6F5AE8',
    items: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function seedFakeDoc(uid: string, plan: Plan) {
  fakeDb.set(planPath(uid, plan.id), { version: 0, data: plan })
}

function readFakeDoc(uid: string, planId: string): Plan | undefined {
  return fakeDb.get(planPath(uid, planId))?.data as Plan | undefined
}

/** Seeds the store's local _plans (the onSnapshot-fed cache), independent of the fake server doc. */
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
  runTransactionMock.mockClear()
  initPlansStore('user-a')
})

describe('finding a plan by id', () => {
  it('the right planId finds the right plan', () => {
    const plans = [makePlan({ id: 'a' }), makePlan({ id: 'b', title: 'Plan B' })]
    expect(findPlanById(plans, 'b')?.title).toBe('Plan B')
  })

  it('a wrong planId yields undefined ("not found" state)', () => {
    const plans = [makePlan({ id: 'a' })]
    expect(findPlanById(plans, 'does-not-exist')).toBeUndefined()
    expect(findPlanById(plans, undefined)).toBeUndefined()
  })
})

describe('progress across 0%, partial and 100%', () => {
  it('is 0% with no done items, partial mid-way, 100% when all done', () => {
    expect(computePlanProgress(makePlan({ items: [] })).percent).toBe(0)
    expect(
      computePlanProgress(makePlan({ items: [makeItem({ id: '1', done: true }), makeItem({ id: '2', done: false })] })).percent,
    ).toBe(50)
    expect(
      computePlanProgress(makePlan({ items: [makeItem({ id: '1', done: true }), makeItem({ id: '2', done: true })] })).percent,
    ).toBe(100)
  })
})

describe('isValidItemLabel', () => {
  it('rejects empty/whitespace, accepts real text', () => {
    expect(isValidItemLabel('')).toBe(false)
    expect(isValidItemLabel('   ')).toBe(false)
    expect(isValidItemLabel('Task')).toBe(true)
  })
})

describe('mutatePlanItems reads the server-fresh document, not the local _plans cache', () => {
  it('applies the mutation to whatever is in the fake Firestore doc, ignoring a stale local plan', async () => {
    // The local cache thinks item-a is NOT done...
    seedLocalPlans([makePlan({ items: [makeItem({ id: 'item-a', done: false })] })])
    // ...but the server document (what the transaction actually reads) says it IS done.
    seedFakeDoc('user-a', makePlan({ items: [makeItem({ id: 'item-a', done: false })] }))

    await togglePlanItem('plan-1', 'item-a')

    // The transaction toggled from the server's false -> true, independent of _plans.
    expect(readFakeDoc('user-a', 'plan-1')?.items[0].done).toBe(true)
    expect(runTransactionMock).toHaveBeenCalledTimes(1)
  })

  it('never reads from _plans at all for a plan that only exists on the server', async () => {
    // _plans (the local cache) is empty / never seeded.
    seedFakeDoc('user-a', makePlan({ id: 'plan-2', items: [makeItem({ id: 'x' })] }))
    await expect(togglePlanItem('plan-2', 'x')).resolves.toBeUndefined()
    expect(readFakeDoc('user-a', 'plan-2')?.items[0].done).toBe(true)
  })
})

describe('adding an item', () => {
  it('rejects an empty or whitespace-only label without writing', async () => {
    seedFakeDoc('user-a', makePlan({ items: [] }))
    await expect(addPlanItem('plan-1', '   ')).rejects.toThrow()
    expect(readFakeDoc('user-a', 'plan-1')?.items).toEqual([])
  })

  it('adds a valid item with done: false and an optional trimmed note', async () => {
    seedFakeDoc('user-a', makePlan({ items: [] }))
    await addPlanItem('plan-1', '  New task  ', '  some note  ')
    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.items).toHaveLength(1)
    expect(doc.items[0].label).toBe('New task')
    expect(doc.items[0].note).toBe('some note')
    expect(doc.items[0].done).toBe(false)
  })

  it('generates a unique id for every added item', async () => {
    seedFakeDoc('user-a', makePlan({ items: [] }))
    await addPlanItem('plan-1', 'First')
    await addPlanItem('plan-1', 'Second')
    const ids = readFakeDoc('user-a', 'plan-1')!.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('editing label/note', () => {
  it('updates label and note and bumps updatedAt', async () => {
    seedFakeDoc('user-a', makePlan({ updatedAt: 1, items: [makeItem({ label: 'Old', note: 'old note' })] }))
    await updatePlanItem('plan-1', 'item-a', { label: 'New label', note: 'new note' })
    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.items[0].label).toBe('New label')
    expect(doc.items[0].note).toBe('new note')
    expect(doc.updatedAt).toBeGreaterThan(1)
  })

  it('rejects blanking out the label', async () => {
    seedFakeDoc('user-a', makePlan({ items: [makeItem({ label: 'Keep me' })] }))
    await expect(updatePlanItem('plan-1', 'item-a', { label: '   ' })).rejects.toThrow()
    expect(readFakeDoc('user-a', 'plan-1')?.items[0].label).toBe('Keep me')
  })
})

describe('deleting an item', () => {
  it('removes it from items', async () => {
    seedFakeDoc('user-a', makePlan({ items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })] }))
    await deletePlanItem('plan-1', 'a')
    expect(readFakeDoc('user-a', 'plan-1')!.items.map((i) => i.id)).toEqual(['b'])
  })
})

describe('missing plan / missing item give a controlled error', () => {
  it('throws PLAN_NOT_FOUND for a plan that does not exist on the server', async () => {
    await expect(togglePlanItem('does-not-exist', 'item-a')).rejects.toThrow('PLAN_NOT_FOUND')
  })

  it('throws ITEM_NOT_FOUND for an item id not present on the plan', async () => {
    seedFakeDoc('user-a', makePlan({ items: [makeItem({ id: 'real-item' })] }))
    await expect(togglePlanItem('plan-1', 'ghost-item')).rejects.toThrow('ITEM_NOT_FOUND')
    await expect(deletePlanItem('plan-1', 'ghost-item')).rejects.toThrow('ITEM_NOT_FOUND')
    await expect(updatePlanItem('plan-1', 'ghost-item', { label: 'x' })).rejects.toThrow('ITEM_NOT_FOUND')
  })
})

describe('a transaction failure leaves the local store unchanged', () => {
  it('a rejected runTransaction call does not touch _plans', async () => {
    const original = makePlan({ items: [makeItem({ done: false })] })
    seedLocalPlans([original])
    seedFakeDoc('user-a', original)
    runTransactionMock.mockImplementationOnce(() => Promise.reject(new Error('network')))

    await expect(togglePlanItem('plan-1', 'item-a')).rejects.toThrow('network')

    // _plans is only ever written by onSnapshot — a failed write can't have touched it.
    expect(getAllPlans()[0].items[0].done).toBe(false)
  })
})

describe('lost-update race: two single-item mutations on the same plan', () => {
  it('two concurrent toggles on different items both persist (neither is lost)', async () => {
    seedFakeDoc('user-a', makePlan({
      items: [makeItem({ id: 'a', done: false }), makeItem({ id: 'b', done: false })],
    }))

    await Promise.all([
      togglePlanItem('plan-1', 'a'),
      togglePlanItem('plan-1', 'b'),
    ])

    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.items.find((i) => i.id === 'a')?.done).toBe(true)
    expect(doc.items.find((i) => i.id === 'b')?.done).toBe(true)
    // The conflict was real: at least one attempt needed a retry (more calls than mutations).
    expect(runTransactionMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('adding an item concurrently with editing a different item loses neither change', async () => {
    seedFakeDoc('user-a', makePlan({ items: [makeItem({ id: 'existing', label: 'Old label' })] }))

    await Promise.all([
      addPlanItem('plan-1', 'Brand new item'),
      updatePlanItem('plan-1', 'existing', { label: 'Edited label' }),
    ])

    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.items.find((i) => i.id === 'existing')?.label).toBe('Edited label')
    expect(doc.items.some((i) => i.label === 'Brand new item')).toBe(true)
    expect(doc.items).toHaveLength(2)
  })

  it('three concurrent toggles on three different items all persist', async () => {
    seedFakeDoc('user-a', makePlan({
      items: [
        makeItem({ id: 'a', done: false }),
        makeItem({ id: 'b', done: false }),
        makeItem({ id: 'c', done: false }),
      ],
    }))

    await Promise.all([
      togglePlanItem('plan-1', 'a'),
      togglePlanItem('plan-1', 'b'),
      togglePlanItem('plan-1', 'c'),
    ])

    const doc = readFakeDoc('user-a', 'plan-1')!
    expect(doc.items.every((i) => i.done)).toBe(true)
  })
})

describe('mutatePlanItems is the single generic write path (no per-type logic)', () => {
  it('is what addPlanItem/updatePlanItem/togglePlanItem/deletePlanItem all funnel through', async () => {
    seedFakeDoc('user-a', makePlan({ items: [] }))
    await mutatePlanItems('plan-1', (items) => [...items, makeItem({ id: 'direct', label: 'Direct mutate' })])
    expect(readFakeDoc('user-a', 'plan-1')?.items[0].label).toBe('Direct mutate')
  })
})
