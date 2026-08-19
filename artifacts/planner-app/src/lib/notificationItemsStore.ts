import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getLocalNotificationSettings } from '@/lib/notificationsStore'
import type { NotificationModules } from '@/lib/notificationsStore'
import { notifyOtherDevices } from '@/lib/pushNotifications'

// ── Types ────────────────────────────────────────────────────────────────────

export type NotifIcon =
  | 'clock'
  | 'calendar'
  | 'repeat'
  | 'check'
  | 'target'
  | 'shield'
  | 'bot'
  | 'database'
  | 'download'

export type NotifModule = keyof NotificationModules | 'system'

export interface NotifItem {
  id: string
  type: string
  module: NotifModule
  title: string
  description: string
  timeLabel: string
  read: boolean
  icon: NotifIcon
  accent: string
  createdAt: number // timestamp ms
  /** Optional deep-link path (e.g. '/app/tasks', '/app/habits') for navigation on click */
  link?: string
}

// ── Module-level state ────────────────────────────────────────────────────────

let _items: NotifItem[] = []
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

type Listener = () => void
const _listeners = new Set<Listener>()

function emit() {
  for (const l of _listeners) l()
}

// ── Firestore paths ───────────────────────────────────────────────────────────

function notifCol(uid: string) {
  return collection(db, 'users', uid, 'notifications')
}

function notifDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'notifications', id)
}

// ── Initialisation ────────────────────────────────────────────────────────────

export function initNotificationItemsStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _items = []
  emit()

  if (!uid) return

  // Load the 100 most recent notifications, newest first
  const q = query(notifCol(uid), orderBy('createdAt', 'desc'), limit(100))

  _unsubscribe = onSnapshot(
    q,
    (snap) => {
      _items = snap.docs.map((d) => d.data() as NotifItem)
      emit()
    },
    () => {
      // On error, leave _items as-is
    },
  )
}

// ── Quiet-hours check ─────────────────────────────────────────────────────────

function isInQuietHours(): boolean {
  const settings = getLocalNotificationSettings()
  if (!settings.quietHoursEnabled) return false

  const now = new Date()
  const [startH, startM] = settings.quietStart.split(':').map(Number)
  const [endH, endM] = settings.quietEnd.split(':').map(Number)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  } else {
    // Overnight window e.g. 22:00–08:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes
  }
}

// ── Deduplication helper ──────────────────────────────────────────────────────

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hasDuplicateToday(type: string): boolean {
  const today = todayDateStr()
  return _items.some((it) => {
    if (it.type !== type) return false
    const d = new Date(it.createdAt)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return ds === today
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export function dispatch(item: Omit<NotifItem, 'id' | 'createdAt'>): boolean {
  if (!_currentUid) return false

  const settings = getLocalNotificationSettings()

  // Check in-app channel
  if (!settings.inApp) return false

  // Check quiet hours
  if (isInQuietHours()) return false

  // Check module toggle (only for known module toggles, not 'system')
  if (item.module !== 'system' && item.module in settings.modules) {
    const mod = item.module as keyof NotificationModules
    if (!settings.modules[mod]) return false
  }

  // Deduplication by type+day
  if (hasDuplicateToday(item.type)) return false

  const newItem: NotifItem = {
    ...item,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  }

  // Optimistic local update for immediate feedback
  _items = [newItem, ..._items]
  emit()

  // Persist to Firestore
  setDoc(notifDoc(_currentUid, newItem.id), newItem).catch(() => {})

  // Deliver to other registered devices via Web Push (fire-and-forget)
  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '')
  const pushUrl = `${window.location.origin}${base}${newItem.link ?? '/app/notifications'}`
  notifyOtherDevices(_currentUid, {
    title: newItem.title,
    body: newItem.description,
    url: pushUrl,
    tag: newItem.id,
  }).catch(() => {})

  return true
}

export function markRead(id: string): void {
  if (!_currentUid) return

  // Optimistic
  _items = _items.map((it) => (it.id === id ? { ...it, read: true } : it))
  emit()

  updateDoc(notifDoc(_currentUid, id), { read: true }).catch(() => {})
}

export function markAllRead(): void {
  if (!_currentUid) return

  const unread = _items.filter((it) => !it.read)
  if (unread.length === 0) return

  // Optimistic
  _items = _items.map((it) => ({ ...it, read: true }))
  emit()

  const batch = writeBatch(db)
  for (const item of unread) {
    batch.update(notifDoc(_currentUid, item.id), { read: true })
  }
  batch.commit().catch(() => {})
}

/**
 * Permanently delete a single notification from Firestore.
 * Optimistically removes it locally first so the badge updates immediately.
 * Throws on Firestore error so callers can show an error toast.
 */
export async function deleteNotification(id: string): Promise<void> {
  if (!_currentUid) return

  // Optimistic local remove — badge count drops immediately
  _items = _items.filter((it) => it.id !== id)
  emit()

  await deleteDoc(notifDoc(_currentUid, id))
}

/**
 * Permanently delete every notification for this user.
 * Optimistic — clears the local list immediately.
 * Throws on Firestore error so callers can show an error toast.
 */
export async function deleteAllNotifications(): Promise<void> {
  if (!_currentUid) return

  const toDelete = [..._items]
  if (toDelete.length === 0) return

  _items = []
  emit()

  const batch = writeBatch(db)
  for (const item of toDelete) {
    batch.delete(notifDoc(_currentUid, item.id))
  }
  await batch.commit()
}

export function getAll(): NotifItem[] {
  return _items
}

export function subscribe(cb: Listener): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useNotificationItems(): NotifItem[] {
  const [state, setState] = useState<NotifItem[]>(_items)
  useEffect(() => {
    setState(_items)
    const unsub = subscribe(() => setState([..._items]))
    return unsub
  }, [])
  return state
}
