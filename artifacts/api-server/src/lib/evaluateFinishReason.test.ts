/**
 * Unit tests for evaluateFinishReason (completion truncation/incomplete
 * guard for POST /api/ai/chat).
 *
 * evaluateFinishReason() is called immediately after the OpenAI completion
 * comes back and BEFORE `JSON.parse(raw)` runs in the route handler (see
 * routes/ai.ts: `if (rejectRequest) { res.status(422)...; return; }` occurs
 * before `const raw = completion.choices[0]?.message?.content`). So proving
 * rejectRequest === true here for a given finish_reason is exactly proving
 * that no JSON parsing, action extraction, or draft ever happens for that
 * completion, regardless of whether its (possibly truncated) content would
 * otherwise have parsed as valid JSON.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/evaluateFinishReason.test.ts | node
 */

import { evaluateFinishReason } from "./evaluateFinishReason.js";

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

group("1. plan_creation + finish_reason 'stop' → accepted, nothing discarded", () => {
  const d = evaluateFinishReason("plan_creation", "stop");
  assert(d.rejectRequest === false, "request not rejected");
  assert(d.discardActions === false, "actions not discarded — a valid preview may be produced");
});

group("2. plan_creation + finish_reason 'length' → rejected before parsing", () => {
  const d = evaluateFinishReason("plan_creation", "length");
  assert(d.rejectRequest === true, "request rejected outright");
  assert(d.discardActions === true, "actions also marked discarded");
});

group("3. plan_creation + finish_reason 'content_filter' → rejected", () => {
  const d = evaluateFinishReason("plan_creation", "content_filter");
  assert(d.rejectRequest === true, "request rejected outright");
});

group("4. plan_creation + missing/null/undefined finish_reason → rejected", () => {
  assert(evaluateFinishReason("plan_creation", null).rejectRequest === true, "null finish_reason rejected");
  assert(evaluateFinishReason("plan_creation", undefined).rejectRequest === true, "undefined finish_reason rejected");
});

group("5. plan_creation + any other non-stop reason → rejected", () => {
  assert(evaluateFinishReason("plan_creation", "tool_calls").rejectRequest === true, "'tool_calls' rejected");
  assert(evaluateFinishReason("plan_creation", "function_call").rejectRequest === true, "'function_call' rejected");
  assert(evaluateFinishReason("plan_creation", "something_unexpected").rejectRequest === true, "unknown string reason rejected");
});

group("6. chat mode + 'stop' → unaffected", () => {
  const d = evaluateFinishReason("chat", "stop");
  assert(d.rejectRequest === false, "request not rejected");
  assert(d.discardActions === false, "actions kept");
});

group("7. chat mode + non-stop reasons → request NOT rejected (reply text still shown), but actions ARE always discarded", () => {
  for (const reason of ["length", "content_filter", null, undefined, "tool_calls"]) {
    const d = evaluateFinishReason("chat", reason);
    assert(d.rejectRequest === false, `chat mode never rejects the whole request for reason=${String(reason)}`);
    assert(d.discardActions === true, `chat mode always discards actions for a non-stop reason=${String(reason)} — no partial write can execute`);
  }
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  evaluateFinishReason: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
