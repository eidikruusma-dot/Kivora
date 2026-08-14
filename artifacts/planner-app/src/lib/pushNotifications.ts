/**
 * pushNotifications.ts
 * ─────────────────────
 * Manages Web Push subscriptions (register → subscribe → unsubscribe) and
 * delegates push delivery to the API server for cross-device notifications.
 *
 * All public functions are safe to call when the browser does not support
 * Push API — they return early without throwing.
 */

import { collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Stable, Firestore-safe ID derived from the push endpoint URL */
function encodeSubId(endpoint: string): string {
  return btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)
}

// ── VAPID public key (cached) ─────────────────────────────────────────────────

let _vapidKey: string | null = null

async function fetchVapidKey(): Promise<string> {
  if (_vapidKey) return _vapidKey
  const res = await fetch('/api/push/vapid-key')
  if (!res.ok) throw new Error('Failed to fetch VAPID key')
  const data = (await res.json()) as { publicKey: string }
  _vapidKey = data.publicKey
  return _vapidKey
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true when this browser has all Web Push prerequisites */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/**
 * Register (or reuse) the Kivora service worker.
 * Safe to call multiple times — the browser deduplicates registrations.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    const scope = import.meta.env.BASE_URL as string
    return await navigator.serviceWorker.register(swUrl, { scope })
  } catch (err) {
    console.warn('[Kivora] SW registration failed:', err)
    return null
  }
}

/** Returns the browser's active push subscription, or null if not subscribed */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Full opt-in flow: request Notification permission → register SW →
 * create a push subscription → persist it in Firestore.
 *
 * @returns 'active' on success, 'denied' if permission was denied, 'error' on any other failure
 */
export async function enablePush(uid: string): Promise<'active' | 'denied' | 'error'> {
  if (!isPushSupported()) return 'error'

  // 1. Request notification permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  // 2. Register service worker
  const reg = await registerServiceWorker()
  if (!reg) return 'error'

  try {
    // 3. Fetch VAPID public key and subscribe
    const vapidKey = await fetchVapidKey()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    // 4. Persist subscription in Firestore under the user's path
    const subJson = sub.toJSON() as {
      endpoint: string
      keys: { auth: string; p256dh: string }
    }
    const subId = encodeSubId(sub.endpoint)
    await setDoc(doc(db, 'users', uid, 'pushSubscriptions', subId), {
      endpoint: sub.endpoint,
      keys: subJson.keys,
      subId,
      createdAt: Date.now(),
      userAgent: navigator.userAgent.slice(0, 150),
    })

    return 'active'
  } catch (err) {
    console.warn('[Kivora] Push subscription error:', err)
    return 'error'
  }
}

/**
 * Unsubscribe from push and remove the subscription from Firestore.
 */
export async function disablePush(uid: string): Promise<void> {
  const sub = await getActivePushSubscription()
  if (!sub) return

  const subId = encodeSubId(sub.endpoint)
  try {
    await Promise.all([
      sub.unsubscribe(),
      deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', subId)),
    ])
  } catch (err) {
    console.warn('[Kivora] Unsubscribe error:', err)
  }
}

/**
 * Deliver a push notification to all OTHER registered devices for this user.
 * Called fire-and-forget after notificationItemsStore.dispatch() persists to Firestore.
 * Silently swallows all errors — the in-app notification is already delivered.
 */
export async function notifyOtherDevices(
  uid: string,
  notification: { title: string; body: string; url: string; tag: string },
): Promise<void> {
  if (!isPushSupported()) return

  try {
    // Exclude the current device's subscription
    const currentSub = await getActivePushSubscription()
    const currentEndpoint = currentSub?.endpoint

    const snap = await getDocs(collection(db, 'users', uid, 'pushSubscriptions'))
    if (snap.empty) return

    const subscriptions = snap.docs
      .map((d) => d.data() as { endpoint: string; keys: { auth: string; p256dh: string } })
      .filter((s) => s.endpoint && s.endpoint !== currentEndpoint)

    if (subscriptions.length === 0) return

    // The API server holds the VAPID private key — delegate sending to it
    await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions, notification }),
    })
  } catch {
    // Non-critical — swallow silently
  }
}
