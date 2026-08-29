/**
 * Regression coverage for the AI-language preference fix (Settings >
 * Language > AI Assistant Language, `aiLang`), which was found — during
 * inspection — to be stored and displayed by KeelPage.tsx but never
 * actually read by anything that talks to the AI: every fetchAIReply()
 * caller passed its own UI `appLang`, and `aiLang` had zero runtime effect
 * beyond localStorage.
 *
 * Fix (aiClient.ts only): fetchAIReply() now resolves an `effectiveLang`
 * from the caller-supplied `lang` (still exactly the current app language,
 * unchanged in every caller) and the stored `aiLang` preference:
 *   - aiLang === 'same' -> effectiveLang = lang (the app language, as before)
 *   - aiLang === 'et'   -> effectiveLang = 'et', regardless of lang
 *   - aiLang === 'en'   -> effectiveLang = 'en', regardless of lang
 * effectiveLang is then used for BOTH buildAIContext(...) and the `lang`
 * field sent to /api/ai/chat — the only two places the old `lang` parameter
 * was used. The function signature and every caller are unchanged; UI text
 * elsewhere still uses the raw app language exactly as before.
 *
 * `@/lib/languageStore` is mocked directly (a controllable
 * getLocalLangSettings) rather than exercised through real localStorage,
 * since the default vitest environment for this project is 'node' (no
 * localStorage global) — see vitest.config.ts.
 *
 * No render harness needed — fetchAIReply is a plain async function; the
 * network boundary (global fetch) and Firestore (getDoc, for the
 * privacy-gate path already covered by aiPrivacyGate.test.ts) are mocked,
 * same pattern as that file.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiLanguagePreference.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({ aiData: true }) })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: vi.fn(() => vi.fn()),
}))

type AiLang = 'same' | 'et' | 'en'
const getLocalLangSettingsMock = vi.fn<() => { appLang: 'et' | 'en'; aiLang: AiLang }>()

vi.mock('@/lib/languageStore', () => ({
  getLocalLangSettings: (...args: unknown[]) => getLocalLangSettingsMock(...(args as [])),
}))

import { auth } from '@/lib/firebase'
import { fetchAIReply } from '@/lib/aiClient'

const UID = 'user-a'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function lastRequestBody(): { context: string; lang: string; messages: unknown[] } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  getLocalLangSettingsMock.mockReset()
  getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'same' })

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

describe('aiLang: same', () => {
  it('with ET app language, resolves to et — matches the app language passed in', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'same' })

    await fetchAIReply([{ role: 'user', content: 'tere' }], 'et')

    expect(lastRequestBody().lang).toBe('et')
  })

  it('with EN app language, resolves to en — matches the app language passed in', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'same' })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'en')

    expect(lastRequestBody().lang).toBe('en')
  })
})

describe('aiLang: et forces Estonian regardless of app language', () => {
  it('app language is en, but aiLang: et still sends lang: et', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'et' })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'en')

    expect(lastRequestBody().lang).toBe('et')
  })

  it('app language is et, aiLang: et still (trivially) sends lang: et', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'et' })

    await fetchAIReply([{ role: 'user', content: 'tere' }], 'et')

    expect(lastRequestBody().lang).toBe('et')
  })
})

describe('aiLang: en forces English regardless of app language', () => {
  it('app language is et, but aiLang: en still sends lang: en', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'en' })

    await fetchAIReply([{ role: 'user', content: 'tere' }], 'et')

    expect(lastRequestBody().lang).toBe('en')
  })

  it('app language is en, aiLang: en still (trivially) sends lang: en', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'en' })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'en')

    expect(lastRequestBody().lang).toBe('en')
  })
})

describe('the resolved language is used by the normal app context (buildAIContext), not the raw UI language', () => {
  it('aiLang: en with an ET UI produces English-preamble context, not Estonian', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'en' })

    await fetchAIReply([{ role: 'user', content: 'tere' }], 'et')

    const { context } = lastRequestBody()
    expect(context).toContain('overview of the Kivora user') // buildAIContext's EN preamble
    expect(context).not.toContain('Kivora kasutaja praegune andmete ülevaade') // ET preamble
  })

  it('aiLang: et with an EN UI produces Estonian-preamble context, not English', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'et' })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'en')

    const { context } = lastRequestBody()
    expect(context).toContain('Kivora kasutaja praegune andmete ülevaade') // ET preamble
    expect(context).not.toContain('overview of the Kivora user') // EN preamble
  })

  it('aiLang: same simply follows whichever app language was passed in, for context too', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'same' })

    await fetchAIReply([{ role: 'user', content: 'hi' }], 'en')

    expect(lastRequestBody().context).toContain('overview of the Kivora user')
  })
})

describe('the resolved language is sent in the request payload lang field', () => {
  it('the payload\'s lang field always reflects effectiveLang, never the raw app language when they differ', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'en' })

    await fetchAIReply([{ role: 'user', content: 'tere' }], 'et')

    const payload = lastRequestBody()
    expect(payload.lang).toBe('en')
    expect(payload.lang).not.toBe('et')
  })
})

describe('contextOverride / plan_creation still uses the resolved AI language while preserving the override content', () => {
  it('an explicit contextOverride is sent verbatim, but the payload lang field still reflects the forced aiLang', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'en' })

    await fetchAIReply(
      [{ role: 'user', content: 'Loo mulle plaan' }],
      'et',
      'PLAN GENERATION OVERRIDE CONTEXT',
      'plan_creation',
    )

    const payload = lastRequestBody()
    expect(payload.context).toBe('PLAN GENERATION OVERRIDE CONTEXT')
    expect(payload.lang).toBe('en')
  })

  it('with aiLang: same, plan_creation still just follows the passed-in app language', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'en', aiLang: 'same' })

    await fetchAIReply(
      [{ role: 'user', content: 'Make me a plan' }],
      'en',
      'ANOTHER OVERRIDE',
      'plan_creation',
    )

    const payload = lastRequestBody()
    expect(payload.context).toBe('ANOTHER OVERRIDE')
    expect(payload.lang).toBe('en')
  })

  it('mode is still sent through unchanged alongside the resolved language', async () => {
    getLocalLangSettingsMock.mockReturnValue({ appLang: 'et', aiLang: 'et' })

    await fetchAIReply([{ role: 'user', content: 'x' }], 'et', 'override', 'plan_creation')

    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.mode).toBe('plan_creation')
  })
})
