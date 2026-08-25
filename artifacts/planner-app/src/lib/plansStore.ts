import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import type { PlanTemplate, PlanTemplateType } from '@/data/planTemplates'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanItem {
  id: string
  label: string
  done: boolean
  date?: string
  note?: string
}

export interface Plan {
  id: string
  type: PlanTemplateType
  title: string
  color: string
  startDate?: string
  endDate?: string
  items: PlanItem[]
  createdAt: number
  updatedAt: number
}

/**
 * Progress is derived from `items` on every read and never persisted —
 * a stored percentage could drift from the actual items if either changed
 * without the other being recomputed.
 */
export function computePlanProgress(plan: Plan): { done: number; total: number; percent: number } {
  const total = plan.items.length
  const done = plan.items.filter((i) => i.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}

// ── Creation-form validation ─────────────────────────────────────────────────
// Pure so the create-plan UI and its tests share one source of truth.

export function isValidPlanTitle(title: string): boolean {
  return title.trim().length > 0
}

/** Empty start/end dates are valid (both optional) — only a real inversion is rejected. */
export function isValidPlanDateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return true
  return endDate >= startDate
}

export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Date-only arithmetic (UTC, no timezone/DST drift) ─────────────────────────
// `startDate`/`endDate` are plain YYYY-MM-DD strings with no time component.
// All shifting is done via Date.UTC + getUTC* so the host machine's timezone
// and DST transitions can never shift a date by a day either direction.

const MS_PER_DAY = 24 * 60 * 60 * 1000

function isoDateToUTCms(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcMsToISODate(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftISODate(dateStr: string, days: number): string {
  return utcMsToISODate(isoDateToUTCms(dateStr) + days * MS_PER_DAY)
}

/**
 * Shifts a start/end date pair forward to the next equal-length period,
 * starting the day after the original period ends — e.g. 24–30 Aug becomes
 * 31 Aug–6 Sep. Month/year boundaries fall out of Date.UTC's own
 * normalisation, so no special-casing is needed for them. Only a real pair
 * (both dates present) is shifted; a missing start or end yields no dates,
 * matching "no dates on the original → no dates on the copy".
 */
export function shiftPlanDatesForward(
  startDate: string | undefined,
  endDate: string | undefined,
): { startDate?: string; endDate?: string } {
  if (!startDate || !endDate) return {}
  const periodDays = Math.round((isoDateToUTCms(endDate) - isoDateToUTCms(startDate)) / MS_PER_DAY)
  const newStart = shiftISODate(endDate, 1)
  const newEnd = shiftISODate(newStart, periodDays)
  return { startDate: newStart, endDate: newEnd }
}

/**
 * The one generic clone helper — builds a brand-new, ready-to-save Plan from
 * an existing one: fresh plan id, fresh item ids, every item reset to
 * done: false, dates shifted forward one period, and a translated
 * "Copy: " title prefix. Never mutates `original`; PlanFormModal (already
 * shared by create/edit) is reused to let the user adjust title/color/dates
 * before this is actually written via addPlan().
 */
export function clonePlanForCreation(original: Plan, lang: AppLang): Plan {
  const now = Date.now()
  const { startDate, endDate } = shiftPlanDatesForward(original.startDate, original.endDate)
  return {
    id: generatePlanId(),
    type: original.type,
    title: `${t('plans.copy.titlePrefix', lang)} ${original.title}`,
    color: original.color,
    startDate,
    endDate,
    items: original.items.map((item) => ({
      id: generateItemId(),
      label: item.label,
      done: false,
      ...(item.note ? { note: item.note } : {}),
    })),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Builds the checklist items a new plan starts with from a template's
 * blueprints. Labels are translated once, at creation time, into plain
 * strings stored on the plan — a later language switch does not touch
 * items that already exist.
 */
export function createPlanItemsFromTemplate(template: PlanTemplate, lang: AppLang): PlanItem[] {
  return template.itemBlueprints.map((bp) => ({
    id: `${template.type}-${bp.id}`,
    label: t(bp.titleKey, lang),
    done: false,
  }))
}

// ── Item validation ──────────────────────────────────────────────────────────

export function isValidItemLabel(label: string): boolean {
  return label.trim().length > 0
}

// ── Date formatting (shared by PlansPage and PlanDetailPage) ─────────────────

export function formatPlanDate(dateStr: string, lang: AppLang): string {
  return new Date(dateStr).toLocaleDateString(lang === 'et' ? 'et-EE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function formatDateRange(plan: Plan, lang: AppLang): string | null {
  if (plan.startDate && plan.endDate) {
    return `${formatPlanDate(plan.startDate, lang)} – ${formatPlanDate(plan.endDate, lang)}`
  }
  if (plan.startDate) return formatPlanDate(plan.startDate, lang)
  if (plan.endDate) return formatPlanDate(plan.endDate, lang)
  return null
}

// ── Local pub/sub ───────────────────────────────────────────────────────────
type Listener = (plans: Plan[]) => void
type LoadingListener = (loading: boolean) => void

// ── Module-level state ──────────────────────────────────────────────────────
let _plans: Plan[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _listeners = new Set<Listener>()
const _loadingListeners = new Set<LoadingListener>()

function emit() {
  for (const l of _listeners) l(_plans)
}

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function plansCol(uid: string) {
  return collection(db, 'users', uid, 'plans')
}

function planDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'plans', id)
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initPlansStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _plans = []
  emit()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    plansCol(uid),
    (snap) => {
      _plans = snap.docs.map((d) => d.data() as Plan)
      emit()
      setLoading(false)
    },
    () => {
      setLoading(false)
    },
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function addPlan(plan: Plan): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: plans store has no authenticated user')
  await setDoc(planDoc(_currentUid, plan.id), sanitizeForFirestore(plan))
}

export interface PlanDetailsUpdate {
  title: string
  color: string
  startDate: string
  endDate: string
}

/**
 * Writes only title/color/startDate/endDate/updatedAt via a Firestore
 * partial update — never `type`, `id`, `items`, or `createdAt`, and never a
 * full-document overwrite. Because `updateDoc` touches only the fields
 * named in its payload, a concurrent item mutation (which runs through the
 * `items`-only transaction above) can never be clobbered by this call, and
 * this call can never clobber it either.
 */
export async function updatePlanDetails(planId: string, details: PlanDetailsUpdate): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: plans store has no authenticated user')
  if (!isValidPlanTitle(details.title)) throw new Error('INVALID_PLAN_TITLE')
  if (!isValidPlanDateRange(details.startDate, details.endDate)) throw new Error('INVALID_DATE_RANGE')
  await updateDoc(planDoc(_currentUid, planId), {
    title: details.title.trim(),
    color: details.color,
    startDate: details.startDate ? details.startDate : deleteField(),
    endDate: details.endDate ? details.endDate : deleteField(),
    updatedAt: Date.now(),
  })
}

export async function deletePlan(planId: string): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: plans store has no authenticated user')
  await deleteDoc(planDoc(_currentUid, planId))
}

function generateItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * The one generic write path for a plan's checklist. Runs inside a Firestore
 * transaction: reads the plan fresh from the server, applies `mutate` to
 * that server-fresh `items` array (never the local `_plans` cache, which can
 * be stale the instant two writes race), and writes the result back in the
 * same transaction. Firestore retries the whole transaction automatically if
 * another write lands on the document in between the read and the commit,
 * so two concurrent single-item mutations (e.g. toggling item A while item B
 * is being added) each apply cleanly instead of one clobbering the other.
 */
export async function mutatePlanItems(
  planId: string,
  mutate: (items: PlanItem[]) => PlanItem[],
): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: plans store has no authenticated user')
  const ref = planDoc(_currentUid, planId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('PLAN_NOT_FOUND')
    const plan = snap.data() as Plan
    const items = mutate(plan.items)
    tx.set(ref, sanitizeForFirestore({ ...plan, items, updatedAt: Date.now() }))
  })
}

