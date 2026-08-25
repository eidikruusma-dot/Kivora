import type { AppLang } from '@/lib/languageStore'
import { buildAIContext } from '@/lib/aiContextBuilder'
import type { AIAction } from '@/lib/aiActions'

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

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history,
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
