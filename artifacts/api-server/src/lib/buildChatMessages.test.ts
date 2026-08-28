/**
 * Unit tests for buildChatMessages — the pure function that assembles the
 * exact message array sent to the model for POST /api/ai/chat.
 *
 * Root cause this locks in: an OLD, long-running AI conversation kept
 * repeating stale facts from its own earlier turns ("Task A exists") even
 * after Task A was deleted outside that conversation, while a brand-new
 * conversation (short/no history) always answered correctly. The store/
 * context-building layer was never stale (see aiContextFreshness.test.ts
 * and aiRequestPayloadIntegration.test.ts in the planner-app package) — the
 * bug was purely in message ORDER: CURRENT_KIVORA_STATE used to be placed
 * BEFORE conversation history in the request sent to the model, so a long
 * history's own repeated assertions sat closer to the point of generation
 * (more influential) than the fresh data block parked back near the start.
 *
 * buildChatMessages() now places CURRENT_KIVORA_STATE AFTER all history,
 * immediately adjacent to the current turn, on every single request —
 * removing the recency race entirely instead of just adding more prompt
 * wording asking the model to prefer it.
 *
 * Compile and run (also available as `pnpm run test:buildChatMessages`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/buildChatMessages.test.ts | node
 */

import { buildChatMessages } from "./buildChatMessages.js";
import type { ChatRequestMessage } from "./validateChatRequest.js";

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

function userMsg(content: string): ChatRequestMessage {
  return { role: "user", content };
}
function assistantMsg(content: string): ChatRequestMessage {
  return { role: "assistant", content };
}

const DATES = { today: "2026-08-28", tomorrow: "2026-08-29", yesterday: "2026-08-27" };

// ── 16-18. Conflicting-history case: fresh state must win ──────────────────

group("16-18. a historical assistant claim about entity existence never outranks CURRENT_KIVORA_STATE", () => {
  const messages: ChatRequestMessage[] = [
    userMsg("Millised ülesanded mul on?"),
    assistantMsg('Praegu on sul üks ülesanne: "Pane Matiase kooliasjad valmis".'),
    userMsg("Kas see on ikka olemas?"),
  ];
  const result = buildChatMessages({
    lang: "et",
    mode: "chat",
    ...DATES,
    context: "### Ülesanded\nKõik ülesanded on tehtud.",
    messages,
  });

  const historicalIdx = result.findIndex(
    (m) => typeof m.content === "string" && m.content.includes('Praegu on sul üks ülesanne'),
  );
  const freshStateIdx = result.findIndex(
    (m) => typeof m.content === "string" && m.content.includes("CURRENT_KIVORA_STATE"),
  );
  assert(historicalIdx !== -1, "the historical (stale) assistant claim is present, as conversation history");
  assert(freshStateIdx !== -1, "CURRENT_KIVORA_STATE is present");
  assert(freshStateIdx > historicalIdx, "CURRENT_KIVORA_STATE is positioned AFTER the historical claim, not before it");
  assert(
    result[result.length - 1] === messages[messages.length - 1],
    "the current turn is still the very last message",
  );
  assert(
    result[result.length - 2]?.role === "system" &&
      typeof result[result.length - 2]?.content === "string" &&
      (result[result.length - 2]!.content as string).includes("CURRENT_KIVORA_STATE"),
    "CURRENT_KIVORA_STATE is the message immediately BEFORE the current turn — the closest thing to the point of generation",
  );
});

// ── Payload order: locks the exact tier ordering so it cannot regress ──────

