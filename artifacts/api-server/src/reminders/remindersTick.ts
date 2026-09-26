/**
 * remindersTick.ts — the Phase 1 orchestrator: scans every user with at
 * least one push subscription, and for each one whose Calendar
 * notification module is enabled, finds timed Calendar events whose
 * reminder (per their `defaultReminder` setting) is due in this tick's
 * window, and pushes it to every one of their own subscribed devices.
 *
 * Poll-and-decide, not a job queue: every tick recomputes candidates
 * fresh from live Firestore state. A deleted event is simply absent from
 * the next query; an edited event's dedup id changes (see
 * calendarReminderCandidates.ts), so a stale reminder for its old time
 * never blocks the new, correctly-timed one. Nothing is ever "cancelled"
 * — there is nothing scheduled ahead of time to cancel.
 *
 * Reuses, rather than reinvents:
 *   - isInQuietHours / isModuleEnabled from notificationRules.ts (the
 *     server-side twin of the Phase 0 shared rules) for quiet hours and
 *     the Calendar module toggle. NOT shouldDispatch/hasDuplicateOnDay —
 *     those encode the client's "one per type per day" dedup, which is a
 *     weaker, different strategy than the deterministic per-(event,
 *     offset) doc-id dedup this tick uses (see below).
 *   - the same users/{uid}/notifications (NotifItem-shaped) collection
 *     the client bell already reads, so a reminder sent while every
 *     client was closed simply appears there on next open — no second
 *     notification concept.
 *   - sendWebPush from webPushSend.ts (the same VAPID setup and "gone
 *     endpoint" detection routes/push.ts uses), sent to EVERY one of the
 *     user's subscriptions — unlike the client's notifyOtherDevices(),
 *     which excludes "the current device" because a live client already
 *     showed the in-app version. There is no current device here.
 *
 * All Firestore access and the push send are injected as narrow
 * interfaces (RemindersFirestore, SendWebPush) — see
 * remindersTickFirestoreAdmin.ts for the real Admin SDK implementation
 * and remindersTick.test.ts for the in-memory fake used in tests. This
 * mirrors grantOwnerRole.ts's dependency-injection pattern in this same
 * package.
 */

import { isInQuietHours, isModuleEnabled } from '../lib/notificationRules.js'
import { instantToZonedClockDate } from '../lib/timeZoneWallClock.js'
import { extractCalendarReminderCandidate, type CalendarEventLike } from './calendarReminderCandidates.js'
import type { NotificationSettings } from '../lib/notificationSettingsTypes.js'
import type { PushSubscriptionLike, WebPushPayload, WebPushSendResult } from '../lib/webPushSend.js'

// ── Injected dependencies ───────────────────────────────────────────────────

export interface PushSubscriptionRecord {
  uid: string
  subId: string
  endpoint: string
  keys: { auth: string; p256dh: string }
}

export interface UserSettingsRecord {
  timezone: string
  preferredLanguage: string
  notifications: NotificationSettings
}

export type CalendarEventRecord = CalendarEventLike & { title: string }

export interface NotificationDocFields {
  id: string
  type: string
  module: 'calendar'
  title: string
  description: string
  timeLabel: string
  read: boolean
  icon: 'calendar'
  accent: string
  createdAt: number
  link?: string
}

/** The narrow Firestore surface this tick needs — see remindersTickFirestoreAdmin.ts for the real implementation. */
export interface RemindersFirestore {
  /** Every push subscription across every user (a collectionGroup scan needs no filter/index). */
  listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]>
  /** users/{uid}'s timezone/preferredLanguage/notifications fields, or null if the user doc is missing. */
  getUserSettings(uid: string): Promise<UserSettingsRecord | null>
  /**
   * users/{uid}/calendarEvents docs whose `date` falls within
   * [fromDateIso, toDateIso] inclusive. This is a generous pre-filter
   * only — exact due-now correctness comes from
   * extractCalendarReminderCandidate downstream, not from this range.
   */
  getCalendarEventsInRange(uid: string, fromDateIso: string, toDateIso: string): Promise<CalendarEventRecord[]>
  /** True when users/{uid}/notifications/{id} already exists. */
  notificationExists(uid: string, id: string): Promise<boolean>
  /** Writes users/{uid}/notifications/{id}. */
  writeNotification(uid: string, id: string, item: NotificationDocFields): Promise<void>
  /** Deletes users/{uid}/pushSubscriptions/{subId}. */
  deletePushSubscription(uid: string, subId: string): Promise<void>
}

export type SendWebPush = (
  subscriptions: PushSubscriptionLike[],
  payload: WebPushPayload,
) => Promise<WebPushSendResult>

export interface RemindersTickDeps {
  firestore: RemindersFirestore
  sendWebPush: SendWebPush
  /** The real current instant — injected so tests never wait on a real clock. */
  now: Date
  /** Only candidates whose trigger instant falls in (now - windowMs, now] are due this tick. */
  windowMs: number
}

