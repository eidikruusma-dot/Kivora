/**
 * Unit tests for runRemindersTick() — the Phase 1 Calendar reminders
 * orchestrator. Everything is driven through the narrow RemindersFirestore
 * interface and an injected sendWebPush, with a fully controlled `now`,
 * so every scenario (including "due right now") is exercised without any
 * real waiting, real Firestore, or real network call.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/reminders/remindersTick.test.ts --outfile=.tmp-remindersTick.mjs \
 *       && node .tmp-remindersTick.mjs
 */

import {
  runRemindersTick,
  type RemindersFirestore,
  type PushSubscriptionRecord,
  type UserSettingsRecord,
  type CalendarEventRecord,
  type WorkSchedulePlanRecord,
  type NotificationDocFields,
  type SendWebPush,
} from "./remindersTick.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../lib/notificationSettingsTypes.js";
import type { NotificationSettings } from "../lib/notificationSettingsTypes.js";
import type { WebPushSendResult } from "../lib/webPushSend.js";

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

async function group(name: string, fn: () => Promise<void> | void): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

// ── Fake Firestore ───────────────────────────────────────────────────────

function makeFakeFirestore() {
  const users = new Map<string, UserSettingsRecord>();
  let subs: PushSubscriptionRecord[] = [];
  const events = new Map<string, CalendarEventRecord[]>();
  const workSchedulePlans = new Map<string, WorkSchedulePlanRecord[]>();
  const notifications = new Map<string, NotificationDocFields>();
  const deletedSubIds: string[] = [];
  const getUserSettingsErrors = new Set<string>();

  const firestore: RemindersFirestore = {
    async listAllPushSubscriptions() {
      return [...subs];
    },
    async getUserSettings(uid) {
      if (getUserSettingsErrors.has(uid)) throw new Error(`simulated failure for ${uid}`);
      return users.get(uid) ?? null;
    },
    async getCalendarEventsInRange(uid, from, to) {
      return (events.get(uid) ?? []).filter((e) => e.date >= from && e.date <= to);
    },
    async getWorkSchedulePlans(uid) {
      // Real per-plan `type` filtering happens at the Firestore query level
      // (see remindersTickFirestoreAdmin.ts) — this fake just returns
      // whatever was seeded for this uid, defaulting to none (empty), so
      // every existing Calendar-only test is completely unaffected.
      return workSchedulePlans.get(uid) ?? [];
    },
    async notificationExists(uid, id) {
      return notifications.has(`${uid}/${id}`);
    },
    async writeNotification(uid, id, item) {
      notifications.set(`${uid}/${id}`, item);
    },
    async deletePushSubscription(uid, subId) {
      deletedSubIds.push(subId);
      subs = subs.filter((s) => !(s.uid === uid && s.subId === subId));
    },
  };

  return {
    firestore,
    users,
    setSubs: (v: PushSubscriptionRecord[]) => { subs = v; },
    setEvents: (uid: string, list: CalendarEventRecord[]) => { events.set(uid, list); },
    setWorkSchedulePlans: (uid: string, list: WorkSchedulePlanRecord[]) => { workSchedulePlans.set(uid, list); },
    notifications,
    deletedSubIds,
    getUserSettingsErrors,
  };
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...overrides,
    modules: { ...DEFAULT_NOTIFICATION_SETTINGS.modules, ...overrides.modules },
  };
}

function userRecord(overrides: Partial<UserSettingsRecord> = {}): UserSettingsRecord {
  return { timezone: "Europe/Tallinn", preferredLanguage: "et", notifications: settings(), ...overrides };
}

function calEvent(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  return { id: "evt-1", title: "Hambaarst", date: "2026-06-15", startTime: "14:00", ...overrides };
}

function wsPlan(overrides: Partial<WorkSchedulePlanRecord> = {}): WorkSchedulePlanRecord {
  return {
    id: "ws-plan-1",
    items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "off" }],
    ...overrides,
  };
}

function sub(uid: string, subId: string): PushSubscriptionRecord {
  return { uid, subId, endpoint: `https://p/${subId}`, keys: { auth: "a", p256dh: "p" } };
}

function makeSendWebPush(result: Partial<WebPushSendResult> = {}): { fn: SendWebPush; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const fn: SendWebPush = async (subs, payload) => {
    calls.push([subs, payload]);
    return { sent: subs.length, failed: 0, goneEndpoints: [], ...result };
  };
  return { fn, calls };
}

