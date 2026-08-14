---
name: Push Notifications Architecture
description: Web Push setup — VAPID, service worker, Firestore subscriptions, API server send path
---

## Architecture

- **Protocol**: VAPID Web Push (no FCM)
- **Service Worker**: `artifacts/planner-app/public/sw.js` → served at `<BASE_URL>sw.js`
  - Registered early in `App.tsx` (NotificationBootstrap) on every page load
  - Handles `push` + `notificationclick` events; opens/focuses app window
- **Subscriptions**: stored in Firestore at `users/{uid}/pushSubscriptions/{subId}`
  - `subId` = `btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)`
  - Fields: `endpoint`, `keys: {auth, p256dh}`, `subId`, `createdAt`, `userAgent`
- **Push flow**: `notificationItemsStore.dispatch()` → `notifyOtherDevices()` (fire-and-forget) → reads Firestore subscriptions (excluding current device) → POST `/api/push/notify`
- **API server** (`artifacts/api-server/src/routes/push.ts`): receives subscriptions + payload, calls `webPush.sendNotification()` with VAPID keys

## Environment Variables

- `VAPID_PUBLIC_KEY` — set as shared env var (non-secret, public key)
- `VAPID_PRIVATE_KEY` — set as Replit Secret (sensitive)
- Generated VAPID pair: public = `BAdWREY_TBz2YSTxaHKoUQptW3rU9zciYjZ1URmvnQmis7kP9pRjaxeAy6CLLDuOeainWB7V296x-AIrke6s4Iw`

## Key Files

- `src/lib/pushNotifications.ts` — `enablePush`, `disablePush`, `getActivePushSubscription`, `notifyOtherDevices`
- `src/views/settings/TeavitusedPage.tsx` — push toggle (`pushStatus` state + `handlePushToggle`)
- `src/lib/notificationItemsStore.ts` — `NotifItem` has `link?: string` for navigation; calls `notifyOtherDevices` on dispatch

## NotifItem.link

- Added `link?: string` to `NotifItem` interface
- Clicking a notification in NotificationsPanel or NotificationsPage navigates to `n.link` if set
- Push URL constructed as: `window.location.origin + BASE_URL.replace(/\/$/, '') + (link ?? '/app/notifications')`

**Why**: Needed cross-device push without Firebase Cloud Messaging to avoid service account complexity.
