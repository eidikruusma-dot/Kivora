import type { AppLang } from '@/lib/languageStore'
import { buildAIContext } from '@/lib/aiContextBuilder'
import type { AIAction } from '@/lib/aiActions'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

export interface AIResponse {
  reply: string
  actions: AIAction[]
}

export type ChatRequestMode = 'chat' | 'plan_creation'

/**
 * Builds the exact request messages for a plan-generation call: the raw,
 * already-trimmed user description, sent verbatim as the sole message
 * content — no prefix/wrapper sentence. This guarantees the length actually
 * measured by the backend's PLAN_DRAFT_LIMITS.maxPromptLength check
 * (validateChatRequest.ts) is exactly the length of what the user typed
 * (after trimming), matching the frontend's own maxPromptLength enforcement
 * on that same string. The "generate a plan" instruction is supplied by the
 * backend's mode: "plan_creation" system prompt instead (see routes/ai.ts),
 * so nothing here can silently push the measured length past the limit.
 */
export function buildPlanGenerationMessages(description: string): { role: 'user'; content: string }[] {
  return [{ role: 'user', content: description }]
}

// ── Conversation history windowing ──────────────────────────────────────────
//
// api-server's validateChatRequest.ts hard-rejects a request whose `messages`
// array is too long (CHAT_REQUEST_LIMITS.maxMessages, currently 50) or whose
// combined content is too long (maxTotalContentLength, currently 60,000
// chars) — a 400 TOO_MANY_MESSAGES/TOTAL_CONTENT_TOO_LONG, returned before
// the model is ever called. A conversation a user keeps coming back to over
// weeks or months accumulates turns indefinitely; sending its ENTIRE history
// eventually — and, for an active user, not all that eventually — crosses
// either limit and makes that specific conversation permanently unusable
// (every future message in it fails the same way).
//
// The fix is NOT a bigger limit (an unboundedly growing conversation would
// just fail later instead of never) — it's sending a bounded, deterministic
// WINDOW of the most recent messages on every request, while the full
// conversation stays exactly as stored (Firestore, and the chat list the
// user sees) — this only bounds what goes out over the wire to the model.
//
// Kept comfortably under the server's own limits (not equal to them) so
// this constant drifting slightly out of sync with a future server-side
// change can never itself be the thing that triggers the 400.
export const HISTORY_WINDOW_MAX_MESSAGES = 30
export const HISTORY_WINDOW_MAX_TOTAL_CHARS = 50_000

/**
 * Returns the most recent slice of `history` that both:
 *   - contains at most HISTORY_WINDOW_MAX_MESSAGES messages, and
 *   - has combined content under HISTORY_WINDOW_MAX_TOTAL_CHARS characters,
 * ALWAYS keeping the last message (the current turn) no matter what —
 * older messages are dropped from the front (oldest first), never the
 * newest, so a conversation the user is actively continuing always sees
 * its own most recent turns.
 *
 * This is exactly why a delete confirmation flow ("Kas soovid kindlasti
 * kustutada...?" / "Jah, kustuta.") is always safe across this window: the
 * confirmation question is the message immediately BEFORE the user's
 * confirming reply, which is itself the current turn — always the last two
 * entries of the array — so any window that keeps the current turn plus at
 * least one prior message (this one keeps up to 29) always includes it.
 * The actual confirm-before-execute gate is separately enforced in code
 * (aiActions.ts's pending-destructive-action tracking, keyed by exact
 * entity id, independent of conversation history) — windowing only affects
 * what the MODEL sees when deciding whether to re-propose the action, never
 * whether the code executes it.
 *
 * Pure and side-effect-free: never mutates `history`, never touches
 * anything persisted — callers still store/display the full, untrimmed
 * conversation exactly as before. Only the array actually sent to
 * /api/ai/chat is bounded.
 */
export function windowConversationHistory<T extends { role: 'user' | 'assistant'; content: string }>(
  history: T[],
): T[] {
  if (history.length === 0) return history

  const currentTurn = history[history.length - 1]
  const precedingHistory = history.slice(0, -1)

  let windowed = precedingHistory.slice(-(HISTORY_WINDOW_MAX_MESSAGES - 1))

  let totalLength = currentTurn.content.length + windowed.reduce((sum, m) => sum + m.content.length, 0)
  while (windowed.length > 0 && totalLength > HISTORY_WINDOW_MAX_TOTAL_CHARS) {
    totalLength -= windowed[0].content.length
    windowed = windowed.slice(1)
  }

  return [...windowed, currentTurn]
}

/**
 * The one client entry point into the shared /api/ai/chat backend — used
 * by both AIAssistantPage's chat and the Plans module's AI plan generator,
 * so there is only ever one AI backend call path on the frontend.
 *
 * `contextOverride` lets a caller replace the default full-app context
 * (buildAIContext) with something smaller/more targeted — e.g. the plan
 * generator sends no app context at all, since generating a new plan from
 * a description does not need the user's existing tasks/notes/etc.
 *
 * `mode` tells the backend which request-shape rules to enforce
 * (see validateChatRequest.ts on the server) — the plan generator passes
 * 'plan_creation', which requires exactly one user message capped at
 * PLAN_DRAFT_LIMITS.maxPromptLength; everything else defaults to 'chat'.
 *
 * `history` is windowed (windowConversationHistory) before it ever reaches
 * the network — this is the ONLY place that happens, so every caller (both
 * call sites in AIAssistantPage.tsx, plus the plan generator) automatically
 * sends a bounded request regardless of how long the caller's own stored
 * conversation has grown. Callers keep passing their FULL history; nothing
 * about what they store or display changes.
 */
export async function fetchAIReply(
  history: { role: 'user' | 'assistant'; content: string }[],
  lang: AppLang,
  contextOverride?: string,
  mode: ChatRequestMode = 'chat',
): Promise<AIResponse> {
  // Build client-local date string (YYYY-MM-DD) so the server can resolve "today"/"tomorrow" correctly
  const _now = new Date()
  const localDate = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

  const res = await authenticatedFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: windowConversationHistory(history),
      context: contextOverride !== undefined ? contextOverride : buildAIContext(lang),
      lang,
      localDate,
      mode,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status}).`)
  }
  const data = await res.json()
  if (!data.reply && (!data.actions || data.actions.length === 0))
    throw new Error('AI returned no reply.')
  return { reply: data.reply || '', actions: data.actions || [] }
}
