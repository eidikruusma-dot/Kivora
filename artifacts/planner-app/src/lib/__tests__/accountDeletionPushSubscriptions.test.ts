/**
 * accountDeletionService.ts's deleteAllUserData() never deleted the real
 * Firestore subcollection users/{uid}/pushSubscriptions (written/read by
 * pushNotifications.ts), and its habits deletion line still carried a stale
 * "usually empty — in-memory store" comment even though habits.ts has
 * always persisted to Firestore (see backupServiceHabits.test.ts from the
 * Backup-area fix).
 *
 * Fix: add deleteCollection(uid, 'pushSubscriptions') to deleteAllUserData(),
 * reusing the existing flat-collection helper — no parallel deletion system —
 * and drop the stale habits comment. Safe dependency order (nested
 * subcollections cleared before parents, profile root last) and the
 * deleteUser() separation (deleteAllUserData() never calls it) are untouched.
 *
 * Exercises the real deleteAllUserData() against a minimal path-keyed fake
 * Firestore, the same mock style used in backupServiceHabits.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/accountDeletionPushSubscriptions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

// ── Minimal path-keyed fake Firestore ───────────────────────────────────────

const fakeDb = new Map<string, Record<string, unknown>>()

function isRefLike(x: unknown): x is { path: string } {
  return !!x && typeof x === 'object' && 'path' in (x as object)
}

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
    if (remainder.includes('/')) continue
    docs.push({ id: remainder, ref: { path }, data: () => data })
  }
  return docs
}

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => makeRef(segments)),
  doc: vi.fn((...segments: unknown[]) => makeRef(segments)),
  getDocs: vi.fn(async (collRef: { path: string }) => ({ docs: directChildren(collRef.path) })),
  deleteDoc: vi.fn(async (ref: { path: string }) => { fakeDb.delete(ref.path) }),
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
}))

const deleteBackupSpy = vi.fn(async (uid: string, backupId: string) => {
  for (const path of Array.from(fakeDb.keys())) {
    if (path.startsWith(`users/${uid}/backups/${backupId}/chunks/`)) fakeDb.delete(path)
  }
  fakeDb.delete(`users/${uid}/backups/${backupId}`)
})
vi.mock('@/lib/backupService', () => ({
  deleteBackup: (uid: string, backupId: string) => deleteBackupSpy(uid, backupId),
}))

import { deleteAllUserData } from '@/lib/accountDeletionService'

const UID = 'user-a'

beforeEach(() => {
  fakeDb.clear()
  deleteBackupSpy.mockClear()
})

describe('pushSubscriptions is included in the full user-data deletion', () => {
  it('all docs in users/{uid}/pushSubscriptions are deleted', async () => {
    fakeDb.set(`users/${UID}/pushSubscriptions/sub-1`, { id: 'sub-1' })
    fakeDb.set(`users/${UID}/pushSubscriptions/sub-2`, { id: 'sub-2' })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/pushSubscriptions/sub-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/pushSubscriptions/sub-2`)).toBe(false)
  })

  it('an empty pushSubscriptions collection does not crash deleteAllUserData()', async () => {
    await expect(deleteAllUserData(UID)).resolves.toBeUndefined()
  })
})

describe('habits is still deleted by deleteAllUserData()', () => {
  it('all docs in users/{uid}/habits are deleted', async () => {
    fakeDb.set(`users/${UID}/habits/habit-1`, { id: 'habit-1' })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/habits/habit-1`)).toBe(false)
  })
})

describe('nested AI conversations and backups deletion remain untouched', () => {
  it('AI conversation message subcollections are deleted before the parent conversation doc', async () => {
    fakeDb.set(`users/${UID}/aiConversations/conv-1`, { id: 'conv-1' })
    fakeDb.set(`users/${UID}/aiConversations/conv-1/messages/msg-1`, { id: 'msg-1' })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/aiConversations/conv-1/messages/msg-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/aiConversations/conv-1`)).toBe(false)
  })

  it('deleteBackup() from backupService is still reused (not a parallel deletion system) for every backup', async () => {
    fakeDb.set(`users/${UID}/backups/bk-1`, { id: 'bk-1' })
    fakeDb.set(`users/${UID}/backups/bk-1/chunks/tasks_0`, { items: [] })
    fakeDb.set(`users/${UID}/backups/bk-2`, { id: 'bk-2' })

    await deleteAllUserData(UID)

    expect(deleteBackupSpy).toHaveBeenCalledWith(UID, 'bk-1')
    expect(deleteBackupSpy).toHaveBeenCalledWith(UID, 'bk-2')
    expect(deleteBackupSpy).toHaveBeenCalledTimes(2)
  })
})

describe('the profile root document is still deleted last', () => {
  it('users/{uid} is gone once deleteAllUserData() resolves', async () => {
    fakeDb.set(`users/${UID}`, { uid: UID })
    await deleteAllUserData(UID)
    expect(fakeDb.has(`users/${UID}`)).toBe(false)
  })
})

describe('no stale "habits are in-memory" claim remains in accountDeletionService.ts', () => {
  const SRC = readFileSync(resolve(process.cwd(), 'src/lib/accountDeletionService.ts'), 'utf8')

  it('the source has no in-memory/excluded habits comment', () => {
    expect(SRC).not.toMatch(/habits?.{0,40}in.?memory/is)
    expect(SRC).not.toMatch(/in.?memory.{0,40}habits?/is)
  })

  it('pushSubscriptions deletion is wired inside deleteAllUserData(), before the profile root delete', () => {
    const fnBlock = SRC.match(/export async function deleteAllUserData[\s\S]*?\n\}/)?.[0] ?? ''
    expect(fnBlock).toMatch(/deleteCollection\(uid, 'pushSubscriptions'\)/)
    const pushIdx = fnBlock.indexOf("deleteCollection(uid, 'pushSubscriptions')")
    const profileIdx = fnBlock.indexOf("deleteDoc(doc(db, 'users', uid))")
    expect(pushIdx).toBeGreaterThan(-1)
    expect(profileIdx).toBeGreaterThan(pushIdx)
  })

  it('deleteAllUserData() still never invokes deleteUser() — the caller must do that separately', () => {
    expect(SRC).not.toMatch(/\bdeleteUser\b\s*,|,\s*\bdeleteUser\b/)
    expect(SRC).not.toMatch(/await deleteUser\(/)
  })
})
