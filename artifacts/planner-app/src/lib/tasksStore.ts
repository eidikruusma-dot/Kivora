import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Task } from '@/types'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import { getLinksForEntity, linkDoc as entityLinkDoc } from '@/lib/entityLinksStore'
import { eventDoc as calendarEventDoc } from '@/lib/calendarStore'
import { syncSchoolTaskFromLinkedTask } from '@/lib/schoolStore'

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
  const nextCompleted = !task.completed
  await updateDoc(taskDoc(_currentUid, id), {
    completed: nextCompleted,
    updatedAt: new Date().toISOString(),
  })
  // Keep a School task's completion in sync when this Task is the one a
  // School assignment's "add to Tasks" checkbox created/links to (School
  // change #4) — no-op when no School task links to this one, or when it's
  // already in sync. Every UI surface that calls this function (TasksPage,
  // the Dashboard task widgets, FinancePage) gets this for free.
  await syncSchoolTaskFromLinkedTask(id, nextCompleted)
}

/**
 * Sets a task's completed state to an explicit value (rather than flipping
 * it) and skips the write entirely when it's already there — this exact
 * idempotence is what stops School<->Tasks completion sync from
 * ping-ponging: propagating a change back to the side that already has it
 * is always a no-op, so the chain terminates after one hop each way.
 * No-ops safely if the task no longer exists (the School side that
 * initiated this remains usable either way).
 */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === id)
  if (!task) return
  if (task.completed === completed) return
  try {
    await updateDoc(taskDoc(_currentUid, id), {
      completed,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    // Write failed — a counterpart-sync failure must never surface as an
    // error on the School side that triggered it.
  }
}

// The auto-linking service (automaticLinking.ts) stamps every calendar event
// it creates automatically with this id prefix. It is the only place in the
// codebase that generates ids with this prefix — every other calendar-event
// creation path (manual "link to calendar" flows, the AI assistant, the
// Calendar page itself) uses a different prefix. A `scheduled` EntityLink
// alone does NOT prove a calendar event was auto-created — the same
// relationType is used when a user manually links a task to a pre-existing
// event (see LinkPickerModal, PostSaveLinkSuggestionsDialog). Checking this
// prefix on the link's toId is what distinguishes "owned by this task" from
// "independently created and merely linked."
const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'

/**
 * Deletes a task and cascades to the calendar event it automatically
 * created (if any) plus every EntityLink referencing it, all in a single
 * atomic Firestore batch — the task, its owned calendar event, and its
 * links either all disappear together or none of them do.
 *
 * Calendar events the task is merely linked to (not auto-created for it)
 * are left untouched, as are links/events belonging to other entities.
 *
 * This is the single shared deletion path — every task-deletion entry point
 * (TasksPage, the AI assistant's delete_task action, useTaskActions) calls
 * this same exported function, so the cascade applies everywhere uniformly.
 */
export async function deleteTask(id: string): Promise<void> {
  if (!_currentUid) return
  const uid = _currentUid

  const links = getLinksForEntity('task', id)
  const ownedCalendarEventIds = links
    .filter(
      (l) =>
        l.relationType === 'scheduled' &&
        l.fromType === 'task' &&
        l.fromId === id &&
        l.toType === 'calendar' &&
        l.toId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX),
    )
    .map((l) => l.toId)

  const batch = writeBatch(db)
  batch.delete(taskDoc(uid, id))
  for (const eventId of ownedCalendarEventIds) {
    batch.delete(calendarEventDoc(uid, eventId))
  }
  for (const link of links) {
    batch.delete(entityLinkDoc(uid, link.id))
  }
  await batch.commit()
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
