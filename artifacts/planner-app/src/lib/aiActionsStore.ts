/**
 * aiActionsStore.ts
 *
 * Kivora 2.0, Etapp 2.1 — the data model and store for a history of
 * actions Kivora itself takes on a user's data autonomously.
 *
 * SCOPE OF THIS FILE (2.1 only). It provides:
 *   - the AiAction / AiActionChange / AiActionFieldValue data model;
 *   - a Firestore-backed store (singleton onSnapshot + pub/sub, same
 *     pattern as every other Kivora store);
 *   - recordAiAction(): an idempotent way to write one action, keyed by
 *     a caller-supplied retryKey (see generateAiActionRetryKey() below).
 *
 * It deliberately does NOT (left for later, separately-confirmed stages):
 *   - call into automaticLinking.ts or any other autonomous-write path
 *     (Etapp 2.2);
 *   - implement reverting an action (Etapp 2.3) — only the data shape a
 *     future transactional revert will need (snapshotUpdatedAt, the
 *     present/absent AiActionFieldValue wrapper) is built now.
 *
 * PERMANENT LIMITATION — read before using this collection for anything:
 * this log is written by the CLIENT, exactly like every other Kivora
 * collection (tasks, calendarEvents, entityLinks, ...). Firestore
 * security rules only know that the request comes from
 * `request.auth.uid == uid` — they cannot distinguish "Kivora's own code
 * wrote this" from "the account owner wrote this directly, e.g. via
 * devtools". A user can therefore fabricate or edit an AiAction document
 * about their OWN account. That grants them no capability they didn't
 * already have (they can already edit their own Task/CalendarEvent/etc.
 * directly, with no Kivora logic involved at all) — the residual risk is
 * limited to self-deception, never a cross-user or privilege-escalation
 * risk. NEVER use this collection as a source of truth for a server-side
 * authorization decision, a financial decision, or as evidence in a
 * dispute. A genuinely tamper-proof audit trail would need to be WRITTEN
 * BY A SERVER (the pattern api-server/src/lib/aiQuota.ts already uses for
 * the AI daily quota, which lives outside `users/{uid}` and is never
 * touched by the client SDK) — a materially bigger change, out of scope
 * here.
 */

import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  runTransaction,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EntityType } from '@/types/entityLinks'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Data model ────────────────────────────────────────────────────────────

export const AI_ACTION_TYPES = [
  'createLink',
  'createCalendarEvent',
  'fillCategory',
  'flagDuplicate',
] as const
export type AiActionType = typeof AI_ACTION_TYPES[number]

export const AI_ACTION_REVERT_STATUSES = ['none', 'reverted', 'expired', 'blocked'] as const
export type AiActionRevertStatus = typeof AI_ACTION_REVERT_STATUSES[number]

const MAX_RELATED_CHANGES = 5
const MAX_REASON_LENGTH = 200
const MAX_ENTITY_ID_LENGTH = 200
const MAX_FIELD_NAME_LENGTH = 100

/**
 * Distinguishes "this field did not exist at all" from "this field's
 * value was null" — a future revert of an originally-ABSENT field (e.g.
 * a Task's optional `category`, never set) must delete the field
 * (Firestore's deleteField() sentinel), never write a literal `null`
 * into a field that was never there in the first place.
 */
export type AiActionFieldValue =
  | { present: false }
  | { present: true; value: string | number | boolean | null }

export interface AiActionChange {
  module: EntityType
  entityId: string
  field: string
  oldValue: AiActionFieldValue
  newValue: AiActionFieldValue
}

export interface AiAction {
  /**
   * Also the Firestore document id, and equal to the caller-supplied
   * retryKey (see recordAiAction()/generateAiActionRetryKey()).
   * Deliberately NOT derived from type+module+entityId+date — the same
   * entity can have several separate, distinct actions on the same day,
   * and a coarser derived key would incorrectly collapse them into one.
   */
  id: string
  type: AiActionType
  module: EntityType
  entityId: string
  relatedChanges: AiActionChange[]
  reason: string
  createdAt: string
  revertible: boolean
  revertStatus: AiActionRevertStatus
  /**
   * Each affected document's own updatedAt AT THE MOMENT Kivora wrote it.
   * A future transactional revert (Etapp 2.3) compares this against the
   * entity's CURRENT updatedAt before restoring anything, so a revert
   * never clobbers a change the user made after Kivora's own write.
   */
  snapshotUpdatedAt: Record<string, string>
}

// ── Module-level singleton (same onSnapshot + pub/sub pattern as every
// other Kivora store, e.g. entityLinksStore.ts) ─────────────────────────────

let _actions: AiAction[] = []
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

type Listener = () => void
const _listeners = new Set<Listener>()

function emit(): void {
  for (const l of _listeners) l()
}

function col(uid: string) {
  return collection(db, 'users', uid, 'aiActions')
}

export function actionDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'aiActions', id)
}

export function initAiActionsStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _actions = []
  emit()

  if (!uid) return

  _unsubscribe = onSnapshot(
    col(uid),
    (snap) => {
      _actions = snap.docs.map((d) => d.data() as AiAction)
      emit()
    },
    (err) => {
      console.error('[aiActionsStore] onSnapshot error:', err)
    },
  )
}

