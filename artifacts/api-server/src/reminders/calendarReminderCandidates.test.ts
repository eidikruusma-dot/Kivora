/**
 * Unit tests for extractCalendarReminderCandidate() — allDay exclusion,
 * offset-to-instant math for every non-1day defaultReminder value, the
 * 1day "same local time, one calendar day earlier" composition, and the
 * dedup id's sensitivity to an edited event time.
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
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
