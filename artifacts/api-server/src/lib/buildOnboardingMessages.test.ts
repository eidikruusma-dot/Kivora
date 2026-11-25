/**
 * Unit tests for buildOnboardingMessages.ts. Pure functions — asserts
 * message ordering/shape and language branching directly, without mocking
 * the OpenAI SDK (same technique buildChatMessages.test.ts already uses
 * for the general assistant's prompt).
 *
 * Compile and run (also available as `pnpm run test:buildOnboardingMessages`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/buildOnboardingMessages.test.ts | node
 */

import { buildOnboardingChatMessages, buildOnboardingSummaryMessages, countUserReplies } from "./buildOnboardingMessages.js";
import {
  ONBOARDING_MODULE_IDS,
  ONBOARDING_PURPOSE_IDS,
  allowedOnboardingModuleIds,
  allowedOnboardingPurposeIds,
  ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP,
} from "./onboardingConfig.js";

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

// ── buildOnboardingChatMessages ─────────────────────────────────────────────

group("1. chat: system prompt always comes first, then the conversation unmodified, then the wrap-up guard note last", () => {
  const messages = [
    { role: "user" as const, content: "Tere!" },
    { role: "assistant" as const, content: "Tere tulemast!" },
    { role: "user" as const, content: "Olen õpetaja." },
  ];
  const result = buildOnboardingChatMessages({ lang: "et", messages });
  assert(result.length === 5, "system prompt + 3 conversation messages + trailing wrap-up guard note");
  assert(result[0].role === "system", "first message is the system prompt");
  assert(result[1] === messages[0] && result[2] === messages[1] && result[3] === messages[2], "conversation messages pass through unchanged, in order");
  assert(result[4].role === "system", "last message is the wrap-up guard note");
  assert(result[4] !== result[0], "the guard note is a distinct message from the opening system prompt");
});

group("1b. chat: the wrap-up guard note reflects the real user reply count and the minimum-replies rule", () => {
  const below = buildOnboardingChatMessages({
    lang: "et",
    messages: [
      { role: "user", content: "Tere!" },
      { role: "assistant", content: "Tere tulemast!" },
    ],
  });
  assert(countUserReplies([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]) === 1, "countUserReplies counts only user-role messages");
  assert(below[below.length - 1].content.includes("1 korda"), `note states the real count 1 (got: ${below[below.length - 1].content})`);
  assert(/ÄRA paku/.test(below[below.length - 1].content), "below the minimum: explicitly forbids suggesting wrap-up");

  const atMinimum = buildOnboardingChatMessages({
    lang: "et",
    messages: Array.from({ length: ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP }, (_, i) => ({
      role: "user" as const,
      content: `vastus ${i + 1}`,
    })),
  });
  const lastNote = atMinimum[atMinimum.length - 1].content;
  assert(lastNote.includes(`${ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP} korda`), `note states the real count at the minimum (got: ${lastNote})`);
  assert(/Võid nüüd pakkuda/.test(lastNote), "at/above the minimum: explicitly permits suggesting wrap-up");

  const en = buildOnboardingChatMessages({ lang: "en", messages: [{ role: "user", content: "Hi!" }] });
  const enNote = en[en.length - 1].content;
  assert(enNote.includes("1 time(s)"), `English note states the real count (got: ${enNote})`);
  assert(/Do NOT suggest wrapping up/.test(enNote), "English note below the minimum forbids suggesting wrap-up");
});

group("2. chat: Estonian vs English system prompt selected by lang, each in its own language", () => {
  const et = buildOnboardingChatMessages({ lang: "et", messages: [{ role: "user", content: "hi" }] });
  const en = buildOnboardingChatMessages({ lang: "en", messages: [{ role: "user", content: "hi" }] });
  assert(et[0].content.includes("eesti keeles"), "Estonian prompt instructs responding in Estonian");
  assert(en[0].content.includes("English"), "English prompt instructs responding in English");
  assert(!et[0].content.includes("English"), "Estonian prompt is not just the English one with a note appended");
});

