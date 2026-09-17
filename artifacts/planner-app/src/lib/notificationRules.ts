/**
 * Pure notification-decision rules shared by the client dispatch path
 * (notificationItemsStore.ts) and, eventually, server-side reminder
 * processing (Phase 1+ of the V1 reminder architecture). No Firebase or
 * DOM imports — only `NotificationSettings`/`NotificationModules` types,
 * so this module can run unmodified in a Node/Admin context later.
 *
 * Phase 0 only extracts what notificationItemsStore.dispatch() already
 * did inline (quiet hours, module toggle, same-day dedup) — the logic
 * itself is unchanged, just moved so it has one home instead of living
 * only inside the client store.
 */

import type { NotificationSettings, NotificationModules } from '@/lib/notificationsStore'

/** The minimal shape hasDuplicateOnDay/shouldDispatch need from a notification item. */
export interface DedupCandidate {
  type: string
  createdAt: number
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mirrors the previous private isInQuietHours() in notificationItemsStore.ts, unchanged. */
export function isInQuietHours(settings: NotificationSettings, now: Date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false

  const [startH, startM] = settings.quietStart.split(':').map(Number)
  const [endH, endM] = settings.quietEnd.split(':').map(Number)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  } else {
    // Overnight window e.g. 22:00–08:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes
  }
}

/** Mirrors the previous inline `item.module !== 'system' && item.module in settings.modules` check. */
export function isModuleEnabled(settings: NotificationSettings, module: string): boolean {
  if (module === 'system') return true
  if (module in settings.modules) {
    return settings.modules[module as keyof NotificationModules]
  }
  return true
}

/** Mirrors the previous private hasDuplicateToday() in notificationItemsStore.ts, unchanged. */
export function hasDuplicateOnDay(
  items: DedupCandidate[],
  type: string,
  now: Date = new Date(),
): boolean {
  const today = dateKey(now)
  return items.some((it) => it.type === type && dateKey(new Date(it.createdAt)) === today)
}

/**
 * The full gate notificationItemsStore.dispatch() applies before creating
 * a notification: in-app channel, quiet hours, module toggle, same-day
 * dedup — in that exact order, matching the prior inline checks.
 */
export function shouldDispatch(
  settings: NotificationSettings,
  existingItems: DedupCandidate[],
  candidate: { type: string; module: string },
  now: Date = new Date(),
): boolean {
  if (!settings.inApp) return false
  if (isInQuietHours(settings, now)) return false
  if (!isModuleEnabled(settings, candidate.module)) return false
  if (hasDuplicateOnDay(existingItems, candidate.type, now)) return false
  return true
}
