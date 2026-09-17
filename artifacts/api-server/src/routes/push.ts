import { Router } from 'express'
import { isWebPushConfigured, VAPID_PUBLIC_KEY_VALUE, sendWebPush } from '../lib/webPushSend.js'

const router = Router()

/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key so the client can create a push subscription.
 */
router.get('/push/vapid-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY_VALUE, configured: isWebPushConfigured })
})

/**
 * POST /api/push/notify
 * Sends a push payload to one or more Web Push subscriptions.
 * Body: { subscriptions: [{endpoint, keys: {auth, p256dh}}], notification: {title, body, url?, tag?} }
 */
router.post('/push/notify', async (req, res) => {
  if (!isWebPushConfigured) {
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

  const result = await sendWebPush(subscriptions, notification)
  res.json(result)
})

export default router