group("3. chat: system prompt never mentions destructive/CRUD action vocabulary", () => {
  const et = buildOnboardingChatMessages({ lang: "et", messages: [{ role: "user", content: "hi" }] });
  const en = buildOnboardingChatMessages({ lang: "en", messages: [{ role: "user", content: "hi" }] });
  const forbidden = ["delete_task", "create_task", "delete_habit", "create_calendar_event", "preview_plan_creation"];
  for (const token of forbidden) {
    assert(!et[0].content.includes(token), `Estonian onboarding prompt does not mention "${token}"`);
    assert(!en[0].content.includes(token), `English onboarding prompt does not mention "${token}"`);
  }
});

group("4. chat: system prompt instructs exactly one question per message", () => {
  const et = buildOnboardingChatMessages({ lang: "et", messages: [{ role: "user", content: "hi" }] });
  const en = buildOnboardingChatMessages({ lang: "en", messages: [{ role: "user", content: "hi" }] });
  assert(/üks küsimus/i.test(et[0].content), "Estonian prompt says 'one question'");
  assert(/one question/i.test(en[0].content), "English prompt says 'one question'");
});

// ── buildOnboardingSummaryMessages ──────────────────────────────────────────

group("5. summary: system prompt first, transcript preserved in order, closing instruction last", () => {
  const messages = [
    { role: "user" as const, content: "Olen üliõpilane ja pean palju plaane tegema." },
    { role: "assistant" as const, content: "Põnev! Kas kasutad ka kalendrit?" },
    { role: "user" as const, content: "Jah, iga päev." },
  ];
  const allowedModuleIds = allowedOnboardingModuleIds(false);
  const allowedPurposeIds = allowedOnboardingPurposeIds(false);
  const result = buildOnboardingSummaryMessages({ lang: "et", messages, allowedModuleIds, allowedPurposeIds });
  assert(result.length === 5, "system + 3 transcript messages + closing system instruction");
  assert(result[0].role === "system", "first is the summary system prompt");
  assert(result[1] === messages[0] && result[2] === messages[1] && result[3] === messages[2], "transcript preserved unchanged, in order");
  assert(result[4].role === "system", "last message is the closing instruction");
  assert(result[4] !== result[0], "closing instruction is a distinct message from the opening system prompt");
});

group("6. summary: allowed module AND purpose ids are embedded in the prompt, respecting the money-module flag", () => {
  const messages = [{ role: "user" as const, content: "hi" }];
  const withoutFinance = buildOnboardingSummaryMessages({
    lang: "et",
    messages,
    allowedModuleIds: allowedOnboardingModuleIds(false),
    allowedPurposeIds: allowedOnboardingPurposeIds(false),
  });
  const withFinance = buildOnboardingSummaryMessages({
    lang: "et",
    messages,
    allowedModuleIds: allowedOnboardingModuleIds(true),
    allowedPurposeIds: allowedOnboardingPurposeIds(true),
  });
  assert(!withoutFinance[0].content.includes('"finance"'), "finance excluded from the prompt when money module is disabled");
  assert(withFinance[0].content.includes('"finance"'), "finance included in the prompt when money module is enabled");
  for (const id of ONBOARDING_MODULE_IDS.filter((m) => m !== "finance")) {
    assert(withoutFinance[0].content.includes(`"${id}"`), `non-finance module "${id}" is listed in the prompt`);
  }
  for (const id of ONBOARDING_PURPOSE_IDS.filter((p) => p !== "finance")) {
    assert(withoutFinance[0].content.includes(`"${id}"`), `non-finance purpose "${id}" is listed in the prompt`);
  }
});

group("7. summary: instructs JSON-only output with the exact expected shape, including recommendedPurposes", () => {
  const et = buildOnboardingSummaryMessages({
    lang: "et",
    messages: [{ role: "user", content: "hi" }],
    allowedModuleIds: allowedOnboardingModuleIds(false),
    allowedPurposeIds: allowedOnboardingPurposeIds(false),
  });
  assert(et[0].content.includes("profileSummary"), "prompt names the profileSummary field");
  assert(et[0].content.includes("recommendedPurposes"), "prompt names the recommendedPurposes field");
  assert(et[0].content.includes("recommendedModules"), "prompt names the recommendedModules field");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  buildOnboardingMessages: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
