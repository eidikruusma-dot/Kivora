/**
 * Server-side request validation for POST /api/ai/chat.
 *
 * Frontend maxlength/slice on the plan-generator textarea is not a security
 * boundary — this is the actual enforcement point. Every check here rejects
 * (returns a stable error code + 4xx status) rather than silently truncating
 * the input, so a caller always gets an explicit, machine-readable reason.
 *
 * `mode: "plan_creation"` is the Plans module's AI generator; `mode: "chat"`
 * (the default) is the general AI Assistant. plan_creation gets an extra,
 * tighter rule (exactly one user message, capped at PLAN_DRAFT_LIMITS.maxPromptLength)
 * on top of the general chat limits below, which exist to bound normal
 * Assistant usage (including attached-document text folded into message
 * content) without breaking real conversations.
 */

import { PLAN_DRAFT_LIMITS } from "./planDraftValidation.js";

export type ChatMode = "chat" | "plan_creation";

export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * General limits for mode "chat" — this is an unauthenticated, internet-
 * reachable endpoint (see the separately-documented missing-auth risk), so
 * these are deliberately tight rather than generous. They still comfortably
 * cover a single attached document's extracted text, capped client-side at
 * 12,000 characters (AIAssistantPage.tsx buildAttachmentPayload) plus the
 * user's own message text, and a normal multi-turn conversation — but no
 * longer assume a caller is behaving reasonably. A conversation or request
 * that genuinely needs more than this is expected to be rare; a request
 * built to abuse an open endpoint is exactly what these bound.
 */
export const CHAT_REQUEST_LIMITS = {
  maxMessages: 50,
  maxMessageLength: 20_000,
  maxTotalContentLength: 60_000,
  /**
   * `context` (CURRENT_KIVORA_STATE, built by aiContextBuilder.ts) is a
   * SEPARATE top-level request field, not part of `messages` — none of the
   * limits above ever applied to it, and none of its module sections
   * (Tasks, Plans, Goals, Notes, Habits, Calendar, School, Finance,
   * Notifications) cap how much they render. Live incident: an active
   * account's real data exceeded the raw HTTP body-size limit before this
   * field-level check existed, and the resulting rejection happened inside
   * body-parser — before this validator ever ran — as an opaque 400/413
   * with no usable error message. 500,000 characters is comfortably above
   * any realistic account's total context size (well under the 2mb raw
   * body limit set in app.ts, leaving headroom for messages + JSON
   * overhead) while still being a real, intentional bound rather than
   * "whatever the raw body limit happens to allow" — so a still-oversized
   * context now fails here, cleanly, with a specific code and message.
   */
  maxContextLength: 500_000,
} as const;

export interface ChatRequestValidationOk {
  ok: true;
  mode: ChatMode;
  messages: ChatRequestMessage[];
}

export interface ChatRequestValidationError {
  ok: false;
  code: string;
  status: number;
  error: string;
}

export type ChatRequestValidationResult = ChatRequestValidationOk | ChatRequestValidationError;

function err(code: string, status: number, error: string): ChatRequestValidationError {
  return { ok: false, code, status, error };
}

export function validateChatRequest(body: {
  messages?: unknown;
  mode?: unknown;
  context?: unknown;
}): ChatRequestValidationResult {
  if (body.mode !== undefined && body.mode !== "chat" && body.mode !== "plan_creation") {
    return err("INVALID_MODE", 400, `Unknown mode "${String(body.mode)}".`);
  }

  if (body.context !== undefined) {
    if (typeof body.context !== "string") {
      return err("INVALID_CONTEXT", 400, "context must be a string.");
    }
    if (body.context.length > CHAT_REQUEST_LIMITS.maxContextLength) {
      return err(
        "CONTEXT_TOO_LARGE",
        400,
        `context exceeds the maximum length of ${CHAT_REQUEST_LIMITS.maxContextLength} characters.`,
      );
    }
  }
  const mode: ChatMode = body.mode === "plan_creation" ? "plan_creation" : "chat";

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err("INVALID_MESSAGES", 400, "messages must be a non-empty array.");
  }

  if (body.messages.length > CHAT_REQUEST_LIMITS.maxMessages) {
    return err(
      "TOO_MANY_MESSAGES",
      400,
      `Too many messages (max ${CHAT_REQUEST_LIMITS.maxMessages}).`,
    );
  }

  const messages: ChatRequestMessage[] = [];
  let totalLength = 0;
  for (const raw of body.messages) {
    if (!raw || typeof raw !== "object") {
      return err("INVALID_MESSAGE_SHAPE", 400, "Each message must be an object.");
    }
    const { role, content } = raw as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") {
      return err("INVALID_MESSAGE_SHAPE", 400, `Invalid message role "${String(role)}".`);
    }
    if (typeof content !== "string") {
      return err("INVALID_MESSAGE_SHAPE", 400, "Message content must be a string.");
    }
    if (content.length > CHAT_REQUEST_LIMITS.maxMessageLength) {
      return err(
        "MESSAGE_TOO_LONG",
        400,
        `A message exceeds the maximum length of ${CHAT_REQUEST_LIMITS.maxMessageLength} characters.`,
      );
    }
    totalLength += content.length;
    messages.push({ role, content });
  }

  if (totalLength > CHAT_REQUEST_LIMITS.maxTotalContentLength) {
    return err(
      "TOTAL_CONTENT_TOO_LONG",
      400,
      `Total message content exceeds ${CHAT_REQUEST_LIMITS.maxTotalContentLength} characters.`,
    );
  }

  if (mode === "plan_creation") {
    if (messages.length !== 1 || messages[0].role !== "user") {
      return err(
        "PLAN_CREATION_REQUIRES_SINGLE_MESSAGE",
        400,
        "plan_creation mode requires exactly one user message.",
      );
    }
    if (messages[0].content.length > PLAN_DRAFT_LIMITS.maxPromptLength) {
      return err(
        "PLAN_PROMPT_TOO_LONG",
        400,
        `Plan description exceeds ${PLAN_DRAFT_LIMITS.maxPromptLength} characters.`,
      );
    }
  }

  return { ok: true, mode, messages };
}
