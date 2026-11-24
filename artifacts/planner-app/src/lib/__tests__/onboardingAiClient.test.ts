import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authenticatedFetchMock = vi.fn()
vi.mock('@/lib/authenticatedFetch', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetchMock(...args),
}))

// onboardingAiClient.ts imports getAiErrorCode from aiClient.ts, which
// imports the real @/lib/firebase at module scope (`getAuth(app)`) — that
// throws immediately with this sandbox's fake Firebase config. Mocked here
// exactly like the rest of this codebase's AI-related tests.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

import { streamOnboardingChatReply, fetchOnboardingSummary, getAiErrorCode } from '@/lib/onboardingAiClient'

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
}

/** A stream whose frames arrive only when the test calls `push`/`close` — for simulating timing. */
function controlledStream(): {
  stream: ReadableStream<Uint8Array>
  push: (frame: string) => void
  close: () => void
} {
  const encoder = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller
    },
  })
  return {
    stream,
    push: (frame: string) => ctrl.enqueue(encoder.encode(frame)),
    close: () => ctrl.close(),
  }
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function okResponse(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, body } as unknown as Response
}

function errorResponse(status: number, payload: { error?: string; code?: string }): Response {
  return { ok: false, status, json: async () => payload } as unknown as Response
}

describe('onboardingAiClient — streamOnboardingChatReply', () => {
  beforeEach(() => authenticatedFetchMock.mockReset())

  it('calls onDelta with each delta chunk, in order, and resolves once the stream ends', async () => {
    authenticatedFetchMock.mockResolvedValue(
      okResponse(sseStream([sseFrame('delta', { content: 'Tere' }), sseFrame('delta', { content: '! Kuidas' }), sseFrame('done', { finishReason: 'stop' })])),
    )
    const received: string[] = []
    await streamOnboardingChatReply({
      messages: [{ role: 'user', content: 'hi' }],
      lang: 'et',
      startedAt: new Date().toISOString(),
      onDelta: (text) => received.push(text),
    })
    expect(received).toEqual(['Tere', '! Kuidas'])
  })

  it('sends the exact request shape the backend expects (messages, lang, startedAt)', async () => {
    authenticatedFetchMock.mockResolvedValue(okResponse(sseStream([sseFrame('done', { finishReason: 'stop' })])))
    const startedAt = new Date('2026-01-01T00:00:00.000Z').toISOString()
    await streamOnboardingChatReply({
      messages: [{ role: 'user', content: 'Tere' }],
      lang: 'en',
      startedAt,
      onDelta: () => {},
    })
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      '/api/ai/onboarding/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Tere' }], lang: 'en', startedAt }),
      }),
    )
  })

  it('a frame split across two stream chunks (boundary mid-frame) is still parsed correctly', async () => {
    const whole = sseFrame('delta', { content: 'hello world' })
    const splitPoint = Math.floor(whole.length / 2)
    authenticatedFetchMock.mockResolvedValue(
      okResponse(sseStream([whole.slice(0, splitPoint), whole.slice(splitPoint)])),
    )
    const received: string[] = []
    await streamOnboardingChatReply({
      messages: [{ role: 'user', content: 'hi' }],
      lang: 'et',
      startedAt: new Date().toISOString(),
      onDelta: (text) => received.push(text),
    })
    expect(received).toEqual(['hello world'])
  })

  it('rejects with the error code from a non-ok HTTP response, before any stream reading is attempted', async () => {
    authenticatedFetchMock.mockResolvedValue(errorResponse(422, { error: 'Too late', code: 'ONBOARDING_TIME_LIMIT_REACHED' }))
    const received: string[] = []
    await expect(
      streamOnboardingChatReply({ messages: [], lang: 'et', startedAt: new Date().toISOString(), onDelta: (t) => received.push(t) }),
    ).rejects.toMatchObject({ code: 'ONBOARDING_TIME_LIMIT_REACHED' })
    expect(received).toEqual([])
  })

  it('rejects with the error code from a mid-stream "error" SSE event, after whatever text already arrived', async () => {
    authenticatedFetchMock.mockResolvedValue(
      okResponse(sseStream([sseFrame('delta', { content: 'Tere, ma' }), sseFrame('error', { error: 'AI_STREAM_INTERRUPTED' })])),
    )
    const received: string[] = []
    let caught: unknown
    try {
      await streamOnboardingChatReply({
        messages: [{ role: 'user', content: 'hi' }],
        lang: 'et',
        startedAt: new Date().toISOString(),
        onDelta: (text) => received.push(text),
      })
    } catch (err) {
      caught = err
    }
    expect(received).toEqual(['Tere, ma']) // whatever arrived before the error is preserved
    expect(getAiErrorCode(caught)).toBe('AI_STREAM_INTERRUPTED')
  })

  it('ignores a frame with no data line, and an unparseable data line, without throwing', async () => {
    authenticatedFetchMock.mockResolvedValue(
      okResponse(sseStream(['event: delta\n\n', 'event: delta\ndata: not json\n\n', sseFrame('delta', { content: 'ok' })])),
    )
    const received: string[] = []
    await streamOnboardingChatReply({
      messages: [{ role: 'user', content: 'hi' }],
      lang: 'et',
      startedAt: new Date().toISOString(),
      onDelta: (text) => received.push(text),
    })
    expect(received).toEqual(['ok'])
  })

  describe('timeout/stall watchdog', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('calls onSlowResponse once 20s pass with no data, but still resolves normally once data arrives', async () => {
      const { stream, push, close } = controlledStream()
      authenticatedFetchMock.mockResolvedValue(okResponse(stream))
      const onSlowResponse = vi.fn()
      const received: string[] = []

      const promise = streamOnboardingChatReply({
        messages: [{ role: 'user', content: 'hi' }],
        lang: 'et',
        startedAt: new Date().toISOString(),
        onSlowResponse,
        onDelta: (text) => received.push(text),
      })

      await vi.advanceTimersByTimeAsync(20_000)
      expect(onSlowResponse).toHaveBeenCalledTimes(1)

      push(sseFrame('delta', { content: 'hi there' }))
      push(sseFrame('done', { finishReason: 'stop' }))
      close()
      await promise

      expect(received).toEqual(['hi there'])
    })

    it('rejects with AI_RESPONSE_TIMEOUT if no data arrives within 60s — the AI never started replying', async () => {
      const { stream } = controlledStream() // never pushed to, never closed
      authenticatedFetchMock.mockResolvedValue(okResponse(stream))

      const promise = streamOnboardingChatReply({
        messages: [{ role: 'user', content: 'hi' }],
        lang: 'et',
        startedAt: new Date().toISOString(),
        onDelta: () => {},
      })
      const assertion = expect(promise).rejects.toMatchObject({ code: 'AI_RESPONSE_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(60_000)
      await assertion
    })

    it('rejects with AI_RESPONSE_TIMEOUT if the stream starts, then goes silent for 60s — a mid-stream stall', async () => {
      const { stream, push } = controlledStream()
      authenticatedFetchMock.mockResolvedValue(okResponse(stream))
      const received: string[] = []

      const promise = streamOnboardingChatReply({
        messages: [{ role: 'user', content: 'hi' }],
        lang: 'et',
        startedAt: new Date().toISOString(),
        onDelta: (text) => received.push(text),
      })

      // Some real content arrives well before any timeout...
      await vi.advanceTimersByTimeAsync(5_000)
      push(sseFrame('delta', { content: 'Tere' }))
      await vi.advanceTimersByTimeAsync(0)

      // ...then the stream goes completely silent. The 60s stall clock
      // resets on that last chunk, so this must still time out even though
      // more than 60s have passed since the request started.
      const assertion = expect(promise).rejects.toMatchObject({ code: 'AI_RESPONSE_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(60_000)
      await assertion
      expect(received).toEqual(['Tere']) // whatever arrived before the stall is preserved
    })

    it('a caller-initiated abort (e.g. component unmount) is never reported as AI_RESPONSE_TIMEOUT', async () => {
      const { stream } = controlledStream()
      authenticatedFetchMock.mockResolvedValue(okResponse(stream))
      const controller = new AbortController()

      const promise = streamOnboardingChatReply({
        messages: [{ role: 'user', content: 'hi' }],
        lang: 'et',
        startedAt: new Date().toISOString(),
        signal: controller.signal,
        onDelta: () => {},
      })
      const assertion = expect(promise).rejects.not.toMatchObject({ code: 'AI_RESPONSE_TIMEOUT' })
      controller.abort()
      await assertion
    })
  })
})

describe('onboardingAiClient — fetchOnboardingSummary', () => {
  beforeEach(() => authenticatedFetchMock.mockReset())

  it('returns the parsed profileSummary and recommendedModules on success', async () => {
    authenticatedFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ profileSummary: 'Sa oled üliõpilane.', recommendedModules: ['tasks', 'calendar'] }),
    } as unknown as Response)
    const result = await fetchOnboardingSummary({ messages: [{ role: 'user', content: 'hi' }], lang: 'et' })
    expect(result).toEqual({ profileSummary: 'Sa oled üliõpilane.', recommendedModules: ['tasks', 'calendar'] })
  })

  it('defaults to an empty summary shape if the server response is missing fields', async () => {
    authenticatedFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response)
    const result = await fetchOnboardingSummary({ messages: [{ role: 'user', content: 'hi' }], lang: 'et' })
    expect(result).toEqual({ profileSummary: '', recommendedModules: [] })
  })

  it('rejects with the server error code on failure (e.g. ONBOARDING_SUMMARY_INCOMPLETE)', async () => {
    authenticatedFetchMock.mockResolvedValue(errorResponse(422, { error: 'Incomplete', code: 'ONBOARDING_SUMMARY_INCOMPLETE' }))
    await expect(fetchOnboardingSummary({ messages: [], lang: 'et' })).rejects.toMatchObject({
      code: 'ONBOARDING_SUMMARY_INCOMPLETE',
    })
  })

  it('rejects with QUOTA_EXCEEDED when the quota gate denies the request', async () => {
    authenticatedFetchMock.mockResolvedValue(errorResponse(429, { error: 'Quota exceeded', code: 'QUOTA_EXCEEDED' }))
    await expect(fetchOnboardingSummary({ messages: [], lang: 'et' })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })

  it('sends the exact request shape (messages, lang) with no startedAt field', async () => {
    authenticatedFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response)
    await fetchOnboardingSummary({ messages: [{ role: 'user', content: 'x' }], lang: 'et' })
    const [, init] = authenticatedFetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ messages: [{ role: 'user', content: 'x' }], lang: 'et' })
    expect(body.startedAt).toBeUndefined()
  })
})