export interface RemindersTickSummary {
  usersScanned: number
  eventsConsidered: number
  remindersSent: number
  remindersSuppressed: {
    inAppDisabled: number
    moduleDisabled: number
    quietHours: number
    duplicate: number
    /** extractCalendarReminderCandidate returned null (all-day, no startTime, or reminder resolved to 'none'). */
    noCandidate: number
    /** The candidate's trigger instant is still in the future relative to this tick. */
    notYetDue: number
    /** The candidate's trigger instant is more than windowMs in the past — this tick's window missed it. */
    windowMissed: number
  }
  subscriptionsCleanedUp: number
  errors: Array<{ uid: string; error: string }>
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const MESSAGES = {
  et: (eventTitle: string, startTime: string) => ({
    title: `Peatselt: ${eventTitle}`,
    description: `Sündmus „${eventTitle}“ algab kell ${startTime}.`,
    timeLabel: 'Täna',
  }),
  en: (eventTitle: string, startTime: string) => ({
    title: `Coming up: ${eventTitle}`,
    description: `"${eventTitle}" starts at ${startTime}.`,
    timeLabel: 'Today',
  }),
} as const

function messageFor(lang: string, eventTitle: string, startTime: string) {
  return (lang === 'en' ? MESSAGES.en : MESSAGES.et)(eventTitle, startTime)
}

/**
 * Runs one tick. Never throws for a single user's failure — that user is
 * recorded in `errors` and the tick continues with the rest, so one
 * misbehaving account can't stop reminders for everyone else.
 */
export async function runRemindersTick(deps: RemindersTickDeps): Promise<RemindersTickSummary> {
  const { firestore, sendWebPush, now, windowMs } = deps

  const summary: RemindersTickSummary = {
    usersScanned: 0,
    eventsConsidered: 0,
    remindersSent: 0,
    remindersSuppressed: {
      inAppDisabled: 0,
      moduleDisabled: 0,
      quietHours: 0,
      duplicate: 0,
      noCandidate: 0,
      notYetDue: 0,
      windowMissed: 0,
    },
    subscriptionsCleanedUp: 0,
    errors: [],
  }

  const allSubs = await firestore.listAllPushSubscriptions()
  const subsByUid = new Map<string, PushSubscriptionRecord[]>()
  for (const sub of allSubs) {
    const list = subsByUid.get(sub.uid) ?? []
    list.push(sub)
    subsByUid.set(sub.uid, list)
  }

  const fromDateIso = isoDateUtc(new Date(now.getTime() - 24 * 3600 * 1000))
  const toDateIso = isoDateUtc(new Date(now.getTime() + 48 * 3600 * 1000))

  for (const [uid, subs] of subsByUid) {
    summary.usersScanned++
    try {
      const settingsRecord = await firestore.getUserSettings(uid)
      if (!settingsRecord) continue
      const { timezone, preferredLanguage, notifications: settings } = settingsRecord

      if (!settings.inApp) {
        summary.remindersSuppressed.inAppDisabled++
        continue
      }
      if (!isModuleEnabled(settings, 'calendar')) {
        summary.remindersSuppressed.moduleDisabled++
        continue
      }

      const events = await firestore.getCalendarEventsInRange(uid, fromDateIso, toDateIso)

      for (const event of events) {
        summary.eventsConsidered++

        const candidate = extractCalendarReminderCandidate(event, settings.defaultReminder, timezone)
        if (!candidate) {
          summary.remindersSuppressed.noCandidate++
          continue
        }

        const dueMs = candidate.triggerInstant.getTime()
        const nowMs = now.getTime()
        if (dueMs > nowMs) {
          summary.remindersSuppressed.notYetDue++
          continue
        }
        if (dueMs <= nowMs - windowMs) {
          summary.remindersSuppressed.windowMissed++
          continue
        }

        const localNow = instantToZonedClockDate(now, timezone)
        if (isInQuietHours(settings, localNow)) {
          summary.remindersSuppressed.quietHours++
          continue
        }

        if (await firestore.notificationExists(uid, candidate.dedupId)) {
          summary.remindersSuppressed.duplicate++
          continue
        }

        const msg = messageFor(preferredLanguage, event.title, event.startTime ?? '')

        await firestore.writeNotification(uid, candidate.dedupId, {
          id: candidate.dedupId,
          type: candidate.dedupId,
          module: 'calendar',
          title: msg.title,
          description: msg.description,
          timeLabel: msg.timeLabel,
          read: false,
          icon: 'calendar',
          accent: '#2563EB',
          createdAt: now.getTime(),
          link: '/app/calendar',
        })

        const pushResult = await sendWebPush(
          subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
          { title: msg.title, body: msg.description, url: '/app/calendar', tag: candidate.dedupId },
        )
        summary.remindersSent++

        for (const goneEndpoint of pushResult.goneEndpoints) {
          const match = subs.find((s) => s.endpoint === goneEndpoint)
          if (match) {
            await firestore.deletePushSubscription(uid, match.subId)
            summary.subscriptionsCleanedUp++
          }
        }
      }
    } catch (err) {
      summary.errors.push({ uid, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return summary
}