export async function addPlanItem(planId: string, label: string, note?: string): Promise<void> {
  if (!isValidItemLabel(label)) throw new Error('INVALID_ITEM_LABEL')
  const trimmedNote = note?.trim()
  const newItem: PlanItem = {
    id: generateItemId(),
    label: label.trim(),
    done: false,
    ...(trimmedNote ? { note: trimmedNote } : {}),
  }
  await mutatePlanItems(planId, (items) => [...items, newItem])
}

export async function updatePlanItem(
  planId: string,
  itemId: string,
  patch: { label?: string; note?: string },
): Promise<void> {
  await mutatePlanItems(planId, (items) => {
    const index = items.findIndex((item) => item.id === itemId)
    if (index === -1) throw new Error('ITEM_NOT_FOUND')
    const item = items[index]
    const nextLabel = patch.label !== undefined ? patch.label.trim() : item.label
    if (!isValidItemLabel(nextLabel)) throw new Error('INVALID_ITEM_LABEL')
    const nextNote = patch.note !== undefined ? patch.note.trim() : item.note
    const next = [...items]
    next[index] = { ...item, label: nextLabel, note: nextNote || undefined }
    return next
  })
}

export async function togglePlanItem(planId: string, itemId: string): Promise<void> {
  await mutatePlanItems(planId, (items) => {
    const index = items.findIndex((item) => item.id === itemId)
    if (index === -1) throw new Error('ITEM_NOT_FOUND')
    const next = [...items]
    next[index] = { ...next[index], done: !next[index].done }
    return next
  })
}

export async function deletePlanItem(planId: string, itemId: string): Promise<void> {
  await mutatePlanItems(planId, (items) => {
    if (!items.some((item) => item.id === itemId)) throw new Error('ITEM_NOT_FOUND')
    return items.filter((item) => item.id !== itemId)
  })
}

// ── Sync read ────────────────────────────────────────────────────────────────
export function getAllPlans(): Plan[] {
  return _plans
}

export function findPlanById(plans: Plan[], planId: string | undefined): Plan | undefined {
  if (!planId) return undefined
  return plans.find((p) => p.id === planId)
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function usePlans(): Plan[] {
  const [state, setState] = useState<Plan[]>(_plans)
  useEffect(() => {
    setState(_plans)
    const l: Listener = (p) => setState(p)
    _listeners.add(l)
    return () => { _listeners.delete(l) }
  }, [])
  return state
}

export function usePlan(planId: string | undefined): Plan | undefined {
  const plans = usePlans()
  return findPlanById(plans, planId)
}

export function usePlansLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}
