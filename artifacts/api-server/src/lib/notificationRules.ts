/**
 * notificationRules.ts — a twin of planner-app's
 * src/lib/notificationRules.ts (Phase 0 of the V1 reminder architecture),
 * ported here so the server-side reminders tick (remindersTick.ts)
 * applies the exact same quiet-hours/module-toggle/dedup decision logic
 * the client's notificationItemsStore.dispatch() already uses — one
 * ruleset, expressed identically on both sides, rather than two
 * independently-invented behaviors.
 *
 * This is a twin, not a shared import, because the client (browser
 * Firebase SDK, Vite `@/` alias, DOM globals) and this server package
 * (Admin SDK, esbuild-bundled Node scripts) are genuinely different
 * runtimes with no existing shared-package boundary between them — see
 * notificationSettingsTypes.ts's doc comment for why a raw cross-artifact
 * import was rejected in favor of this twin for Phase 1. Every function
 * below is byte-for-byte the same logic as its planner-app counterpart;
 * notificationRules.test.ts asserts behavioral parity against the same
 * scenarios the planner-app version's own tests cover.
 */

import type { NotificationSettings, NotificationModules } from './notificationSettingsTypes.js'

/** The minimal shape hasDuplicateOnDay/shouldDispatch need from a notification item. */
export interface DedupCandidate {
  type: string
  createdAt: number
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mirrors planner-app's isInQuietHours(), unchanged. */
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

/** Mirrors planner-app's isModuleEnabled(), unchanged. */
export function isModuleEnabled(settings: NotificationSettings, module: string): boolean {
  if (module === 'system') return true
  if (module in settings.modules) {
    return settings.modules[module as keyof NotificationModules]
  }
  return true
}

/** Mirrors planner-app's hasDuplicateOnDay(), unchanged. */
export function hasDuplicateOnDay(
  items: DedupCandidate[],
  type: string,
  now: Date = new Date(),
): boolean {
  const today = dateKey(now)
  return items.some((it) => it.type === type && dateKey(new Date(it.createdAt)) === today)
}

/** Mirrors planner-app's shouldDispatch(), unchanged. */
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
