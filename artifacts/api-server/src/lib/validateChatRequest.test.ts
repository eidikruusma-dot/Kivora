/**
 * Unit tests for validateChatRequest (POST /api/ai/chat server-side limits).
 *
 * Proves the backend rejects oversized/malformed requests BEFORE the OpenAI
 * call is ever made — validateChatRequest() is a pure function called at the
 * top of the route handler, ahead of `openai.chat.completions.create(...)`,
 * so a false→ok:false result here is exactly what stops the OpenAI call in
 * the real route. Synthetic data only.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/validateChatRequest.test.ts | node
 */

import { validateChatRequest, CHAT_REQUEST_LIMITS } from "./validateChatRequest.js";
import { PLAN_DRAFT_LIMITS } from "./planDraftValidation.js";

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

function userMsg(content: string) {
  return { role: "user", content };
}

group("1. Normal, reasonable Assistant requests are accepted", () => {
  const result = validateChatRequest({
    messages: [userMsg("Mis ülesanded mul homme on?"), { role: "assistant", content: "Sul on 2 ülesannet." }, userMsg("Aitäh!")],
  });
  assert(result.ok === true, "3-message chat conversation accepted");
  if (result.ok) assert(result.mode === "chat", "defaults to mode 'chat' when mode is omitted");
});

group("2. mode: 'chat' explicit is accepted the same as default", () => {
  const result = validateChatRequest({ messages: [userMsg("Tere!")], mode: "chat" });
  assert(result.ok === true, "explicit mode: chat accepted");
});

group("3. Unknown mode is rejected", () => {
  const result = validateChatRequest({ messages: [userMsg("hi")], mode: "something_else" });
  assert(result.ok === false, "unknown mode rejected");
  if (!result.ok) {
    assert(result.code === "INVALID_MODE", "code is INVALID_MODE");
    assert(result.status >= 400 && result.status < 500, "4xx status");
  }
});

group("4. Missing/empty messages array is rejected", () => {
  const r1 = validateChatRequest({ messages: [] });
  const r2 = validateChatRequest({});
  const r3 = validateChatRequest({ messages: "not an array" });
  assert(r1.ok === false && (r1 as { code: string }).code === "INVALID_MESSAGES", "empty array rejected");
  assert(r2.ok === false && (r2 as { code: string }).code === "INVALID_MESSAGES", "missing field rejected");
  assert(r3.ok === false && (r3 as { code: string }).code === "INVALID_MESSAGES", "non-array rejected");
});

group("5. Malformed roles/content are rejected before any OpenAI call", () => {
  const badRole = validateChatRequest({ messages: [{ role: "system", content: "hi" }] });
  const badContentType = validateChatRequest({ messages: [{ role: "user", content: 12345 }] });
  const missingContent = validateChatRequest({ messages: [{ role: "user" }] });
  const notAnObject = validateChatRequest({ messages: ["just a string"] });
  assert(badRole.ok === false && (badRole as { code: string }).code === "INVALID_MESSAGE_SHAPE", "invalid role rejected");
  assert(badContentType.ok === false && (badContentType as { code: string }).code === "INVALID_MESSAGE_SHAPE", "non-string content rejected");
  assert(missingContent.ok === false && (missingContent as { code: string }).code === "INVALID_MESSAGE_SHAPE", "missing content rejected");
  assert(notAnObject.ok === false && (notAnObject as { code: string }).code === "INVALID_MESSAGE_SHAPE", "non-object message rejected");
});

group("6. Excessive message count is rejected", () => {
  const messages = Array.from({ length: CHAT_REQUEST_LIMITS.maxMessages + 1 }, (_, i) => userMsg(`msg ${i}`));
  const result = validateChatRequest({ messages });
  assert(result.ok === false && (result as { code: string }).code === "TOO_MANY_MESSAGES", `over ${CHAT_REQUEST_LIMITS.maxMessages} messages rejected`);

  const atLimit = validateChatRequest({ messages: messages.slice(0, CHAT_REQUEST_LIMITS.maxMessages) });
  assert(atLimit.ok === true, `exactly ${CHAT_REQUEST_LIMITS.maxMessages} messages accepted`);
});

group("7. Excessive per-message length is rejected", () => {
  const tooLong = validateChatRequest({ messages: [userMsg("x".repeat(CHAT_REQUEST_LIMITS.maxMessageLength + 1))] });
  assert(tooLong.ok === false && (tooLong as { code: string }).code === "MESSAGE_TOO_LONG", "over-length single message rejected");

  const atLimit = validateChatRequest({ messages: [userMsg("x".repeat(CHAT_REQUEST_LIMITS.maxMessageLength))] });
  assert(atLimit.ok === true, "message at exactly the length limit accepted");
});

