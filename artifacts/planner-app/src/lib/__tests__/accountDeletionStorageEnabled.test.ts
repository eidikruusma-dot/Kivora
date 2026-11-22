/**
 * Exercises accountDeletionService.ts's calendars/documents/profile-photo
 * logic with ACCOUNT_DELETION_CALENDARS_ENABLED and
 * ACCOUNT_DELETION_STORAGE_ENABLED forced to true (via vi.mock), i.e. the
 * state those flags are meant to reach ONCE their prerequisites (a
 * Firestore rule for each collection; the Blaze plan for Storage) are
 * actually met — see featureFlags.ts's doc comments for both flags.
 *
 * accountDeletionNewCollections.test.ts covers the opposite, CURRENT case
 * (both flags false) — this file proves the gated code path itself is
 * correct, independently of whether it is switched on yet.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/accountDeletionStorageEnabled.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/featureFlags', () => ({
  ACCOUNT_DELETION_CALENDARS_ENABLED: true,
  ACCOUNT_DELETION_STORAGE_ENABLED: true,
  MONEY_MODULE_ENABLED: false,
}))

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
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => fakeDb.has(ref.path),
    data: () => fakeDb.get(ref.path),
  })),
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

// Storage mock: per-path configurable outcome, so tests can force a
// specific file to fail with a specific error code.
const storageOutcomes = new Map<string, 'ok' | 'not-found' | 'permission-denied'>()
const deleteObjectSpy = vi.fn(async (ref: { path: string }) => {
  const outcome = storageOutcomes.get(ref.path) ?? 'ok'
  if (outcome === 'not-found') {
    const err = new Error('no object') as Error & { code: string }
    err.code = 'storage/object-not-found'
    throw err
  }
  if (outcome === 'permission-denied') {
    const err = new Error('nope') as Error & { code: string }
    err.code = 'storage/unauthorized'
    throw err
  }
})
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  deleteObject: (ref: { path: string }) => deleteObjectSpy(ref),
}))

const deleteBackupSpy = vi.fn(async (uid: string, backupId: string) => {
  fakeDb.delete(`users/${uid}/backups/${backupId}`)
})
vi.mock('@/lib/backupService', () => ({
  deleteBackup: (uid: string, backupId: string) => deleteBackupSpy(uid, backupId),
}))

import { deleteAllUserData } from '@/lib/accountDeletionService'

const UID = 'user-a'

beforeEach(() => {
  fakeDb.clear()
  storageOutcomes.clear()
  deleteBackupSpy.mockClear()
  deleteObjectSpy.mockClear()
})

describe('calendars deletes once its flag is on', () => {
  it('all docs in users/{uid}/calendars are deleted', async () => {
    fakeDb.set(`users/${UID}/calendars/cal-1`, { id: 'cal-1' })
    await deleteAllUserData(UID)
    expect(fakeDb.has(`users/${UID}/calendars/cal-1`)).toBe(false)
  })
})

describe('documents: Storage file deleted before its Firestore record, paired', () => {
  it('a normal document has both its file and metadata removed', async () => {
    fakeDb.set(`users/${UID}/documents/doc-1`, {
      id: 'doc-1',
      storagePath: `users/${UID}/documents/doc-1/file.pdf`,
    })

    await deleteAllUserData(UID)

    expect(deleteObjectSpy).toHaveBeenCalledWith({ path: `users/${UID}/documents/doc-1/file.pdf` })
    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(false)
  })

  it('"storage/object-not-found" is tolerated — the Firestore record still gets deleted', async () => {
    fakeDb.set(`users/${UID}/documents/doc-1`, {
      id: 'doc-1',
      storagePath: `users/${UID}/documents/doc-1/file.pdf`,
    })
    storageOutcomes.set(`users/${UID}/documents/doc-1/file.pdf`, 'not-found')

    await expect(deleteAllUserData(UID)).resolves.toBeUndefined()
    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(false)
  })

  it('a real Storage error aborts the whole run and leaves that document\'s Firestore record in place (no orphaned file reference lost)', async () => {
    fakeDb.set(`users/${UID}`, { uid: UID })
    fakeDb.set(`users/${UID}/documents/doc-1`, {
      id: 'doc-1',
      storagePath: `users/${UID}/documents/doc-1/file.pdf`,
    })
    storageOutcomes.set(`users/${UID}/documents/doc-1/file.pdf`, 'permission-denied')

    await expect(deleteAllUserData(UID)).rejects.toThrow()

    // The record survives specifically so a retry can still find the file.
    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(true)
    // The profile root must NOT have been deleted either — the caller's
    // deleteUser() is never reached when this throws.
    expect(fakeDb.has(`users/${UID}`)).toBe(true)
  })

  it('earlier documents already fully processed before a later failure stay deleted (no rollback)', async () => {
    fakeDb.set(`users/${UID}/documents/doc-1`, { id: 'doc-1', storagePath: `users/${UID}/documents/doc-1/a.pdf` })
    fakeDb.set(`users/${UID}/documents/doc-2`, { id: 'doc-2', storagePath: `users/${UID}/documents/doc-2/b.pdf` })
    storageOutcomes.set(`users/${UID}/documents/doc-2/b.pdf`, 'permission-denied')

    await expect(deleteAllUserData(UID)).rejects.toThrow()

    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(false)
    expect(fakeDb.has(`users/${UID}/documents/doc-2`)).toBe(true)
  })

  it('a document with no storagePath field only deletes its Firestore record (no Storage call)', async () => {
    fakeDb.set(`users/${UID}/documents/doc-1`, { id: 'doc-1' })
    await deleteAllUserData(UID)
    expect(deleteObjectSpy).not.toHaveBeenCalled()
    expect(fakeDb.has(`users/${UID}/documents/doc-1`)).toBe(false)
  })
})

describe('profile photo Storage file', () => {
  it('is deleted before the profile root document', async () => {
    fakeDb.set(`users/${UID}`, {
      uid: UID,
      photoURL: 'https://firebasestorage.googleapis.com/v0/b/kivora.appspot.com/o/users%2Fuser-a%2Fprofile%2Favatar-123.jpg?alt=media&token=x',
    })

    await deleteAllUserData(UID)

    expect(deleteObjectSpy).toHaveBeenCalledWith({ path: 'users/user-a/profile/avatar-123.jpg' })
    expect(fakeDb.has(`users/${UID}`)).toBe(false)
  })

  it('no photoURL means no Storage call at all', async () => {
    fakeDb.set(`users/${UID}`, { uid: UID })
    await deleteAllUserData(UID)
    expect(deleteObjectSpy).not.toHaveBeenCalled()
  })

  it('a real Storage error deleting the profile photo aborts before the profile document is removed', async () => {
    fakeDb.set(`users/${UID}`, {
      uid: UID,
      photoURL: 'https://firebasestorage.googleapis.com/v0/b/kivora.appspot.com/o/users%2Fuser-a%2Fprofile%2Favatar-123.jpg?alt=media',
    })
    storageOutcomes.set('users/user-a/profile/avatar-123.jpg', 'permission-denied')

    await expect(deleteAllUserData(UID)).rejects.toThrow()
    expect(fakeDb.has(`users/${UID}`)).toBe(true)
  })
})
