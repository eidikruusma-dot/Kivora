import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import type { PlanTemplateType } from '@/data/planTemplates'

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

// ── Sync read ────────────────────────────────────────────────────────────────
export function getAllPlans(): Plan[] {
  return _plans
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
