/**
 * onboardingAiClient.ts
 *
 * Frontend client for the two onboarding AI endpoints
 * (POST /api/ai/onboarding/chat and /api/ai/onboarding/summary) — kept
 * fully separate from aiClient.ts so the existing AI assistant's request
 * building, history windowing, and error handling are never touched by
 * this feature.
 *
 * Not using EventSource for the streaming call: EventSource only supports
 * GET requests and cannot send a custom Authorization header, and this
 * endpoint needs both (POST, with the Firebase ID token authenticatedFetch
 * attaches). Instead this reads the POST response's body as a plain
 * ReadableStream and parses the server's `event: ...\ndata: ...\n\n` frames
 * by hand — a standard, well-supported pattern for authenticated SSE.
 */

import type { AppLang } from '@/lib/languageStore'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { getAiErrorCode } from '@/lib/aiClient'
import type { ModuleId } from '@/lib/modulesStore'

export interface OnboardingChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface OnboardingSummary {
  profileSummary: string
  recommendedModules: ModuleId[]
}

/**
 * How long to wait with no network activity before telling the user the
 * response is taking longer than usual. Not an error yet — the request may
 * still complete normally; this is purely a "still working on it" notice
 * for the UI (see OnboardingChatPage.tsx's onSlowResponse handling).
 */
export const ONBOARDING_SLOW_RESPONSE_NOTICE_MS = 20_000

/**
 * How long to wait with no network activity before giving up on the
 * request entirely. Measured from the request's start AND reset on every
 * chunk of bytes read from the response body — so this catches both "the
 * AI never started replying" and "the AI started replying, then the
 * stream silently stalled partway through" with the same mechanism.
 */
export const ONBOARDING_STALL_TIMEOUT_MS = 60_000

/** getAiErrorCode(err) reads this off a timeout rejection — see below. */
export const AI_RESPONSE_TIMEOUT_CODE = 'AI_RESPONSE_TIMEOUT'

async function throwForErrorResponse(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw Object.assign(new Error(body.error || `Request failed (${res.status}).`), {
    code: typeof body.code === 'string' ? body.code : undefined,
  })
}

/**
 * reader.read(), but also rejects immediately once `signal` aborts — even
 * if the underlying stream itself never reacts to the abort. A real
 * browser fetch does error its response-body stream when the request's
 * AbortSignal fires, so this is normally redundant, but it's what makes
 * the stall timeout (see ONBOARDING_STALL_TIMEOUT_MS) reliable rather than
 * dependent on that fetch/stream wiring in every environment.
 */
function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    signal.addEventListener('abort', onAbort)
    reader.read().then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/**
 * Streams one onboarding chat turn. Calls `onDelta` with each newly
 * arrived text fragment as it comes in — callers append it to whatever
 * they're already displaying, exactly like a real conversation typing out.
 *
 * Resolves once the stream ends normally. Rejects (with a `code`, readable
 * via getAiErrorCode) if: the request is rejected before streaming starts
 * (e.g. ONBOARDING_TIME_LIMIT_REACHED, QUOTA_EXCEEDED, AUTH_REQUIRED), the
 * network drops, the server reports a mid-stream error, or no network
 * activity happens for ONBOARDING_STALL_TIMEOUT_MS (code
 * AI_RESPONSE_TIMEOUT — covers both "the AI never started replying" and
 * "it started, then silently stalled") — in every case whatever text
 * already arrived via onDelta is left exactly as it was: this function
 * never erases or rewrites prior deltas itself, so a caller always knows
 * precisely how much of the reply, if any, actually arrived.
 *
 * `onSlowResponse`, if provided, is called once activity has been silent
 * for ONBOARDING_SLOW_RESPONSE_NOTICE_MS — a "still working on it" signal
 * for the UI, well before the harder AI_RESPONSE_TIMEOUT cutoff. It can
 * fire more than once if a later gap (e.g. a mid-stream stall) also
 * crosses the threshold; the caller decides how to display that.
 *
 * `signal`, if provided, lets the caller abort an in-flight stream (e.g.
 * the user navigates away) — it is bridged into this function's own
 * internal AbortController (used for the stall timeout) rather than
 * passed to fetch directly, but has the exact same effect: it both stops
 * reading the response and lets the browser tear down the underlying
 * request. An abort via `signal` is never reported as AI_RESPONSE_TIMEOUT
 * — only this function's own stall timer sets that code.
 */