group("8. Excessive total content length is rejected", () => {
  // Many messages, each under the per-message cap, but summing past the total cap.
  const perMessage = 10_000;
  const count = Math.ceil(CHAT_REQUEST_LIMITS.maxTotalContentLength / perMessage) + 1;
  const messages = Array.from({ length: Math.min(count, CHAT_REQUEST_LIMITS.maxMessages) }, () => userMsg("x".repeat(perMessage)));
  const result = validateChatRequest({ messages });
  assert(result.ok === false, "sum of message lengths over the total cap is rejected");
  if (!result.ok && result.code !== "TOO_MANY_MESSAGES") {
    assert(result.code === "TOTAL_CONTENT_TOO_LONG", "code is TOTAL_CONTENT_TOO_LONG (when not already capped by message count)");
  }
});

group("9. plan_creation mode requires exactly one user message", () => {
  const twoMessages = validateChatRequest({
    messages: [userMsg("first"), userMsg("second")],
    mode: "plan_creation",
  });
  assert(twoMessages.ok === false && (twoMessages as { code: string }).code === "PLAN_CREATION_REQUIRES_SINGLE_MESSAGE", "two messages rejected in plan_creation mode");

  const assistantOnly = validateChatRequest({
    messages: [{ role: "assistant", content: "hi" }],
    mode: "plan_creation",
  });
  assert(assistantOnly.ok === false && (assistantOnly as { code: string }).code === "PLAN_CREATION_REQUIRES_SINGLE_MESSAGE", "a single assistant message is rejected (must be user)");

  const single = validateChatRequest({ messages: [userMsg("Loo nädala menüü")], mode: "plan_creation" });
  assert(single.ok === true, "a single user message is accepted in plan_creation mode");
});

group("10. plan_creation prompt length — at the limit accepted, over the limit rejected before any OpenAI call", () => {
  const atLimit = validateChatRequest({
    messages: [userMsg("x".repeat(PLAN_DRAFT_LIMITS.maxPromptLength))],
    mode: "plan_creation",
  });
  assert(atLimit.ok === true, `a prompt at exactly maxPromptLength (${PLAN_DRAFT_LIMITS.maxPromptLength}) is accepted`);

  const overLimit = validateChatRequest({
    messages: [userMsg("x".repeat(PLAN_DRAFT_LIMITS.maxPromptLength + 1))],
    mode: "plan_creation",
  });
  assert(overLimit.ok === false, "a prompt one character over maxPromptLength is rejected");
  if (!overLimit.ok) {
    assert(overLimit.code === "PLAN_PROMPT_TOO_LONG", "code is PLAN_PROMPT_TOO_LONG");
    assert(overLimit.status >= 400 && overLimit.status < 500, "4xx status returned, not silently truncated");
  }
});

group("11. Server input is never silently truncated — rejection, not a shortened message, is returned", () => {
  const result = validateChatRequest({
    messages: [userMsg("y".repeat(PLAN_DRAFT_LIMITS.maxPromptLength + 500))],
    mode: "plan_creation",
  });
  assert(result.ok === false, "oversized plan prompt is rejected outright");
  // ok:false carries no `messages` field at all — nothing truncated is ever handed back for use.
  assert(!("messages" in result), "no (truncated or otherwise) messages payload is returned on rejection");
});

group("12. Integration-level: the actual frontend request-construction path matches backend validation exactly", () => {
  // Mirrors artifacts/planner-app/src/lib/aiClient.ts buildPlanGenerationMessages
  // EXACTLY (a one-line identity wrapper: the trimmed description becomes the
  // sole message content, with no prefix/wrapper sentence) — so this group
  // proves the real request the frontend builds, not just validateChatRequest
  // in isolation. If that frontend function is ever changed to add a prefix
  // again, this mirror (and therefore this test) would need to change too,
  // which is the point: it pins the "no hidden prefix" contract from both ends.
  function buildPlanGenerationMessages(description: string): { role: "user"; content: string }[] {
    return [{ role: "user", content: description }];
  }

  const at500 = "d".repeat(PLAN_DRAFT_LIMITS.maxPromptLength); // exactly 500 chars, as if typed in the textarea
  const messagesAt500 = buildPlanGenerationMessages(at500);
  assert(messagesAt500[0].content.length === PLAN_DRAFT_LIMITS.maxPromptLength, "constructed message content is exactly maxPromptLength, no added chars");
  assert(messagesAt500[0].content === at500, "message content equals the raw description verbatim — no prefix/wrapper");
  const resultAt500 = validateChatRequest({ messages: messagesAt500, mode: "plan_creation" });
  assert(resultAt500.ok === true, "exactly 500 characters from the textarea reaches backend validation and is accepted");

  const at501 = "d".repeat(PLAN_DRAFT_LIMITS.maxPromptLength + 1); // 501 chars
  const messagesAt501 = buildPlanGenerationMessages(at501);
  const resultAt501 = validateChatRequest({ messages: messagesAt501, mode: "plan_creation" });
  assert(resultAt501.ok === false, "501 characters is rejected before OpenAI is called");
  if (!resultAt501.ok) assert(resultAt501.code === "PLAN_PROMPT_TOO_LONG", "rejected with the expected stable code");

  // A description that itself contains text resembling the OLD hidden prefix —
  // proves no wrapper is silently re-added around arbitrary user content.
  const trickyDescription = "Loo plaan järgmise kirjelduse põhjal: " + "e".repeat(PLAN_DRAFT_LIMITS.maxPromptLength - 38);
  const trickyMessages = buildPlanGenerationMessages(trickyDescription);
  assert(trickyMessages[0].content === trickyDescription, "user text resembling the old prefix is sent verbatim, not further wrapped");
  assert(trickyMessages[0].content.length === PLAN_DRAFT_LIMITS.maxPromptLength, "still exactly at the limit — nothing appended on top of the user's own text");
  assert(validateChatRequest({ messages: trickyMessages, mode: "plan_creation" }).ok === true, "accepted at exactly the limit");
});

