/**
 * Builds the "[ai/chat actions]" diagnostic log line for POST /api/ai/chat.
 *
 * Purpose: find out what action `type` string a model actually returns when
 * it does not say the exact literal "preview_plan_creation" (see the
 * "Tundmatu toiming." production investigation), without guessing at
 * aliases and without logging or storing any user content.
 *
 * This function reads ONLY the `.type` field of each action object — it
 * never reads `.data` (or any other field) — so action content (plan
 * titles, item labels, notes, dates, task/note/goal content, etc.) cannot
 * leak into the log by construction, not merely by omission.
 *
 * Logs ONLY: mode, finish_reason, raw action count, raw action type names,
 * normalized action count, normalized action type names.
 * NEVER: user messages, prompts, reply text, action data, or any other
 * user content.
 */

function extractTypeNames(actions: unknown[]): string[] {
  return actions.map((a) => {
    if (a && typeof a === "object" && "type" in a) {
      const t = (a as Record<string, unknown>).type;
      return typeof t === "string" ? t : `<non-string-type:${typeof t}>`;
    }
    return `<malformed-action:${typeof a}>`;
  });
}

export function buildActionsDiagnosticLog(
  mode: string,
  finishReason: unknown,
  rawActions: unknown[],
  normalizedActions: unknown[],
): string {
  const rawTypes = extractTypeNames(rawActions);
  const normalizedTypes = extractTypeNames(normalizedActions);
  return (
    `[ai/chat actions] mode=${mode} finish_reason=${finishReason ?? "null"} ` +
    `rawCount=${rawActions.length} rawTypes=${JSON.stringify(rawTypes)} ` +
    `normalizedCount=${normalizedActions.length} normalizedTypes=${JSON.stringify(normalizedTypes)}`
  );
}
