import type { ReminderOffset } from '@/lib/notificationsStore'
import { t, type TranslationKey } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

/**
 * The exact reminder offsets the server-side reminders tick supports
 * (see artifacts/api-server/src/reminders/calendarReminderCandidates.ts'
 * OFFSET_MINUTES map and its 1day DST-safe branch). Shared by the global
 * default picker (Settings → Notifications) and the per-event override
 * picker (Calendar) so both ever offer only these six values — adding a
 * new one here without first adding backend support would silently
 * produce a reminder that's computed but never sent correctly.
 */
export const REMINDER_OFFSET_ORDER: ReminderOffset[] = ['at_time', '5min', '15min', '30min', '1hour', '1day']

const REMINDER_OFFSET_LABEL_KEYS: Record<ReminderOffset, TranslationKey> = {
  at_time: 'reminder.offset.atTime',
  '5min': 'reminder.offset.min5',
  '15min': 'reminder.offset.min15',
  '30min': 'reminder.offset.min30',
  '1hour': 'reminder.offset.hour1',
  '1day': 'reminder.offset.day1',
}

export function reminderOffsetLabel(value: ReminderOffset, lang: AppLang): string {
  return t(REMINDER_OFFSET_LABEL_KEYS[value], lang)
}