// 14:00 local summer Tallinn (EEST, UTC+3) on 2026-06-15 == 11:00 UTC.
const EVENT_INSTANT_UTC = new Date("2026-06-15T11:00:00.000Z");
const WINDOW_MS = 5 * 60 * 1000;

await group("a due timed event: notification written, pushed to all of the user's own subscriptions", async () => {
  const { firestore, users, setSubs, setEvents, notifications } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "15min" }) }));
  setSubs([sub("u1", "s1"), sub("u1", "s2")]);
  setEvents("u1", [calEvent()]);

  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000); // event - 15min
  const { fn: sendWebPush, calls } = makeSendWebPush();
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "exactly one reminder sent");
  assert(notifications.size === 1, "exactly one notification doc written");
  assert(calls.length === 1, "sendWebPush called exactly once");
  const [sentSubs] = calls[0] as [Array<{ endpoint: string }>, unknown];
  assert(sentSubs.length === 2, "sent to BOTH of the user's subscriptions — no 'current device' exclusion");
});

await group("all-day events are excluded", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent({ allDay: true, startTime: undefined })]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 0, "no reminder sent for an all-day event");
  assert(calls.length === 0, "push never called");
  assert(summary.remindersSuppressed.noCandidate === 1, "counted as noCandidate (diagnostic counter)");
});

await group("the Calendar module toggle suppresses the whole user", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set(
    "u1",
    userRecord({ notifications: settings({ modules: { ...DEFAULT_NOTIFICATION_SETTINGS.modules, calendar: false } }) }),
  );
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 0, "no reminder sent when the Calendar module is disabled");
  assert(summary.remindersSuppressed.moduleDisabled === 1, "counted as module-disabled");
});

await group("quiet hours suppress a reminder that would otherwise be due", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  // Quiet hours 09:00-17:00 local Tallinn; the reminder fires at 13:45 local (15min before 14:00).
  users.set(
    "u1",
    userRecord({ notifications: settings({ quietHoursEnabled: true, quietStart: "09:00", quietEnd: "17:00" }) }),
  );
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 0, "no reminder sent during quiet hours");
  assert(summary.remindersSuppressed.quietHours === 1, "counted as quiet-hours-suppressed");
});

await group("dedup: a second tick at the same due moment does not duplicate", async () => {
  const { firestore, users, setSubs, setEvents, notifications } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);

  const first = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });
  const second = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(first.remindersSent === 1, "first tick sends the reminder");
  assert(second.remindersSent === 0, "second tick at the same instant sends nothing");
  assert(second.remindersSuppressed.duplicate === 1, "second tick counts it as a duplicate");
  assert(calls.length === 1, "sendWebPush was only ever called once total");
  assert(notifications.size === 1, "only one notification doc exists");
});

await group("editing the event's time after a reminder fired is not blocked by the stale dedup id", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent({ startTime: "14:00" })]);

  const { fn: sendWebPush } = makeSendWebPush();

  const firstDue = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const first = await runRemindersTick({ firestore, sendWebPush, now: firstDue, windowMs: WINDOW_MS });
  assert(first.remindersSent === 1, "reminder fires for the original 14:00 time");

  // Event edited to 16:00 — a new instant, 2 hours later.
  setEvents("u1", [calEvent({ startTime: "16:00" })]);
  const secondDue = new Date(new Date("2026-06-15T13:00:00.000Z").getTime() - 15 * 60_000); // 16:00 EEST - 15min
  const second = await runRemindersTick({ firestore, sendWebPush, now: secondDue, windowMs: WINDOW_MS });
  assert(second.remindersSent === 1, "reminder fires again for the new 16:00 time — not blocked by the old dedup id");
});

await group("1day: fires exactly one calendar day before, at the corresponding local time", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "1day" }) }));
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush, calls } = makeSendWebPush();

  // One day before 2026-06-15T14:00 Tallinn local == 2026-06-14T14:00 Tallinn local == 11:00 UTC on the 14th.
  const oneDayBeforeInstant = new Date("2026-06-14T11:00:00.000Z");
  const summary = await runRemindersTick({ firestore, sendWebPush, now: oneDayBeforeInstant, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "the 1day reminder fires exactly one calendar day before");
  assert(calls.length === 1, "push sent for the 1day reminder");

  // Sanity check that in this non-DST case, "one day before at the same
  // local time" and "raw minus 24h" happen to coincide (they would NOT
  // across a DST transition — see calendarReminderCandidates.test.ts).
  const rawMinus24h = new Date(EVENT_INSTANT_UTC.getTime() - 24 * 3600 * 1000);
  assert(rawMinus24h.getTime() === oneDayBeforeInstant.getTime(), "sanity: the two coincide in this non-DST case");
});

