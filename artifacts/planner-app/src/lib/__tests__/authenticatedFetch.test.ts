/**
 * authenticatedFetch: the one shared entry point for calling Kivora's paid,
 * OpenAI-backed API routes. Proves it attaches the signed-in user's
 * Firebase ID token as an Authorization header, preserves every other
 * request option, never touches Content-Type for a FormData body, and
 * never makes a network request when there's no user or token retrieval
 * fails.
 *
 * Synthetic data only — no real tokens, requests, or user data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null as { getIdToken: () => Promise<string> } | null },
}))

import { auth } from '@/lib/firebase'
import { authenticatedFetch, AuthRequiredError } from '@/lib/authenticatedFetch'

type MockAuth = { currentUser: { getIdToken: () => Promise<string> } | null }

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function mockUser(token = 'synthetic-id-token') {
  return { getIdToken: vi.fn(() => Promise.resolve(token)) }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as MockAuth).currentUser = null
})

describe('authenticatedFetch: Authorization header', () => {
  it('sends Authorization: Bearer <token> for a signed-in user', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser('synthetic-token-abc')

    await authenticatedFetch('/api/ai/chat', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer synthetic-token-abc')
  })

  it('calls getIdToken() on the current user to obtain the token', async () => {
    const user = mockUser('another-token')
    ;(auth as unknown as MockAuth).currentUser = user

    await authenticatedFetch('/api/ai/chat')

    expect(user.getIdToken).toHaveBeenCalledTimes(1)
  })
})

describe('authenticatedFetch: existing headers remain intact', () => {
  it('preserves every header the caller already set, alongside the new Authorization header', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser('tok')

    await authenticatedFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom-Header': 'custom-value' },
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Custom-Header')).toBe('custom-value')
    expect(headers.get('Authorization')).toBe('Bearer tok')
  })

  it('preserves headers passed as a Headers instance', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser('tok2')

    const callerHeaders = new Headers({ 'X-From-Headers-Instance': 'yes' })
    await authenticatedFetch('/api/ai/chat', { headers: callerHeaders })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('X-From-Headers-Instance')).toBe('yes')
    expect(headers.get('Authorization')).toBe('Bearer tok2')
  })
})

describe('authenticatedFetch: every existing request option is preserved', () => {
  it('preserves method and body unchanged', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser()
    const body = JSON.stringify({ messages: [], mode: 'chat' })

    await authenticatedFetch('/api/ai/chat', { method: 'POST', body })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/chat')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(body)
  })
})

describe('authenticatedFetch: missing user', () => {
  it('throws AuthRequiredError and never calls fetch when there is no signed-in user', async () => {
    ;(auth as unknown as MockAuth).currentUser = null

    await expect(authenticatedFetch('/api/ai/chat')).rejects.toBeInstanceOf(AuthRequiredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the thrown error has a stable, checkable AUTH_REQUIRED message', async () => {
    ;(auth as unknown as MockAuth).currentUser = null

    await expect(authenticatedFetch('/api/ai/upload')).rejects.toMatchObject({
      name: 'AuthRequiredError',
      message: 'AUTH_REQUIRED',
    })
  })
})

describe('authenticatedFetch: token retrieval failure', () => {
  it('makes no network request when getIdToken() rejects', async () => {
    const failingUser = { getIdToken: vi.fn(() => Promise.reject(new Error('synthetic token error'))) }
    ;(auth as unknown as MockAuth).currentUser = failingUser

    await expect(authenticatedFetch('/api/ai/chat')).rejects.toThrow('synthetic token error')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('authenticatedFetch: JSON vs FormData Content-Type handling', () => {
  it('preserves Content-Type: application/json for a JSON body', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser()

    await authenticatedFetch('/api/ai/bank-import/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [], bankMeta: {} }),
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('never sets Content-Type for a FormData body — the browser must add the multipart boundary itself', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser()

    const formData = new FormData()
    formData.append('file', new Blob(['synthetic file content'], { type: 'text/plain' }), 'synthetic.txt')

    await authenticatedFetch('/api/ai/upload', { method: 'POST', body: formData })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.has('Content-Type')).toBe(false)
    expect(init?.body).toBe(formData)
  })

  it('never sets Content-Type for a FormData body even when the caller sets other headers', async () => {
    ;(auth as unknown as MockAuth).currentUser = mockUser()

    const formData = new FormData()
    formData.append('file', new Blob(['x']), 'x.txt')

    await authenticatedFetch('/api/ai/bank-import', {
      method: 'POST',
      headers: { 'X-Some-Header': 'value' },
      body: formData,
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.has('Content-Type')).toBe(false)
    expect(headers.get('X-Some-Header')).toBe('value')
  })
})

// ── Source-level check: all four paid-AI call sites actually use the helper ──

function readSrc(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

describe('all four paid-AI frontend call sites use the shared helper', () => {
  it('aiClient.ts calls authenticatedFetch for /api/ai/chat, never a bare fetch', () => {
    const src = readSrc('../aiClient.ts')
    expect(src).toMatch(/from ['"]@\/lib\/authenticatedFetch['"]/)
    expect(src).toMatch(/authenticatedFetch\(['"]\/api\/ai\/chat['"]/)
    expect(src).not.toMatch(/(?<!authenticated)fetch\(['"]\/api\/ai\//)
  })

  it('AIAssistantPage.tsx calls authenticatedFetch for /api/ai/upload, never a bare fetch', () => {
    const src = readSrc('../../views/AIAssistantPage.tsx')
    expect(src).toMatch(/from ['"]@\/lib\/authenticatedFetch['"]/)
    expect(src).toMatch(/authenticatedFetch\(['"]\/api\/ai\/upload['"]/)
    expect(src).not.toMatch(/(?<!authenticated)fetch\(['"]\/api\/ai\//)
  })

  it('FinancePage.tsx calls authenticatedFetch for both /api/ai/bank-import and /api/ai/bank-import/revalidate, never a bare fetch', () => {
    const src = readSrc('../../views/finance/FinancePage.tsx')
    expect(src).toMatch(/from ['"]@\/lib\/authenticatedFetch['"]/)
    expect(src).toMatch(/authenticatedFetch\(['"]\/api\/ai\/bank-import['"]/)
    expect(src).toMatch(/authenticatedFetch\(['"]\/api\/ai\/bank-import\/revalidate['"]/)
    expect(src).not.toMatch(/(?<!authenticated)fetch\(['"]\/api\/ai\//)
  })

  it('accounts for exactly four converted call sites in total (1 + 1 + 2)', () => {
    const aiClientSrc = readSrc('../aiClient.ts')
    const assistantSrc = readSrc('../../views/AIAssistantPage.tsx')
    const financeSrc = readSrc('../../views/finance/FinancePage.tsx')
    const count = (src: string) => (src.match(/authenticatedFetch\(['"]\/api\/ai\//g) ?? []).length
    expect(count(aiClientSrc) + count(assistantSrc) + count(financeSrc)).toBe(4)
  })
})
