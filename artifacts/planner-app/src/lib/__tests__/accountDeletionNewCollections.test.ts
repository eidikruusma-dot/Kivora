/**
 * accountDeletionService.ts's deleteAllUserData() was missing "plans",
 * "transactions", "bills", and "monthlyBudgets" — all four already have a
 * working Firestore rule (owner read/create/update/delete), confirmed
 * directly in the Firebase Console, so they are safe to delete
 * unconditionally, the same way "tasks"/"habits"/etc. already are.
 *
 * "calendars" and "documents" (+ their Storage files, + the profile photo
 * Storage file) are each gated behind a featureFlags.ts flag
 * (ACCOUNT_DELETION_CALENDARS_ENABLED / ACCOUNT_DELETION_STORAGE_ENABLED),
 * both false today, because:
 *   - "users/{uid}/calendars" and "users/{uid}/documents" have NO
 *     Firestore security rule deployed (confirmed in the Firebase
 *     Console) — every query against them is rejected with
 *     permission-denied regardless of whether any documents match.
 *   - Firebase Storage requires this project to be on the Blaze plan,
 *     which it is not yet.
 *
 * This file exercises deleteAllUserData() against the REAL featureFlags
 * module (both flags at their real, current value: false) to prove the
 * safe default: the new money/plans collections are deleted, while
 * calendars/documents/profile-photo are never even queried — so a
 * missing security rule for those two collections cannot break deletion
 * for anyone today. accountDeletionStorageEnabled.test.ts covers the
 * opposite case (flags forced on) to verify the gated logic itself.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/accountDeletionNewCollections.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Minimal path-keyed fake Firestore (same shape as
// accountDeletionPushSubscriptions.test.ts) ─────────────────────────────────

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

const getDocsSpy = vi.fn(async (collRef: { path: string }) => ({ docs: directChildren(collRef.path) }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => makeRef(segments)),
  doc: vi.fn((...segments: unknown[]) => makeRef(segments)),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => fakeDb.has(ref.path),
    data: () => fakeDb.get(ref.path),
  })),
  getDocs: (collRef: { path: string }) => getDocsSpy(collRef),
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

const deleteObjectSpy = vi.fn(async () => {})
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  deleteObject: (ref: { path: string }) => deleteObjectSpy(ref),
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
import { ACCOUNT_DELETION_CALENDARS_ENABLED, ACCOUNT_DELETION_STORAGE_ENABLED } from '@/lib/featureFlags'

const UID = 'user-a'

beforeEach(() => {
  fakeDb.clear()
  deleteBackupSpy.mockClear()
  deleteObjectSpy.mockClear()
  getDocsSpy.mockClear()
})

describe('the real featureFlags values are both still false today', () => {
  it('ACCOUNT_DELETION_CALENDARS_ENABLED is false', () => {
    expect(ACCOUNT_DELETION_CALENDARS_ENABLED).toBe(false)
  })
  it('ACCOUNT_DELETION_STORAGE_ENABLED is false', () => {
    expect(ACCOUNT_DELETION_STORAGE_ENABLED).toBe(false)
  })
})

describe('plans/transactions/bills/monthlyBudgets are deleted unconditionally', () => {
  it('all four collections are cleared', async () => {
    fakeDb.set(`users/${UID}/plans/plan-1`, { id: 'plan-1' })
    fakeDb.set(`users/${UID}/transactions/tx-1`, { id: 'tx-1' })
    fakeDb.set(`users/${UID}/bills/bill-1`, { id: 'bill-1' })
    fakeDb.set(`users/${UID}/monthlyBudgets/budget-1`, { id: 'budget-1' })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/plans/plan-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/transactions/tx-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/bills/bill-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/monthlyBudgets/budget-1`)).toBe(false)
  })

  it('empty plans/transactions/bills/monthlyBudgets do not crash deleteAllUserData()', async () => {
    await expect(deleteAllUserData(UID)).resolves.toBeUndefined()
  })
})

describe('calendars is never queried while ACCOUNT_DELETION_CALENDARS_ENABLED is false', () => {
  it('a "calendars" doc is left untouched', async () => {
    fakeDb.set(`users/${UID}/calendars/cal-1`, { id: 'cal-1' })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/calendars/cal-1`)).toBe(true)
  })

  it('getDocs is never called for the calendars collection', async () => {
    await deleteAllUserData(UID)
    const calledPaths = getDocsSpy.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect(calledPaths).not.toContain(`users/${UID}/calendars`)
  })
})

describe('documents + Storage are never touched while ACCOUNT_DELETION_STORAGE_ENABLED is false', () => {
  it('a "documents" doc and its Storage file are both left untouched', async () => {
    fakeDb.set(`users/${UID}/documents/doc-1`, {
      id: 'doc-1',
      storagePath: `users/${UID}/documents/doc-1/file.pdf`,
    })

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(true)
    expect(deleteObjectSpy).not.toHaveBeenCalled()
  })

  it('a profile photo is never deleted from Storage', async () => {
    fakeDb.set(`users/${UID}`, { uid: UID, photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuser-a%2Fprofile%2Favatar-1.jpg?alt=media' })

    await deleteAllUserData(UID)

    expect(deleteObjectSpy).not.toHaveBeenCalled()
  })
})

describe('the rest of the existing deletion is unaffected', () => {
  it('tasks/habits/aiConversations/backups/pushSubscriptions/profile root still all delete', async () => {
    fakeDb.set(`users/${UID}`, { uid: UID })
    fakeDb.set(`users/${UID}/tasks/t1`, {})
    fakeDb.set(`users/${UID}/habits/h1`, {})
    fakeDb.set(`users/${UID}/aiConversations/c1`, {})
    fakeDb.set(`users/${UID}/aiConversations/c1/messages/m1`, {})
    fakeDb.set(`users/${UID}/pushSubscriptions/s1`, {})
    fakeDb.set(`users/${UID}/backups/b1`, {})

    await deleteAllUserData(UID)

    expect(fakeDb.has(`users/${UID}`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/tasks/t1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/habits/h1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/aiConversations/c1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/aiConversations/c1/messages/m1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/pushSubscriptions/s1`)).toBe(false)
    expect(deleteBackupSpy).toHaveBeenCalledWith(UID, 'b1')
  })
})

describe('no stale claim remains in accountDeletionService.ts', () => {
  const SRC = readFileSync(resolve(process.cwd(), 'src/lib/accountDeletionService.ts'), 'utf8')

  it('deleteAllUserData() still never invokes deleteUser()', () => {
    expect(SRC).not.toMatch(/await deleteUser\(/)
  })

  it('feedbackSubmissions and supportMessages are never referenced as collection names to delete', () => {
    expect(SRC).not.toMatch(/deleteCollection\(uid, ['"]feedbackSubmissions['"]\)/)
    expect(SRC).not.toMatch(/deleteCollection\(uid, ['"]supportMessages['"]\)/)
  })
})
