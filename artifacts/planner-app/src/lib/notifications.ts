// Re-export NotifItem as Notification for backward compatibility.
// The static seed and getLocalizedNotifications have been removed;
// all notification data now lives in notificationItemsStore.
export type { NotifItem as Notification } from '@/lib/notificationItemsStore'
