/**
 * checkAutomaticDeletionAvailability() blocked automatic account deletion
 * from leaving personal data behind (calendars, documents + profile
 * photo Storage, and feedbackSubmissions/supportMessages) while the
 * underlying gaps are still open. This file covers two things:
 *
 *  1. The capability check itself (direct unit tests — no mocking of the
 *     consuming UI needed).
 *  2. That AndmeteKustutaminePage.tsx actually WIRES this check in, in
 *     front of every destructive step — via structural source-scan
 *     assertions, the same style already used by this repo's other
 *     Settings-page tests (no React rendering harness exists here; see
 *     andmeteKustutaminePageRedundantHabitLoopRemoved.test.ts's own doc
 *     comment for the same note). This directly verifies the invariant
 *     asked for: a blocked or failed deletion attempt can never reach
 *     deleteUser() — the user's Firebase Auth account is never removed
 *     unless deleteAllUserData() has already fully succeeded, which in
 *     turn can only be attempted once checkAutomaticDeletionAvailability()
 *     reports available: true.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/accountDeletionAvailabilityGate.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

describe('checkAutomaticDeletionAvailability() — real featureFlags (today\'s actual state)', () => {
  it('reports unavailable, with all three known reasons', async () => {
    const { checkAutomaticDeletionAvailability } = await import('@/lib/accountDeletionService')
    const result = checkAutomaticDeletionAvailability()
    expect(result.available).toBe(false)
    expect(result.blockedReasons).toEqual(
      expect.arrayContaining(['calendars', 'documents-and-profile-photo', 'feedback-and-support-messages']),
    )
    expect(result.blockedReasons).toHaveLength(3)
  })
})

describe('checkAutomaticDeletionAvailability() — flags mocked to isolate each condition', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('is only available once ALL THREE flags are true', async () => {
    vi.doMock('@/lib/featureFlags', () => ({
      ACCOUNT_DELETION_CALENDARS_ENABLED: true,
      ACCOUNT_DELETION_STORAGE_ENABLED: true,
      ACCOUNT_DELETION_FEEDBACK_SUPPORT_ENABLED: true,
      MONEY_MODULE_ENABLED: false,
    }))
    const { checkAutomaticDeletionAvailability } = await import('@/lib/accountDeletionService')
    expect(checkAutomaticDeletionAvailability()).toEqual({ available: true, blockedReasons: [] })
    vi.doUnmock('@/lib/featureFlags')
  })

  it('having two of three flags true is still NOT available', async () => {
    vi.doMock('@/lib/featureFlags', () => ({
      ACCOUNT_DELETION_CALENDARS_ENABLED: true,
      ACCOUNT_DELETION_STORAGE_ENABLED: true,
      ACCOUNT_DELETION_FEEDBACK_SUPPORT_ENABLED: false,
      MONEY_MODULE_ENABLED: false,
    }))
    const { checkAutomaticDeletionAvailability } = await import('@/lib/accountDeletionService')
    const result = checkAutomaticDeletionAvailability()
    expect(result.available).toBe(false)
    expect(result.blockedReasons).toEqual(['feedback-and-support-messages'])
    vi.doUnmock('@/lib/featureFlags')
  })
})

describe('AndmeteKustutaminePage.tsx wires the availability check in front of every destructive step', () => {
  const SRC = readFileSync(
    resolve(process.cwd(), 'src/views/settings/AndmeteKustutaminePage.tsx'),
    'utf8',
  )

  it('imports checkAutomaticDeletionAvailability from accountDeletionService', () => {
    expect(SRC).toMatch(/import\s*\{[\s\S]*checkAutomaticDeletionAvailability[\s\S]*\}\s*from\s*["']@\/lib\/accountDeletionService["']/)
  })

  it('computes automaticDeletionAvailable from the real check (not hardcoded true)', () => {
    expect(SRC).toMatch(/automaticDeletionAvailable\s*=\s*checkAutomaticDeletionAvailability\(\)\.available/)
  })

  it('the destructive flow (type-to-confirm input, reauth, MFA) is only rendered when automaticDeletionAvailable is true', () => {
    // The whole interactive block is wrapped: !automaticDeletionAvailable ? <Notice/> : ( <>...destructive flow...</> )
    const ternaryIdx = SRC.indexOf('{!automaticDeletionAvailable ? (')
    const noticeIdx = SRC.indexOf('<AccountDeletionUnavailableNotice lang={lang} />')
    const handleRequestBtnIdx = SRC.indexOf('onClick={handleRequestAccount}')
    expect(ternaryIdx).toBeGreaterThan(-1)
    expect(noticeIdx).toBeGreaterThan(ternaryIdx)
    // The button that starts the destructive flow must appear AFTER the
    // gate, i.e. only reachable inside the "available" branch.
    expect(handleRequestBtnIdx).toBeGreaterThan(noticeIdx)
  })

  it('performDeletion() checks availability BEFORE calling deleteAllUserData() or deleteUser(), and returns without touching either when unavailable', () => {
    const fnStart = SRC.indexOf('async function performDeletion()')
    const fnBlock = SRC.slice(fnStart, SRC.indexOf('\n  async function handleConfirmAccount', fnStart))
    expect(fnBlock.length).toBeGreaterThan(0)

    const guardIdx = fnBlock.indexOf('checkAutomaticDeletionAvailability().available')
    const returnAfterGuardIdx = fnBlock.indexOf('return;', guardIdx)
    const deleteAllIdx = fnBlock.indexOf('await deleteAllUserData(')
    const deleteUserIdx = fnBlock.indexOf('await deleteUser(')

    expect(guardIdx).toBeGreaterThan(-1)
    expect(returnAfterGuardIdx).toBeGreaterThan(guardIdx)
    // The early return for the unavailable case comes before either
    // destructive call — so neither can execute when blocked.
    expect(deleteAllIdx).toBeGreaterThan(returnAfterGuardIdx)
    expect(deleteUserIdx).toBeGreaterThan(deleteAllIdx)
  })

  it('deleteUser() is still only ever called after deleteAllUserData() in the source (pre-existing invariant, unchanged)', () => {
    const dataIdx = SRC.indexOf('await deleteAllUserData(user.uid);')
    const userIdx = SRC.indexOf('await deleteUser(user);')
    expect(dataIdx).toBeGreaterThan(-1)
    expect(userIdx).toBeGreaterThan(dataIdx)
  })

  it('the unavailable notice links to the real, working help/support page (not a dead or fake button)', () => {
    expect(SRC).toMatch(/navigate\(["']\/app\/help["']\)/)
  })

  it('AccountDeletionUnavailableNotice never calls deleteAllUserData or deleteUser itself', () => {
    const start = SRC.indexOf('function AccountDeletionUnavailableNotice')
    const end = SRC.indexOf('\nfunction ', start + 1)
    const block = SRC.slice(start, end === -1 ? undefined : end)
    expect(block).not.toMatch(/deleteAllUserData|deleteUser\(/)
  })
})
