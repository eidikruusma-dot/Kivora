/**
 * Help & Support FAQ — help.faq.a3 still told users to manage sync at
 * "Settings → Synchronization" / "Seaded → Sünkroonimine" after that
 * Settings page was deleted (see the Synchronization-removal commit).
 * Fix: the answer now states the actual, always-automatic behavior
 * (signing into the same account keeps data in sync via Firestore) with
 * no settings-page reference at all. help.faq.q3 (the question) and every
 * other FAQ entry are untouched.
 *
 * AbiJaTugiPage.tsx itself is not touched by this fix — it only renders
 * whichever keys FAQ_ITEMS lists, generically, so this is a translations-
 * only change.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/helpFaqSyncAnswerCleanup.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

describe('help.faq.a3 no longer references the removed Synchronization settings page', () => {
  it('ET answer has no "Sünkroonimine" / settings-arrow reference', () => {
    const a3 = t('help.faq.a3', 'et')
    expect(a3).not.toMatch(/Sünkroonimine/)
    expect(a3).not.toMatch(/Seaded\s*→/)
  })

  it('EN answer has no "Synchronization" / settings-arrow reference', () => {
    const a3 = t('help.faq.a3', 'en')
    expect(a3).not.toMatch(/Synchronization/)
    expect(a3).not.toMatch(/Settings\s*→/)
  })

  it('ET answer now describes automatic sync via the same account, exactly as specified', () => {
    expect(t('help.faq.a3', 'et')).toBe(
      'Logi sisse sama Kivora kontoga igal seadmel. Kivora hoiab sinu andmed automaatselt sünkroonis kõigi seadmete vahel.',
    )
  })

  it('EN answer now describes automatic sync via the same account, exactly as specified', () => {
    expect(t('help.faq.a3', 'en')).toBe(
      'Sign in with the same Kivora account on each device. Kivora automatically keeps your data in sync across all your devices.',
    )
  })
})

describe('help.faq.q3 remains unchanged', () => {
  it('ET question text is untouched', () => {
    expect(t('help.faq.q3', 'et')).toBe('Kuidas sünkroonida andmeid mitme seadme vahel?')
  })
  it('EN question text is untouched', () => {
    expect(t('help.faq.q3', 'en')).toBe('How do I sync data across multiple devices?')
  })
})

describe('the five FAQ Q/A pairs remain present, in the same order', () => {
  const HELP_PAGE_SRC = readFileSync(
    resolve(process.cwd(), 'src/views/settings/AbiJaTugiPage.tsx'),
    'utf8',
  )

  it('FAQ_ITEMS still lists q1..q5 / a1..a5 in order, untouched by this fix', () => {
    const match = HELP_PAGE_SRC.match(/const FAQ_ITEMS:[\s\S]*?\] = \[([\s\S]*?)\]/)
    expect(match).not.toBeNull()
    const entries = [...match![1].matchAll(/qKey: '([^']+)', aKey: '([^']+)'/g)]
    expect(entries.map((m) => [m[1], m[2]])).toEqual([
      ['help.faq.q1', 'help.faq.a1'],
      ['help.faq.q2', 'help.faq.a2'],
      ['help.faq.q3', 'help.faq.a3'],
      ['help.faq.q4', 'help.faq.a4'],
      ['help.faq.q5', 'help.faq.a5'],
    ])
  })

  it('every other FAQ entry (q1/a1, q2/a2, q4/a4, q5/a5) is unaffected by this change', () => {
    expect(t('help.faq.q1', 'et')).not.toBe('')
    expect(t('help.faq.a1', 'et')).not.toBe('')
    expect(t('help.faq.q2', 'et')).toBe('Kuidas vahetada keelt?')
    expect(t('help.faq.a2', 'et')).toBe('Ava Seaded → Keel ja vali eesti või inglise keel. Keel vahetub kohe.')
    expect(t('help.faq.q4', 'et')).toBe('Kuidas eksportida oma andmeid?')
    expect(t('help.faq.q5', 'et')).toBe('Kuidas ühendust võtta kasutajatoega?')
  })
})
