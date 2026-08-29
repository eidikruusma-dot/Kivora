/**
 * AndmeteKustutaminePage.tsx's performDeletion() (the full account-deletion
 * flow) had a redundant "Clear in-memory habits store" loop
 * (getAllHabits().forEach((h) => deleteHabit(h.id))) after deleteUser()
 * succeeded — redundant because deleteAllUserData(), called earlier in the
 * same function, already deletes the real Firestore users/{uid}/habits
 * collection (see accountDeletionPushSubscriptions.test.ts). Running it here
 * too meant extra Firestore deleteDoc calls against an auth session whose
 * user had just been deleted.
 *
 * The page's separate per-item "delete just my habits" flow
 * (handleConfirmItem, key === "habits") is a distinct feature, unrelated to
 * deleteAllUserData(), and is intentionally left untouched.
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source, matching
 * the pattern used throughout this session's other Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/andmeteKustutaminePageRedundantHabitLoopRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/AndmeteKustutaminePage.tsx'),
  'utf8',
)

function block(fnSignature: string): string {
  const re = new RegExp(`${fnSignature.replace(/[().]/g, '\\$&')}[\\s\\S]*?\\n  \\}`)
  return SRC.match(re)?.[0] ?? ''
}

describe('the redundant post-deleteAllUserData() habit-deletion loop is gone', () => {
  it('performDeletion() no longer clears the habits store after deleteUser()', () => {
    const fnBlock = block('async function performDeletion()')
    expect(fnBlock).not.toBe('')
    expect(fnBlock).not.toMatch(/Clear in-memory habits store/)
    expect(fnBlock).not.toMatch(/getAllHabits\(\)\.forEach/)
  })

  it('performDeletion() still navigates away immediately once deleteUser() succeeds', () => {
    const fnBlock = block('async function performDeletion()')
    expect(fnBlock).toMatch(/await deleteUser\(user\);[\s\S]*?navigate\("\/"\);/)
  })
})

describe('deleteUser() is still only reached after deleteAllUserData() resolves successfully', () => {
  it('deleteAllUserData() runs first, in its own try/catch that returns before deleteUser()', () => {
    const fnBlock = block('async function performDeletion()')
    const dataIdx = fnBlock.indexOf('await deleteAllUserData(user.uid);')
    const userIdx = fnBlock.indexOf('await deleteUser(user);')
    expect(dataIdx).toBeGreaterThan(-1)
    expect(userIdx).toBeGreaterThan(dataIdx)
    const between = fnBlock.slice(dataIdx, userIdx)
    expect(between).toMatch(/catch \(err\) \{[\s\S]*?return;/)
  })
})

describe('the unrelated per-item habits deletion flow is untouched', () => {
  it('handleConfirmItem still has its own habits branch calling getAllHabits/deleteHabit', () => {
    const fnBlock = block('async function handleConfirmItem(key: DataItemKey)')
    expect(fnBlock).toMatch(/else if \(key === "habits"\) \{/)
    expect(fnBlock).toMatch(/getAllHabits\(\)\.forEach\(\(h\) => deleteHabit\(h\.id\)\);/)
  })

  it('the getAllHabits/deleteHabit import is still present (still used by the per-item flow)', () => {
    expect(SRC).toMatch(/import \{ getAllHabits, deleteHabit \} from "@\/lib\/habitsStore";/)
  })
})

describe('re-authentication, MFA, confirmation, and error-handling behavior are unchanged', () => {
  it('reauthenticate() and MFA challenge handling are still wired in handleConfirmAccount', () => {
    expect(SRC).toMatch(/await reauthenticate\(user, reauthPassword \|\| undefined\);/)
    expect(SRC).toMatch(/if \(err instanceof MFARequiredError\)/)
  })

  it('the permission-denied and generic Firestore/account-deletion error messages are unchanged', () => {
    const fnBlock = block('async function performDeletion()')
    expect(fnBlock).toMatch(/code === "permission-denied"/)
    expect(fnBlock).toMatch(/Andmete kustutamine ebaõnnestus\. Konto ei ole kustutatud\./)
    expect(fnBlock).toMatch(/Konto kustutamine ebaõnnestus\. Võta ühendust toega\./)
  })
})
