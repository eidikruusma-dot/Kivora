import { Router } from 'express'
import webPush from 'web-push'
import { logger } from '../lib/logger'

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY'] ?? ''
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY'] ?? ''
const VAPID_EMAIL = 'mailto:noreply@kivora.app'

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (configured) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  logger.warn(
    'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set — push notifications disabled',
  )
}

const router = Router()

/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key so the client can create a push subscription.
 */
router.get('/push/vapid-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY, configured })
})

/**
 * POST /api/push/notify
 * Sends a push payload to one or more Web Push subscriptions.
 * Body: { subscriptions: [{endpoint, keys: {auth, p256dh}}], notification: {title, body, url?, tag?} }
 */
router.post('/push/notify', async (req, res) => {
  if (!configured) {
    res.status(503).json({
      error: 'Push not configured — VAPID keys missing on server',
    })
    return
  }

  const { subscriptions, notification } = req.body as {
    subscriptions: Array<{
      endpoint: string
      keys: { auth: string; p256dh: string }
    }>
    notification: { title: string; body: string; url?: string; tag?: string }
  }

  if (!Array.isArray(subscriptions) || !notification?.title) {
    res.status(400).json({ error: 'Invalid request body' })
    return
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
  res.json({ sent, failed, goneEndpoints })
})

export default router
