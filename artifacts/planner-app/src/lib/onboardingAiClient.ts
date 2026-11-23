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

async function throwForErrorResponse(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw Object.assign(new Error(body.error || `Request failed (${res.status}).`), {
    code: typeof body.code === 'string' ? body.code : undefined,
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
 * network drops, or the server reports a mid-stream error — in every case
 * whatever text already arrived via onDelta is left exactly as it was: this
 * function never erases or rewrites prior deltas itself, so a caller always
 * knows precisely how much of the reply, if any, actually arrived.
 *
 * `signal`, if provided, lets the caller abort an in-flight stream (e.g.
 * the user navigates away) — the same AbortSignal is passed through to
 * fetch, which both stops reading the response and lets the browser tear
 * down the underlying request.
 */
export async function streamOnboardingChatReply(params: {
  messages: OnboardingChatMessage[]
  lang: AppLang
  startedAt: string
  onDelta: (text: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const res = await authenticatedFetch('/api/ai/onboarding/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: params.messages, lang: params.lang, startedAt: params.startedAt }),
    signal: params.signal,
  })

  if (!res.ok) {
    await throwForErrorResponse(res)
  }

  if (!res.body) {
    throw new Error('No response body to stream.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
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
      // "done" events carry only the finish_reason for diagnostics — nothing
      // for the caller to act on here; the loop simply ends when the
      // underlying stream closes.
    }
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
