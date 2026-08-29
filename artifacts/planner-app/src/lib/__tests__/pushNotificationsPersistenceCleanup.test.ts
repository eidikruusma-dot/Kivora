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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  doc: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
}))

import { enablePush } from '@/lib/pushNotifications'

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
