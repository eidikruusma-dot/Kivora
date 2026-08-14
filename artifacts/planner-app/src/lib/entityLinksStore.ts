/**
 * entityLinksStore.ts
 *
 * Unified Firestore store for cross-module item links.
 * Follows the same singleton onSnapshot + pub/sub + React hook pattern
 * used by all other Kivora stores.
 *
 * Firestore path: users/{uid}/entityLinks/{linkId}
 */

import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EntityLink, EntityType, RelationType } from '@/types/entityLinks'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Module-level singleton ────────────────────────────────────────────────────

let _links: EntityLink[] = []
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

type Listener = () => void
const _listeners = new Set<Listener>()

function emit(): void {
  for (const l of _listeners) l()
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

function col(uid: string) {
  return collection(db, 'users', uid, 'entityLinks')
}

function linkDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'entityLinks', id)
}

// ── Initialisation ────────────────────────────────────────────────────────────

export function initEntityLinksStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _links = []
  emit()

  if (!uid) return

  _unsubscribe = onSnapshot(
    col(uid),
    (snap) => {
      _links = snap.docs.map((d) => d.data() as EntityLink)
      emit()
    },
    (err) => {
      console.error('[entityLinksStore] onSnapshot error:', err)
    },
  )
}

// ── Write operations ──────────────────────────────────────────────────────────

export interface AddLinkParams {
  fromType: EntityType
  fromId: string
  toType: EntityType
  toId: string
  relationType: RelationType
}

/**
 * Add a link between two entities. Idempotent — if an identical link
 * (same from/to/type) already exists, it returns the existing one.
 */
export function addLink(params: AddLinkParams): EntityLink {
  const uid = _currentUid
  if (!uid) throw new Error('entityLinksStore: not authenticated')

  // Idempotency check — prevent duplicates
  const existing = _links.find(
    (l) =>
      l.fromType === params.fromType &&
      l.fromId === params.fromId &&
      l.toType === params.toType &&
      l.toId === params.toId &&
      l.relationType === params.relationType,
  )
  if (existing) return existing

  const now = Date.now()
  const link: EntityLink = {
    id: `link-${now}-${Math.random().toString(36).slice(2, 7)}`,
    ...params,
    createdAt: now,
    updatedAt: now,
  }

  // Optimistic update
  _links = [..._links, link]
  emit()

  setDoc(linkDoc(uid, link.id), sanitizeForFirestore(link)).catch(() => {
    // Revert on failure
    _links = _links.filter((l) => l.id !== link.id)
    emit()
  })

  return link
}

/**
 * Remove a single link by ID.
 */
export function removeLink(id: string): void {
  const uid = _currentUid
  if (!uid) return

  const previous = _links
  _links = _links.filter((l) => l.id !== id)
  emit()

  deleteDoc(linkDoc(uid, id)).catch(() => {
    _links = previous
    emit()
  })
}

/**
 * Remove all links that reference the given entity (in either direction).
 * Call this when an item is deleted to avoid orphaned links.
 */
export function removeLinksForEntity(type: EntityType, entityId: string): void {
  const uid = _currentUid
  if (!uid) return

  const toDelete = _links.filter(
    (l) =>
      (l.fromType === type && l.fromId === entityId) ||
      (l.toType === type && l.toId === entityId),
  )
  if (toDelete.length === 0) return

  const previous = _links
  _links = _links.filter((l) => !toDelete.find((d) => d.id === l.id))
  emit()

  const batch = writeBatch(db)
  for (const l of toDelete) batch.delete(linkDoc(uid, l.id))
  batch.commit().catch(() => {
    _links = previous
    emit()
  })
}

// ── Read operations ───────────────────────────────────────────────────────────

export function getLinksForEntity(type: EntityType, entityId: string): EntityLink[] {
  return _links.filter(
    (l) =>
      (l.fromType === type && l.fromId === entityId) ||
      (l.toType === type && l.toId === entityId),
  )
}

/** Returns true if a `scheduled` link already exists from this entity to any calendar event. */
export function hasCalendarLink(type: EntityType, entityId: string): boolean {
  return _links.some(
    (l) =>
      l.relationType === 'scheduled' &&
      ((l.fromType === type && l.fromId === entityId) ||
        (l.toType === type && l.toId === entityId)),
  )
}

export function getAllLinks(): EntityLink[] {
  return _links
}

// ── Pub/sub ───────────────────────────────────────────────────────────────────

export function subscribeLinks(cb: Listener): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useEntityLinks(): EntityLink[] {
  const [state, setState] = useState<EntityLink[]>(_links)
  useEffect(() => {
    setState(_links)
    return subscribeLinks(() => setState([..._links]))
  }, [])
  return state
}

export function useLinksForEntity(type: EntityType, entityId: string): EntityLink[] {
  const all = useEntityLinks()
  return all.filter(
    (l) =>
      (l.fromType === type && l.fromId === entityId) ||
      (l.toType === type && l.toId === entityId),
  )
}
