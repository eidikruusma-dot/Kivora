/**
 * backupService.ts
 *
 * Real backup / restore system for Kivora.
 *
 * Backup structure:
 *   users/{uid}/backups/{backupId}          — metadata (no item data)
 *   users/{uid}/backups/{backupId}/chunks/{collectionName}_{chunkIndex}  — item data
 *
 * Each chunk stays under CHUNK_BYTE_LIMIT to respect Firestore's 1 MB document limit.
 * A backup holds up to 10 most-recent documents; older ones must be deleted manually.
 *
 * Habits are in-memory only and cannot be backed up.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import { saveSettings, loadSettings } from '@/lib/settingsStore'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stay well under Firestore's 1 MB document limit. */
const CHUNK_BYTE_LIMIT = 700_000

/** Version bumped when the backup schema changes. */
const BACKUP_VERSION = 1

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackupMeta {
  id: string
  createdAt: string
  version: number
  itemCounts: Record<string, number>
  totalItems: number
  collectionNames: string[]
  note: string
}

// ── Firestore path helpers ────────────────────────────────────────────────────

const backupsCol = (uid: string) =>
  collection(db, 'users', uid, 'backups')

const backupDoc = (uid: string, backupId: string) =>
  doc(db, 'users', uid, 'backups', backupId)

const chunksCol = (uid: string, backupId: string) =>
  collection(db, 'users', uid, 'backups', backupId, 'chunks')

// ── Internal utilities ────────────────────────────────────────────────────────

/**
 * Split items into chunk arrays so each chunk's JSON representation
 * stays below CHUNK_BYTE_LIMIT.
 */
function splitIntoChunks(items: object[]): object[][] {
  const result: object[][] = []
  let current: object[] = []
  let currentBytes = 2 // '[]'

  for (const item of items) {
    const serialized = JSON.stringify(item) + ','
    if (currentBytes + serialized.length > CHUNK_BYTE_LIMIT && current.length > 0) {
      result.push(current)
      current = []
      currentBytes = 2
    }
    current.push(item)
    currentBytes += serialized.length
  }

  result.push(current) // always push the last (possibly empty) group
  return result
}

/**
 * Execute Firestore set/delete operations split into batches of ≤490.
 * (Firestore batch limit is 500; 490 gives headroom.)
 */
async function batchOps(
  ops: Array<{ type: 'set'; ref: ReturnType<typeof doc>; data: object }
          | { type: 'delete'; ref: ReturnType<typeof doc> }>,
): Promise<void> {
  for (let i = 0; i < ops.length; i += 490) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 490)) {
      if (op.type === 'delete') {
        batch.delete(op.ref)
      } else {
        batch.set(op.ref, op.data)
      }
    }
    await batch.commit()
  }
}

// ── Read helpers ──────────────────────────────────────────────────────────────

async function readCollectionItems(uid: string, collName: string): Promise<object[]> {
  const snap = await getDocs(collection(db, 'users', uid, collName))
  return snap.docs.map((d) => d.data())
}

