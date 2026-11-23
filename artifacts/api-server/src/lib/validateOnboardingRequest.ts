/**
 * Server-side request validation for the AI onboarding conversation:
 *   POST /api/ai/onboarding/chat     (streaming conversational turns)
 *   POST /api/ai/onboarding/summary  (one-time, non-streamed wrap-up)
 *
 * Deliberately independent from validateChatRequest.ts rather than
 * extending its ChatMode union — the existing general-assistant/
 * plan-generator request shapes, limits, and tests stay completely
 * untouched by this feature (see the Kivora 2.0 onboarding plan's explicit
 * requirement to leave existing AI assistant functionality unchanged).
 *
 * Message-array limits here are intentionally smaller than
 * CHAT_REQUEST_LIMITS: this is a short, bounded getting-to-know-you
 * conversation (plain text, no attached documents), not the general
 * assistant's full-featured chat.
 */

import { ONBOARDING_TIME_LIMIT_MS } from "./onboardingConfig.js";

export interface OnboardingRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export const ONBOARDING_CHAT_LIMITS = {
  maxMessages: 40,
  maxMessageLength: 2_000,
  maxTotalContentLength: 20_000,
} as const;

/** The summary call receives the whole transcript at once, so it allows a larger total. */
export const ONBOARDING_SUMMARY_LIMITS = {
  maxMessages: 40,
  maxMessageLength: 2_000,
  maxTotalContentLength: 30_000,
} as const;

export type OnboardingLang = "et" | "en";

export interface OnboardingChatValidationOk {
  ok: true;
  lang: OnboardingLang;
  messages: OnboardingRequestMessage[];
  startedAt: Date;
}

export interface OnboardingSummaryValidationOk {
  ok: true;
  lang: OnboardingLang;
  messages: OnboardingRequestMessage[];
}

export interface OnboardingValidationError {
  ok: false;
  code: string;
  status: number;
  error: string;
}

function err(code: string, status: number, error: string): OnboardingValidationError {
  return { ok: false, code, status, error };
}

function resolveLang(lang: unknown): OnboardingLang {
  return lang === "en" ? "en" : "et";
}

/**
 * Shared message-array validation for both onboarding endpoints. `limits`
 * lets the two call sites apply their own bounds (see above) without
 * duplicating this loop.
 */
function validateMessages(
  rawMessages: unknown,
  limits: { maxMessages: number; maxMessageLength: number; maxTotalContentLength: number },
): OnboardingRequestMessage[] | OnboardingValidationError {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return err("INVALID_MESSAGES", 400, "messages must be a non-empty array.");
  }
  if (rawMessages.length > limits.maxMessages) {
    return err("TOO_MANY_MESSAGES", 400, `Too many messages (max ${limits.maxMessages}).`);
  }

  const messages: OnboardingRequestMessage[] = [];
  let totalLength = 0;
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object") {
      return err("INVALID_MESSAGE_SHAPE", 400, "Each message must be an object.");
    }
    const { role, content } = raw as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") {
      return err("INVALID_MESSAGE_SHAPE", 400, `Invalid message role "${String(role)}".`);
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return err("INVALID_MESSAGE_SHAPE", 400, "Message content must be a non-empty string.");
    }
    if (content.length > limits.maxMessageLength) {
      return err(
        "MESSAGE_TOO_LONG",
        400,
        `A message exceeds the maximum length of ${limits.maxMessageLength} characters.`,
      );
    }
    totalLength += content.length;
    messages.push({ role, content });
  }

  if (totalLength > limits.maxTotalContentLength) {
    return err(
      "TOTAL_CONTENT_TOO_LONG",
      400,
      `Total message content exceeds ${limits.maxTotalContentLength} characters.`,
    );
  }

  return messages;
}

/**
 * Validates POST /api/ai/onboarding/chat. `startedAt` (ISO 8601 string,
 * required) is the client-reported moment the onboarding conversation
 * began — used to enforce the 10-minute real cap: once elapsed time
 * reaches ONBOARDING_TIME_LIMIT_MS, this returns
 * ONBOARDING_TIME_LIMIT_REACHED instead of ok, telling the caller to stop
 * asking questions and move straight to /onboarding/summary. See
 * onboardingConfig.ts's doc comment on why this is a client-reported,
 * UX-level cap rather than a security boundary.
 *
 * `now` defaults to the real clock and is only ever overridden in tests.
 */
export function validateOnboardingChatRequest(
  body: { messages?: unknown; lang?: unknown; startedAt?: unknown },
  now: Date = new Date(),
): OnboardingChatValidationOk | OnboardingValidationError {
  if (typeof body.startedAt !== "string") {
    return err("INVALID_STARTED_AT", 400, "startedAt must be an ISO 8601 timestamp string.");
  }
  const startedAt = new Date(body.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return err("INVALID_STARTED_AT", 400, "startedAt is not a valid date.");
  }

  const messages = validateMessages(body.messages, ONBOARDING_CHAT_LIMITS);
  if (!Array.isArray(messages)) return messages;

  if (now.getTime() - startedAt.getTime() >= ONBOARDING_TIME_LIMIT_MS) {
    return err(
      "ONBOARDING_TIME_LIMIT_REACHED",
      422,
      "The 10-minute onboarding conversation limit has been reached.",
    );
  }

  return { ok: true, lang: resolveLang(body.lang), messages, startedAt };
}

/**
 * Validates POST /api/ai/onboarding/summary. No startedAt/time-limit check
 * here on purpose — the wrap-up call must always be reachable, even after
 * the 10-minute chat limit, since it's the one thing that lets the
 * conversation actually conclude.
 */
export function validateOnboardingSummaryRequest(
  body: { messages?: unknown; lang?: unknown },
): OnboardingSummaryValidationOk | OnboardingValidationError {
  const messages = validateMessages(body.messages, ONBOARDING_SUMMARY_LIMITS);
  if (!Array.isArray(messages)) return messages;
  return { ok: true, lang: resolveLang(body.lang), messages };
}
