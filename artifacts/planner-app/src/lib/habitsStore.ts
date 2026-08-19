import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Habit, HabitStatus, HabitCategory } from '@/data/habitsData'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// weekDays[] uses Monday=0 … Sunday=6 (ISO week, Estonian week starting Monday).
// JS getDay() returns Sunday=0, Monday=1 … Saturday=6, so we rotate by -1 mod 7.
export const TODAY_INDEX = (new Date().getDay() + 6) % 7

// ── Module-level state ────────────────────────────────────────────────────────

let _habits: Habit[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

type Listener = () => void
const _listeners = new Set<Listener>()

function emit() {
  for (const l of _listeners) l()
}

// ── Firestore path helpers ────────────────────────────────────────────────────

function habitsCol(uid: string) {
  return collection(db, 'users', uid, 'habits')
}

function habitDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'habits', id)
}

// ── Store initialisation ──────────────────────────────────────────────────────
// Called by AuthContext on every auth-state change. Idempotent for same uid.

export function initHabitsStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _habits = []
  emit()

  if (!uid) {
    _loading = false
    return
  }

  _loading = true

  _unsubscribe = onSnapshot(
    habitsCol(uid),
    (snap) => {
      _habits = snap.docs.map((d) => d.data() as Habit)
      _loading = false
      emit()
    },
    () => {
      // On Firestore error leave the list empty and stop the spinner.
      _loading = false
      emit()
    },
  )
}

// ── Public reads ──────────────────────────────────────────────────────────────

export function getAllHabits(): Habit[] {
  return _habits
}

export function getDashboardPercent(): number {
  const active = _habits.filter((h) => h.status === 'active')
  if (active.length === 0) return 0
  const done = active.filter((h) => h.weekDays[TODAY_INDEX] === true).length
  return Math.round((done / active.length) * 100)
}

// ── React subscriptions ───────────────────────────────────────────────────────

export function subscribeHabits(cb: Listener): () => void {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

export function useHabits(): Habit[] {
  const [state, setState] = useState<Habit[]>(_habits)
  useEffect(() => {
    setState(_habits)
    return subscribeHabits(() => setState([..._habits]))
  }, [])
  return state
}

export function useHabitsLoading(): boolean {
  const [state, setState] = useState(_loading)
  useEffect(() => {
    setState(_loading)
    return subscribeHabits(() => setState(_loading))
  }, [])
  return state
}

// ── CRUD – all writes go to Firestore; onSnapshot reflects them back ──────────

export async function addHabit(input: {
  title: string
  description: string
  category: HabitCategory
  icon: Habit['icon']
  iconColor: string
  iconBg: string
  recurrence: 'daily' | 'weekdays' | 'custom'
  customDays?: boolean[]
}): Promise<Habit> {
  let weekDays: (boolean | null)[]
  if (input.recurrence === 'daily') {
    weekDays = [true, true, true, true, true, true, true]
  } else if (input.recurrence === 'weekdays') {
    weekDays = [true, true, true, true, true, false, false]
  } else {
    weekDays = (input.customDays ?? [false, false, false, false, false, false, false]).map(
      (d) => (d ? true : null),
    )
    if (!weekDays.some((d) => d === true)) {
      weekDays = [true, true, true, true, true, false, false]
    }
  }

  const habit: Habit = {
    id: `habit-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    iconBg: input.iconBg,
    iconColor: input.iconColor,
    icon: input.icon,
    streak: 0,
    status: 'active',
    category: input.category,
    weekDays,
  }

  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: habits store has no authenticated user')
  // Optimistic local update for immediate UI feedback
  _habits = [habit, ..._habits]
  emit()
  await setDoc(habitDoc(_currentUid, habit.id), sanitizeForFirestore(habit))

  return habit
}

export async function updateHabit(id: string, updates: Partial<Habit>): Promise<void> {
  if (!_currentUid) return

  // Optimistic
  _habits = _habits.map((h) => (h.id === id ? { ...h, ...updates } : h))
  emit()

  await updateDoc(habitDoc(_currentUid, id), sanitizeForFirestore(updates as Record<string, unknown>))
}

export async function toggleToday(id: string): Promise<void> {
  if (!_currentUid) return

  const habit = _habits.find((h) => h.id === id)
  if (!habit) return

  const isDone = habit.weekDays[TODAY_INDEX] === true
  const nextDays = [...habit.weekDays]
  nextDays[TODAY_INDEX] = !isDone
  const nextStreak = isDone ? Math.max(0, habit.streak - 1) : habit.streak + 1

  const updates = { weekDays: nextDays, streak: nextStreak }

  // Optimistic
  _habits = _habits.map((h) => (h.id === id ? { ...h, ...updates } : h))
  emit()

  await updateDoc(habitDoc(_currentUid, id), sanitizeForFirestore(updates))
}

export async function setStatus(id: string, status: HabitStatus): Promise<void> {
  if (!_currentUid) return

  const habit = _habits.find((h) => h.id === id)
  if (!habit) return

  const updates: Partial<Habit> =
    status === 'paused'
      ? { status, weekDays: habit.weekDays.map(() => null) }
      : { status }

  // Optimistic
  _habits = _habits.map((h) => (h.id === id ? { ...h, ...updates } : h))
  emit()

  await updateDoc(habitDoc(_currentUid, id), sanitizeForFirestore(updates as Record<string, unknown>))
}

export async function deleteHabit(id: string): Promise<void> {
  if (!_currentUid) return

  // Optimistic
  _habits = _habits.filter((h) => h.id !== id)
  emit()

  await deleteDoc(habitDoc(_currentUid, id))
}
