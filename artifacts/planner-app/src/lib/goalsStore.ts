import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Goal, GoalStep } from '@/data/goalsData'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Local pub/sub ───────────────────────────────────────────────────────────
type Listener = (goals: Goal[]) => void
type LoadingListener = (loading: boolean) => void

// ── Module-level state ──────────────────────────────────────────────────────
let _goals: Goal[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _listeners = new Set<Listener>()
const _loadingListeners = new Set<LoadingListener>()

function emit() {
  for (const l of _listeners) l(_goals)
}

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function goalsCol(uid: string) {
  return collection(db, 'users', uid, 'goals')
}

function goalDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'goals', id)
}

// ── Derived progress ────────────────────────────────────────────────────────
function recompute(goal: Goal): Goal {
  const done = goal.steps.filter((s) => s.done).length
  const total = goal.steps.length
  return { ...goal, progressValue: done, progressMax: Math.max(total, 1) }
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initGoalsStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _goals = []
  emit()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    goalsCol(uid),
    (snap) => {
      _goals = snap.docs.map((d) => d.data() as Goal)
      emit()
      setLoading(false)
    },
    () => {
      setLoading(false)
    },
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function addGoal(goal: Goal): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: goals store has no authenticated user')
  await setDoc(goalDoc(_currentUid, goal.id), sanitizeForFirestore(recompute(goal)))
}

export async function updateGoal(id: string, patch: Partial<Goal>): Promise<void> {
  if (!_currentUid) return
  const existing = _goals.find((g) => g.id === id)
  if (!existing) return
  await setDoc(goalDoc(_currentUid, id), sanitizeForFirestore(recompute({ ...existing, ...patch })))
}

export async function toggleStep(goalId: string, stepId: string): Promise<void> {
  if (!_currentUid) return
  const goal = _goals.find((g) => g.id === goalId)
  if (!goal) return
  const steps = goal.steps.map((s) =>
    s.id === stepId ? { ...s, done: !s.done } : s,
  )
  await setDoc(goalDoc(_currentUid, goalId), sanitizeForFirestore(recompute({ ...goal, steps })))
}

export async function addStep(goalId: string, title: string): Promise<void> {
  if (!_currentUid) return
  const goal = _goals.find((g) => g.id === goalId)
  if (!goal) return
  const step: GoalStep = { id: `step-${Date.now()}`, title, done: false }
  await setDoc(
    goalDoc(_currentUid, goalId),
    sanitizeForFirestore(recompute({ ...goal, steps: [...goal.steps, step] })),
  )
}

export async function deleteStep(goalId: string, stepId: string): Promise<void> {
  if (!_currentUid) return
  const goal = _goals.find((g) => g.id === goalId)
  if (!goal) return
  await setDoc(
    goalDoc(_currentUid, goalId),
    sanitizeForFirestore(recompute({ ...goal, steps: goal.steps.filter((s) => s.id !== stepId) })),
  )
}

export async function deleteGoal(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(goalDoc(_currentUid, id))
}

// ── Sync read ────────────────────────────────────────────────────────────────
export function getAllGoals(): Goal[] {
  return _goals
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function useGoals(): Goal[] {
  const [state, setState] = useState<Goal[]>(_goals)
  useEffect(() => {
    setState(_goals)
    const l: Listener = (g) => setState(g)
    _listeners.add(l)
    return () => { _listeners.delete(l) }
  }, [])
  return state
}

export function useGoalsLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}
