/**
 * Tier 2 of the Calendar reminder UX fix: an optional per-event reminder
 * override on top of Tier 1's global default.
 *
 *   - MockCalendarEvent gains an optional `reminder?: ReminderOffset |
 *     'none'` field. Optional means every existing event, with no such
 *     field at all, is unaffected — this is the "no migration required"
 *     requirement, checked directly below by constructing an event
 *     literal without the field and confirming it's simply undefined.
 *   - NewEventModal.tsx (create/edit UI) exposes a selector with
 *     "use default" / "no reminder" / the six backend-supported offsets,
 *     and persists exactly what the user chose (or nothing at all for
 *     "use default", not even an explicit `undefined` marker beyond
 *     what the object literal already carries).
 *   - EventDetailsModal.tsx displays the *effective* reminder — the
 *     override if present, or the resolved global default otherwise —
 *     and only for a timed event (never for an all-day one, since the
 *     server-side tick excludes those regardless of any reminder value).
 *   - CalendarPage.tsx loads the user's global defaultReminder (the same
 *     NotificationSettings Tier 1 writes to) purely to pass it down for
 *     that display — it computes no reminders itself.
 *
 * No React rendering harness exists for these components in this repo —
 * verified via structural regex assertions against the raw source
 * (matching this session's established pattern), plus real behavioral
 * checks anywhere a plain TypeScript object/function can be exercised
 * directly (the MockCalendarEvent type itself, and NewEventModal's save
 * payload shape via its own literal in source).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/calendarEventReminderOverride.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

describe('MockCalendarEvent.reminder — optional, no migration required', () => {
  it('an event literal with no reminder field at all is valid and reads as undefined (every pre-Tier-2 event)', () => {
    const legacyEvent: MockCalendarEvent = {
      id: 'evt-legacy', title: 'Old event', startTime: '10:00', endTime: '11:00', color: '#6F5AE8', date: '2026-01-01',
    }
    expect(legacyEvent.reminder).toBeUndefined()
  })

  it('an event literal can carry a real ReminderOffset override', () => {
    const overridden: MockCalendarEvent = {
      id: 'evt-1', title: 'T', startTime: '10:00', endTime: '11:00', color: '#6F5AE8', date: '2026-01-01', reminder: '5min',
    }
    expect(overridden.reminder).toBe('5min')
  })

  it("an event literal can carry the explicit 'none' override", () => {
    const noneEvent: MockCalendarEvent = {
      id: 'evt-2', title: 'T', startTime: '10:00', endTime: '11:00', color: '#6F5AE8', date: '2026-01-01', reminder: 'none',
    }
    expect(noneEvent.reminder).toBe('none')
  })
})

describe('NewEventModal.tsx — create/edit reminder selector', () => {
  const SRC = readSrc('src/components/calendar/NewEventModal.tsx')

  it('imports the shared backend-supported offset list/labels, not a separate array', () => {
    expect(SRC).toMatch(/import \{ REMINDER_OFFSET_ORDER, reminderOffsetLabel \} from '@\/lib\/calendar\/reminderOptions'/)
  })

  it("the choice type is 'default' | 'none' | ReminderOffset — no other values possible", () => {
    expect(SRC).toMatch(/type ReminderChoice = 'default' \| 'none' \| ReminderOffset/)
  })

  it('the option list always starts with "use default" then "no reminder", followed by the six offsets', () => {
    const block = SRC.match(/const REMINDER_CHOICE_OPTIONS[\s\S]*?= \[[\s\S]*?\n {2}\]/)
    expect(block).not.toBeNull()
    const text = block![0]
    const defaultIdx = text.indexOf("value: 'default'")
    const noneIdx = text.indexOf("value: 'none'")
    const spreadIdx = text.indexOf('...REMINDER_OFFSET_ORDER.map')
    expect(defaultIdx).toBeGreaterThan(-1)
    expect(noneIdx).toBeGreaterThan(defaultIdx)
    expect(spreadIdx).toBeGreaterThan(noneIdx)
  })

  it('pre-fills the choice from initialEvent.reminder, defaulting to "default" when absent (edit mode = current value, create mode = default)', () => {
    expect(SRC).toMatch(/setReminderChoice\(initialEvent\?\.reminder \?\? 'default'\)/)
  })

  it('"use default" persists no override at all (undefined), never the literal string "default"', () => {
    expect(SRC).toMatch(/reminder: reminderChoice === 'default' \? undefined : reminderChoice/)
  })

  it('renders a <select> for the reminder field, labeled with the existing cal.event.reminder key', () => {
    expect(SRC).toMatch(/\{t\('cal\.event\.reminder', lang\)\}/)
    expect(SRC).toMatch(/value=\{reminderChoice\}/)
  })
})

describe('EventDetailsModal.tsx — effective reminder display', () => {
  const SRC = readSrc('src/components/calendar/EventDetailsModal.tsx')

  it("shows the 'no reminder' label when the event's override is 'none'", () => {
    expect(SRC).toMatch(/event\.reminder === 'none'\s*\n\s*\? t\('cal\.event\.reminder\.none', lang\)/)
  })

  it('shows the override\'s own label when a real offset is set', () => {
    expect(SRC).toMatch(/: event\.reminder\s*\n\s*\? reminderOffsetLabel\(event\.reminder, lang\)/)
  })

  it('shows "using default (<resolved label>)" when there is no override at all', () => {
    expect(SRC).toMatch(
      /: t\('cal\.event\.reminder\.usingDefault', lang\)\.replace\('\{value\}', reminderOffsetLabel\(defaultReminder, lang\)\)/,
    )
  })

  it('the reminder row only renders for a timed event, never for an all-day one', () => {
    const block = SRC.match(/\{!event\.allDay && \([\s\S]*?<\/div>\s*\)\}/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/reminderText/)
  })

  it('accepts an optional defaultReminder prop, falling back to DEFAULT_NOTIFICATION_SETTINGS.defaultReminder', () => {
    expect(SRC).toMatch(/defaultReminder = DEFAULT_NOTIFICATION_SETTINGS\.defaultReminder,/)
  })

  it('the Trash/Close/Edit footer actions are unchanged', () => {
    expect(SRC).toMatch(/onClick=\{handleRequestDelete\}/)
    expect(SRC).toMatch(/onClick=\{onClose\}[\s\S]{0,250}\{t\('cal\.action\.close', lang\)\}/)
    expect(SRC).toMatch(/onClick=\{onEdit\}/)
  })
})

describe('CalendarPage.tsx — loads and passes the global default for display only', () => {
  const SRC = readSrc('src/views/CalendarPage.tsx')

  it('loads defaultReminder via the existing getNotificationSettings(uid), the same source Tier 1 writes to', () => {
    expect(SRC).toMatch(/getNotificationSettings\(user\.uid\)/)
    expect(SRC).toMatch(/setDefaultReminder\(settings\.defaultReminder\)/)
  })

  it('passes it to EventDetailsModal as defaultReminder', () => {
    const block = SRC.match(/<EventDetailsModal[\s\S]*?\/>/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/defaultReminder=\{defaultReminder\}/)
  })

  it('does NOT pass it to the create/edit NewEventModal instances — no resolved-value display there, per the minimal scope', () => {
    const blocks = [...SRC.matchAll(/<NewEventModal[\s\S]*?\/>/g)].map((m) => m[0])
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block).not.toMatch(/defaultReminder/)
    }
  })

  it('handleSaveEvent/handleUpdateEvent still pass the whole event object through unchanged — no reminder-specific special-casing at the call site', () => {
    expect(SRC).toMatch(/const handleSaveEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*addCalendarEvent\(event\)/)
    expect(SRC).toMatch(/const handleUpdateEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*updateCalendarEvent\(event\)/)
  })
})
