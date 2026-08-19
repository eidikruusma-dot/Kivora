import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationModules {
  tasks: boolean
  calendar: boolean
  habits: boolean
  goals: boolean
  school: boolean
  assistant: boolean
  security: boolean
}

export type ReminderOffset = 'at_time' | '5min' | '15min' | '30min' | '1hour' | '1day'

export interface NotificationSettings {
  modules: NotificationModules
  inApp: boolean
  systemNotifications: boolean
  defaultReminder: ReminderOffset
  quietHoursEnabled: boolean
  quietStart: string // 'HH:mm'
  quietEnd: string   // 'HH:mm'
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  modules: {
    tasks: true,
    calendar: true,
    habits: true,
    goals: true,
    school: true,
    assistant: false,
    security: true,
  },
  inApp: true,
  systemNotifications: false,
  defaultReminder: '15min',
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
}

export const REMINDER_OPTIONS: { value: ReminderOffset; label: string }[] = [
  { value: 'at_time', label: 'Sündmuse ajal' },
  { value: '5min',    label: '5 minutit enne' },
  { value: '15min',   label: '15 minutit enne' },
  { value: '30min',   label: '30 minutit enne' },
  { value: '1hour',   label: '1 tund enne' },
  { value: '1day',    label: '1 päev enne' },
]

// ── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kivora:notifications'

function readLocal(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotificationSettings>
      return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...parsed,
        modules: {
          ...DEFAULT_NOTIFICATION_SETTINGS.modules,
          ...(parsed.modules ?? {}),
        },
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_NOTIFICATION_SETTINGS
}

function writeLocal(settings: NotificationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export function getLocalNotificationSettings(): NotificationSettings {
  return readLocal()
}

// ── Firestore ─────────────────────────────────────────────────────────────────

export async function getNotificationSettings(uid: string): Promise<NotificationSettings> {
  const local = readLocal()
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data()
      const saved = data.notifications as Partial<NotificationSettings> | undefined
      if (saved) {
        return {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...saved,
          modules: {
            ...DEFAULT_NOTIFICATION_SETTINGS.modules,
            ...(saved.modules ?? {}),
          },
        }
      }
    }
  } catch {
    // fall back to local
  }
  return local
}

export async function saveNotificationSettings(
  uid: string,
  settings: NotificationSettings,
): Promise<void> {
  writeLocal(settings)
  try {
    const ref = doc(db, 'users', uid)
    await updateDoc(ref, {
      notifications: settings,
      updatedAt: serverTimestamp(),
    })
  } catch {
    // local-only fallback is fine
  }
}