export function getAllAiActions(): AiAction[] {
  return _actions
}

export function subscribeAiActions(cb: Listener): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

export function useAiActions(): AiAction[] {
  const [state, setState] = useState<AiAction[]>(_actions)
  useEffect(() => {
    setState(_actions)
    return subscribeAiActions(() => setState([..._actions]))
  }, [])
  return state
}

// ── Recording an action ──────────────────────────────────────────────────────

/**
 * A fresh, caller-owned identity for one real autonomous action.
 * Generate ONE of these when the autonomous decision is made, and reuse
 * the SAME value only if that specific attempt is retried (e.g. after a
 * network failure) — never derive it from type/module/entityId/date,
 * and never generate a new one for what is really the same attempt.
 */
export function generateAiActionRetryKey(): string {
  return crypto.randomUUID()
}

export interface RecordAiActionParams {
  retryKey: string
  type: AiActionType
  module: EntityType
  entityId: string
  relatedChanges: AiActionChange[]
  reason: string
  revertible: boolean
  snapshotUpdatedAt: Record<string, string>
}

function validateChange(c: AiActionChange): void {
  if (!c.entityId || c.entityId.length > MAX_ENTITY_ID_LENGTH) {
    throw new Error('INVALID_AI_ACTION_CHANGE: entityId missing or too long')
  }
  if (!c.field || c.field.length > MAX_FIELD_NAME_LENGTH) {
    throw new Error('INVALID_AI_ACTION_CHANGE: field missing or too long')
  }
  if (typeof c.oldValue?.present !== 'boolean' || typeof c.newValue?.present !== 'boolean') {
    throw new Error('INVALID_AI_ACTION_CHANGE: oldValue/newValue must be an AiActionFieldValue')
  }
}

/**
 * Defense-in-depth validation independent of the Firestore rules (which
 * enforce the same constraints server-side — see firestore.rules'
 * `users/{uid}/aiActions/{actionId}` block). Throws on anything invalid
 * rather than silently writing a malformed record.
 */
function validateParams(params: RecordAiActionParams): void {
  if (!params.retryKey) {
    throw new Error('INVALID_AI_ACTION: retryKey is required')
  }
  if (!(AI_ACTION_TYPES as readonly string[]).includes(params.type)) {
    throw new Error(`INVALID_AI_ACTION: unknown type "${params.type}"`)
  }
  if (!params.entityId || params.entityId.length > MAX_ENTITY_ID_LENGTH) {
    throw new Error('INVALID_AI_ACTION: entityId missing or too long')
  }
  if (!params.reason || params.reason.length > MAX_REASON_LENGTH) {
    throw new Error('INVALID_AI_ACTION: reason must be 1-200 characters')
  }
  if (params.relatedChanges.length === 0 || params.relatedChanges.length > MAX_RELATED_CHANGES) {
    throw new Error(`INVALID_AI_ACTION: relatedChanges must have 1-${MAX_RELATED_CHANGES} entries`)
  }
  for (const c of params.relatedChanges) validateChange(c)
}

/**
 * Pure — builds the exact document shape recordAiAction() writes.
 * Exported so a future Etapp 2.2 integration can fold this SAME
 * check-and-build logic into ONE transaction together with the real
 * autonomous mutation, instead of calling recordAiAction() as a
 * separate, non-atomic step after it (see recordAiAction()'s own doc
 * comment for why that matters).
 */
export function buildAiActionDocData(params: RecordAiActionParams): AiAction {
  validateParams(params)
  return {
    id: params.retryKey,
    type: params.type,
    module: params.module,
    entityId: params.entityId,
    relatedChanges: params.relatedChanges,
    reason: params.reason,
    createdAt: new Date().toISOString(),
    revertible: params.revertible,
    revertStatus: 'none',
    snapshotUpdatedAt: params.snapshotUpdatedAt,
  }
}

/**
 * Idempotently records one autonomous action. Runs its own transaction:
 * if a document already exists at `retryKey`, this is a retry of the
 * SAME attempt and is a safe no-op; otherwise creates the record with
 * revertStatus 'none'.
 *
 * This commits its OWN, standalone transaction, which is correct and
 * sufficient for this stage (2.1), where nothing yet calls it from a
 * real autonomous-write path. A FUTURE (2.2+) integration that performs
 * an actual autonomous data change must NOT call this function as a
 * separate step after that change — that would reintroduce exactly the
 * "two atomic operations, non-atomic together" gap this design exists to
 * avoid. Instead it should fold buildAiActionDocData() into ONE shared
 * transaction together with the real mutation, so a logging failure can
 * never leave an unlogged, invisible automatic change.
 */
export async function recordAiAction(params: RecordAiActionParams): Promise<string> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: aiActions store has no authenticated user')
  const uid = _currentUid
  const ref = actionDoc(uid, params.retryKey)
  const docData = buildAiActionDocData(params)

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) return // retry of the same attempt — already recorded
    tx.set(ref, sanitizeForFirestore(docData))
  })

  return params.retryKey
}

export async function deleteAiAction(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(actionDoc(_currentUid, id))
}

export function getAiAction(id: string): AiAction | undefined {
  return _actions.find((a) => a.id === id)
}
