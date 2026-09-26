/**
 * Unit tests for extractCalendarReminderCandidate() — allDay exclusion,
 * offset-to-instant math for every non-1day defaultReminder value, the
 * 1day "same local time, one calendar day earlier" composition, the
 * dedup id's sensitivity to an edited event time, and (Tier 2) the
 * per-event `reminder` override: undefined falls back to the global
 * default, 'none' suppresses the candidate entirely, and a real
 * ReminderOffset value takes precedence over the global default.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/reminders/calendarReminderCandidates.test.ts \
 *       --outfile=.tmp-calendarReminderCandidates.mjs && node .tmp-calendarReminderCandidates.mjs
 */

import { extractCalendarReminderCandidate, type CalendarEventLike } from "./calendarReminderCandidates.js";

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

function event(overrides: Partial<CalendarEventLike> = {}): CalendarEventLike {
  return { id: "evt-1", date: "2026-06-15", startTime: "14:00", ...overrides };
}

group("exclusions", () => {
  assert(
    extractCalendarReminderCandidate(event({ allDay: true }), "15min", TZ) === null,
    "an all-day event never produces a candidate",
  );
  assert(
    extractCalendarReminderCandidate(event({ startTime: undefined }), "15min", TZ) === null,
    "an event with no startTime never produces a candidate",
  );
  assert(
    extractCalendarReminderCandidate(event({ reminder: "none" }), "15min", TZ) === null,
    "an event whose reminder override is 'none' never produces a candidate, regardless of the global default",
  );
});

group("Tier 2 — per-event reminder override", () => {
  // 14:00 local summer Tallinn (EEST, UTC+3) = 11:00 UTC.
  const eventUtc = new Date("2026-06-15T11:00:00.000Z").getTime();

  const noOverride = extractCalendarReminderCandidate(event(), "30min", TZ);
  assert(
    noOverride !== null && noOverride.triggerInstant.getTime() === eventUtc - 30 * 60_000,
    "undefined reminder falls back to the global defaultReminder (30min)",
  );

  const overridden = extractCalendarReminderCandidate(event({ reminder: "5min" }), "30min", TZ);
  assert(
    overridden !== null && overridden.triggerInstant.getTime() === eventUtc - 5 * 60_000,
    "a real ReminderOffset override (5min) takes precedence over the global default (30min)",
  );

  const overriddenAtTime = extractCalendarReminderCandidate(event({ reminder: "at_time" }), "1day", TZ);
  assert(
    overriddenAtTime !== null && overriddenAtTime.triggerInstant.getTime() === eventUtc,
    "an at_time override takes precedence even when the global default is 1day",
  );

  const overridden1day = extractCalendarReminderCandidate(event({ reminder: "1day" }), "5min", TZ);
  assert(
    overridden1day !== null && overridden1day.triggerInstant.toISOString() === "2026-06-14T11:00:00.000Z",
    "a 1day override still uses the DST-safe calendar-day composition, not a raw 24h subtraction",
  );
});

group("offset-to-instant math (non-1day)", () => {
  // 14:00 local summer Tallinn (EEST, UTC+3) = 11:00 UTC.
  const eventUtc = new Date("2026-06-15T11:00:00.000Z").getTime();

  const atTime = extractCalendarReminderCandidate(event(), "at_time", TZ);
  assert(atTime !== null && atTime.triggerInstant.getTime() === eventUtc, "at_time fires exactly at the event instant");

  const fiveMin = extractCalendarReminderCandidate(event(), "5min", TZ);
  assert(
    fiveMin !== null && fiveMin.triggerInstant.getTime() === eventUtc - 5 * 60_000,
    "5min fires 5 minutes before",
  );

  const fifteenMin = extractCalendarReminderCandidate(event(), "15min", TZ);
  assert(
    fifteenMin !== null && fifteenMin.triggerInstant.getTime() === eventUtc - 15 * 60_000,
    "15min fires 15 minutes before",
  );

  const thirtyMin = extractCalendarReminderCandidate(event(), "30min", TZ);
  assert(
    thirtyMin !== null && thirtyMin.triggerInstant.getTime() === eventUtc - 30 * 60_000,
    "30min fires 30 minutes before",
  );

  const oneHour = extractCalendarReminderCandidate(event(), "1hour", TZ);
  assert(
    oneHour !== null && oneHour.triggerInstant.getTime() === eventUtc - 60 * 60_000,
    "1hour fires 60 minutes before",
  );
});

group("1day — same local time, one calendar day earlier (DST-correct)", () => {
  // Both sides of this pair are after the spring transition — plain 24h apart.
  const oneDay = extractCalendarReminderCandidate(event({ date: "2026-06-15", startTime: "14:00" }), "1day", TZ);
  assert(oneDay !== null, "produces a candidate");
  assert(
    oneDay!.triggerInstant.toISOString() === "2026-06-14T11:00:00.000Z",
    `fires at 14:00 local the day before (got ${oneDay!.triggerInstant.toISOString()})`,
  );

  // Across the actual 2026-03-29 spring-forward transition: event ON the
  // transition day at 14:00 (already EEST/+3) — one day before must still
  // read 14:00 local on 2026-03-28 (still EET/+2), a real 23h gap, not 24h.
  const acrossTransition = extractCalendarReminderCandidate(
    event({ date: "2026-03-29", startTime: "14:00" }),
    "1day",
    TZ,
  );
  assert(
    acrossTransition!.triggerInstant.toISOString() === "2026-03-28T12:00:00.000Z",
    `1day before a DST-transition-day event still reads 14:00 local the prior day (got ${acrossTransition!.triggerInstant.toISOString()})`,
  );
});

group("dedup id", () => {
  const a = extractCalendarReminderCandidate(event(), "15min", TZ)!;
  assert(
    a.dedupId === "srv-cal-evt-1-2026-06-15-1400-15min",
    `dedup id has the expected shape (got ${a.dedupId})`,
  );

  const editedTime = extractCalendarReminderCandidate(event({ startTime: "15:00" }), "15min", TZ)!;
  assert(a.dedupId !== editedTime.dedupId, "editing the event's time changes the dedup id");

  const editedDate = extractCalendarReminderCandidate(event({ date: "2026-06-16" }), "15min", TZ)!;
  assert(a.dedupId !== editedDate.dedupId, "editing the event's date changes the dedup id");

  const differentOffset = extractCalendarReminderCandidate(event(), "1hour", TZ)!;
  assert(a.dedupId !== differentOffset.dedupId, "a different defaultReminder offset changes the dedup id");

  const overridden = extractCalendarReminderCandidate(event({ reminder: "1hour" }), "15min", TZ)!;
  assert(
    overridden.dedupId === differentOffset.dedupId,
    "an override that resolves to the same effective offset (1hour) produces the same dedup id as that global default would",
  );
  assert(a.dedupId !== overridden.dedupId, "...and still differs from the unoverridden (15min) dedup id");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
