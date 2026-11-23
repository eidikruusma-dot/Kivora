/**
 * Unit tests for normalizeOnboardingSummary.ts — the untrusted-model-output
 * sanitizer for POST /api/ai/onboarding/summary.
 *
 * Compile and run (also available as `pnpm run test:normalizeOnboardingSummary`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/normalizeOnboardingSummary.test.ts | node
 */

import { normalizeOnboardingSummary } from "./normalizeOnboardingSummary.js";
import { allowedOnboardingModuleIds } from "./onboardingConfig.js";

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

const ALLOWED_NO_FINANCE = allowedOnboardingModuleIds(false);
const ALLOWED_WITH_FINANCE = allowedOnboardingModuleIds(true);

group("1. well-formed object passes through with module list clamped to the allowlist", () => {
  const result = normalizeOnboardingSummary(
    { profileSummary: "Sa oled üliõpilane, kes armastab plaane teha.", recommendedModules: ["tasks", "calendar", "plans"] },
    ALLOWED_NO_FINANCE,
  );
  assert(result !== null, "returns a non-null summary");
  assert(result?.profileSummary === "Sa oled üliõpilane, kes armastab plaane teha.", "profileSummary passed through");
  assert(
    JSON.stringify(result?.recommendedModules) === JSON.stringify(["tasks", "calendar", "plans"]),
    "recommendedModules passed through unchanged when all are already allowed",
  );
});

group("2. module ids not in the allowlist are dropped silently, never surfaced", () => {
  const result = normalizeOnboardingSummary(
    { profileSummary: "ok", recommendedModules: ["tasks", "finance", "made_up_module", "shopping_list"] },
    ALLOWED_NO_FINANCE, // finance disabled right now
  );
  assert(result !== null, "still returns a usable summary");
  assert(
    JSON.stringify(result?.recommendedModules) === JSON.stringify(["tasks"]),
    "only 'tasks' survives — finance (disabled), made_up_module and shopping_list (not real ids) are all dropped",
  );
});

group("3. finance is allowed through when the money module is enabled", () => {
  const result = normalizeOnboardingSummary(
    { profileSummary: "ok", recommendedModules: ["finance", "tasks"] },
    ALLOWED_WITH_FINANCE,
  );
  assert(
    JSON.stringify(result?.recommendedModules) === JSON.stringify(["finance", "tasks"]),
    "finance kept when explicitly allowed",
  );
});

group("4. duplicate module ids are de-duplicated, first occurrence order kept", () => {
  const result = normalizeOnboardingSummary(
    { profileSummary: "ok", recommendedModules: ["tasks", "calendar", "tasks", "calendar", "goals"] },
    ALLOWED_NO_FINANCE,
  );
  assert(
    JSON.stringify(result?.recommendedModules) === JSON.stringify(["tasks", "calendar", "goals"]),
    "duplicates collapsed, order preserved",
  );
});

group("5. non-string entries in recommendedModules are skipped, not thrown", () => {
  const result = normalizeOnboardingSummary(
    { profileSummary: "ok", recommendedModules: ["tasks", 42, null, { not: "a string" }, "goals"] },
    ALLOWED_NO_FINANCE,
  );
  assert(
    JSON.stringify(result?.recommendedModules) === JSON.stringify(["tasks", "goals"]),
    "non-string entries skipped cleanly",
  );
});

group("6. missing/invalid fields fall back to safe defaults rather than throwing", () => {
  const noFields = normalizeOnboardingSummary({}, ALLOWED_NO_FINANCE);
  assert(noFields !== null, "empty object still returns a usable (empty) summary, not null");
  assert(noFields?.profileSummary === "", "missing profileSummary defaults to empty string");
  assert(JSON.stringify(noFields?.recommendedModules) === "[]", "missing recommendedModules defaults to empty array");

  const wrongTypes = normalizeOnboardingSummary(
    { profileSummary: 12345, recommendedModules: "tasks,calendar" },
    ALLOWED_NO_FINANCE,
  );
  assert(wrongTypes?.profileSummary === "", "non-string profileSummary falls back to empty string, not the raw number");
  assert(
    JSON.stringify(wrongTypes?.recommendedModules) === "[]",
    "non-array recommendedModules (a plain string here) falls back to empty array",
  );
});

group("7. profileSummary is capped at a sane maximum length", () => {
  const huge = "a".repeat(5_000);
  const result = normalizeOnboardingSummary({ profileSummary: huge, recommendedModules: [] }, ALLOWED_NO_FINANCE);
  assert((result?.profileSummary.length ?? 0) <= 1_000, "profileSummary truncated to the configured cap");
});

group("8. fundamentally unusable input (null/undefined/primitive) returns null", () => {
  assert(normalizeOnboardingSummary(null, ALLOWED_NO_FINANCE) === null, "null -> null");
  assert(normalizeOnboardingSummary(undefined, ALLOWED_NO_FINANCE) === null, "undefined -> null");
  assert(normalizeOnboardingSummary("just a string", ALLOWED_NO_FINANCE) === null, "a bare string -> null");
  assert(normalizeOnboardingSummary(42, ALLOWED_NO_FINANCE) === null, "a number -> null");
});

group("9. an array is technically typeof 'object' in JS — handled via the same safe field defaults, not a crash", () => {
  const result = normalizeOnboardingSummary(["array", "not", "a", "plain", "object"], ALLOWED_NO_FINANCE);
  assert(result !== null, "not rejected outright (typeof [] === 'object')");
  assert(result?.profileSummary === "", "has no .profileSummary property -> safe default empty string");
  assert(JSON.stringify(result?.recommendedModules) === "[]", "has no .recommendedModules property -> safe default empty array");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  normalizeOnboardingSummary: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
