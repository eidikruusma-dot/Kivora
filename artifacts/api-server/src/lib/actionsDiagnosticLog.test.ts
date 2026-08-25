/**
 * Unit tests for buildActionsDiagnosticLog (POST /api/ai/chat diagnostic
 * logging — the "Tundmatu toiming." production investigation).
 *
 * Proves the diagnostic log line can NEVER contain action data (titles,
 * item labels, notes, dates, or any other user content) — only action
 * TYPE STRINGS and counts — and that it correctly reports both the raw
 * (pre-normalization) and normalized action type names. Synthetic data
 * only; some of it is deliberately sensitive-looking (personal names,
 * recognisable phrases) specifically to prove it never appears in the log.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/actionsDiagnosticLog.test.ts | node
 */

import { buildActionsDiagnosticLog } from "./actionsDiagnosticLog.js";

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

group("1. Action data never appears in the diagnostic payload", () => {
  const rawActions = [
    {
      type: "preview_plan_creation",
      data: {
        title: "Synthetic Weekly Menu For Mari Testson",
        type: "menu",
        color: "#6F5AE8",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        items: [
          { label: "Esmaspäev – kanapasta", note: "Koostisosad:\n- 500 g kana\n- 400 g pastat" },
          { label: "Very Secret Personal Note About Mari", note: "This must never be logged anywhere." },
        ],
      },
    },
  ];
  const normalizedActions = rawActions; // simulating a valid pass-through for this check
  const log = buildActionsDiagnosticLog("plan_creation", "stop", rawActions, normalizedActions);

  const forbiddenSubstrings = [
    "Synthetic Weekly Menu",
    "Mari Testson",
    "Koostisosad",
    "kana",
    "pastat",
    "Esmaspäev",
    "Very Secret Personal Note",
    "must never be logged",
    "2026-09-01",
    "2026-09-07",
    "#6F5AE8",
  ];
  for (const s of forbiddenSubstrings) {
    assert(!log.includes(s), `log does not contain "${s}"`);
  }
  assert(!log.includes('"data"'), 'log never contains the literal string "data" (the field name itself is never serialized)');
});

group("2. Action data is excluded even for every other known action type (not just preview_plan_creation)", () => {
  const rawActions = [
    { type: "create_task", data: { title: "Confidential Task Title", description: "Sensitive task description" } },
    { type: "create_note", data: { title: "Diary Entry", content: "Deeply personal note content" } },
    { type: "create_money_income", data: { amount: 12345.67, title: "Salary from Employer X" } },
  ];
  const log = buildActionsDiagnosticLog("chat", "stop", rawActions, []);
  for (const s of ["Confidential Task Title", "Sensitive task description", "Diary Entry", "Deeply personal", "12345.67", "Salary from Employer X"]) {
    assert(!log.includes(s), `log does not contain "${s}"`);
  }
});

group("3. Raw and normalized action type names are both reported, with correct counts", () => {
  const rawActions = [
    { type: "create_plan", data: { title: "Should be dropped/renamed upstream", type: "study", items: [] } },
    { type: "create_task", data: { title: "A task" } },
  ];
  const normalizedActions = [{ type: "create_task", data: { title: "A task" } }]; // simulating the unknown type having been dropped
  const log = buildActionsDiagnosticLog("chat", "stop", rawActions, normalizedActions);

  assert(log.includes("rawCount=2"), "raw count is reported");
  assert(log.includes("normalizedCount=1"), "normalized count is reported");
  assert(log.includes('"create_plan"'), "raw type name 'create_plan' is reported — proves the actual mismatched type string is now observable");
  assert(log.includes('"create_task"'), "raw type name 'create_task' is reported");
  assert(log.includes("rawTypes="), "rawTypes field present");
  assert(log.includes("normalizedTypes="), "normalizedTypes field present");
  // normalizedTypes must contain only what survived (one create_task), not the dropped create_plan
  const normalizedTypesMatch = log.match(/normalizedTypes=(\[.*\])$/);
  assert(!!normalizedTypesMatch, "normalizedTypes is a well-formed trailing JSON array");
  if (normalizedTypesMatch) {
    const parsed = JSON.parse(normalizedTypesMatch[1]);
    assert(JSON.stringify(parsed) === JSON.stringify(["create_task"]), "normalizedTypes reflects exactly what normalization kept");
  }
});

group("4. mode and finish_reason are reported exactly", () => {
  const logChat = buildActionsDiagnosticLog("chat", "stop", [], []);
  assert(logChat.includes("mode=chat"), "mode=chat reported");
  assert(logChat.includes("finish_reason=stop"), "finish_reason=stop reported");

  const logPlan = buildActionsDiagnosticLog("plan_creation", "length", [], []);
  assert(logPlan.includes("mode=plan_creation"), "mode=plan_creation reported");
  assert(logPlan.includes("finish_reason=length"), "finish_reason=length reported");

  const logNull = buildActionsDiagnosticLog("chat", null, [], []);
  assert(logNull.includes("finish_reason=null"), "a null finish_reason is reported as the literal 'null', not omitted or throwing");

  const logUndefined = buildActionsDiagnosticLog("chat", undefined, [], []);
  assert(logUndefined.includes("finish_reason=null"), "an undefined finish_reason is also reported as 'null' (no distinct blank/undefined leak)");
});

group("5. Zero actions is reported safely (no error, correct counts)", () => {
  const log = buildActionsDiagnosticLog("chat", "stop", [], []);
  assert(log.includes("rawCount=0"), "zero raw actions reported");
  assert(log.includes("normalizedCount=0"), "zero normalized actions reported");
  assert(log.includes("rawTypes=[]"), "empty raw types array reported");
  assert(log.includes("normalizedTypes=[]"), "empty normalized types array reported");
});

group("6. Malformed/non-object actions never throw and never leak their shape", () => {
  const rawActions: unknown[] = [null, undefined, "a bare string", 42, { noTypeField: true }, { type: 123 }];
  let threw = false;
  let log = "";
  try {
    log = buildActionsDiagnosticLog("chat", "stop", rawActions, []);
  } catch {
    threw = true;
  }
  assert(!threw, "does not throw on malformed action entries");
  assert(log.includes("rawCount=6"), "still counts every entry, malformed or not");
  assert(!log.includes("a bare string"), "a bare string action's own content does not leak");
});

group("7. Existing behavior is unaffected — this is a pure formatter with no side effects on its inputs", () => {
  const rawActions = [{ type: "create_task", data: { title: "Unchanged" } }];
  const normalizedActions = [{ type: "create_task", data: { title: "Unchanged" } }];
  const rawSnapshot = JSON.parse(JSON.stringify(rawActions));
  const normalizedSnapshot = JSON.parse(JSON.stringify(normalizedActions));
  buildActionsDiagnosticLog("chat", "stop", rawActions, normalizedActions);
  assert(JSON.stringify(rawActions) === JSON.stringify(rawSnapshot), "rawActions array/objects are not mutated");
  assert(JSON.stringify(normalizedActions) === JSON.stringify(normalizedSnapshot), "normalizedActions array/objects are not mutated");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  actionsDiagnosticLog: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