export async function streamOnboardingChatReply(params: {
  messages: OnboardingChatMessage[]
  lang: AppLang
  startedAt: string
  onDelta: (text: string) => void
  onSlowResponse?: () => void
  signal?: AbortSignal
}): Promise<void> {
  const internalController = new AbortController()
  if (params.signal) {
    if (params.signal.aborted) internalController.abort()
    else params.signal.addEventListener('abort', () => internalController.abort())
  }

  let timedOut = false
  let slowTimer: ReturnType<typeof setTimeout> | undefined
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  function clearWatchdog() {
    clearTimeout(slowTimer)
    clearTimeout(stallTimer)
  }

  // (Re)arms both timers from "now" — called once before the request is
  // sent, and again after every chunk of raw bytes is read, so a mid-stream
  // stall resets the clock exactly like the initial wait for a first byte
  // does, rather than only ever measuring time since the request started.
  function armWatchdog() {
    clearWatchdog()
    slowTimer = setTimeout(() => params.onSlowResponse?.(), ONBOARDING_SLOW_RESPONSE_NOTICE_MS)
    stallTimer = setTimeout(() => {
      timedOut = true
      internalController.abort()
    }, ONBOARDING_STALL_TIMEOUT_MS)
  }

  armWatchdog()

  try {
    const res = await authenticatedFetch('/api/ai/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: params.messages, lang: params.lang, startedAt: params.startedAt }),
      signal: internalController.signal,
    })

    if (!res.ok) {
      await throwForErrorResponse(res)
    }

    if (!res.body) {
      throw new Error('No response body to stream.')
    }

    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await readWithAbort(reader, internalController.signal)
      if (done) break
      armWatchdog()
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        let eventName = 'message'
        let dataLine = ''
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim()
          else if (line.startsWith('data:')) dataLine = line.slice('data:'.length).trim()
        }
        if (!dataLine) continue

        let parsed: unknown
        try {
          parsed = JSON.parse(dataLine)
        } catch {
          continue
        }

        if (eventName === 'delta') {
          const content = (parsed as { content?: unknown }).content
          if (typeof content === 'string' && content.length > 0) params.onDelta(content)
        } else if (eventName === 'error') {
          const code = (parsed as { error?: unknown }).error
          throw Object.assign(new Error('The AI response was interrupted.'), {
            code: typeof code === 'string' ? code : 'AI_STREAM_INTERRUPTED',
          })
        }
        // "done" events carry only the finish_reason for diagnostics —
        // nothing for the caller to act on here; the loop simply ends when
        // the underlying stream closes.
      }
    }
  } catch (err) {
    if (timedOut) {
      throw Object.assign(new Error('The AI response timed out.'), { code: AI_RESPONSE_TIMEOUT_CODE })
    }
    throw err
  } finally {
    clearWatchdog()
    if (timedOut) reader?.cancel().catch(() => {})
  }
}

/**
 * Calls the one-time, non-streamed onboarding summary endpoint with the
 * full conversation transcript. Resolves with the model's module
 * recommendation and profile recap, already sanitized server-side
 * (normalizeOnboardingSummary.ts) — recommendedModules is always a subset
 * of the real, currently-enabled module ids.
 */
export async function fetchOnboardingSummary(params: {
  messages: OnboardingChatMessage[]
  lang: AppLang
}): Promise<OnboardingSummary> {
  const res = await authenticatedFetch('/api/ai/onboarding/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: params.messages, lang: params.lang }),
  })

  if (!res.ok) {
    await throwForErrorResponse(res)
  }

  const data = await res.json()
  return {
    profileSummary: typeof data.profileSummary === 'string' ? data.profileSummary : '',
    recommendedModules: Array.isArray(data.recommendedModules) ? data.recommendedModules : [],
  }
}

export { getAiErrorCode }