async function readAllUserData(uid: string): Promise<Record<string, object[]>> {
  const [
    profileSnap,
    settingsSnap,
    tasks,
    calendarEvents,
    notes,
    goals,
    schoolItems,
    aiConversations,
    notifications,
    entityLinks,
  ] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDocs(collection(db, 'users', uid, 'settings')),
    readCollectionItems(uid, 'tasks'),
    readCollectionItems(uid, 'calendarEvents'),
    readCollectionItems(uid, 'notes'),
    readCollectionItems(uid, 'goals'),
    readCollectionItems(uid, 'schoolItems'),
    readCollectionItems(uid, 'aiConversations'),
    readCollectionItems(uid, 'notifications'),
    readCollectionItems(uid, 'entityLinks'),
  ])

  return {
    profile: profileSnap.exists() ? [profileSnap.data()] : [],
    // Settings docs are stored by their document ID — preserve it as _settingsId
    settings: settingsSnap.docs.map((d) => ({ _settingsId: d.id, ...d.data() })),
    tasks,
    calendarEvents,
    notes,
    goals,
    schoolItems,
    aiConversations,
    notifications,
    entityLinks,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a full backup of all supported Firestore data for the given user.
 * Writes chunk documents first, then the metadata doc, then updates
 * `users/{uid}/settings/backup.lastBackupAt`.
 */
export async function createBackup(uid: string): Promise<BackupMeta> {
  const data = await readAllUserData(uid)

  const backupId = `bk_${Date.now()}`
  const createdAt = new Date().toISOString()

  // ── Write data chunks ──────────────────────────────────────────────────────
  const chunkSetOps: Array<{ type: 'set'; ref: ReturnType<typeof doc>; data: object }> = []

  for (const [collName, items] of Object.entries(data)) {
    const chunkArrays = splitIntoChunks(items)
    for (let i = 0; i < chunkArrays.length; i++) {
      chunkSetOps.push({
        type: 'set',
        ref: doc(chunksCol(uid, backupId), `${collName}_${i}`),
        data: sanitizeForFirestore({
          collectionName: collName,
          chunkIndex: i,
          totalChunks: chunkArrays.length,
          items: chunkArrays[i],
        }),
      })
    }
  }

  await batchOps(chunkSetOps)

  // ── Write metadata doc ─────────────────────────────────────────────────────
  const itemCounts: Record<string, number> = {}
  for (const [key, items] of Object.entries(data)) {
    itemCounts[key] = items.length
  }
  const totalItems = Object.values(itemCounts).reduce((a, b) => a + b, 0)

  const meta: BackupMeta = {
    id: backupId,
    createdAt,
    version: BACKUP_VERSION,
    itemCounts,
    totalItems,
    collectionNames: Object.keys(data),
    note: 'Habits are stored in memory only and are not included in this backup.',
  }

  await setDoc(backupDoc(uid, backupId), sanitizeForFirestore(meta))

  // ── Update lastBackupAt ────────────────────────────────────────────────────
  const currentBackupSettings = await loadSettings<{ autoBackup: boolean; frequency: string; lastBackupAt: string | null }>(
    uid,
    'backup',
    { autoBackup: true, frequency: 'weekly', lastBackupAt: null },
  )
  await saveSettings(uid, 'backup', { ...currentBackupSettings, lastBackupAt: createdAt })

  return meta
}

/**
 * List the newest ≤10 backups for the given user (metadata only, no item data).
 */
export async function listBackups(uid: string): Promise<BackupMeta[]> {
  const snap = await getDocs(
    query(backupsCol(uid), orderBy('createdAt', 'desc'), limit(10)),
  )
  return snap.docs.map((d) => d.data() as BackupMeta)
}

/**
 * Permanently delete a backup and all its chunk documents.
 */
export async function deleteBackup(uid: string, backupId: string): Promise<void> {
  // Delete chunks first
  const chunksSnap = await getDocs(chunksCol(uid, backupId))
  const deleteOps = chunksSnap.docs.map((d) => ({
    type: 'delete' as const,
    ref: d.ref,
  }))
  await batchOps(deleteOps)
  // Delete metadata doc
  await deleteDoc(backupDoc(uid, backupId))
}

/**
 * Restore all supported collections from a backup.
 *
 * Safety guarantees:
 * - Auth-critical profile fields (uid, email, createdAt, photoURL) are never overwritten.
 * - The backup settings document itself is never overwritten during restore.
 * - If any step throws, the error propagates — callers must not show success on catch.
 * - Callers should create a safety backup before calling this function.
 */
export async function restoreBackup(uid: string, backupId: string): Promise<void> {
  // ── Read all chunk documents ───────────────────────────────────────────────
  const chunksSnap = await getDocs(chunksCol(uid, backupId))

  // Reassemble items per collection (sort by chunkIndex to preserve order)
  const byCollection: Record<string, { chunkIndex: number; items: object[] }[]> = {}
  for (const chunkDocSnap of chunksSnap.docs) {
    const data = chunkDocSnap.data() as {
      collectionName: string
      chunkIndex: number
      items: object[]
    }
    if (!byCollection[data.collectionName]) byCollection[data.collectionName] = []
    byCollection[data.collectionName].push({ chunkIndex: data.chunkIndex, items: data.items })
  }

  // Sort chunks within each collection and flatten
  const assembled: Record<string, object[]> = {}
  for (const [collName, chunks] of Object.entries(byCollection)) {
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
    assembled[collName] = chunks.flatMap((c) => c.items)
  }

  // ── Restore each collection ───────────────────────────────────────────────
  for (const [collName, items] of Object.entries(assembled)) {
    if (collName === 'profile') {
      if (items.length > 0) {
        const profileRef = doc(db, 'users', uid)
        const existing = await getDoc(profileRef)
        const existingData = (existing.exists() ? existing.data() : {}) as Record<string, unknown>
        const restored = items[0] as Record<string, unknown>
        await setDoc(
          profileRef,
          sanitizeForFirestore({
            ...restored,
            // Preserve auth-critical fields from the live document
            uid:       existingData.uid       ?? restored.uid,
            email:     existingData.email     ?? restored.email,
            createdAt: existingData.createdAt ?? restored.createdAt,
            photoURL:  existingData.photoURL  ?? restored.photoURL,
          }),
        )
      }
    } else if (collName === 'settings') {
      // Restore each settings sub-document, but NEVER overwrite the backup doc
      const settingsOps: Array<{ type: 'set'; ref: ReturnType<typeof doc>; data: object }> = []
      for (const item of items as Array<{ _settingsId: string; [k: string]: unknown }>) {
        const { _settingsId, ...rest } = item
        if (!_settingsId || _settingsId === 'backup') continue
        settingsOps.push({
          type: 'set',
          ref: doc(db, 'users', uid, 'settings', _settingsId),
          data: sanitizeForFirestore(rest),
        })
      }
      await batchOps(settingsOps)
    } else {
      // Generic collections: delete existing docs, then write restored docs
      const existingSnap = await getDocs(collection(db, 'users', uid, collName))
      const deleteOps = existingSnap.docs.map((d) => ({
        type: 'delete' as const,
        ref: d.ref,
      }))
      await batchOps(deleteOps)

      const writeOps: Array<{ type: 'set'; ref: ReturnType<typeof doc>; data: object }> = []
      for (const item of items as Array<{ id?: unknown; [k: string]: unknown }>) {
        const id = item.id
        if (id === undefined || id === null) continue
        writeOps.push({
          type: 'set',
          ref: doc(db, 'users', uid, collName, String(id)),
          data: sanitizeForFirestore(item),
        })
      }
      await batchOps(writeOps)
    }
  }
}
