import { logOnboardingChatStage } from "./onboardingStageLog.js";

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

async function group(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

function captureConsoleLog(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

await group("1. logs the stage name with no fields", () => {
  const lines = captureConsoleLog(() => logOnboardingChatStage("request accepted"));
  assert(lines.length === 1, "exactly one line logged");
  assert(lines[0] === "[ai/onboarding/chat] request accepted", `exact format (got ${JSON.stringify(lines[0])})`);
});

await group("2. logs numeric fields as key=value, comma-separated, in insertion order", () => {
  const lines = captureConsoleLog(() => logOnboardingChatStage("stream ended", { totalChunks: 7, t: 842 }));
  assert(
    lines[0] === "[ai/onboarding/chat] stream ended, totalChunks=7, t=842",
    `exact format (got ${JSON.stringify(lines[0])})`,
  );
});

await group("3. a secret/content string handed in by mistake cannot appear verbatim — only its numeric coercion can", () => {
  // fields is typed Record<string, number>, so this file (and tsc) would
  // reject `{ note: "some user text" }` at compile time. At runtime, even
  // forcing one in via `as unknown as number` only ever produces the
  // string's numeric coercion (NaN), never the original text — proving
  // there is no code path here that can echo back arbitrary string content.
  const secret = "sk-test-super-secret-token-should-never-appear";
  const forced = secret as unknown as number;
  const lines = captureConsoleLog(() => logOnboardingChatStage("stage", { note: forced }));
  assert(!lines[0]!.includes(secret), "the secret string itself never appears in the logged line");
  assert(lines[0] === "[ai/onboarding/chat] stage, note=NaN", `numeric coercion only (got ${JSON.stringify(lines[0])})`);
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  onboardingStageLog: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
