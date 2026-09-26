/**
 * Tier 1 of the Calendar reminder UX fix: Settings → Notifications
 * (TeavitusedPage.tsx) previously had no control at all for
 * `defaultReminder` — the server-side reminders tick already read and
 * respected it, but nothing let the user see or change it. This adds
 * exactly one new picker, bound to the existing `settings.defaultReminder`
 * field, offering the exact six backend-supported values via the shared
 * REMINDER_OFFSET_ORDER/reminderOffsetLabel (see reminderOptions.test.ts
 * for those functions' own behavioral coverage) — no new backend value,
 * no hardcoded Estonian-only labels (the old REMINDER_OPTIONS array in
 * notificationsStore.ts is no longer used for display here).
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the established pattern (see
 * teavitusedPagePushCopyFixed.test.ts).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/teavitusedPageDefaultReminder.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/views/settings/TeavitusedPage.tsx'), 'utf8')

describe('the missing global default-reminder picker now exists', () => {
  it('imports the shared, backend-supported offset list and label function (not a hardcoded/ET-only list)', () => {
    expect(SRC).toMatch(/import \{ REMINDER_OFFSET_ORDER, reminderOffsetLabel \} from '@\/lib\/calendar\/reminderOptions'/)
  })

  it('renders a <select> bound to settings.defaultReminder', () => {
    expect(SRC).toMatch(/<select\s+value=\{settings\.defaultReminder\}/)
  })

  it('changing it calls update({ defaultReminder: ... }) — the existing generic settings-patch helper, reused unchanged', () => {
    expect(SRC).toMatch(/onChange=\{\(e\) => update\(\{ defaultReminder: e\.target\.value as ReminderOffset \}\)\}/)
  })

  it('the option list is built from REMINDER_OFFSET_ORDER, not a separate/duplicated array', () => {
    const optionsBlock = SRC.match(/\{REMINDER_OFFSET_ORDER\.map\([\s\S]*?<\/select>/)
    expect(optionsBlock).not.toBeNull()
    expect(optionsBlock![0]).toMatch(/reminderOffsetLabel\(value, lang\)/)
  })

  it('uses the existing notifSettings.reminder.* translation keys for the section title/description', () => {
    expect(SRC).toMatch(/t\('notifSettings\.reminder\.title', lang\)/)
    expect(SRC).toMatch(/t\('notifSettings\.reminder\.sectionDesc', lang\)/)
    expect(SRC).toMatch(/t\('notifSettings\.reminder\.label', lang\)/)
  })
})

describe('unrelated Settings sections are untouched', () => {
  it('the module toggles section still maps MODULE_CONFIG unchanged', () => {
    expect(SRC).toMatch(/\{MODULE_CONFIG\.map\(\(m\) => \(/)
  })

  it('Push notification toggle handling is unchanged', () => {
    expect(SRC).toMatch(/const handlePushToggle = async \(enabled: boolean\) => \{/)
  })

  it('Quiet hours section still exists, independent of the new reminder section', () => {
    expect(SRC).toMatch(/t\('notifSettings\.quiet\.title', lang\)/)
    expect(SRC).toMatch(/checked=\{settings\.quietHoursEnabled\}/)
  })
})
