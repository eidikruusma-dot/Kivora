// @vitest-environment jsdom
/**
 * Regression coverage for the temporary owner-custom-claim verification
 * tool (ownerClaimCheck.ts) — used once, manually, from the browser
 * console to confirm a freshly-refreshed production ID token carries
 * `owner: true` after running api-server's grantOwnerRole.ts, without
 * ever printing the raw token, a permanent endpoint, or a hardcoded
 * identity.
 *
 * Proves: the exposed window.__KIVORA_CHECK_OWNER_CLAIM__ function calls
 * getIdTokenResult(auth.currentUser, true) (force-refresh — the same
 * effect logout/login would have) and returns/logs ONLY the parsed
 * boolean `owner` claim; a missing/falsy claim resolves to false; no
 * signed-in user resolves to null without throwing; and the raw token
 * string is never logged.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/ownerClaimCheckWindowGlobal.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SECRET_RAW_TOKEN = 'synthetic-raw-id-token-must-never-be-logged'

let fakeCurrentUser: { uid: string } | null = null
const getIdTokenResultMock = vi.fn(async (_user: unknown, _forceRefresh?: boolean) => ({
  token: SECRET_RAW_TOKEN,
  claims: fakeClaims,
}))
let fakeClaims: Record<string, unknown> = {}

vi.mock('@/lib/firebase', () => ({
  auth: {
    get currentUser() {
      return fakeCurrentUser
    },
  },
}))

vi.mock('firebase/auth', () => ({
  getIdTokenResult: (...args: Parameters<typeof getIdTokenResultMock>) => getIdTokenResultMock(...args),
}))

beforeEach(() => {
  fakeCurrentUser = null
  fakeClaims = {}
  getIdTokenResultMock.mockClear()
  vi.resetModules()
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__KIVORA_CHECK_OWNER_CLAIM__
})

async function loadAndGetCheckFn() {
  await import('@/lib/ownerClaimCheck')
  return (window as unknown as { __KIVORA_CHECK_OWNER_CLAIM__?: () => Promise<boolean | null> })
    .__KIVORA_CHECK_OWNER_CLAIM__
}

describe('window.__KIVORA_CHECK_OWNER_CLAIM__ is exposed as a side effect of importing the module', () => {
  it('sets the function on window', async () => {
    const fn = await loadAndGetCheckFn()
    expect(typeof fn).toBe('function')
  })
})

describe('owner: true on the refreshed token resolves to true', () => {
  it('returns true and forces a token refresh', async () => {
    fakeCurrentUser = { uid: 'owner-uid' }
    fakeClaims = { owner: true }
    const fn = await loadAndGetCheckFn()

    const result = await fn!()

    expect(result).toBe(true)
    expect(getIdTokenResultMock).toHaveBeenCalledTimes(1)
    expect(getIdTokenResultMock.mock.calls[0][0]).toEqual({ uid: 'owner-uid' })
    expect(getIdTokenResultMock.mock.calls[0][1]).toBe(true) // forceRefresh
  })
})

describe('a missing or false owner claim resolves to false, never loosely truthy', () => {
  it('missing claim -> false', async () => {
    fakeCurrentUser = { uid: 'normal-uid' }
    fakeClaims = {}
    const fn = await loadAndGetCheckFn()
    expect(await fn!()).toBe(false)
  })

  it('owner: false -> false', async () => {
    fakeCurrentUser = { uid: 'normal-uid' }
    fakeClaims = { owner: false }
    const fn = await loadAndGetCheckFn()
    expect(await fn!()).toBe(false)
  })

  it('a non-boolean truthy owner value -> false (strict === true check, no loose coercion)', async () => {
    fakeCurrentUser = { uid: 'normal-uid' }
    fakeClaims = { owner: 'true' }
    const fn = await loadAndGetCheckFn()
    expect(await fn!()).toBe(false)
  })
})

describe('no signed-in user resolves to null without throwing, and never calls getIdTokenResult', () => {
  it('returns null', async () => {
    fakeCurrentUser = null
    const fn = await loadAndGetCheckFn()
    const result = await fn!()
    expect(result).toBeNull()
    expect(getIdTokenResultMock).not.toHaveBeenCalled()
  })
})

describe('the raw token string is never logged', () => {
  it('console.log is never called with the raw token', async () => {
    fakeCurrentUser = { uid: 'owner-uid' }
    fakeClaims = { owner: true }
    const fn = await loadAndGetCheckFn()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await fn!()
      const loggedAnything = logSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes(SECRET_RAW_TOKEN)),
      )
      expect(loggedAnything).toBe(false)
    } finally {
      logSpy.mockRestore()
    }
  })
})