await group("Tier 2 — legacy events (no reminder field) fall back to the global default", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "15min" }) }));
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]); // no `reminder` field at all — every pre-Tier-2 event looks like this

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000); // due under the 15min global default
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "a legacy event with no reminder field still uses the global default, unchanged");
  assert(calls.length === 1, "push still sent exactly as before Tier 2");
});

await group("Tier 2 — a per-event override changes which reminder actually fires", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "30min" }) }));
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent({ reminder: "5min" })]);

  const { fn: sendWebPush } = makeSendWebPush();

  // Due under the event's own 5min override...
  const dueUnderOverride = new Date(EVENT_INSTANT_UTC.getTime() - 5 * 60_000);
  const atOverride = await runRemindersTick({ firestore, sendWebPush, now: dueUnderOverride, windowMs: WINDOW_MS });
  assert(atOverride.remindersSent === 1, "fires at the event's own 5min override time");

  // ...but NOT under the global 30min default, since the override takes precedence.
  const dueUnderGlobalDefaultOnly = new Date(EVENT_INSTANT_UTC.getTime() - 30 * 60_000);
  const atGlobalDefault = await runRemindersTick({
    firestore,
    sendWebPush,
    now: dueUnderGlobalDefaultOnly,
    windowMs: WINDOW_MS,
  });
  assert(
    atGlobalDefault.remindersSent === 0,
    "does NOT fire at the global default's time — the override fully replaces it, it doesn't add a second reminder",
  );
  assert(
    atGlobalDefault.remindersSuppressed.notYetDue === 1,
    "the override's own (later) trigger time is still in the future relative to this tick — counted as notYetDue, not noCandidate",
  );
});

await group("Tier 2 — reminder: 'none' suppresses the event entirely, even with a global default set", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "15min" }) }));
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent({ reminder: "none" })]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000); // exactly when the global default would have fired
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 0, "no reminder is sent for a 'none' event");
  assert(calls.length === 0, "push is never called for a 'none' event");
  assert(summary.remindersSuppressed.noCandidate === 1, "counted as noCandidate (diagnostic counter)");
});

await group("stale (410) subscriptions are cleaned up after a send", async () => {
  const { firestore, users, setSubs, setEvents, deletedSubIds } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "good"), sub("u1", "gone")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush } = makeSendWebPush({ goneEndpoints: ["https://p/gone"] });
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);

  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });
  const remaining = await firestore.listAllPushSubscriptions();

  assert(summary.subscriptionsCleanedUp === 1, "exactly one subscription cleaned up");
  assert(deletedSubIds.includes("gone"), "the gone subscription's id was deleted");
  assert(remaining.length === 1 && remaining[0]?.subId === "good", "only the good subscription remains");
});

await group("a candidate outside the tick window is not due", async () => {
  const { firestore, users, setSubs, setEvents } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);

  const { fn: sendWebPush } = makeSendWebPush();

  const tooEarly = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000 - WINDOW_MS - 60_000);
  const notYetDue = await runRemindersTick({ firestore, sendWebPush, now: tooEarly, windowMs: WINDOW_MS });
  assert(notYetDue.remindersSent === 0, "not yet due (before the window)");
  assert(notYetDue.remindersSuppressed.notYetDue === 1, "counted as notYetDue (diagnostic counter)");
  assert(notYetDue.remindersSuppressed.windowMissed === 0, "not counted as windowMissed");
  assert(notYetDue.remindersSuppressed.noCandidate === 0, "not counted as noCandidate");

  const alreadyPassed = new Date(EVENT_INSTANT_UTC.getTime() + 60_000);
  const past = await runRemindersTick({ firestore, sendWebPush, now: alreadyPassed, windowMs: WINDOW_MS });
  assert(past.remindersSent === 0, "already past its own event time with a 15min-before offset — window missed");
  assert(past.remindersSuppressed.windowMissed === 1, "counted as windowMissed (diagnostic counter)");
  assert(past.remindersSuppressed.notYetDue === 0, "not counted as notYetDue");
});

