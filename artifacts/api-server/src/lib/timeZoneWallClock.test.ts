/**
 * Unit tests for timeZoneWallClock.ts — the local wall-clock <-> instant
 * conversions the Calendar reminders tick (Phase 1) depends on for
 * per-user timezone correctness, including DST transitions and the
 * `1day` reminder offset's "same local time, one calendar day earlier"
 * semantics.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/lib/timeZoneWallClock.test.ts --outfile=.tmp-timeZoneWallClock.mjs \
 *       && node .tmp-timeZoneWallClock.mjs
 */

import {
  zonedWallClockToInstant,
  instantToZonedClockDate,
  subtractOneCalendarDay,
  isProcessTimeZoneUtc,
} from "./timeZoneWallClock.js";

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

group("isProcessTimeZoneUtc", () => {
  assert(
    isProcessTimeZoneUtc() === true,
    "the test/CI process itself runs in UTC (required for instantToZonedClockDate to be valid)",
  );
});

group("zonedWallClockToInstant — Europe/Tallinn (EET/EEST, UTC+2/+3)", () => {
  // Estonia is UTC+2 in winter (EET), no DST in effect.
  const winter = zonedWallClockToInstant("2026-01-15", "14:00", "Europe/Tallinn");
  assert(
    winter.toISOString() === "2026-01-15T12:00:00.000Z",
    `14:00 local in winter Tallinn is 12:00 UTC (got ${winter.toISOString()})`,
  );

  // Estonia is UTC+3 in summer (EEST), DST in effect.
  const summer = zonedWallClockToInstant("2026-07-15", "14:00", "Europe/Tallinn");
  assert(
    summer.toISOString() === "2026-07-15T11:00:00.000Z",
    `14:00 local in summer Tallinn is 11:00 UTC (got ${summer.toISOString()})`,
  );
});

group("zonedWallClockToInstant — UTC passthrough", () => {
  const d = zonedWallClockToInstant("2026-03-01", "09:30", "UTC");
  assert(
    d.toISOString() === "2026-03-01T09:30:00.000Z",
    `09:30 in UTC is exactly 09:30 UTC (got ${d.toISOString()})`,
  );
});

group("zonedWallClockToInstant — negative-offset zone (America/New_York)", () => {
  // Mid-January: EST, UTC-5.
  const d = zonedWallClockToInstant("2026-01-15", "08:00", "America/New_York");
  assert(
    d.toISOString() === "2026-01-15T13:00:00.000Z",
    `08:00 EST is 13:00 UTC (got ${d.toISOString()})`,
  );
});

group("instantToZonedClockDate", () => {
  const instant = new Date("2026-06-15T11:00:00.000Z"); // 14:00 in summer Tallinn
  const local = instantToZonedClockDate(instant, "Europe/Tallinn");
  assert(local.getHours() === 14 && local.getMinutes() === 0, "reports 14:00 for summer Tallinn at 11:00 UTC");

  const localUtc = instantToZonedClockDate(instant, "UTC");
  assert(localUtc.getHours() === 11 && localUtc.getMinutes() === 0, "reports 11:00 for UTC itself");
});

group("subtractOneCalendarDay", () => {
  assert(subtractOneCalendarDay("2026-06-15") === "2026-06-14", "normal day-of-month subtraction");
  assert(subtractOneCalendarDay("2026-03-01") === "2026-02-28", "crosses a month boundary");
  assert(subtractOneCalendarDay("2028-03-01") === "2028-02-29", "crosses into a leap-year February");
  assert(subtractOneCalendarDay("2026-01-01") === "2025-12-31", "crosses a year boundary");
});

group("1day offset composition — same local time, one calendar day earlier, DST-correct", () => {
  // Event at 14:00 local on the day AFTER a Tallinn spring-forward
  // (2026-03-29 is the EU DST transition date) — one calendar day before
  // must still land on 14:00 local on 2026-03-29, using THAT day's own
  // UTC offset (+2, not yet sprung forward at that wall-clock hour... in
  // fact the transition happens at 03:00 local, so 14:00 on the 29th is
  // already EEST/+3) — the point is this composition never hard-codes an
  // offset, it re-derives it for the earlier date.
  const eventInstant = zonedWallClockToInstant("2026-03-30", "14:00", "Europe/Tallinn");
  const priorDate = subtractOneCalendarDay("2026-03-30");
  const oneDayBefore = zonedWallClockToInstant(priorDate, "14:00", "Europe/Tallinn");

  assert(priorDate === "2026-03-29", "prior calendar date is the DST-transition day itself");
  // Both 2026-03-29 14:00 and 2026-03-30 14:00 fall after the 03:00
  // transition, so both are EEST (+3) — exactly 24h apart.
  assert(
    eventInstant.getTime() - oneDayBefore.getTime() === 24 * 60 * 60 * 1000,
    "exactly 24h apart when both sides of the transition are already in the same DST state",
  );

  // Across the transition itself: event the day OF the transition at
  // 14:00 (already EEST) vs. one day before at 14:00 (still EET) — wall
  // clock time is identical (14:00) but the real gap is only 23h,
  // because Europe "loses" an hour that day. A naive raw
  // instant-minus-86400000 would NOT reproduce 14:00 local on the prior
  // day; recomputing from the wall clock does.
  const transitionDayEvent = zonedWallClockToInstant("2026-03-29", "14:00", "Europe/Tallinn");
  const dayBeforeTransition = zonedWallClockToInstant(subtractOneCalendarDay("2026-03-29"), "14:00", "Europe/Tallinn");
  assert(
    transitionDayEvent.getTime() - dayBeforeTransition.getTime() === 23 * 60 * 60 * 1000,
    "23h apart across the spring-forward transition, yet both are 14:00 local",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
