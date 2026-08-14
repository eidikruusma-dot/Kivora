import { useState, useEffect, useCallback } from 'react'
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
import type { Task } from '@/types'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Local pub/sub types ─────────────────────────────────────────────────────
type TaskListener = (tasks: Task[]) => void
type LoadingListener = (loading: boolean) => void

// ── Module-level state ──────────────────────────────────────────────────────
// These are module singletons so any number of React components can subscribe
// to the same Firestore listener without duplicating network calls.
let _tasks: Task[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _taskListeners = new Set<TaskListener>()
const _loadingListeners = new Set<LoadingListener>()

// ── Internal emitters ───────────────────────────────────────────────────────
function emitTasks() {
  for (const l of _taskListeners) l(_tasks)
}

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore path helpers ──────────────────────────────────────────────────
function tasksCol(uid: string) {
  return collection(db, 'users', uid, 'tasks')
}

function taskDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'tasks', id)
}

// ── Store initialisation ────────────────────────────────────────────────────
// Called by AuthContext on every auth-state change (sign-in, sign-out, user
// switch).  Idempotent: no-op when the uid has not changed.
export function initTasksStore(uid: string | null): void {
  if (uid === _currentUid) return

  // Tear down any existing Firestore listener.
  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _tasks = []
  emitTasks()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    tasksCol(uid),
    (snap) => {
      _tasks = snap.docs.map((d) => d.data() as Task)
      emitTasks()
      setLoading(false)
    },
    () => {
      // On Firestore error surface an empty list and stop the spinner.
      setLoading(false)
    },
  )
}

// ── CRUD operations ─────────────────────────────────────────────────────────
// All writes are fire-and-forget from the component side; the onSnapshot
// listener automatically reflects the change back to every subscriber.

export async function addTask(task: Task): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: tasks store has no authenticated user')
  const now = new Date().toISOString()
  await setDoc(taskDoc(_currentUid, task.id), sanitizeForFirestore({
    ...task,
    createdAt: task.createdAt ?? now,
    updatedAt: now,
  }))
}

export async function updateTask(updated: Task): Promise<void> {
  if (!_currentUid) return
  await setDoc(taskDoc(_currentUid, updated.id), sanitizeForFirestore({
    ...updated,
    updatedAt: new Date().toISOString(),
  }))
}

export async function toggleTask(id: string): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === id)
  if (!task) return
  await updateDoc(taskDoc(_currentUid, id), {
    completed: !task.completed,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteTask(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(taskDoc(_currentUid, id))
}

// ── Synchronous read ────────────────────────────────────────────────────────
// Used by AI context builder, notification generators, etc.
// Returns the current in-memory snapshot; always up-to-date after the initial
// onSnapshot fires.
export function getAllTasks(): Task[] {
  return _tasks
}

// ── React hooks ─────────────────────────────────────────────────────────────

export function useTasks(): Task[] {
  const [state, setState] = useState<Task[]>(_tasks)
  useEffect(() => {
    setState(_tasks) // immediately sync with in-memory state on mount
    const l: TaskListener = (t) => setState(t)
    _taskListeners.add(l)
    return () => { _taskListeners.delete(l) }
  }, [])
  return state
}

export function useTasksLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}

export function useTaskActions() {
  return {
    addTask: useCallback((task: Task) => addTask(task), []),
    toggleTask: useCallback((id: string) => toggleTask(id), []),
    deleteTask: useCallback((id: string) => deleteTask(id), []),
  }
}
