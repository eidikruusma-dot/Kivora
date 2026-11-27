/**
 * Kivora 2.0, Etapp 2.2 — runAutomaticLinking() now writes every new
 * EntityLink, the one auto-created CalendarEvent, and the AiAction log
 * entry/entries describing them inside ONE Firestore transaction, keyed by
 * DETERMINISTIC document ids (see automaticLinking.ts's
 * deterministicLinkId()/deterministicCalendarEventId()).
 *
 * This file proves the three properties that matter and are NOT provable
 * by inspection alone:
 *   1. Atomicity — if the transaction fails, nothing partial is committed
 *      (no link/event without its log entry, no log entry without data).
 *   2. Concurrency safety — two near-simultaneous calls for the exact same
 *      candidate converge on exactly ONE document, never two, because the
 *      server-authoritative tx.get() (not the local cache, not a plain
 *      writeBatch) is what decides whether to write.
 *   3. The AutoLinkResult contract (linkIds/calendarEventId) is unchanged
 *      from before this rewrite.
 *
 * The runTransaction mock below is a genuine small transactional store with
 * per-document version numbers and a real retry-on-conflict loop — not a
 * pass-through stub — so the concurrency test actually exercises the same
 * optimistic-concurrency mechanism Firestore itself uses, the same style as
 * planDetailStage4.test.ts's fake transactional store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-a' } }, storage: {} }))

// ── Fake transactional Firestore (versioned, retries on conflict) ──────────

interface FakeDocEntry { version: number; data: unknown }
const fakeDb = new Map<string, FakeDocEntry>()

interface FakeTx {
  get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
  set: (ref: { path: string }, data: unknown) => void
}

let forceTransactionFailureOnce = false

const runTransactionMock = vi.fn(async (_db: unknown, updateFn: (tx: FakeTx) => Promise<unknown>) => {
  const MAX_ATTEMPTS = 25
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const readVersions = new Map<string, number>()
    const pendingWrites = new Map<string, unknown>()
    const tx: FakeTx = {
      get: async (ref) => {
        const entry = fakeDb.get(ref.path)
        readVersions.set(ref.path, entry ? entry.version : -1)
        return { exists: () => entry !== undefined, data: () => entry?.data }
      },
      set: (ref, data) => { pendingWrites.set(ref.path, data) },
    }

    const result = await updateFn(tx)

    if (forceTransactionFailureOnce) {
      forceTransactionFailureOnce = false
      throw new Error('SIMULATED_TRANSACTION_FAILURE')
    }

    let conflict = false
    for (const [path, version] of readVersions) {
      const current = fakeDb.get(path)
      if ((current ? current.version : -1) !== version) { conflict = true; break }
    }
    if (!conflict) {
      for (const [path, data] of pendingWrites) {
        const current = fakeDb.get(path)
        fakeDb.set(path, { version: (current?.version ?? -1) + 1, data })
      }
      return result
    }
    // Someone else committed a read path since we read it — retry fresh.
  }
  throw new Error('TRANSACTION_RETRY_EXCEEDED')
})

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(() => unsubscribeMock)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  runTransaction: (...args: Parameters<typeof runTransactionMock>) => runTransactionMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { runAutomaticLinking } from '@/lib/automaticLinking'
import { initNotesStore } from '@/lib/quickNotesStore'

const UID = 'user-a'

function pathsStartingWith(prefix: string): { path: string; data: unknown }[] {
  return [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, entry]) => ({ path, data: entry.data }))
}

function linkDocs() { return pathsStartingWith(`users/${UID}/entityLinks/`) }
function eventDocs() { return pathsStartingWith(`users/${UID}/calendarEvents/`) }
function actionDocs() { return pathsStartingWith(`users/${UID}/aiActions/`) }

beforeEach(() => {
  fakeDb.clear()
  runTransactionMock.mockClear()
  forceTransactionFailureOnce = false
})

describe('no candidates: zero Firestore calls, same as before this change', () => {
  it('an entity with no date and no high-confidence suggestions never starts a transaction', async () => {
    const result = await runAutomaticLinking('task', 'task-none', 'et', { title: 'Zzz unmatched title Zzz' })
    expect(runTransactionMock).not.toHaveBeenCalled()
    expect(result).toEqual({ linkIds: [], calendarEventId: null })
  })
})

describe('calendar event creation: single call, deterministic id, atomic with its log entry', () => {
  it('creates exactly one event, one scheduled link, and one createCalendarEvent AiAction, all under deterministic ids', async () => {
    const result = await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })

    expect(eventDocs()).toHaveLength(1)
    expect(linkDocs()).toHaveLength(1)
    expect(actionDocs()).toHaveLength(1)

    const action = actionDocs()[0].data as { type: string; relatedChanges: unknown[] }
    expect(action.type).toBe('createCalendarEvent')
    expect(action.relatedChanges).toHaveLength(2) // the event + its link

    expect(result.calendarEventId).toBe(eventDocs()[0].path.split('/').pop())
    expect(result.linkIds).toEqual([linkDocs()[0].path.split('/').pop()])
  })

  it('calling it again for the SAME entity is a true no-op: no new writes, no new log entry', async () => {
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })
    expect(eventDocs()).toHaveLength(1)
    expect(actionDocs()).toHaveLength(1)

    const second = await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })

    expect(eventDocs()).toHaveLength(1) // still exactly one — never a duplicate
    expect(actionDocs()).toHaveLength(1) // no new log entry for a no-op
    expect(second.calendarEventId).toBeNull() // nothing NEW was created this time
  })

  it('the deterministic calendar event id still starts with the existing cal-auto- prefix (every other prefix check in the codebase keeps working)', async () => {
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })
    expect(eventDocs()[0].path.split('/').pop()).toMatch(/^cal-auto-/)
  })
})

describe('atomicity: a failed transaction leaves no partial state', () => {
  it('neither the event, the link, nor the AiAction exist if the transaction fails', async () => {
    forceTransactionFailureOnce = true
    const result = await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })

    expect(eventDocs()).toHaveLength(0)
    expect(linkDocs()).toHaveLength(0)
    expect(actionDocs()).toHaveLength(0)
    // Never surfaced as an error to the caller — same best-effort contract as before.
    expect(result).toEqual({ linkIds: [], calendarEventId: null })
  })

  it('a subsequent call (no forced failure) succeeds normally — the earlier failure left nothing to retry around', async () => {
    forceTransactionFailureOnce = true
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })
    expect(eventDocs()).toHaveLength(0)

    const result = await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })
    expect(eventDocs()).toHaveLength(1)
    expect(result.calendarEventId).not.toBeNull()
  })
})

describe('concurrency: two near-simultaneous calls for the same entity never create a duplicate', () => {
  it('two concurrent runAutomaticLinking() calls for the same dated task converge on exactly one event, one link, one log entry', async () => {
    const hint = { title: 'Osta lilled', date: '2026-09-01' }
    const [a, b] = await Promise.all([
      runAutomaticLinking('task', 'task-1', 'et', hint),
      runAutomaticLinking('task', 'task-1', 'et', hint),
    ])

    expect(eventDocs()).toHaveLength(1)
    expect(linkDocs()).toHaveLength(1)
    expect(actionDocs()).toHaveLength(1)

    // Exactly one of the two calls reports having created the event; the
    // other correctly reports null — never both, and never neither.
    const createdCount = [a.calendarEventId, b.calendarEventId].filter((x) => x !== null).length
    expect(createdCount).toBe(1)
  })

  it('three concurrent calls for the same entity still converge on exactly one of everything', async () => {
    const hint = { title: 'Hambaarst', date: '2026-10-10', time: '14:00' }
    const results = await Promise.all([
      runAutomaticLinking('task', 'task-2', 'et', hint),
      runAutomaticLinking('task', 'task-2', 'et', hint),
      runAutomaticLinking('task', 'task-2', 'et', hint),
    ])

    expect(eventDocs()).toHaveLength(1)
    expect(linkDocs()).toHaveLength(1)
    expect(actionDocs()).toHaveLength(1)
    expect(results.filter((r) => r.calendarEventId !== null)).toHaveLength(1)
  })
})

describe('createLink: a high-confidence suggestion also goes through the transaction, as its own AiAction', () => {
  it('an exact title match against an existing note creates a link, logged as its own createLink action — separate from createCalendarEvent', async () => {
    initNotesStore('user-a')
    const idx = onSnapshotMock.mock.calls.length - 1
    const onNext = onSnapshotMock.mock.calls[idx][1] as (snap: { docs: { data: () => unknown }[] }) => void
    onNext({
      docs: [{
        data: () => ({
          id: 'note-1', title: 'Osta lilled', preview: '', folder: 'Yleine',
          timestamp: '', starred: false, iconBg: '', iconColor: '', icon: 'document',
        }),
      }],
    })

    // No date in the hint -> no calendar candidate at all, isolating this
    // to the createLink branch only.
    const result = await runAutomaticLinking('task', 'task-3', 'et', { title: 'Osta lilled' })

    expect(linkDocs()).toHaveLength(1)
    expect(eventDocs()).toHaveLength(0)
    expect(actionDocs()).toHaveLength(1)

    const action = actionDocs()[0].data as { type: string; relatedChanges: unknown[] }
    expect(action.type).toBe('createLink')
    expect(action.relatedChanges).toHaveLength(1)
    expect(result.linkIds).toHaveLength(1)
    expect(result.calendarEventId).toBeNull()
  })
})

describe('AiAction identity: a fresh retryKey per real logged action, never derived from type+entity+date', () => {
  it('two different entities on the same day get two different AiAction ids', async () => {
    await runAutomaticLinking('task', 'task-a', 'et', { title: 'A', date: '2026-09-01' })
    await runAutomaticLinking('task', 'task-b', 'et', { title: 'B', date: '2026-09-01' })

    const ids = actionDocs().map((d) => d.path.split('/').pop())
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('every AiAction id is a fresh UUID-shaped string, not a deterministic composition of type/module/entityId/date', async () => {
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-09-01' })
    const id = actionDocs()[0].path.split('/').pop()!
    expect(id).not.toContain('task-1')
    expect(id).not.toContain('2026-09-01')
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