group("Payload order: stable instructions, then full history, then CURRENT_KIVORA_STATE, then current turn", () => {
  const messages: ChatRequestMessage[] = [
    userMsg("Loo ülesanne Osta piima"),
    assistantMsg('Ülesanne "Osta piima" lisatud.'),
    userMsg("Kustuta see"),
    assistantMsg('Kas soovid kindlasti kustutada ülesande "Osta piima"?'),
    userMsg("Jah, kustuta."),
  ];
  const result = buildChatMessages({
    lang: "et",
    mode: "chat",
    ...DATES,
    context: "### Ülesanded\nPraegu ei ole selles moodulis ühtegi kirjet.",
    messages,
  });

  assert(result.length === 1 + 4 + 1 + 1, "exactly one stable system message + 4 history messages + 1 CURRENT_KIVORA_STATE + the current turn");
  assert(result[0]!.role === "system", "message 0 is the stable system instructions");
  assert(
    typeof result[0]!.content === "string" && (result[0]!.content as string).includes("CURRENT DATE") === false && (result[0]!.content as string).includes("TÄNANE KUUPÄEV"),
    "message 0 is buildSystemPrompt's Estonian variant (contains TÄNANE KUUPÄEV)",
  );
  for (let i = 0; i < 4; i++) {
    assert(
      result[1 + i]?.role === messages[i]!.role && result[1 + i]?.content === messages[i]!.content,
      `message ${1 + i} is history entry ${i}, unmodified and in original order`,
    );
  }
  assert(result[5]!.role === "system", "message 5 (right after history) is the CURRENT_KIVORA_STATE system message");
  assert(
    typeof result[5]!.content === "string" && (result[5]!.content as string).startsWith("CURRENT_KIVORA_STATE"),
    "message 5's content starts with the literal CURRENT_KIVORA_STATE label",
  );
  assert(result[6] === messages[4], "message 6 (last) is the current turn, unmodified");
});

group("no history (brand-new conversation): CURRENT_KIVORA_STATE still sits directly before the single turn", () => {
  const messages: ChatRequestMessage[] = [userMsg("Millised ülesanded mul on?")];
  const result = buildChatMessages({
    lang: "et",
    mode: "chat",
    ...DATES,
    context: "### Ülesanded\nKõik ülesanded on tehtud.",
    messages,
  });
  assert(result.length === 3, "stable system + CURRENT_KIVORA_STATE + the one user turn");
  assert(result[0]!.role === "system", "message 0 is stable instructions");
  assert(
    typeof result[1]!.content === "string" && (result[1]!.content as string).startsWith("CURRENT_KIVORA_STATE"),
    "message 1 is CURRENT_KIVORA_STATE",
  );
  assert(result[2] === messages[0], "message 2 is the current (only) turn");
});

group("no context supplied: no CURRENT_KIVORA_STATE message is added at all", () => {
  const messages: ChatRequestMessage[] = [userMsg("Tere!")];
  const result = buildChatMessages({ lang: "et", mode: "chat", ...DATES, messages });
  assert(result.length === 2, "just the stable system message + the current turn — no phantom third message");
  assert(
    !result.some((m) => typeof m.content === "string" && m.content.includes("CURRENT_KIVORA_STATE")),
    "no CURRENT_KIVORA_STATE anywhere in the payload",
  );
});

// ── mode: plan_creation — its instruction stays in the stable tier ─────────

group("plan_creation mode: the mode instruction is a STABLE message, not affected by history/context ordering", () => {
  const messages: ChatRequestMessage[] = [userMsg("suveniku päevakava")];
  const result = buildChatMessages({ lang: "et", mode: "plan_creation", ...DATES, messages });
  assert(result.length === 3, "buildSystemPrompt + the plan_creation instruction + the single user turn (no context in plan_creation mode)");
  assert(result[0]!.role === "system" && result[1]!.role === "system", "both preceding messages are system role");
  assert(
    typeof result[1]!.content === "string" && (result[1]!.content as string).includes("plaani loomise sooviavaldusena"),
    "message 1 is the plan_creation-specific instruction",
  );
  assert(result[2] === messages[0], "the last message is still the user's plan description, unmodified");
});

// ── Language selection ──────────────────────────────────────────────────────

group("lang: 'en' produces the English CURRENT_KIVORA_STATE label and system prompt", () => {
  const messages: ChatRequestMessage[] = [userMsg("What tasks do I have?")];
  const result = buildChatMessages({
    lang: "en",
    mode: "chat",
    ...DATES,
    context: "### Tasks\nAll tasks are done.",
    messages,
  });
  assert(
    typeof result[0]!.content === "string" && (result[0]!.content as string).includes("CURRENT DATE"),
    "stable system message is the English variant",
  );
  assert(
    typeof result[1]!.content === "string" && (result[1]!.content as string).startsWith("CURRENT_KIVORA_STATE"),
    "CURRENT_KIVORA_STATE label is present in English mode too (English text, same label)",
  );
});

// ── 20. Entity-action resolution: the model is told, in-band, not to act on history alone ──