await group("one user's failure does not stop reminders for other users", async () => {
  const { firestore, users, setSubs, setEvents, getUserSettingsErrors } = makeFakeFirestore();
  users.set("broken", userRecord());
  users.set("fine", userRecord());
  getUserSettingsErrors.add("broken");
  setSubs([sub("broken", "s1"), sub("fine", "s2")]);
  setEvents("broken", []);
  setEvents("fine", [calEvent()]);

  const { fn: sendWebPush } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.errors.some((e) => e.uid === "broken"), "the broken user's failure is recorded");
  assert(summary.remindersSent === 1, "the other user's reminder still went out");
});

// ── Work Schedule shift reminders ───────────────────────────────────────────
// 08:00-20:00 local summer Tallinn (EEST, UTC+3) on 2026-06-15.
const SHIFT_START_UTC = new Date("2026-06-15T05:00:00.000Z");
const ONE_HOUR_BEFORE_UTC = new Date("2026-06-15T04:00:00.000Z");
const EVENING_BEFORE_UTC = new Date("2026-06-14T16:00:00.000Z");

await group("Work Schedule — 'off' (and no reminder field at all) produces nothing, unchanged from before this feature", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setWorkSchedulePlans("u1", [wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "off" }] })]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  // Due instant for BOTH offsets, in case 'off' were somehow ignored.
  const atHourBefore = await runRemindersTick({ firestore, sendWebPush, now: ONE_HOUR_BEFORE_UTC, windowMs: WINDOW_MS });
  const atEveningBefore = await runRemindersTick({ firestore, sendWebPush, now: EVENING_BEFORE_UTC, windowMs: WINDOW_MS });

  assert(atHourBefore.remindersSent === 0 && atEveningBefore.remindersSent === 0, "no reminder sent for an 'off' shift");
  assert(calls.length === 0, "push never called");
  assert(atHourBefore.eventsConsidered === 0, "an 'off' shift is not even counted as considered — no telemetry noise for the common case");

  const noReminderField = makeFakeFirestore();
  noReminderField.users.set("u1", userRecord());
  noReminderField.setSubs([sub("u1", "s1")]);
  noReminderField.setWorkSchedulePlans("u1", [wsPlan()]); // wsPlan()'s default item already omits/sets reminder: 'off'
  const legacy = await runRemindersTick({
    firestore: noReminderField.firestore,
    sendWebPush,
    now: ONE_HOUR_BEFORE_UTC,
    windowMs: WINDOW_MS,
  });
  assert(legacy.remindersSent === 0, "a shift with no reminder field at all (every pre-existing shift) sends nothing");
});

await group("Work Schedule — 'eveningBefore' pushes at 19:00 local the day before, with the expected message", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans, notifications } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "eveningBefore" }] }),
  ]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const summary = await runRemindersTick({ firestore, sendWebPush, now: EVENING_BEFORE_UTC, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "exactly one reminder sent");
  assert(notifications.size === 1, "exactly one notification doc written");
  const [, payload] = calls[0] as [unknown, { title: string; body: string }];
  assert(payload.body === "Homme on tööpäev: 08:00–20:00", `evening-before message matches the exact expected text (got ${JSON.stringify(payload.body)})`);
});

await group("Work Schedule — 'oneHourBefore' pushes exactly one hour before shift start, with the expected message", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans, notifications } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "oneHourBefore" }] }),
  ]);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const summary = await runRemindersTick({ firestore, sendWebPush, now: ONE_HOUR_BEFORE_UTC, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "exactly one reminder sent");
  assert(notifications.size === 1, "exactly one notification doc written");
  const [, payload] = calls[0] as [unknown, { title: string; body: string }];
  assert(payload.body === "Töövahetus algab kell 08:00.", `1-hour-before message matches the exact expected text (got ${JSON.stringify(payload.body)})`);
});

