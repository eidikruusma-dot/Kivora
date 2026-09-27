// @vitest-environment jsdom
/**
 * enablePush(uid) creates a real browser PushSubscription via
 * reg.pushManager.subscribe(), then persists it to
 * users/{uid}/pushSubscriptions/{subId}. Until now, firestore.rules had no
 * rule for that subcollection at all, so the setDoc() call was denied with
 * permission-denied on every real device — the exact bug reported after
 * testing on a real Android phone.
 *
 * Two related fixes:
 *   1. firestore.rules now owner-gates users/{uid}/pushSubscriptions/{subId}
 *      (read/create/update/delete), matching every other subcollection's
 *      pattern (e.g. notifications, backups).
 *   2. enablePush() now checks reg.pushManager.getSubscription() BEFORE
 *      calling subscribe(). subscribe() is idempotent — if already
 *      subscribed, it returns the existing subscription instead of
 *      creating a new one. So if persistence then fails, enablePush()
 *      unsubscribes ONLY when this call itself created a new subscription
 *      (there was none before) — never one that already existed, since
 *      that one is presumably already correctly persisted from an earlier
 *      successful enable.
 *
 * This test exercises the real enablePush() against mocked browser APIs
 * (Notification, navigator.serviceWorker, PushManager) and a mocked
 * firebase/firestore module, since no jsdom-based test previously existed
 * for this file.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/pushNotificationsPersistenceCleanup.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {} }))

const setDocMock = vi.fn()
const getDocsMock = vi.fn(async () => ({ empty: true, docs: [] }))
const deleteDocMock = vi.fn(async () => {})
// Path -> stored data, so getDoc() can reflect what setDoc()/deleteDoc() actually did —
// needed to test ensureCurrentDevicePushPersisted()'s "already persisted, don't rewrite"
// and "missing, recover" branches against real doc paths rather than a blind stub.
const fakeDocs = new Map<string, Record<string, unknown>>()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  doc: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    await setDocMock(ref, data)
    fakeDocs.set(ref.path, data)
  },
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => fakeDocs.has(ref.path),
    data: () => fakeDocs.get(ref.path),
  })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  deleteDoc: async (ref: { path: string }) => {
    await deleteDocMock(ref)
    fakeDocs.delete(ref.path)
  },
}))

import { enablePush, disablePush, ensureCurrentDevicePushPersisted } from '@/lib/pushNotifications'

function makeSubscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { auth: 'auth-secret', p256dh: 'p256dh-key' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

function stubBrowserPushSupport(opts: {
  existingSubscription: ReturnType<typeof makeSubscription> | null
  subscribeReturns: ReturnType<typeof makeSubscription>
}) {
  const getSubscription = vi.fn(async () => opts.existingSubscription)
  const subscribe = vi.fn(async () => opts.subscribeReturns)
  const registration = { pushManager: { getSubscription, subscribe } }
  const register = vi.fn(async () => registration)

  vi.stubGlobal('PushManager', function () {})
  vi.stubGlobal('Notification', {
    requestPermission: vi.fn(async () => 'granted'),
    permission: 'default',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ publicKey: 'dGVzdC12YXBpZC1rZXk' }), // valid base64url ("test-vapid-key")
    })),
  )
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register, ready: Promise.resolve(registration) },
    configurable: true,
  })

  return { getSubscription, subscribe, register }
}

const UID = 'user-a'

beforeEach(() => {
  setDocMock.mockReset()
  getDocsMock.mockClear()
  deleteDocMock.mockClear()
  fakeDocs.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error -- test-only cleanup of a property defineProperty added
  delete navigator.serviceWorker
})

describe('firestore.rules owner-gates pushSubscriptions', () => {
  const RULES_SRC = readFileSync(resolve(process.cwd(), '..', '..', 'firestore.rules'), 'utf8')

  it('has an explicit match block for users/{uid}/pushSubscriptions/{subId}', () => {
    const block = RULES_SRC.match(
      /match \/users\/\{uid\}\/pushSubscriptions\/\{subId\} \{([\s\S]*?)\n {4}\}/,
    )
    expect(block).not.toBeNull()
  })

  it('owner-gates read, create, update, and delete, matching the existing subcollection pattern', () => {
    const block = RULES_SRC.match(
      /match \/users\/\{uid\}\/pushSubscriptions\/\{subId\} \{([\s\S]*?)\n {4}\}/,
    )?.[1] ?? ''
    expect(block).toMatch(/allow read, create, update, delete: if isOwner\(uid\);/)
  })
})

describe('failed Firestore persistence cleans up a newly-created subscription', () => {
  it('unsubscribes the subscription when there was no existing one and setDoc() fails', async () => {
    const newSub = makeSubscription('https://push.example.com/new')
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: newSub })
    setDocMock.mockRejectedValueOnce(new Error('permission-denied'))

    const result = await enablePush(UID)

    expect(result).toBe('error')
    expect(newSub.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('an already-existing subscription is not unsubscribed by failure cleanup', () => {
  it('does NOT unsubscribe when a subscription already existed before this enable attempt', async () => {
    const existingSub = makeSubscription('https://push.example.com/existing')
    // subscribe() is idempotent — returns the same existing subscription object
    stubBrowserPushSupport({ existingSubscription: existingSub, subscribeReturns: existingSub })
    setDocMock.mockRejectedValueOnce(new Error('permission-denied'))

    const result = await enablePush(UID)

    expect(result).toBe('error')
    expect(existingSub.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('successful subscription + persistence behavior is unchanged', () => {
  it('returns "active" and persists the subscription; unsubscribe is never called', async () => {
    const newSub = makeSubscription('https://push.example.com/ok')
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: newSub })
    setDocMock.mockResolvedValueOnce(undefined)

    const result = await enablePush(UID)

    expect(result).toBe('active')
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(newSub.unsubscribe).not.toHaveBeenCalled()
    const [, persistedData] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(persistedData.endpoint).toBe('https://push.example.com/ok')
  })
})

// ── Regression: multi-device subId collision (Windows + Android both on FCM) ──

const WINDOWS_ENDPOINT =
  'https://fcm.googleapis.com/fcm/send/dWluZG93cy10b2tlbi1hYmMxMjM0NTY3ODkwLXVuaXF1ZS1wYXJ0'
const ANDROID_ENDPOINT =
  'https://fcm.googleapis.com/fcm/send/YW5kcm9pZC10b2tlbi14eXo5ODc2NTQzMjEwLWRpZmZlcmVudA'

describe('multiple devices for the same user get distinct Firestore documents', () => {
  it('a Windows Chrome and an Android Chrome subscription (same FCM URL prefix) persist as two separate docs', async () => {
    const windowsSub = makeSubscription(WINDOWS_ENDPOINT)
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: windowsSub })
    expect(await enablePush(UID)).toBe('active')

    const androidSub = makeSubscription(ANDROID_ENDPOINT)
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: androidSub })
    expect(await enablePush(UID)).toBe('active')

    // The exact bug: encodeSubId used to slice(0, 40), which never reaches past
    // the shared "https://fcm.googleapis.com/fcm/send/" prefix (48 base64 chars
    // on its own) — so the second enablePush() silently overwrote the first
    // device's document instead of creating its own.
    expect(setDocMock).toHaveBeenCalledTimes(2)
    expect(fakeDocs.size).toBe(2)

    const [firstPath] = (setDocMock.mock.calls[0] as [{ path: string }, unknown])
    const [secondPath] = (setDocMock.mock.calls[1] as [{ path: string }, unknown])
    expect(firstPath.path).not.toBe(secondPath.path)

    const persistedEndpoints = Array.from(fakeDocs.values()).map((d) => d.endpoint)
    expect(persistedEndpoints).toContain(WINDOWS_ENDPOINT)
    expect(persistedEndpoints).toContain(ANDROID_ENDPOINT)
  })
})

describe('disablePush() deletes only the current device\'s own document', () => {
  it('disabling push on Android does not remove the Windows subscription', async () => {
    const windowsSub = makeSubscription(WINDOWS_ENDPOINT)
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: windowsSub })
    await enablePush(UID)

    const androidSub = makeSubscription(ANDROID_ENDPOINT)
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: androidSub })
    await enablePush(UID)

    expect(fakeDocs.size).toBe(2)

    // Disabling from the Android device: its local browser subscription is androidSub.
    stubBrowserPushSupport({ existingSubscription: androidSub, subscribeReturns: androidSub })
    await disablePush(UID)

    expect(fakeDocs.size).toBe(1)
    const [remaining] = Array.from(fakeDocs.values())
    expect(remaining.endpoint).toBe(WINDOWS_ENDPOINT)
  })
})

describe('ensureCurrentDevicePushPersisted() reflects and self-heals the REAL device state', () => {
  it('re-persists when the browser has an active subscription but Firestore has no matching document', async () => {
    const sub = makeSubscription('https://fcm.googleapis.com/fcm/send/some-real-token-1234567890')
    stubBrowserPushSupport({ existingSubscription: sub, subscribeReturns: sub })

    expect(fakeDocs.size).toBe(0)

    const result = await ensureCurrentDevicePushPersisted(UID)

    expect(result).toBe(sub)
    expect(fakeDocs.size).toBe(1)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [persisted] = Array.from(fakeDocs.values())
    expect(persisted.endpoint).toBe(sub.endpoint)
  })

  it('does not rewrite a document that is already correctly persisted', async () => {
    const sub = makeSubscription('https://fcm.googleapis.com/fcm/send/some-real-token-1234567890')
    stubBrowserPushSupport({ existingSubscription: sub, subscribeReturns: sub })

    await ensureCurrentDevicePushPersisted(UID)
    expect(setDocMock).toHaveBeenCalledTimes(1)

    const result = await ensureCurrentDevicePushPersisted(UID)

    expect(result).toBe(sub)
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('returns null (never fabricates "active") when this device has no local subscription', async () => {
    stubBrowserPushSupport({ existingSubscription: null, subscribeReturns: makeSubscription('unused') })

    const result = await ensureCurrentDevicePushPersisted(UID)

    expect(result).toBeNull()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
