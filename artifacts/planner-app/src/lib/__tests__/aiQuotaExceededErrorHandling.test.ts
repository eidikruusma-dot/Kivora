/**
 * Regression coverage for user-facing QUOTA_EXCEEDED handling.
 *
 * Server state (unchanged by this file): every AI-cost-generating route
 * (/api/ai/chat, /api/ai/upload, /api/ai/bank-import,
 * /api/ai/upload-direct-test) now returns 429 with
 * { error: "Daily AI request limit reached...", code: "QUOTA_EXCEEDED",
 * limit, remaining, resetAt } once a Free user hits the 20/UTC-day limit
 * (see api-server's aiQuotaGate.ts). Before this fix, that raw English
 * `error` string leaked straight into the UI regardless of language —
 * either doubled behind the generic apology (chat, via describeAIError)
 * or shown verbatim (upload/bank-import, which use their own local error
 * mapping, not describeAIError).
 *
 * Three things prove this is fixed, without touching any server logic or
 * quota number:
 *
 *   1. getAiErrorCode (aiClient.ts) — the one shared place that reads a
 *      server-supplied `code` off an error/response body, independent of
 *      the raw (always-English) `error` message text.
 *   2. describeAIError (AIAssistantPage.tsx) — used by both of chat's
 *      catch handlers — returns the new translated ai.chat.quotaExceeded
 *      string for a QUOTA_EXCEEDED-coded error, in both languages, with
 *      the raw code never appearing in the output; AUTH_REQUIRED and an
 *      unrelated real server error still behave exactly as before.
 *   3. fetchAIReply (aiClient.ts) — a real 429 QUOTA_EXCEEDED response
 *      (network mocked) throws an error getAiErrorCode can read, proving
 *      the code survives the actual chat network path end to end.
 *
 * AIAssistantPage.tsx's /api/ai/upload handler and FinancePage.tsx's
 * /api/ai/bank-import handler each have their OWN local error-mapping
 * code (not describeAIError) — verified structurally here (both files are
 * large views with heavy Firestore/router dependencies; a full render is
 * unnecessary to prove a two-line branch maps one code to one shared
 * translation key), matching the same structural-verification pattern
 * already used for these two files in authenticatedFetch.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiQuotaExceededErrorHandling.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readSrc(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

import { getAiErrorCode, fetchAIReply } from '@/lib/aiClient'
import { describeAIError } from '@/views/AIAssistantPage'
import { auth } from '@/lib/firebase'
import { t } from '@/lib/translations'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: 'u-quota-test',
    getIdToken: vi.fn(() => Promise.resolve('synthetic-id-token')),
  }
})

function quotaExceededError(): Error {
  return Object.assign(new Error('Daily AI request limit reached. Try again tomorrow.'), {
    code: 'QUOTA_EXCEEDED',
  })
}

describe('getAiErrorCode: reads the server-supplied code, independent of the raw message text', () => {
  it('extracts the code from an Error carrying one', () => {
    expect(getAiErrorCode(quotaExceededError())).toBe('QUOTA_EXCEEDED')
  })

  it('returns undefined for a plain Error with no code', () => {
    expect(getAiErrorCode(new Error('some other failure'))).toBeUndefined()
  })

  it('returns undefined for a non-object/non-Error value', () => {
    expect(getAiErrorCode('a raw string')).toBeUndefined()
    expect(getAiErrorCode(null)).toBeUndefined()
    expect(getAiErrorCode(undefined)).toBeUndefined()
  })
})

describe('describeAIError: QUOTA_EXCEEDED produces the friendly translated message, in both languages', () => {
  it('Estonian: exact translated copy, no raw code or raw English server text', () => {
    const result = describeAIError(quotaExceededError(), 'et')
    expect(result).toBe(t('ai.chat.quotaExceeded', 'et'))
    expect(result).toBe('Tänane AI kasutuslimiit on täis. Proovi uuesti homme.')
    expect(result).not.toContain('QUOTA_EXCEEDED')
    expect(result).not.toContain('Daily AI request limit reached')
  })

  it('English: exact translated copy, no raw code or raw English server text leaking through unmapped', () => {
    const result = describeAIError(quotaExceededError(), 'en')
    expect(result).toBe(t('ai.chat.quotaExceeded', 'en'))
    expect(result).toBe("You've reached today's AI usage limit. Try again tomorrow.")
    expect(result).not.toContain('QUOTA_EXCEEDED')
  })

  it('does not depend on the exact wording of the raw server message — only the code', () => {
    const differentlyWordedButSameCode = Object.assign(
      new Error('Some future, differently-worded limit message.'),
      { code: 'QUOTA_EXCEEDED' },
    )
    expect(describeAIError(differentlyWordedButSameCode, 'et')).toBe(t('ai.chat.quotaExceeded', 'et'))
  })
})

describe('describeAIError: unrelated behavior is unchanged', () => {
  it('AUTH_REQUIRED sentinel still falls back to the plain apology, exactly as before', () => {
    const err = new Error('AUTH_REQUIRED')
    err.name = 'AuthRequiredError'
    const result = describeAIError(err, 'et')
    expect(result).toBe(t('ai.chat.error', 'et'))
    expect(result).not.toContain('AUTH_REQUIRED')
    expect(result).not.toContain('QUOTA_EXCEEDED')
  })

  it('a genuine unrelated server error still appends its real reason, exactly as before', () => {
    const result = describeAIError(
      new Error('context exceeds the maximum length of 500000 characters.'),
      'et',
    )
    expect(result).toBe(`${t('ai.chat.error', 'et')} (context exceeds the maximum length of 500000 characters.)`)
  })

  it('a non-Error value still falls back to the plain apology', () => {
    const result = describeAIError('a raw string, not an Error', 'et')
    expect(result).toBe(t('ai.chat.error', 'et'))
  })
})

describe('fetchAIReply: a real 429 QUOTA_EXCEEDED response carries its code through to the thrown error', () => {
  it('throws an error getAiErrorCode reads as QUOTA_EXCEEDED, and describeAIError renders it as the friendly message', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Daily AI request limit reached. Try again tomorrow.',
          code: 'QUOTA_EXCEEDED',
          limit: 20,
          remaining: 0,
          resetAt: '2026-08-31T00:00:00.000Z',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    let caught: unknown
    try {
      await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    expect(getAiErrorCode(caught)).toBe('QUOTA_EXCEEDED')
    expect(describeAIError(caught, 'et')).toBe(t('ai.chat.quotaExceeded', 'et'))
  })

  it('an unrelated server error response (no code) is unaffected — no code, falls through to the raw message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Something else went wrong.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    let caught: unknown
    try {
      await fetchAIReply([{ role: 'user', content: 'hi' }], 'et')
    } catch (err) {
      caught = err
    }

    expect(getAiErrorCode(caught)).toBeUndefined()
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('Something else went wrong.')
  })
})

describe('AIAssistantPage.tsx /api/ai/upload: QUOTA_EXCEEDED is mapped to the same shared translation key', () => {
  it('maps body.code === "QUOTA_EXCEEDED" to t("ai.chat.quotaExceeded", lang) before the existing PDF_NO_TEXT mapping', () => {
    const src = readSrc('../../views/AIAssistantPage.tsx')
    const uploadBlock = src.match(
      /const res = await authenticatedFetch\("\/api\/ai\/upload"[\s\S]*?throw new Error\(errMsg\);/,
    )?.[0]
    expect(uploadBlock).toBeDefined()
    expect(uploadBlock).toContain('(body as { code?: string }).code === "QUOTA_EXCEEDED"')
    expect(uploadBlock).toContain('t("ai.chat.quotaExceeded", lang)')
    // The pre-existing PDF_NO_TEXT mapping must still be present, untouched.
    expect(uploadBlock).toContain('errMsg === "PDF_NO_TEXT"')
  })
})

describe('FinancePage.tsx /api/ai/bank-import: QUOTA_EXCEEDED is mapped to the same shared translation key', () => {
  it('maps body.code === "QUOTA_EXCEEDED" to t("ai.chat.quotaExceeded", lang) before the existing fallback message', () => {
    const src = readSrc('../../views/finance/FinancePage.tsx')
    const bankImportBlock = src.match(
      /const res = await authenticatedFetch\("\/api\/ai\/bank-import"[\s\S]*?Failed to process file\.["\s\S]*?\n\s*\}/,
    )?.[0]
    expect(bankImportBlock).toBeDefined()
    expect(bankImportBlock).toContain('body.code === "QUOTA_EXCEEDED"')
    expect(bankImportBlock).toContain('t("ai.chat.quotaExceeded", lang)')
    // The pre-existing fallback message must still be present, untouched.
    expect(bankImportBlock).toContain('Faili töötlemine ebaõnnestus.')
    expect(bankImportBlock).toContain('Failed to process file.')
  })

  it('the revalidate call site is untouched — no quota mapping added there (it is never quota-gated server-side)', () => {
    const src = readSrc('../../views/finance/FinancePage.tsx')
    const revalidateBlock = src.match(
      /authenticatedFetch\("\/api\/ai\/bank-import\/revalidate"[\s\S]{0,400}/,
    )?.[0]
    expect(revalidateBlock).toBeDefined()
    expect(revalidateBlock).not.toContain('QUOTA_EXCEEDED')
  })
})

describe('translations: ai.chat.quotaExceeded exists in both languages with the agreed copy', () => {
  it('Estonian', () => {
    expect(t('ai.chat.quotaExceeded', 'et')).toBe('Tänane AI kasutuslimiit on täis. Proovi uuesti homme.')
  })
  it('English', () => {
    expect(t('ai.chat.quotaExceeded', 'en')).toBe("You've reached today's AI usage limit. Try again tomorrow.")
  })
})
