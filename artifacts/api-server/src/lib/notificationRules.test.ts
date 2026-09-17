/**
 * Behavior-parity tests for the server-side notificationRules.ts twin —
 * mirrors the exact same scenarios covered by planner-app's
 * src/lib/__tests__/notificationRulesDispatchExtraction.test.ts (the
 * Phase 0 pure-function unit tests), so a drift between the two copies
 * would be caught here even though there is no shared import between
 * them (see notificationRules.ts's doc comment for why).
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/lib/notificationRules.test.ts --outfile=.tmp-notificationRules.mjs \
 *       && node .tmp-notificationRules.mjs
 */

import type { NotificationSettings } from "./notificationSettingsTypes.js";
import {
  isInQuietHours,
  isModuleEnabled,
  hasDuplicateOnDay,
  shouldDispatch,
  type DedupCandidate,
} from "./notificationRules.js";

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

function baseSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    modules: {
      tasks: true,
      calendar: true,
      habits: true,
      goals: true,
      school: true,
      assistant: false,
      security: true,
    },
    inApp: true,
    systemNotifications: false,
    defaultReminder: "15min",
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    ...overrides,
  };
}

group("isInQuietHours", () => {
  assert(
    isInQuietHours(baseSettings({ quietHoursEnabled: false }), new Date(2026, 0, 1, 23, 0)) === false,
    "disabled quiet hours never suppress",
  );

  const normal = baseSettings({ quietHoursEnabled: true, quietStart: "09:00", quietEnd: "17:00" });
  assert(isInQuietHours(normal, new Date(2026, 0, 1, 12, 0)) === true, "normal window: inside is true");
  assert(isInQuietHours(normal, new Date(2026, 0, 1, 8, 0)) === false, "normal window: before start is false");
  assert(isInQuietHours(normal, new Date(2026, 0, 1, 17, 0)) === false, "normal window: end is exclusive");
  assert(isInQuietHours(normal, new Date(2026, 0, 1, 9, 0)) === true, "normal window: start is inclusive");

  const overnight = baseSettings({ quietHoursEnabled: true, quietStart: "22:00", quietEnd: "08:00" });
  assert(isInQuietHours(overnight, new Date(2026, 0, 1, 23, 0)) === true, "overnight window: late evening is inside");
  assert(isInQuietHours(overnight, new Date(2026, 0, 1, 3, 0)) === true, "overnight window: early morning is inside");
  assert(isInQuietHours(overnight, new Date(2026, 0, 1, 12, 0)) === false, "overnight window: midday is outside");
});

group("isModuleEnabled", () => {
  const disabledSecurity = baseSettings({ modules: { ...baseSettings().modules, security: false } });
  assert(isModuleEnabled(disabledSecurity, "system") === true, '"system" is always enabled');
  assert(isModuleEnabled(baseSettings(), "tasks") === true, "a known enabled module reflects true");
  assert(isModuleEnabled(baseSettings(), "assistant") === false, "a known disabled module reflects false");
  assert(
    isModuleEnabled(baseSettings(), "some-future-module") === true,
    "an unknown module name falls through as enabled",
  );
});

group("hasDuplicateOnDay", () => {
  const now = new Date(2026, 5, 15, 10, 0);
  assert(
    hasDuplicateOnDay(
      [{ type: "cal-1", createdAt: new Date(2026, 5, 15, 2, 0).getTime() }] as DedupCandidate[],
      "cal-1",
      now,
    ) === true,
    "same type, same calendar day is a duplicate",
  );
  assert(
    hasDuplicateOnDay(
      [{ type: "cal-1", createdAt: new Date(2026, 5, 14, 23, 59).getTime() }] as DedupCandidate[],
      "cal-1",
      now,
    ) === false,
    "same type, different day is not a duplicate",
  );
  assert(
    hasDuplicateOnDay([{ type: "cal-2", createdAt: now.getTime() }] as DedupCandidate[], "cal-1", now) === false,
    "different type, same day is not a duplicate",
  );
});

group("shouldDispatch", () => {
  const now = new Date(2026, 5, 15, 10, 0);
  const candidate = { type: "srv-cal-1", module: "calendar" };

  assert(shouldDispatch(baseSettings({ inApp: false }), [], candidate, now) === false, "inApp off blocks");
  assert(
    shouldDispatch(baseSettings({ quietHoursEnabled: true, quietStart: "09:00", quietEnd: "17:00" }), [], candidate, now) ===
      false,
    "quiet hours block",
  );
  assert(
    shouldDispatch(baseSettings({ modules: { ...baseSettings().modules, calendar: false } }), [], candidate, now) ===
      false,
    "disabled module blocks",
  );
  assert(
    shouldDispatch(
      baseSettings(),
      [{ type: candidate.type, createdAt: now.getTime() }] as DedupCandidate[],
      candidate,
      now,
    ) === false,
    "same-day duplicate blocks",
  );
  assert(shouldDispatch(baseSettings(), [], candidate, now) === true, "every gate passing allows through");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
