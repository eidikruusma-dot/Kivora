/**
 * onboardingStageLog.ts — one diagnostic log line per stage of
 * POST /ai/onboarding/chat (validation passed, quota passed, OpenAI call
 * starting, first chunk received, stream ended), each timestamped relative
 * to the request's own start.
 *
 * Added to let Render's log output show exactly how far a given request
 * got before it stopped producing activity — otherwise, on the happy path,
 * this route logs nothing at all between "request received" and "response
 * closed", so a request that stalls somewhere in the middle (auth passed,
 * but OpenAI never seemed to start; or OpenAI started but no chunk ever
 * arrived) leaves no trace of which stage it actually reached.
 *
 * `fields` is typed as `Record<string, number>` — only numbers type-check,
 * so it is structurally impossible to pass conversation content, a uid, an
 * auth token, or an API key into this function at compile time, the same
 * guarantee this codebase already relies on elsewhere (see
 * aiQuotaGate.ts's doc comment on enforceAiQuota never reading `req`).
 * Each value is also explicitly run through `Number()` before being
 * logged — belt-and-suspenders in case a future caller bypasses the type
 * check (an `any`, a bad cast): a string that slipped through becomes
 * `NaN` here rather than being logged verbatim.
 */
export function logOnboardingChatStage(stage: string, fields: Record<string, number> = {}): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${Number(value)}`);
  const suffix = parts.length > 0 ? `, ${parts.join(", ")}` : "";
  console.log(`[ai/onboarding/chat] ${stage}${suffix}`);
}
