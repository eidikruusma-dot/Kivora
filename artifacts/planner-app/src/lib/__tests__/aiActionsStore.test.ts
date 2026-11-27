/**
 * aiActionsStore.ts — Kivora 2.0, Etapp 2.1: the data model and store for
 * Kivora's own autonomous-action history. This stage adds ONLY the data
 * model, the store, and (in firestore.rules) the security rules — it is
 * not yet connected to any real autonomous-write path and does not
 * implement reverting an action.
 *
 * These tests use a small fake Firestore (a plain Map keyed by document
 * path) so recordAiAction()'s actual idempotent-create-via-transaction
 * behavior is genuinely exercised, not just asserted to have been
 * "called" — the same style as planDetailStage4.test.ts's fake
 * transactional store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore ────────────────────────────────────────────────────────

const fakeDb = new Map<string, unknown>()
const deletedPaths: string[] = []

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
  let pendingWrite: { path: string; data: unknown } | null = null
  const tx: FakeTx = {
    get: async (ref) => {
      const entry = fakeDb.get(ref.path)
      return { exists: () => entry !== undefined, data: () => entry }
    },
    set: (ref, data) => {
      pendingWrite = { path: ref.path, data }
    },
  }
  await updateFn(tx)
  if (pendingWrite) {
    const write = pendingWrite as { path: string; data: unknown }
    fakeDb.set(write.path, write.data)
  }
})

const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  deletedPaths.push(ref.path)
  fakeDb.delete(ref.path)
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  runTransaction: (...args: Parameters<typeof runTransactionMock>) => runTransactionMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initAiActionsStore,
  getAllAiActions,
  getAiAction,
  recordAiAction,
  buildAiActionDocData,
  generateAiActionRetryKey,
  deleteAiAction,
  actionDoc,
  type RecordAiActionParams,
  type AiActionChange,
} from '@/lib/aiActionsStore'

function makeChange(overrides: Partial<AiActionChange> = {}): AiActionChange {
  return {
    module: 'task',
    entityId: 'task-1',
    field: 'category',
    oldValue: { present: false },
    newValue: { present: true, value: 'Töö' },
    ...overrides,
  }
}

function makeParams(overrides: Partial<RecordAiActionParams> = {}): RecordAiActionParams {
  return {
    retryKey: generateAiActionRetryKey(),
    type: 'fillCategory',
    module: 'task',
    entityId: 'task-1',
    relatedChanges: [makeChange()],
    reason: 'Täitsin tühja kategooria sarnaste ülesannete põhjal.',
    revertible: true,
    snapshotUpdatedAt: { 'task-1': '2026-11-27T10:00:00.000Z' },
    ...overrides,
  }
}

beforeEach(() => {
  // Force a reset to null first — otherwise, since the previous test also
  // left the singleton on 'user-a', the init() call below would be a no-op
  // (same uid) and onSnapshot would never fire again for this test.
  initAiActionsStore(null)
  fakeDb.clear()
  deletedPaths.length = 0
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  runTransactionMock.mockClear()
  deleteDocMock.mockClear()
  initAiActionsStore('user-a')
})

describe('generateAiActionRetryKey', () => {
  it('returns a non-empty string, and two calls never collide', () => {
    const a = generateAiActionRetryKey()
    const b = generateAiActionRetryKey()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })
})

describe('recordAiAction: basic write', () => {
  it('writes a document whose id equals the caller-supplied retryKey, with revertStatus "none"', async () => {
    const params = makeParams()
    const id = await recordAiAction(params)
    expect(id).toBe(params.retryKey)
    expect(fakeDb.get(actionDoc('user-a', params.retryKey).path)).toMatchObject({
      id: params.retryKey,
      revertStatus: 'none',
      type: 'fillCategory',
    })
  })

  it('stamps createdAt itself — the caller cannot pass revertStatus at all (it is not part of RecordAiActionParams), so a caller can never create a document that is not revertStatus "none"', async () => {
    const params = makeParams()
    await recordAiAction(params)
    const stored = fakeDb.get(actionDoc('user-a', params.retryKey).path) as { createdAt: string }
    expect(typeof stored.createdAt).toBe('string')
    expect(() => new Date(stored.createdAt).toISOString()).not.toThrow()
  })
})

describe('recordAiAction: requirement 1 — a stable retry key dedupes a RETRY, but never collapses two distinct same-day actions on the same entity', () => {
  it('calling recordAiAction twice with the SAME retryKey is a no-op the second time (retry of the same attempt)', async () => {
    const retryKey = generateAiActionRetryKey()
    await recordAiAction(makeParams({ retryKey, reason: 'First attempt reason' }))
    // Simulate a retry of the exact same attempt after e.g. a network blip —
    // same retryKey, params rebuilt identically by the caller.
    await recordAiAction(makeParams({ retryKey, reason: 'First attempt reason' }))

    const docsForKey = [...fakeDb.values()].filter((d) => (d as { id: string }).id === retryKey)
    expect(docsForKey).toHaveLength(1)
    expect(runTransactionMock).toHaveBeenCalledTimes(2)
  })

  it('a second, genuinely different action on the SAME entity on the SAME day gets its OWN retryKey and its OWN record — never collapsed into one by type+module+entityId', async () => {
    // This is exactly what the old type+module+entityId+date derived-id
    // scheme would have wrongly collapsed into a single document.
    await recordAiAction(makeParams({
      retryKey: generateAiActionRetryKey(),
      type: 'fillCategory',
      entityId: 'task-1',
      reason: 'Filled category',
    }))
    await recordAiAction(makeParams({
      retryKey: generateAiActionRetryKey(),
      type: 'flagDuplicate',
      entityId: 'task-1',
      reason: 'Flagged as a likely duplicate',
    }))

    expect(getAllActionsFromFakeDb()).toHaveLength(2)
  })

  it('a stale retry with STALE params (e.g. a caller bug re-sending old data) still no-ops rather than overwriting the already-recorded action', async () => {
    const retryKey = generateAiActionRetryKey()
    await recordAiAction(makeParams({ retryKey, reason: 'Original, correct reason' }))
    await recordAiAction(makeParams({ retryKey, reason: 'DIFFERENT reason — must be ignored' }))

    const stored = fakeDb.get(actionDoc('user-a', retryKey).path) as { reason: string }
    expect(stored.reason).toBe('Original, correct reason')
  })
})

function getAllActionsFromFakeDb(): unknown[] {
  return [...fakeDb.values()]
}

describe('AiActionFieldValue: present vs. absent, round-tripped through buildAiActionDocData', () => {
  it('an originally-absent field is stored as { present: false }, with no "value" key at all', () => {
    const doc = buildAiActionDocData(makeParams({
      relatedChanges: [makeChange({ oldValue: { present: false } })],
    }))
    expect(doc.relatedChanges[0].oldValue).toEqual({ present: false })
    expect('value' in doc.relatedChanges[0].oldValue).toBe(false)
  })

  it('an explicit null value is distinguishable from "absent" — { present: true, value: null }', () => {
    const doc = buildAiActionDocData(makeParams({
      relatedChanges: [makeChange({ oldValue: { present: true, value: null } })],
    }))
    expect(doc.relatedChanges[0].oldValue).toEqual({ present: true, value: null })
    expect(doc.relatedChanges[0].oldValue).not.toEqual({ present: false })
  })
})

describe('defense-in-depth validation (independent of the Firestore rules)', () => {
  it('rejects an unknown action type', () => {
    expect(() => buildAiActionDocData(makeParams({ type: 'notARealType' as never }))).toThrow(/type/i)
  })

  it('rejects an empty reason', () => {
    expect(() => buildAiActionDocData(makeParams({ reason: '' }))).toThrow(/reason/i)
  })

  it('rejects a reason over 200 characters', () => {
    expect(() => buildAiActionDocData(makeParams({ reason: 'x'.repeat(201) }))).toThrow(/reason/i)
  })

  it('rejects zero relatedChanges', () => {
    expect(() => buildAiActionDocData(makeParams({ relatedChanges: [] }))).toThrow(/relatedChanges/i)
  })

  it('rejects more than 5 relatedChanges', () => {
    const six = Array.from({ length: 6 }, () => makeChange())
    expect(() => buildAiActionDocData(makeParams({ relatedChanges: six }))).toThrow(/relatedChanges/i)
  })

  it('accepts exactly 5 relatedChanges', () => {
    const five = Array.from({ length: 5 }, () => makeChange())
    expect(() => buildAiActionDocData(makeParams({ relatedChanges: five }))).not.toThrow()
  })

  it('rejects a change missing entityId', () => {
    expect(() => buildAiActionDocData(makeParams({
      relatedChanges: [makeChange({ entityId: '' })],
    }))).toThrow()
  })

  it('rejects a missing retryKey', async () => {
    await expect(recordAiAction(makeParams({ retryKey: '' }))).rejects.toThrow(/retryKey/i)
  })
})

describe('store plumbing: onSnapshot -> getAllAiActions/getAiAction/useAiActions', () => {
  it('reflects whatever onSnapshot delivers', () => {
    const action = buildAiActionDocData(makeParams())
    const [, onNext] = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1] as [
      unknown,
      (snap: { docs: { data: () => unknown }[] }) => void,
    ]
    onNext({ docs: [{ data: () => action }] })

    expect(getAllAiActions()).toEqual([action])
    expect(getAiAction(action.id)?.id).toBe(action.id)
    expect(getAiAction('does-not-exist')).toBeUndefined()
  })

  it('switching uid clears the previous user\'s actions and unsubscribes', () => {
    const action = buildAiActionDocData(makeParams())
    const [, onNext] = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1] as [
      unknown,
      (snap: { docs: { data: () => unknown }[] }) => void,
    ]
    onNext({ docs: [{ data: () => action }] })
    expect(getAllAiActions()).toHaveLength(1)

    initAiActionsStore('user-b')
    expect(unsubscribeMock).toHaveBeenCalled()
    expect(getAllAiActions()).toHaveLength(0)
  })
})

describe('deleteAiAction', () => {
  it('deletes the document at the right path', async () => {
    const params = makeParams()
    await recordAiAction(params)
    await deleteAiAction(params.retryKey)
    expect(deletedPaths).toContain(actionDoc('user-a', params.retryKey).path)
    expect(fakeDb.has(actionDoc('user-a', params.retryKey).path)).toBe(false)
  })
})