group("20. the CURRENT_KIVORA_STATE text explicitly forbids resolving actions from history alone", () => {
  const messages: ChatRequestMessage[] = [
    assistantMsg("Kustutasin varasemalt ülesande X."),
    userMsg("Kustuta ülesanne X uuesti"),
  ];
  const result = buildChatMessages({
    lang: "et",
    mode: "chat",
    ...DATES,
    context: "### Ülesanded\nKõik ülesanded on tehtud.",
    messages,
  });
  const stateMsg = result.find(
    (m) => typeof m.content === "string" && m.content.includes("CURRENT_KIVORA_STATE"),
  );
  assert(!!stateMsg, "CURRENT_KIVORA_STATE message exists");
  assert(
    typeof stateMsg?.content === "string" &&
      (stateMsg.content as string).includes("Lahenda iga delete/update/complete/link toiming"),
    "explicit instruction: resolve every delete/update/complete/link action using ONLY this block, never history alone",
  );
});

// ── 22. Destructive-action confirmation wording is present in the stable system prompt ──

group("22. the destructive-action confirmation policy text is present in the stable system prompt", () => {
  const result = buildChatMessages({
    lang: "et",
    mode: "chat",
    ...DATES,
    messages: [userMsg("hi")],
  });
  assert(
    typeof result[0]!.content === "string" &&
      (result[0]!.content as string).includes("KUSTUTAMINE — rakendus ise tagab kinnitus-enne-täitmist reegli"),
    "the confirm-before-execute-is-the-app's-job instruction is present verbatim in the stable system prompt",
  );
});

// ── 23. Root-cause fix for a live incident: the model must ALWAYS emit the ──
// ── delete_* action, even on the first ask — never withhold it while only ──
// ── asking a question in free text. See aiDeleteTwoTurnConfirmationFlow    ──
// ── .test.ts (planner-app) for the full two-turn reproduction. The OLD     ──
// ── prompt told the model to hold the action back on the first request,   ──
// ── which meant the code-level confirm-before-execute gate (aiActions.ts) ──
// ── never received anything to track — a short "jah"/"yes" on the next    ──
// ── turn had no pending action to resolve, and the model's own            ──
// ── subsequent delete_* emission was treated as a brand-new first         ──
// ── proposal, asking the same confirmation question again forever.        ──

group("23. the model is told to ALWAYS emit the delete_* action, including on the first ask — never to withhold it", () => {
  const et = buildChatMessages({ lang: "et", mode: "chat", ...DATES, messages: [userMsg("hi")] });
  const en = buildChatMessages({ lang: "en", mode: "chat", ...DATES, messages: [userMsg("hi")] });
  const etPrompt = et[0]!.content as string;
  const enPrompt = en[0]!.content as string;

  assert(
    etPrompt.includes("käivita ALATI täpne delete_* toiming"),
    "ET: instructs the model to ALWAYS emit the exact delete_* action, every time a deletion is requested",
  );
  assert(
    etPrompt.includes("kaasa arvatud esimesel korral"),
    "ET: explicitly includes the very first ask, not just later confirmations",
  );
  assert(
    !etPrompt.includes("ÄRA veel seda delete_* toimingut emiteeri"),
    "ET: the old 'do NOT emit the action yet' instruction is gone — it caused the code gate to never receive a pending action on the first ask",
  );

  assert(
    enPrompt.includes("ALWAYS emit the exact delete_* action"),
    "EN: instructs the model to ALWAYS emit the exact delete_* action, every time a deletion is requested",
  );
  assert(
    enPrompt.includes("including the very first time"),
    "EN: explicitly includes the very first ask, not just later confirmations",
  );
  assert(
    !enPrompt.includes("do NOT emit that delete_* action yet"),
    "EN: the old 'do NOT emit the action yet' instruction is gone — it caused the code gate to never receive a pending action on the first ask",
  );

  assert(
    etPrompt.includes("Rakendus, mitte sina, otsustab") || etPrompt.includes("Ei otsusta mitte sina, vaid rakendus"),
    "ET: makes clear the APP decides execute-vs-confirm, not the model",
  );
  assert(
    enPrompt.includes("You do not decide whether it actually executes"),
    "EN: makes clear the APP decides execute-vs-confirm, not the model",
  );
});

console.log(`\n${"─".repeat(60)}\nbuildChatMessages: ${passed} passed, ${failed} failed\n${"─".repeat(60)}`);
if (failed > 0) process.exit(1);
