/**
 * backupService.ts — habits are a real Firestore collection
 * (users/{uid}/habits), not "in-memory only" as the old comments/metadata
 * claimed. This was stale: habitsStore.ts has always persisted habits to
 * Firestore via addHabit/updateHabit/deleteHabit, and exportService.ts
 * already exported them correctly — only backupService.ts's
 * readAllUserData() never read the collection, and its comments/BackupMeta
 * .note field repeated the stale claim.
 *
 * Fix, extending the existing generic collection pattern (no parallel
 * habits-specific system):
 *   - readAllUserData() now also calls readCollectionItems(uid, 'habits'),
 *     the same helper already used for tasks/notes/goals/etc. — habits
 *     then flow through createBackup()'s existing generic per-collection
 *     chunking/itemCounts loop automatically.
 *   - restoreBackup()'s per-collection loop is already fully generic for
 *     any collection name that isn't 'profile' or 'settings' (delete
 *     existing docs, then write restored docs keyed by item.id) — habits
 *     fall into that same branch with zero special-casing, since habit
 *     documents already store their own `id` field (set by addHabit).
 *   - VarundaminePage.tsx's post-restore re-init step gained
 *     initHabitsStore(uid), matching every other collection's re-init
 *     call, so the Habits UI refreshes immediately after a restore.
 *   - The stale "habits are in-memory"/"not included" comments and the
 *     BackupMeta.note value were updated; exportService.ts's one stale
 *     comment (habits were already exported correctly) was also fixed.
 *
 * Exercises the real createBackup()/restoreBackup() against a minimal
 * path-keyed fake Firestore (same style of harness used throughout this
 * session's AI/School tests) — no render harness needed, these are plain
 * async functions.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/backupServiceHabits.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Minimal path-keyed fake Firestore ───────────────────────────────────────
// Refs are plain { path } objects; a single Map<string, unknown> backs every
// doc. getDocs finds direct children of a collection path.

const fakeDb = new Map<string, Record<string, unknown>>()

function isRefLike(x: unknown): x is { path: string } {
  return !!x && typeof x === 'object' && 'path' in (x as object)
}

// `segments` is the FULL argument list passed to doc()/collection(), including
// the leading `db`/collection-ref argument — makeRef decides whether to drop
// it (when it's `db`) or use its `.path` as a prefix (when it's a collection
// ref, e.g. doc(chunksCol(uid, backupId), key)).
function makeRef(segments: unknown[]): { path: string } {
  const first = segments[0]
  const rest = segments.slice(1).map(String)
  if (isRefLike(first)) return { path: [first.path, ...rest].join('/') }
  return { path: rest.join('/') }
}

function directChildren(collPath: string) {
  const docs: { id: string; ref: { path: string }; data: () => Record<string, unknown> }[] = []
  for (const [path, data] of fakeDb.entries()) {
    if (!path.startsWith(`${collPath}/`)) continue
    const remainder = path.slice(collPath.length + 1)
    if (remainder.includes('/')) continue // not a direct child
    docs.push({ id: remainder, ref: { path }, data: () => data })
  }
  return docs
}

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => makeRef(segments)),
  doc: vi.fn((...segments: unknown[]) => makeRef(segments)),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = fakeDb.get(ref.path)
    return { exists: () => data !== undefined, data: () => data, id: ref.path.split('/').pop()! }
  }),
  getDocs: vi.fn(async (collRef: { path: string }) => ({ docs: directChildren(collRef.path) })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    fakeDb.set(ref.path, data)
  }),
  deleteDoc: vi.fn(async (ref: { path: string }) => {
    fakeDb.delete(ref.path)
  }),
  writeBatch: vi.fn(() => {
    const ops: (() => void)[] = []
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        ops.push(() => fakeDb.set(ref.path, data))
      },
      delete: (ref: { path: string }) => {
        ops.push(() => fakeDb.delete(ref.path))
      },
      commit: async () => { for (const op of ops) op() },
    }
  }),
  query: vi.fn((collRef: unknown) => collRef),
  orderBy: vi.fn(() => undefined),
  limit: vi.fn(() => undefined),
}))

import { createBackup, restoreBackup } from '@/lib/backupService'

const UID = 'user-a'

function habitDocPath(id: string) { return `users/${UID}/habits/${id}` }
function backupChunkPath(backupId: string, key: string) {
  return `users/${UID}/backups/${backupId}/chunks/${key}`
}

function seedHabit(id: string, overrides: Record<string, unknown> = {}) {
  fakeDb.set(habitDocPath(id), {
    id,
    title: `Habit ${id}`,
    description: '',
    category: 'health',
    icon: 'Zap',
    iconColor: '#000',
    iconBg: '#fff',
    weekDays: [true, true, true, true, true, true, true],
    completions: {},
    ...overrides,
  })
}

beforeEach(() => {
  fakeDb.clear()
})

describe('habits are included in newly-created backup data', () => {
  it('createBackup reads users/{uid}/habits and includes it in itemCounts/collectionNames', async () => {
    seedHabit('habit-1')
    seedHabit('habit-2')

    const meta = await createBackup(UID)

    expect(meta.collectionNames).toContain('habits')
    expect(meta.itemCounts.habits).toBe(2)
    expect(meta.totalItems).toBeGreaterThanOrEqual(2)
  })

  it('the habits chunk document actually contains the habit items', async () => {
    seedHabit('habit-1', { title: 'Drink water' })

    const meta = await createBackup(UID)

    const chunk = fakeDb.get(backupChunkPath(meta.id, 'habits_0')) as {
      collectionName: string
      items: { id: string; title: string }[]
    }
    expect(chunk).toBeDefined()
    expect(chunk.collectionName).toBe('habits')
    expect(chunk.items.map((i) => i.id)).toEqual(['habit-1'])
    expect(chunk.items[0].title).toBe('Drink water')
  })

  it('a backup with zero habits still lists habits with count 0 (no crash, no special-casing)', async () => {
    const meta = await createBackup(UID)
    expect(meta.itemCounts.habits).toBe(0)
  })

  it('other existing collections (tasks) are still included alongside habits — nothing regressed', async () => {
    fakeDb.set(`users/${UID}/tasks/task-1`, { id: 'task-1', title: 'Do the thing' })
    seedHabit('habit-1')

    const meta = await createBackup(UID)

    expect(meta.collectionNames).toEqual(expect.arrayContaining(['tasks', 'habits']))
    expect(meta.itemCounts.tasks).toBe(1)
    expect(meta.itemCounts.habits).toBe(1)
  })

  it('the backup metadata note no longer claims habits are excluded/in-memory', async () => {
    const meta = await createBackup(UID)
    expect(meta.note).not.toMatch(/in.?memory/i)
    expect(meta.note).not.toMatch(/habits? .*(excluded|not included|cannot)/i)
  })
})

describe('habits are restored from backup, via the existing generic restore branch', () => {
  it('a backed-up habit is written back to users/{uid}/habits/{id} on restore', async () => {
    seedHabit('habit-1', { title: 'Meditate' })
    const meta = await createBackup(UID)

    // Simulate the habit having since changed/disappeared before restore.
    fakeDb.delete(habitDocPath('habit-1'))
    fakeDb.set(habitDocPath('habit-stale'), { id: 'habit-stale', title: 'Stale habit' })

    await restoreBackup(UID, meta.id)

    const restored = fakeDb.get(habitDocPath('habit-1')) as { title: string } | undefined
    expect(restored).toBeDefined()
    expect(restored!.title).toBe('Meditate')
  })

  it('a habit not present in the backup is deleted by restore (generic delete-then-write semantics)', async () => {
    seedHabit('habit-1')
    const meta = await createBackup(UID)

    fakeDb.set(habitDocPath('habit-extra'), { id: 'habit-extra', title: 'Should be removed' })

    await restoreBackup(UID, meta.id)

    expect(fakeDb.has(habitDocPath('habit-extra'))).toBe(false)
    expect(fakeDb.has(habitDocPath('habit-1'))).toBe(true)
  })

  it('restoring multiple habits preserves all of them with their original fields', async () => {
    seedHabit('habit-1', { title: 'A', category: 'health' })
    seedHabit('habit-2', { title: 'B', category: 'productivity' })
    const meta = await createBackup(UID)
    fakeDb.delete(habitDocPath('habit-1'))
    fakeDb.delete(habitDocPath('habit-2'))

    await restoreBackup(UID, meta.id)

    const a = fakeDb.get(habitDocPath('habit-1')) as { title: string; category: string }
    const b = fakeDb.get(habitDocPath('habit-2')) as { title: string; category: string }
    expect(a).toEqual(expect.objectContaining({ title: 'A', category: 'health' }))
    expect(b).toEqual(expect.objectContaining({ title: 'B', category: 'productivity' }))
  })
})

describe('VarundaminePage.tsx re-initializes the habits store after a restore', () => {
  const PAGE_SRC = readFileSync(
    resolve(process.cwd(), 'src/views/settings/VarundaminePage.tsx'),
    'utf8',
  )

  it('imports initHabitsStore and calls it in the post-restore re-init step', () => {
    expect(PAGE_SRC).toMatch(/import \{ initHabitsStore \} from '@\/lib\/habitsStore'/)
    const restoreBlock = PAGE_SRC.match(/async function handleConfirmRestore\(\)[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(restoreBlock).toMatch(/initHabitsStore\(uid\)/)
  })

  it('every other pre-existing re-init call is still present, unchanged', () => {
    const restoreBlock = PAGE_SRC.match(/async function handleConfirmRestore\(\)[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(restoreBlock).toMatch(/initTasksStore\(uid\)/)
    expect(restoreBlock).toMatch(/initGoalsStore\(uid\)/)
    expect(restoreBlock).toMatch(/initCalendarStore\(uid\)/)
    expect(restoreBlock).toMatch(/initNotesStore\(uid\)/)
    expect(restoreBlock).toMatch(/initSchoolStore\(uid\)/)
    expect(restoreBlock).toMatch(/initEntityLinksStore\(uid\)/)
    expect(restoreBlock).toMatch(/initAIConversationsStore\(uid\)/)
    expect(restoreBlock).toMatch(/initNotificationItemsStore\(uid\)/)
  })
})

describe('no stale "habits are in-memory" claims remain in backup/export service code', () => {
  it('backupService.ts has no in-memory/excluded habits claim', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/backupService.ts'), 'utf8')
    expect(src).not.toMatch(/habits?.{0,40}in.?memory/is)
    expect(src).not.toMatch(/in.?memory.{0,40}habits?/is)
    expect(src).not.toMatch(/habits? .*(cannot be backed up|not included|are not included)/i)
  })

  it('exportService.ts has no in-memory habits claim', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/exportService.ts'), 'utf8')
    expect(src).not.toMatch(/habits?.{0,40}in.?memory/is)
    expect(src).not.toMatch(/in.?memory.{0,40}habits?/is)
  })
})
