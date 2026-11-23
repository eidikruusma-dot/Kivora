/**
 * Unit tests for validateOnboardingRequest.ts — both onboarding request
 * validators. Pure functions, no Express/OpenAI/Firebase involved.
 *
 * Compile and run (also available as `pnpm run test:validateOnboardingRequest`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/validateOnboardingRequest.test.ts | node
 */

import {
  validateOnboardingChatRequest,
  validateOnboardingSummaryRequest,
  ONBOARDING_CHAT_LIMITS,
  ONBOARDING_SUMMARY_LIMITS,
} from "./validateOnboardingRequest.js";
import { ONBOARDING_TIME_LIMIT_MS } from "./onboardingConfig.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const NOW = new Date("2026-06-01T12:00:00.000Z");
const STARTED_JUST_NOW = new Date(NOW.getTime() - 1_000).toISOString();
const STARTED_9_MIN_AGO = new Date(NOW.getTime() - 9 * 60 * 1000).toISOString();
const STARTED_10_MIN_AGO = new Date(NOW.getTime() - ONBOARDING_TIME_LIMIT_MS).toISOString();
const STARTED_11_MIN_AGO = new Date(NOW.getTime() - 11 * 60 * 1000).toISOString();

// ── validateOnboardingChatRequest ───────────────────────────────────────────

group("1. onboarding/chat: happy path accepted, lang/messages/startedAt carried through", () => {
  const result = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "Tere!" }], lang: "et", startedAt: STARTED_JUST_NOW },
    NOW,
  );
  assert(result.ok === true, "accepted");
  if (result.ok) {
    assert(result.lang === "et", "lang carried through");
    assert(result.messages.length === 1 && result.messages[0].content === "Tere!", "messages carried through");
    assert(result.startedAt.toISOString() === STARTED_JUST_NOW, "startedAt parsed correctly");
  }
});

group("2. onboarding/chat: lang defaults to 'et' for anything other than 'en'", () => {
  const r1 = validateOnboardingChatRequest({ messages: [{ role: "user", content: "hi" }], startedAt: STARTED_JUST_NOW }, NOW);
  const r2 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], lang: "fr", startedAt: STARTED_JUST_NOW },
    NOW,
  );
  assert(r1.ok === true && r1.lang === "et", "missing lang -> et");
  assert(r2.ok === true && r2.lang === "et", "unknown lang 'fr' -> et");
});

group("3. onboarding/chat: missing/invalid startedAt rejected", () => {
  const r1 = validateOnboardingChatRequest({ messages: [{ role: "user", content: "hi" }] }, NOW);
  const r2 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], startedAt: "not-a-date" },
    NOW,
  );
  const r3 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], startedAt: 12345 },
    NOW,
  );
  assert(!r1.ok && r1.code === "INVALID_STARTED_AT", "missing startedAt rejected");
  assert(!r2.ok && r2.code === "INVALID_STARTED_AT", "unparseable startedAt rejected");
  assert(!r3.ok && r3.code === "INVALID_STARTED_AT", "non-string startedAt rejected");
});

group("4. onboarding/chat: empty/non-array messages rejected", () => {
  const r1 = validateOnboardingChatRequest({ messages: [], startedAt: STARTED_JUST_NOW }, NOW);
  const r2 = validateOnboardingChatRequest({ messages: "nope", startedAt: STARTED_JUST_NOW }, NOW);
  assert(!r1.ok && r1.code === "INVALID_MESSAGES", "empty array rejected");
  assert(!r2.ok && r2.code === "INVALID_MESSAGES", "non-array rejected");
});

group("5. onboarding/chat: too many messages rejected", () => {
  const messages = Array.from({ length: ONBOARDING_CHAT_LIMITS.maxMessages + 1 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: "hi",
  }));
  const result = validateOnboardingChatRequest({ messages, startedAt: STARTED_JUST_NOW }, NOW);
  assert(!result.ok && result.code === "TOO_MANY_MESSAGES", "rejected over the message-count cap");
});

