/**
 * TeavitusedPage.tsx's active-push-state copy claimed alerts are "delivered
 * to this device" / "saadetakse sellele seadmele" — false, since
 * notifyOtherDevices() (pushNotifications.ts) explicitly excludes the
 * current device's own subscription and only ever delivers to the user's
 * OTHER registered devices. Reworded to describe that behavior accurately,
 * without touching notifyOtherDevices() itself, the module toggles, quiet
 * hours, or any other copy on the page.
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source, matching
 * the pattern used throughout this session's other Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/teavitusedPagePushCopyFixed.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/TeavitusedPage.tsx'),
  'utf8',
)

describe('the active push-state copy no longer claims delivery to this device', () => {
  it('the ET copy no longer says "sellele seadmele" and the EN copy no longer says "this device"', () => {
    expect(SRC).not.toMatch(/saadetakse sellele seadmele/)
    expect(SRC).not.toMatch(/delivered to this device/i)
  })

  it('the copy now describes delivery to other devices, matching notifyOtherDevices() behavior', () => {
    expect(SRC).toMatch(/'Aktiivne — teavitused saadetakse sinu teistele seadmetele'/)
    expect(SRC).toMatch(/'Active — alerts are delivered to your other devices'/)
  })
})

describe('unrelated push-status copy and behavior are unchanged', () => {
  it('the unsupported/denied/inactive copy branches are untouched', () => {
    expect(SRC).toMatch(/'Sinu brauser ei toeta push-teavitusi'/)
    expect(SRC).toMatch(/'Not supported by this browser'/)
    expect(SRC).toMatch(/'Blokeeritud — luba brauseri seadetes'/)
    expect(SRC).toMatch(/'Blocked — enable in browser settings'/)
    expect(SRC).toMatch(/'Saa teavitusi ka siis, kui rakendus pole lahti'/)
    expect(SRC).toMatch(/'Receive alerts even when the app is closed'/)
  })

  it('handlePushToggle still calls enablePush/disablePush unchanged', () => {
    expect(SRC).toMatch(/const handlePushToggle = async \(enabled: boolean\) => \{/)
    expect(SRC).toMatch(/await disablePush\(user\.uid\)/)
    expect(SRC).toMatch(/const result = await enablePush\(user\.uid\)/)
  })
})
