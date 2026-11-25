/**
 * Settings → Modules: "Restart the getting-to-know-you conversation" entry
 * point for an already-onboarded user to voluntarily re-run the AI
 * onboarding chat (ModulesPage.tsx).
 *
 * No React rendering harness exists for ModulesPage.tsx in this repo
 * (useAuth/useModules/useNavigate all need real app context) — verified
 * via structural source assertions and direct translation-key assertions,
 * the same pattern already used for SettingsPage.tsx's other tests (see
 * settingsUsageCardRemoved.test.ts).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/modulesPageRestartOnboarding.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const MODULES_PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/ModulesPage.tsx'),
  'utf8',
)

describe('ModulesPage: restart-onboarding entry point', () => {
  it('imports clearOnboardingConversation and navigates to /onboarding/chat on confirm', () => {
    expect(MODULES_PAGE_SRC).toMatch(/import\s*\{\s*clearOnboardingConversation\s*\}\s*from\s*'@\/lib\/onboardingConversationStore'/)
    expect(MODULES_PAGE_SRC).toMatch(/clearOnboardingConversation\(user\.uid\)/)
    expect(MODULES_PAGE_SRC).toMatch(/navigate\('\/onboarding\/chat'\)/)
  })

  it('requires a confirmation step before restarting — a second piece of state gates the actual action', () => {
    expect(MODULES_PAGE_SRC).toMatch(/confirmRestartOnboarding/)
    // Two distinct call sites: one that only sets the confirm flag, one
    // (handleRestartOnboarding) that actually clears/navigates.
    const setConfirmTrue = MODULES_PAGE_SRC.match(/setConfirmRestartOnboarding\(true\)/g) ?? []
    const setConfirmFalse = MODULES_PAGE_SRC.match(/setConfirmRestartOnboarding\(false\)/g) ?? []
    expect(setConfirmTrue.length).toBeGreaterThanOrEqual(1)
    expect(setConfirmFalse.length).toBeGreaterThanOrEqual(1)
  })

  it('handleRestartOnboarding never touches module settings or Firestore — only the local onboarding draft', () => {
    const match = MODULES_PAGE_SRC.match(/function handleRestartOnboarding\(\)\s*\{([\s\S]*?)\n  \}/)
    expect(match).not.toBeNull()
    const body = match?.[1] ?? ''
    expect(body).not.toMatch(/saveModuleSettings/)
    expect(body).not.toMatch(/setModuleSettingsState/)
    expect(body).toMatch(/clearOnboardingConversation/)
    expect(body).toMatch(/navigate/)
  })

  it('bails out without clearing or navigating when there is no signed-in user', () => {
    const match = MODULES_PAGE_SRC.match(/function handleRestartOnboarding\(\)\s*\{([\s\S]*?)\n  \}/)
    const body = match?.[1] ?? ''
    expect(body).toMatch(/if\s*\(\s*!user\s*\)\s*return/)
  })

  it('the daily AI quota is never touched by this feature — no quota-related call anywhere in the restart flow', () => {
    expect(MODULES_PAGE_SRC).not.toMatch(/[Qq]uota/)
  })
})

describe('modules.restartOnboarding / modules.restartOnboardingDesc translations', () => {
  it('both keys resolve to non-empty, distinct text in Estonian and English', () => {
    const etTitle = t('modules.restartOnboarding', 'et')
    const etDesc = t('modules.restartOnboardingDesc', 'et')
    const enTitle = t('modules.restartOnboarding', 'en')
    const enDesc = t('modules.restartOnboardingDesc', 'en')

    for (const value of [etTitle, etDesc, enTitle, enDesc]) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
    expect(etTitle).not.toBe(enTitle)
    expect(etDesc).not.toBe(enDesc)
  })
})
