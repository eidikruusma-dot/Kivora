/**
 * notificationSettingsTypes.ts — a type-only twin of the relevant shapes
 * from planner-app's notificationsStore.ts (NotificationModules,
 * ReminderOffset, NotificationSettings).
 *
 * Why a twin instead of importing the original directly: this monorepo's
 * actual convention for cross-package reuse is a proper `lib/*` workspace
 * package with its own package.json/tsconfig (see lib/db, lib/api-zod,
 * both registered as TS project `references` in this package's
 * tsconfig.json) — planner-app is not one of those; it is a Vite app with
 * no `main`/`exports`/build output for another package to consume, and
 * its own source uses a `@/` path alias and Vite-specific globals that
 * this Node/esbuild-bundled package does not configure. Reaching into
 * planner-app's `src` tree directly would mean a raw relative import into
 * another package's internals with no formal boundary — exactly the
 * brittle cross-artifact coupling this twin avoids. Promoting this into a
 * real shared `lib/*` package (like lib/db) would be the right move if
 * more server-side rule reuse accumulates beyond this one small file.
 *
 * These are the ONLY fields the reminders tick reads off a user's
 * `notifications` settings and `defaultReminder` value — kept in sync by
 * hand with notificationsStore.ts; a drift here is caught by
 * notificationRules.test.ts's behavior-parity assertions.
 */

export interface NotificationModules {
  tasks: boolean
  calendar: boolean
  habits: boolean
  goals: boolean
  school: boolean
  assistant: boolean
  security: boolean
}

export type ReminderOffset = 'at_time' | '5min' | '15min' | '30min' | '1hour' | '1day'

export interface NotificationSettings {
  modules: NotificationModules
  inApp: boolean
  systemNotifications: boolean
  defaultReminder: ReminderOffset
  quietHoursEnabled: boolean
  quietStart: string // 'HH:mm'
  quietEnd: string   // 'HH:mm'
}

/**
 * Twin of notificationsStore.ts's DEFAULT_NOTIFICATION_SETTINGS — used to
 * fill in missing fields on a user doc exactly the way the client's own
 * getNotificationSettings() already merges defaults, so a user who has
 * never opened Settings still gets correct (enabled) Calendar reminders.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  modules: {
    tasks: true,
    calendar: true,
    habits: true,
    goals: true,
    school: true,
    assistant: false,
    security: true,
  },
  inApp: true,
  systemNotifications: false,
  defaultReminder: '15min',
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
}
