/**
 * Unit tests for extractWorkScheduleReminderCandidates() — Off/Evening
 * before/1 hour before/Both, missing-field exclusion (covers a
 * deleted/incomplete shift producing no candidate), an early-morning
 * shift's date rollover for both offsets, independent dedup ids for the
 * two "Both" candidates, and dedup id sensitivity to an edited shift.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/reminders/workScheduleReminderCandidates.test.ts \
 *       --outfile=.tmp-workScheduleReminderCandidates.mjs && node .tmp-workScheduleReminderCandidates.mjs
 */

import {
  extractWorkScheduleReminderCandidates,
  type WorkScheduleShiftLike,
} from "./workScheduleReminderCandidates.js";

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

const TZ = "Europe/Tallinn";
const PLAN_ID = "ws-plan-1";

function shift(overrides: Partial<WorkScheduleShiftLike> = {}): WorkScheduleShiftLike {
  return { id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", ...overrides };
}

group("Off / missing reminder — no candidates", () => {
  assert(
    extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "off" }), TZ).length === 0,
    "reminder: 'off' produces no candidates",
  );
  assert(
    extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: undefined }), TZ).length === 0,
    "no reminder field at all (every pre-existing shift) produces no candidates",
  );
});

group("missing/incomplete shift fields — no candidates (covers a deleted or mid-edit shift)", () => {
  assert(
    extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "both", date: undefined }), TZ).length === 0,
    "a shift with no date produces no candidates even with a reminder set",
  );
  assert(
    extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "both", startTime: undefined }), TZ).length === 0,
    "a shift with no startTime produces no candidates",
  );
  assert(
    extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "both", endTime: undefined }), TZ).length === 0,
    "a shift with no endTime produces no candidates",
  );
});

group("'eveningBefore' — fires at 19:00 local the calendar day before the shift", () => {
  const candidates = extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "eveningBefore" }), TZ);
  assert(candidates.length === 1, "exactly one candidate");
  assert(candidates[0]!.kind === "eveningBefore", "kind is eveningBefore");
  // 19:00 EEST (UTC+3) on 2026-06-14 == 16:00 UTC.
  assert(
    candidates[0]!.triggerInstant.toISOString() === "2026-06-14T16:00:00.000Z",
    `fires at 19:00 local the day before (got ${candidates[0]!.triggerInstant.toISOString()})`,
  );
});

group("'oneHourBefore' — fires exactly one hour before the shift start", () => {
  const candidates = extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "oneHourBefore" }), TZ);
  assert(candidates.length === 1, "exactly one candidate");
  assert(candidates[0]!.kind === "oneHourBefore", "kind is oneHourBefore");
  // 08:00 EEST (UTC+3) on 2026-06-15 == 05:00 UTC; minus 1 hour == 04:00 UTC.
  assert(
    candidates[0]!.triggerInstant.toISOString() === "2026-06-15T04:00:00.000Z",
    `fires one hour before shift start (got ${candidates[0]!.triggerInstant.toISOString()})`,
  );
});

group("'both' — two independent candidates, each with its own kind and dedupId", () => {
  const candidates = extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "both" }), TZ);
  assert(candidates.length === 2, "exactly two candidates");
  const kinds = candidates.map((c) => c.kind).sort();
  assert(kinds[0] === "eveningBefore" && kinds[1] === "oneHourBefore", "one of each kind");

  const dedupIds = new Set(candidates.map((c) => c.dedupId));
  assert(dedupIds.size === 2, "the two candidates have distinct dedup ids — independently deduplicated");

  const evening = candidates.find((c) => c.kind === "eveningBefore")!;
  const hour = candidates.find((c) => c.kind === "oneHourBefore")!;
  assert(evening.dedupId.endsWith("-evening"), "evening candidate's dedup id is tagged '-evening'");
  assert(hour.dedupId.endsWith("-hour"), "hour candidate's dedup id is tagged '-hour'");
  assert(
    evening.triggerInstant.toISOString() === "2026-06-14T16:00:00.000Z",
    "evening candidate still fires at the correct time within 'both'",
  );
  assert(
    hour.triggerInstant.toISOString() === "2026-06-15T04:00:00.000Z",
    "hour candidate still fires at the correct time within 'both'",
  );
});

group("early-morning shift — both offsets correctly roll back to the PREVIOUS calendar day, with no special-casing", () => {
  const earlyShift = shift({ reminder: "both", startTime: "00:30" });
  const candidates = extractWorkScheduleReminderCandidates(PLAN_ID, earlyShift, TZ);
  const hour = candidates.find((c) => c.kind === "oneHourBefore")!;
  const evening = candidates.find((c) => c.kind === "eveningBefore")!;

  // 00:30 EEST (UTC+3) on 2026-06-15 == 2026-06-14T21:30:00Z; minus 1 hour == 2026-06-14T20:30:00Z.
  assert(
    hour.triggerInstant.toISOString() === "2026-06-14T20:30:00.000Z",
    `1-hour-before an early-morning shift correctly lands the previous UTC day (got ${hour.triggerInstant.toISOString()})`,
  );
  // Evening-before is unaffected by the shift's own start time being early — still 19:00 the day before.
  assert(
    evening.triggerInstant.toISOString() === "2026-06-14T16:00:00.000Z",
    "evening-before is unaffected by how early the shift itself starts",
  );
});

group("dedup id — reflects the shift's own date/time, changes when the shift is edited", () => {
  const original = extractWorkScheduleReminderCandidates(PLAN_ID, shift({ reminder: "oneHourBefore" }), TZ)[0]!;
  assert(
    original.dedupId === "srv-ws-ws-plan-1-shift-1-2026-06-15-0800-hour",
    `dedup id has the expected shape (got ${original.dedupId})`,
  );

  const editedTime = extractWorkScheduleReminderCandidates(
    PLAN_ID,
    shift({ reminder: "oneHourBefore", startTime: "09:00" }),
    TZ,
  )[0]!;
  assert(original.dedupId !== editedTime.dedupId, "editing the shift's start time changes the dedup id");

  const editedDate = extractWorkScheduleReminderCandidates(
    PLAN_ID,
    shift({ reminder: "oneHourBefore", date: "2026-06-16" }),
    TZ,
  )[0]!;
  assert(original.dedupId !== editedDate.dedupId, "editing the shift's date changes the dedup id");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
