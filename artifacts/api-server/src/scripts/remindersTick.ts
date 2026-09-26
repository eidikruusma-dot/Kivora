/**
 * remindersTick.ts — the CLI entry point's orchestration wiring for the
 * Calendar reminders tick (Phase 1 of the V1 reminder architecture).
 *
 * This file exports only main(), performing no top-level side effects on
 * import, so it stays safely testable/importable — the actual CLI entry
 * is the separate runRemindersTick.ts, mirroring this package's existing
 * grantOwnerRole.ts / runGrantOwnerRole.ts split (see that file's doc
 * comment for why the split exists — the same esbuild-per-test-file
 * bundling reasoning applies here).
 *
 * Intended to run as a Render Cron Job's own command (e.g. every 5
 * minutes) — NOT as an HTTP route. It is a standalone Node script with no
 * public network-facing surface at all: it only makes outbound calls to
 * Firebase Admin and the Web Push endpoints, exactly like the existing
 * web service already does. See:
 *
 *   cd artifacts/api-server
 *   pnpm run reminders-tick
 *
 * Requires the same Admin credentials as every other Admin operation in
 * this server (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 * FIREBASE_PRIVATE_KEY) plus VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY for
 * sending pushes.
 */

import { runRemindersTick, type RemindersTickSummary } from '../reminders/remindersTick.js'
import { createAdminRemindersFirestore } from '../reminders/remindersTickFirestoreAdmin.js'
import { sendWebPush } from '../lib/webPushSend.js'
import { isProcessTimeZoneUtc } from '../lib/timeZoneWallClock.js'

/** How often this script is expected to be invoked (must match the Render Cron Job schedule). */
const DEFAULT_TICK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Prints the tick's result. Split out from main() (pure w.r.t. its
 * inputs — takes the already-computed summary, does no Firestore/push
 * work itself) purely so the logging gate below is directly testable
 * without wiring up real Admin Firestore/web-push.
 *
 * The aggregate "per-user errors: N" line is always printed — a count,
 * no identifying data. The per-account breakdown (Firebase uid + raw
 * error text) is gated behind REMINDERS_TICK_VERBOSE_ERRORS=true,
 * default OFF: this script is intended to run from a public GitHub
 * Actions workflow, whose logs are publicly visible on a public repo.
 */
export function logTickSummary(summary: RemindersTickSummary, env: NodeJS.ProcessEnv): void {
  console.log(
    `Reminders tick complete.\n` +
      `  users scanned:            ${summary.usersScanned}\n` +
      `  events considered:        ${summary.eventsConsidered}\n` +
      `  reminders sent:           ${summary.remindersSent}\n` +
      `  suppressed (inApp off):   ${summary.remindersSuppressed.inAppDisabled}\n` +
      `  suppressed (module off):  ${summary.remindersSuppressed.moduleDisabled}\n` +
      `  suppressed (quiet hours): ${summary.remindersSuppressed.quietHours}\n` +
      `  suppressed (duplicate):   ${summary.remindersSuppressed.duplicate}\n` +
      `  subscriptions cleaned up: ${summary.subscriptionsCleanedUp}\n` +
      `  per-user errors:          ${summary.errors.length}`,
  )

  if (env['REMINDERS_TICK_VERBOSE_ERRORS'] === 'true') {
    for (const e of summary.errors) {
      console.error(`  - ${e.uid}: ${e.error}`)
    }
  }
}

export async function main(_argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  if (!isProcessTimeZoneUtc()) {
    console.error(
      'Refusing to run: this process is not running in UTC. The Calendar reminders tick converts every ' +
        "user's local quiet-hours window into this process's own local time fields, which is only correct " +
        'when the process itself runs in UTC (Render\'s default). Set TZ=UTC (or fix the host) before retrying.',
    )
    return 1
  }

  const windowMs = Number(env['REMINDERS_TICK_WINDOW_MS'] ?? DEFAULT_TICK_INTERVAL_MS)

  let summary: RemindersTickSummary
  try {
    summary = await runRemindersTick({
      firestore: createAdminRemindersFirestore(),
      sendWebPush,
      now: new Date(),
      windowMs,
    })
  } catch (err) {
    console.error(
      `Reminders tick failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return 1
  }

  logTickSummary(summary, env)

  return 0
}
