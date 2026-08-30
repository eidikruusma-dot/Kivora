/**
 * EPostPage.tsx's Primary email card packed the email address and its
 * verification badge into one non-wrapping horizontal row
 * (`flex items-center justify-between gap-4`). On narrow phones, the
 * flex-shrink-0 badge (green "E-post kinnitatud" / "Email verified", or
 * amber "not verified") got pushed beyond the right edge of the card —
 * confirmed on a real phone, and reproduced with a real Chromium render of
 * the compiled Tailwind output at 320px: the badge was cut off entirely by
 * the card's own overflow-hidden.
 *
 * Fix: the row now stacks vertically on mobile (`flex flex-col
 * items-start gap-3`) — email block above, badge below, both left-aligned
 * at their natural width so the badge never stretches or gets pushed off —
 * and reverts to the original horizontal layout at sm: and up
 * (`sm:flex-row sm:items-center sm:justify-between sm:gap-4`). No other
 * markup, verified/unverified logic, resend-verification handling,
 * Firebase calls, or translations changed.
 *
 * Re-verified visually after the fix: at 320/360/390px the badge (both
 * verified and not-verified variants) stays fully inside the card on its
 * own row below the email, with no document-level horizontal overflow; at
 * 1024px (desktop) the original single-row layout renders exactly as
 * before.
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the pattern used throughout this session's other Settings/
 * Calendar/Habits mobile fixes.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/epostPagePrimaryBadgeOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/EPostPage.tsx'),
  'utf8',
)

function primaryEmailRowBlock(): string {
  return SRC.match(/\{\/\* ── 1\. Primary email ── \*\/\}[\s\S]*?<\/SectionCard>/)?.[0] ?? ''
}

describe('mobile layout cannot push the badge outside the card', () => {
  it('the row is flex-col with items-start on mobile (no more single non-wrapping row)', () => {
    const block = primaryEmailRowBlock()
    expect(block).not.toBe('')
    expect(block).toMatch(/<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">/)
    expect(block).not.toMatch(/<div className="flex items-center justify-between gap-4">/)
  })

  it('both badge spans keep flex-shrink-0 so they never get compressed or stretched full-width', () => {
    const block = primaryEmailRowBlock()
    const badges = block.match(/flex-shrink-0/g) ?? []
    expect(badges.length).toBe(2) // verified span + not-verified span
  })
})

describe('desktop layout remains horizontal', () => {
  it('sm:flex-row sm:items-center sm:justify-between restores the original desktop row', () => {
    const block = primaryEmailRowBlock()
    expect(block).toMatch(/sm:flex-row sm:items-center sm:justify-between sm:gap-4/)
  })
})

describe('both verified and not-verified badges remain intact', () => {
  it('the verified badge (green, CheckCircle2, emailSettings.verif.verified) is unchanged', () => {
    const block = primaryEmailRowBlock()
    expect(block).toMatch(/bg-green-50 border border-green-200 text-xs font-medium text-green-700/)
    expect(block).toMatch(/<CheckCircle2 size=\{13\} \/>/)
    expect(block).toMatch(/t\('emailSettings\.verif\.verified', lang\)/)
  })

  it('the not-verified badge (amber, AlertCircle, emailSettings.verif.notVerified) is unchanged', () => {
    const block = primaryEmailRowBlock()
    expect(block).toMatch(/bg-amber-50 border border-amber-200 text-xs font-medium text-amber-600/)
    expect(block).toMatch(/<AlertCircle size=\{13\} \/>/)
    expect(block).toMatch(/t\('emailSettings\.verif\.notVerified', lang\)/)
  })

  it('the email address and its label are still rendered, unchanged', () => {
    const block = primaryEmailRowBlock()
    expect(block).toMatch(/\{user\?\.email\}/)
    expect(block).toMatch(/t\('emailSettings\.primary\.address', lang\)/)
  })
})

describe('unrelated email settings behavior is untouched', () => {
  it('resend verification still calls sendEmailVerification via Firebase auth, unchanged', () => {
    expect(SRC).toMatch(/const handleResendVerification = async \(\) => \{/)
    expect(SRC).toMatch(/await sendEmailVerification\(auth\.currentUser\)/)
  })

  it('the email verification status SectionCard (section 2) is untouched by this fix', () => {
    expect(SRC).toMatch(/\{\/\* ── 2\. Email verification status ── \*\/\}/)
    expect(SRC).toMatch(/<div className="flex items-center gap-2\.5">/)
    expect(SRC).toMatch(/<div className="flex items-center justify-between gap-4">/)
  })
})
