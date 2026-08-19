/**
 * settingsStore.ts
 *
 * Generic Firestore helpers for all user settings documents stored under
 * users/{uid}/settings/{docId}.
 *
 * Settings pages (Sync, Backup, Export, Privacy, SchoolLinks) use these
 * instead of localStorage. Each page loads on mount and saves on explicit
 * user action — no fake delays, no simulated success states.
 */

import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function ref(uid: string, docId: string) {
  return doc(db, 'users', uid, 'settings', docId)
}

/** Load a settings document from Firestore. Returns defaults if not found. */
export async function loadSettings<T extends object>(
  uid: string,
  docId: string,
  defaults: T,
): Promise<T> {
  try {
    const snap = await getDoc(ref(uid, docId))
    if (snap.exists()) {
      return { ...defaults, ...(snap.data() as Partial<T>) }
    }
  } catch {
    // ignore — fall through to defaults
  }
  return defaults
}

/**
 * Subscribe to a settings document with real-time updates via onSnapshot.
 * Calls onChange immediately with the current value, then on every change.
 * Returns an unsubscribe function — call it on unmount or uid change.
 */
export function subscribeSettings<T extends object>(
  uid: string,
  docId: string,
  defaults: T,
  onChange: (data: T) => void,
): Unsubscribe {
  let active = true
  let inner: Unsubscribe | null = null

  function attach() {
    inner = onSnapshot(
      ref(uid, docId),
      (snap) => {
        onChange(snap.exists() ? { ...defaults, ...(snap.data() as Partial<T>) } : defaults)
      },
      (error) => {
        // Log so the error is visible during testing/debugging
        console.error('[settingsStore] onSnapshot error — docId:', docId, error)
        // Re-subscribe after 5 s so a transient error (token refresh, network
        // blip) does not permanently kill the listener.
        if (active) setTimeout(() => { if (active) attach() }, 5000)
      },
    )
  }

  attach()

  return () => {
    active = false
    inner?.()
  }
}

/** Persist a settings document to Firestore (full overwrite). */
export async function saveSettings<T extends object>(
  uid: string,
  docId: string,
  data: T,
): Promise<void> {
  await setDoc(ref(uid, docId), data)
}
