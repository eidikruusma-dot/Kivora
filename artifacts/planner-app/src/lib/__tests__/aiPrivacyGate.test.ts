/**
 * Regression coverage for the AI privacy gate in aiClient.ts (added by the
 * manual "Enhance AI context handling with user privacy settings" commit,
 * 57760d3), which was found — during inspection of that manual change — to
 * have shipped with zero dedicated tests of its own, only breaking six
 * pre-existing AI test files (fixed separately, in their own files, by
 * updating their shared getDoc()/auth mocks to support the new .data()/uid
 * reads this feature legitimately needs — see the "Also backs aiClient.ts's
 * loadSettingsStrict()..." comments added there).
 *
 * Behavior under test (fetchAIReply, no contextOverride):
 *   - Reads users/{uid}/settings/privacy via loadSettingsStrict (which does
 *     NOT swallow errors itself — see settingsStore.ts).
 *   - privacy.aiData === true  -> context = buildAIContext(lang) (the
 *     user's real stored Kivora app data).
 *   - privacy.aiData === false -> context = '' (stored app data withheld),
 *     but the AI request is still sent and still gets a normal reply — the
 *     assistant stays usable, it just answers without personal context.
 *   - The privacy-settings read failing for any reason (rejected promise,
 *     or the snapshot's .data() throwing) is caught by aiClient.ts and
 *     fails CLOSED to context = '' — the same as aiData: false — never to
 *     the permissive default. The AI request still goes through.
 *   - An explicit contextOverride bypasses all of the above entirely: it's
 *     used verbatim and the privacy Firestore read never even happens
 *     (verified via the getDoc mock's call count).
 *
 * No render harness needed — fetchAIReply is a plain async function; the
 * network boundary (global fetch) and Firestore (getDoc) are mocked, same
 * pattern as aiRequestPayloadIntegration.test.ts/aiContextFreshness.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiPrivacyGate.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

const getDocMock = vi.fn<() => Promise<{ exists: () => boolean; data: () => unknown }>>()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...(args as [])),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: vi.fn(() => vi.fn()),
}))

import { auth } from '@/lib/firebase'
import { fetchAIReply } from '@/lib/aiClient'

const UID = 'user-a'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function lastRequestBody(): { context: string; messages: unknown[] } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  getDocMock.mockReset()
  getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: true }) }))

  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ reply: 'ok', actions: [] }), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)

  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: UID,
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

describe('1. aiData: true includes normal buildAIContext context', () => {
  it('the request payload carries the real Kivora-overview context, not an empty string', async () => {
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: true }) }))

    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')

    const { context } = lastRequestBody()
    expect(context).not.toBe('')
    // buildAIContext's fixed preamble is present regardless of seeded data
    // — a reliable "this is real context, not a placeholder" marker.
    expect(context).toContain('Kivora kasutaja praegune andmete ülevaade')
  })

  it('the AI request still succeeds and returns a reply', async () => {
    const res = await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.reply).toBe('ok')
  })
})

describe('2. aiData: false sends empty stored-app context but still sends the AI request', () => {
  it('the request payload carries an empty context string', async () => {
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: false }) }))

    await fetchAIReply([{ role: 'user', content: 'Millised ülesanded mul on?' }], 'et')

    expect(lastRequestBody().context).toBe('')
  })

  it('the AI request is still sent and still returns a normal reply — the assistant stays usable', async () => {
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: false }) }))

    const res = await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.reply).toBe('ok')
  })
})

describe('3. a privacy-settings read failure fails closed to empty context, but still sends the AI request', () => {
  it('getDoc rejecting outright still results in empty context, request still sent', async () => {
    getDocMock.mockImplementation(() => Promise.reject(new Error('Firestore unavailable')))

    const res = await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')

    expect(lastRequestBody().context).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.reply).toBe('ok')
  })

  it('a resolved snapshot whose data() throws (malformed/corrupt doc) also fails closed to empty context', async () => {
    getDocMock.mockImplementation(() =>
      Promise.resolve({
        exists: () => true,
        data: () => {
          throw new Error('corrupt snapshot')
        },
      }),
    )

    const res = await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')

    expect(lastRequestBody().context).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.reply).toBe('ok')
  })

  it('never falls back to the permissive default on failure — a failed read is NOT treated as aiData: true', async () => {
    // Sanity check on the contrast: with a working read defaulting to
    // aiData: true (no doc yet, e.g. a brand-new user), context IS sent.
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => false, data: () => ({}) }))
    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    expect(lastRequestBody().context).not.toBe('')

    // But an actual read failure must still fail closed, never silently
    // reuse that same permissive default.
    getDocMock.mockImplementation(() => Promise.reject(new Error('network error')))
    await fetchAIReply([{ role: 'user', content: 'hi again' }], 'et')
    expect(lastRequestBody().context).toBe('')
  })
})

describe('4. an explicit contextOverride remains authoritative', () => {
  it('the override string is sent verbatim, even when aiData is false', async () => {
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: false }) }))

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et', 'MY CUSTOM OVERRIDE CONTEXT')

    expect(lastRequestBody().context).toBe('MY CUSTOM OVERRIDE CONTEXT')
  })

  it('the override string is sent verbatim even when the privacy read would fail', async () => {
    getDocMock.mockImplementation(() => Promise.reject(new Error('would fail closed if reached')))

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et', 'PLAN GENERATION CONTEXT')

    expect(lastRequestBody().context).toBe('PLAN GENERATION CONTEXT')
  })

  it('the privacy Firestore read never happens at all when contextOverride is given — the override short-circuits it entirely', async () => {
    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et', 'override')
    expect(getDocMock).not.toHaveBeenCalled()
  })

  it('an empty-string override is still authoritative (distinct from "no override given")', async () => {
    getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: true }) }))

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'et', '')

    expect(lastRequestBody().context).toBe('')
    // Confirms this took the override branch (which never reads privacy),
    // not the "no override" branch coincidentally also producing ''.
    expect(getDocMock).not.toHaveBeenCalled()
  })
})

describe('scope: no signed-in user means no personal context, without even attempting the privacy read', () => {
  it('with no signed-in user, aiClient never reads the privacy doc (short-circuits to context: \'\' first)', async () => {
    ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = null

    // authenticatedFetch (a separate, pre-existing, unrelated concern) still
    // correctly rejects with no signed-in user before any network call —
    // this test only asserts the privacy-gate's own uid check ran first and
    // never touched Firestore, not that the overall request succeeds.
    await expect(
      fetchAIReply([{ role: 'user', content: 'hi' }], 'et'),
    ).rejects.toThrow('AUTH_REQUIRED')

    expect(getDocMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