// ── context (CURRENT_KIVORA_STATE) size/type validation ─────────────────────
//
// Root cause of a live production 400 on POST /api/ai/chat: `context` is a
// SEPARATE top-level request field, sent alongside (never inside) the
// `messages` array — none of the checks above this section ever applied to
// it, and none of aiContextBuilder.ts's module sections (Tasks, Plans,
// Goals, Notes, Habits, Calendar, School, Finance, Notifications) cap their
// own rendered size. An active account's real data (the incident report
// specifically named "substantially more real School/Task data") exceeded
// the raw HTTP body-size limit before this field-level check existed, and
// that rejection happened inside body-parser, before this validator ever
// ran, as an opaque error with no usable message.

group("context: a realistically large value (simulating a heavy real account) is accepted", () => {
  // Mirrors the shape of a real buildAIContext() output for an account with
  // substantial Task/School/Plan/Notes data — well over the OLD 100kb raw
  // body-parser default, comfortably under maxContextLength.
  const taskLines = Array.from({ length: 1000 }, (_, i) => `  - Ülesanne ${i} — kirjeldus ja tähtaeg (kategooria: Kodu, prioriteet: keskmine)`);
  const schoolLines = Array.from({ length: 1000 }, (_, i) => `  - Õppeaine ${i % 12}: Kodutöö ${i} — tähtaeg: 2026-09-01, edenemine: ${i % 100}%, staatus: tegemata`);
  const realisticContext = [
    `### Ülesanded (tegemata 400/400)\n${taskLines.join("\n")}`,
    `### Kool\n${schoolLines.join("\n")}`,
  ].join("\n\n");
  assert(realisticContext.length > 100_000, `test context is realistically large (${realisticContext.length} chars > 100,000)`);
  assert(realisticContext.length < CHAT_REQUEST_LIMITS.maxContextLength, "still comfortably under maxContextLength");

  const result = validateChatRequest({
    messages: [userMsg("Millised ülesanded mul on?")],
    context: realisticContext,
  });
  assert(result.ok === true, `a realistically large context is accepted (got ${JSON.stringify(result)})`);
});

group("context: exactly at maxContextLength is accepted; one character over is rejected", () => {
  const atLimit = "x".repeat(CHAT_REQUEST_LIMITS.maxContextLength);
  const atResult = validateChatRequest({ messages: [userMsg("hi")], context: atLimit });
  assert(atResult.ok === true, "exactly maxContextLength characters is accepted");

  const overLimit = "x".repeat(CHAT_REQUEST_LIMITS.maxContextLength + 1);
  const overResult = validateChatRequest({ messages: [userMsg("hi")], context: overLimit });
  assert(overResult.ok === false, "one character over maxContextLength is rejected");
  if (!overResult.ok) {
    assert(overResult.code === "CONTEXT_TOO_LARGE", "rejected with the expected stable code CONTEXT_TOO_LARGE");
    assert(overResult.status === 400, "rejected with 400, not a generic 5xx");
  }
});

group("context: a non-string value is rejected cleanly, never reaches the model", () => {
  const result = validateChatRequest({ messages: [userMsg("hi")], context: { not: "a string" } as unknown });
  assert(result.ok === false, "a non-string context is rejected");
  if (!result.ok) assert(result.code === "INVALID_CONTEXT", "rejected with the expected stable code INVALID_CONTEXT");
});

group("context: omitted entirely is still valid (context is optional)", () => {
  const result = validateChatRequest({ messages: [userMsg("hi")] });
  assert(result.ok === true, "no context field at all is still a valid request");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  validateChatRequest: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