group("6. onboarding/chat: invalid message shape rejected (bad role, non-string/empty content)", () => {
  const r1 = validateOnboardingChatRequest(
    { messages: [{ role: "system", content: "hi" }], startedAt: STARTED_JUST_NOW },
    NOW,
  );
  const r2 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: 123 }], startedAt: STARTED_JUST_NOW },
    NOW,
  );
  const r3 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "   " }], startedAt: STARTED_JUST_NOW },
    NOW,
  );
  assert(!r1.ok && r1.code === "INVALID_MESSAGE_SHAPE", "role 'system' rejected (only user/assistant allowed)");
  assert(!r2.ok && r2.code === "INVALID_MESSAGE_SHAPE", "non-string content rejected");
  assert(!r3.ok && r3.code === "INVALID_MESSAGE_SHAPE", "whitespace-only content rejected");
});

group("7. onboarding/chat: message-length and total-length caps enforced", () => {
  const tooLong = "a".repeat(ONBOARDING_CHAT_LIMITS.maxMessageLength + 1);
  const r1 = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: tooLong }], startedAt: STARTED_JUST_NOW },
    NOW,
  );
  assert(!r1.ok && r1.code === "MESSAGE_TOO_LONG", "single over-length message rejected");

  const manyMedium = Array.from({ length: 20 }, () => ({
    role: "user" as const,
    content: "a".repeat(ONBOARDING_CHAT_LIMITS.maxTotalContentLength / 15),
  }));
  const r2 = validateOnboardingChatRequest({ messages: manyMedium, startedAt: STARTED_JUST_NOW }, NOW);
  assert(!r2.ok && r2.code === "TOTAL_CONTENT_TOO_LONG", "combined total over the cap rejected");
});

group("8. onboarding/chat: 10-minute time limit — under, exactly at, and over", () => {
  const under = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], startedAt: STARTED_9_MIN_AGO },
    NOW,
  );
  const atLimit = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], startedAt: STARTED_10_MIN_AGO },
    NOW,
  );
  const over = validateOnboardingChatRequest(
    { messages: [{ role: "user", content: "hi" }], startedAt: STARTED_11_MIN_AGO },
    NOW,
  );
  assert(under.ok === true, "9 minutes elapsed -> still accepted");
  assert(!atLimit.ok && atLimit.code === "ONBOARDING_TIME_LIMIT_REACHED", "exactly 10 minutes elapsed -> rejected");
  assert(!over.ok && over.code === "ONBOARDING_TIME_LIMIT_REACHED", "11 minutes elapsed -> rejected");
  if (!atLimit.ok) assert(atLimit.status === 422, "time-limit rejection uses 422, not a hard 4xx client error");
});

// ── validateOnboardingSummaryRequest ────────────────────────────────────────

group("9. onboarding/summary: happy path accepted, no startedAt required at all", () => {
  const result = validateOnboardingSummaryRequest({
    messages: [
      { role: "user", content: "Olen üliõpilane." },
      { role: "assistant", content: "Tore!" },
    ],
    lang: "et",
  });
  assert(result.ok === true, "accepted with no startedAt field present");
  if (result.ok) assert(result.messages.length === 2, "full transcript carried through");
});

group("10. onboarding/summary: reachable even if it would represent a conversation past the 10-minute mark", () => {
  // No time-based rejection exists for this endpoint at all — proven simply
  // by the fact that it takes no `now`/startedAt parameter in the first
  // place, unlike validateOnboardingChatRequest.
  const result = validateOnboardingSummaryRequest({ messages: [{ role: "user", content: "hi" }] });
  assert(result.ok === true, "summary validator has no time-limit concept to reject on");
});

group("11. onboarding/summary: same message-shape and length rules apply, with its own (larger) total cap", () => {
  const r1 = validateOnboardingSummaryRequest({ messages: [] });
  assert(!r1.ok && r1.code === "INVALID_MESSAGES", "empty transcript rejected");

  const tooLong = "a".repeat(ONBOARDING_SUMMARY_LIMITS.maxMessageLength + 1);
  const r2 = validateOnboardingSummaryRequest({ messages: [{ role: "user", content: tooLong }] });
  assert(!r2.ok && r2.code === "MESSAGE_TOO_LONG", "single over-length message rejected");

  assert(
    ONBOARDING_SUMMARY_LIMITS.maxTotalContentLength > ONBOARDING_CHAT_LIMITS.maxTotalContentLength,
    "summary's total-content cap is larger than a single chat turn's, since it holds the whole transcript",
  );
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  validateOnboardingRequest: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