await group("Work Schedule — 'both' creates two independently deduplicated reminders, to every subscribed device", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans, notifications } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1"), sub("u1", "s2")]);
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "both" }] }),
  ]);

  const { fn: sendWebPush, calls } = makeSendWebPush();

  const eveningTick = await runRemindersTick({ firestore, sendWebPush, now: EVENING_BEFORE_UTC, windowMs: WINDOW_MS });
  assert(eveningTick.remindersSent === 1, "the evening-before half of 'both' fires on its own");
  assert(notifications.size === 1, "exactly one notification doc exists after the evening tick");

  // A second tick at the SAME instant must not duplicate the evening send,
  // and must NOT have sent the hour-before half either (not due yet).
  const repeatEveningTick = await runRemindersTick({ firestore, sendWebPush, now: EVENING_BEFORE_UTC, windowMs: WINDOW_MS });
  assert(repeatEveningTick.remindersSent === 0, "repeating the same instant sends nothing more");
  assert(repeatEveningTick.remindersSuppressed.duplicate === 1, "the evening half is suppressed as a duplicate, not resent");

  const hourTick = await runRemindersTick({ firestore, sendWebPush, now: ONE_HOUR_BEFORE_UTC, windowMs: WINDOW_MS });
  assert(hourTick.remindersSent === 1, "the hour-before half of 'both' fires independently, later");
  assert(notifications.size === 2, "both notification docs now exist — two independent reminders, not one blocking the other");
  assert(calls.length === 2, "sendWebPush called exactly twice in total (once per independent candidate)");
  for (const [subsSent] of calls as [Array<{ endpoint: string }>, unknown][]) {
    assert(subsSent.length === 2, "each send reaches BOTH of the user's subscribed devices");
  }
});

await group("Work Schedule — editing a shift's time changes the dedup id, so the corrected time still fires", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "oneHourBefore" }] }),
  ]);

  const { fn: sendWebPush } = makeSendWebPush();
  const first = await runRemindersTick({ firestore, sendWebPush, now: ONE_HOUR_BEFORE_UTC, windowMs: WINDOW_MS });
  assert(first.remindersSent === 1, "reminder fires for the original 08:00 start time");

  // Shift edited to start at 10:00 instead — a new instant, 2 hours later.
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "10:00", endTime: "22:00", reminder: "oneHourBefore" }] }),
  ]);
  const newDue = new Date(ONE_HOUR_BEFORE_UTC.getTime() + 2 * 3600 * 1000);
  const second = await runRemindersTick({ firestore, sendWebPush, now: newDue, windowMs: WINDOW_MS });
  assert(second.remindersSent === 1, "reminder fires again for the new 10:00 time — not blocked by the old dedup id");
});

await group("Work Schedule — a deleted shift produces no candidate and nothing is ever sent for it", async () => {
  const { firestore, users, setSubs, setWorkSchedulePlans } = makeFakeFirestore();
  users.set("u1", userRecord());
  setSubs([sub("u1", "s1")]);
  setWorkSchedulePlans("u1", [
    wsPlan({ items: [{ id: "shift-1", date: "2026-06-15", startTime: "08:00", endTime: "20:00", reminder: "oneHourBefore" }] }),
  ]);

  // The shift (and its whole plan) is deleted before its reminder ever became due.
  setWorkSchedulePlans("u1", []);

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const summary = await runRemindersTick({ firestore, sendWebPush, now: ONE_HOUR_BEFORE_UTC, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 0, "no reminder sent for a deleted shift");
  assert(calls.length === 0, "push never called");
});

await group("Work Schedule — a plan with no reminder set alongside it does not affect an existing Calendar reminder", async () => {
  const { firestore, users, setSubs, setEvents, setWorkSchedulePlans } = makeFakeFirestore();
  users.set("u1", userRecord({ notifications: settings({ defaultReminder: "15min" }) }));
  setSubs([sub("u1", "s1")]);
  setEvents("u1", [calEvent()]);
  setWorkSchedulePlans("u1", [wsPlan()]); // present, but reminder: 'off' — must not interfere

  const { fn: sendWebPush, calls } = makeSendWebPush();
  const now = new Date(EVENT_INSTANT_UTC.getTime() - 15 * 60_000);
  const summary = await runRemindersTick({ firestore, sendWebPush, now, windowMs: WINDOW_MS });

  assert(summary.remindersSent === 1, "the Calendar reminder still fires exactly as before — unaffected by the Work Schedule plan");
  assert(summary.eventsConsidered === 1, "only the Calendar event is counted — the 'off' shift contributes nothing");
  assert(calls.length === 1, "sendWebPush called exactly once, for the Calendar event only");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
