import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '@/lib/firebase'
import type { UserProfile, UserPreferences, StartOfWeek, TimeFormat, DateFormat } from '@/types'

export const DEFAULT_PREFERENCES: UserPreferences = {
  startOfWeek: 'monday',
  timeFormat: '24h',
  dateFormat: 'DD.MM.YYYY',
  timezone: 'Europe/Tallinn',
}

export function getEffectivePreferences(profile: UserProfile): UserPreferences {
  return {
    startOfWeek: profile.preferences?.startOfWeek ?? DEFAULT_PREFERENCES.startOfWeek,
    timeFormat: profile.preferences?.timeFormat ?? DEFAULT_PREFERENCES.timeFormat,
    dateFormat: profile.preferences?.dateFormat ?? DEFAULT_PREFERENCES.dateFormat,
    // timezone is stored at the top level of UserProfile, not inside preferences
    timezone: profile.timezone || DEFAULT_PREFERENCES.timezone,
  }
}

export interface UserProfileUpdate {
  displayName: string
  phone?: string
  birthday?: string
  photoURL?: string | null
}

export interface UserPreferencesUpdate {
  startOfWeek: StartOfWeek
  timeFormat: TimeFormat
  dateFormat: DateFormat
  preferredLanguage: string
  timezone: string
}

export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return

  await setDoc(ref, {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || '',
    email: user.email || '',
    phone: '',
    birthday: '',
    photoURL: user.photoURL || null,
    preferredLanguage: 'et',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Tallinn',
    preferences: DEFAULT_PREFERENCES,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return { uid, ...snap.data() } as UserProfile
}

export function formatCreatedAt(createdAt: unknown): string {
  return formatTimestamp(createdAt, { dateStyle: 'long', timeStyle: undefined })
}

export function formatLastLogin(lastLoginAt: unknown): string {
  return formatTimestamp(lastLoginAt, { dateStyle: 'long', timeStyle: 'short' })
}

function formatTimestamp(
  value: unknown,
  opts: { dateStyle: 'long'; timeStyle: 'short' | undefined },
): string {
  let date: Date | null = null
  if (value instanceof Date) {
    date = value
  } else if (value && typeof value === 'object' && 'seconds' in value) {
    const ts = value as { seconds: number; nanoseconds?: number }
    date = new Date(ts.seconds * 1000 + (ts.nanoseconds ?? 0) / 1_000_000)
  } else if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) date = parsed
  }
  if (!date || isNaN(date.getTime())) return '—'
  const fmtOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  if (opts.timeStyle === 'short') {
    fmtOpts.hour = '2-digit'
    fmtOpts.minute = '2-digit'
  }
  return new Intl.DateTimeFormat('et-EE', fmtOpts).format(date)
}

export async function updateUserProfile(
  uid: string,
  changes: UserProfileUpdate,
): Promise<void> {
  const ref = doc(db, 'users', uid)
  const updateData: {
    displayName: string
    phone: string
    birthday: string
    updatedAt: ReturnType<typeof serverTimestamp>
    photoURL?: string | null
  } = {
    displayName: changes.displayName,
    phone: changes.phone ?? '',
    birthday: changes.birthday ?? '',
    updatedAt: serverTimestamp(),
  }
  if (changes.photoURL !== undefined) {
    updateData.photoURL = changes.photoURL
  }
  await setDoc(ref, updateData, { merge: true })
}

export async function updateUserPreferences(
  uid: string,
  preferences: UserPreferencesUpdate,
): Promise<void> {
  const ref = doc(db, 'users', uid)
  await setDoc(ref, {
    preferences: {
      startOfWeek: preferences.startOfWeek,
      timeFormat: preferences.timeFormat,
      dateFormat: preferences.dateFormat,
    },
    preferredLanguage: preferences.preferredLanguage,
    timezone: preferences.timezone,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
