/**
 * remindersTickFirestoreAdmin.ts — the real Admin SDK implementation of
 * RemindersFirestore (remindersTick.ts), backed by the same shared Admin
 * Firestore instance every other server-trusted read/write in this
 * package uses (getFirebaseAdminFirestore(), from lib/firebaseAdmin.ts —
 * already used by aiQuota.ts/mailer.ts). No new Firestore collection or
 * schema: same users/{uid}/calendarEvents, users/{uid}/pushSubscriptions,
 * users/{uid}/notifications, and users/{uid}.timezone/.notifications the
 * client already reads and writes via the client Firestore SDK. The
 * Admin SDK bypasses Firestore Security Rules entirely, so no rules
 * change is needed for this to work.
 */

import { getFirebaseAdminFirestore } from '../lib/firebaseAdmin.js'
import { DEFAULT_NOTIFICATION_SETTINGS } from '../lib/notificationSettingsTypes.js'
import type {
  RemindersFirestore,
  PushSubscriptionRecord,
  UserSettingsRecord,
  CalendarEventRecord,
  NotificationDocFields,
} from './remindersTick.js'

export function createAdminRemindersFirestore(): RemindersFirestore {
  const db = getFirebaseAdminFirestore()

  return {
    async listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
      const snap = await db.collectionGroup('pushSubscriptions').get()
      const out: PushSubscriptionRecord[] = []
      for (const doc of snap.docs) {
        // users/{uid}/pushSubscriptions/{subId} — the uid is the parent's parent segment.
        const uid = doc.ref.parent.parent?.id
        if (!uid) continue
        const data = doc.data() as { endpoint?: string; keys?: { auth: string; p256dh: string } }
        if (!data.endpoint || !data.keys) continue
        out.push({ uid, subId: doc.id, endpoint: data.endpoint, keys: data.keys })
      }
      return out
    },

    async getUserSettings(uid: string): Promise<UserSettingsRecord | null> {
      const snap = await db.collection('users').doc(uid).get()
      if (!snap.exists) return null
      const data = snap.data() as {
        timezone?: string
        preferredLanguage?: string
        notifications?: Partial<typeof DEFAULT_NOTIFICATION_SETTINGS>
      }
      return {
        timezone: data.timezone || 'Europe/Tallinn',
        preferredLanguage: data.preferredLanguage || 'et',
        notifications: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...data.notifications,
          modules: { ...DEFAULT_NOTIFICATION_SETTINGS.modules, ...data.notifications?.modules },
        },
      }
    },

    async getCalendarEventsInRange(
      uid: string,
      fromDateIso: string,
      toDateIso: string,
    ): Promise<CalendarEventRecord[]> {
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('calendarEvents')
        .where('date', '>=', fromDateIso)
        .where('date', '<=', toDateIso)
        .get()
      return snap.docs.map((doc) => doc.data() as CalendarEventRecord)
    },

    async notificationExists(uid: string, id: string): Promise<boolean> {
      const snap = await db.collection('users').doc(uid).collection('notifications').doc(id).get()
      return snap.exists
    },

    async writeNotification(uid: string, id: string, item: NotificationDocFields): Promise<void> {
      await db.collection('users').doc(uid).collection('notifications').doc(id).set(item)
    },

    async deletePushSubscription(uid: string, subId: string): Promise<void> {
      await db.collection('users').doc(uid).collection('pushSubscriptions').doc(subId).delete()
    },
  }
}
