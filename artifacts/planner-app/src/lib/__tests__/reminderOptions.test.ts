/**
 * reminderOptions.ts is the shared source of truth for which reminder
 * offsets Settings' global default picker (Tier 1) and the Calendar
 * event override picker (Tier 2) may ever offer — exactly the six
 * values the server-side reminders tick actually supports (see
 * artifacts/api-server/src/reminders/calendarReminderCandidates.ts'
 * OFFSET_MINUTES map + its 1day branch). These are real, behavioral
 * unit tests (pure functions, no rendering harness needed).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/reminderOptions.test.ts
 */

import { describe, it, expect } from 'vitest'
import { REMINDER_OFFSET_ORDER, reminderOffsetLabel } from '@/lib/calendar/reminderOptions'
import type { ReminderOffset } from '@/lib/notificationsStore'

describe('REMINDER_OFFSET_ORDER — exactly the backend-supported values, no more', () => {
  it('is exactly these six values, in this order', () => {
    expect(REMINDER_OFFSET_ORDER).toEqual(['at_time', '5min', '15min', '30min', '1hour', '1day'])
  })

  it('does not include any unsupported value (e.g. 10min)', () => {
    expect(REMINDER_OFFSET_ORDER).not.toContain('10min')
    expect(REMINDER_OFFSET_ORDER.length).toBe(6)
  })
})

describe('reminderOffsetLabel — ET and EN wording for every supported value', () => {
  const cases: [ReminderOffset, string, string][] = [
    ['at_time', 'Sündmuse ajal', 'At event time'],
    ['5min', '5 minutit enne', '5 minutes before'],
    ['15min', '15 minutit enne', '15 minutes before'],
    ['30min', '30 minutit enne', '30 minutes before'],
    ['1hour', '1 tund enne', '1 hour before'],
    ['1day', '1 päev enne', '1 day before'],
  ]

  for (const [value, et, en] of cases) {
    it(`${value}: ET="${et}", EN="${en}"`, () => {
      expect(reminderOffsetLabel(value, 'et')).toBe(et)
      expect(reminderOffsetLabel(value, 'en')).toBe(en)
    })
  }
})
