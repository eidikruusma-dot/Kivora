/**
 * Decides what to do with an OpenAI chat completion's `finish_reason`
 * before its content is parsed or its actions are executed.
 *
 * - mode "plan_creation": only "stop" may ever produce a preview. Any other
 *   reason ("length", "content_filter", missing/null, anything else) means
 *   the whole request is rejected before the response body is even parsed
 *   as JSON — a syntactically-valid-but-incomplete JSON object from a
 *   truncated completion must never reach sanitizePlanDraft.
 * - mode "chat": existing behavior is preserved for the reply text (still
 *   shown even on a non-stop finish), but `actions` must always be
 *   discarded on a non-stop finish — a partial/truncated completion must
 *   never be allowed to execute a write.
 */

import type { ChatMode } from "./validateChatRequest.js";

export interface FinishReasonDecision {
  rejectRequest: boolean;
  discardActions: boolean;
}

export function evaluateFinishReason(mode: ChatMode, finishReason: unknown): FinishReasonDecision {
  const isStop = finishReason === "stop";
  if (mode === "plan_creation") {
    return { rejectRequest: !isStop, discardActions: !isStop };
  }
  return { rejectRequest: false, discardActions: !isStop };
}
