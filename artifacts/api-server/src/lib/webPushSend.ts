/**
 * webPushSend.ts — the actual Web Push send + VAPID setup, extracted from
 * routes/push.ts (POST /api/push/notify) unchanged, so the Calendar
 * reminders tick (remindersTick.ts) can send pushes through the exact
 * same VAPID configuration and "gone subscription" detection instead of
 * duplicating either. routes/push.ts now delegates here; its external
 * request/response behavior is unchanged.
 */

import webPush from 'web-push'
import { logger } from './logger.js'

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY'] ?? ''
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY'] ?? ''
const VAPID_EMAIL = 'mailto:noreply@kivora.app'

export const VAPID_PUBLIC_KEY_VALUE = VAPID_PUBLIC_KEY
export const isWebPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (isWebPushConfigured) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  logger.warn(
    'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set — push notifications disabled',
  )
}

export interface PushSubscriptionLike {
  endpoint: string
  keys: { auth: string; p256dh: string }
}

export interface WebPushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface WebPushSendResult {
  sent: number
  failed: number
  /** Endpoints that came back 404/410 — permanently gone, safe to delete. */
  goneEndpoints: string[]
}

/**
 * Sends `notification` to every one of `subscriptions`. Throws if VAPID
 * is not configured — callers decide how to surface that (routes/push.ts
 * turns it into a 503; remindersTick.ts treats it as a tick-level error).
 */
export async function sendWebPush(
  subscriptions: PushSubscriptionLike[],
  notification: WebPushPayload,
): Promise<WebPushSendResult> {
  if (!isWebPushConfigured) {
    throw new Error('Push not configured — VAPID keys missing on server')
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body ?? '',
    url: notification.url ?? '/',
    tag: notification.tag ?? 'kivora',
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 86400 }, // 24-hour time-to-live
      ),
    ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.length - sent

  // Collect endpoints that are permanently gone (410 Gone / 404)
  const goneEndpoints: string[] = results
    .map((r, i) => ({ r, sub: subscriptions[i] }))
    .filter(
      ({ r }) =>
        r.status === 'rejected' &&
        [404, 410].includes(
          (r as PromiseRejectedResult).reason?.statusCode ?? 0,
        ),
    )
    .map(({ sub }) => sub.endpoint)

  logger.info({ sent, failed, gone: goneEndpoints.length }, 'Push sent')
  return { sent, failed, goneEndpoints }
}
