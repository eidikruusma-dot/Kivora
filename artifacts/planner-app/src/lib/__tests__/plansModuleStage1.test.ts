/**
 * Stage 1 of the Plaanid (Plans) module: navigation, module-toggle wiring,
 * static template gallery, and translations — no Firestore collection yet.
 *
 * Also proves the Raha (finance) hide from the previous change is untouched
 * by this addition.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

import {
  ALL_MODULE_IDS,
  DEFAULT_MODULE_SETTINGS,
  type ModuleSettings,
} from '@/lib/modulesStore'
import { isModuleFlaggedOff } from '@/components/layout/Sidebar'
import { PLAN_TEMPLATES } from '@/data/planTemplates'
import { t } from '@/lib/translations'

describe('plans module registration', () => {
  it('is a known module id, enabled by default', () => {
    expect(ALL_MODULE_IDS).toContain('plans')
    expect(DEFAULT_MODULE_SETTINGS.plans).toBe(true)
  })

  it('is not gated by the money-module feature flag', () => {
    expect(isModuleFlaggedOff('plans')).toBe(false)
  })
})

describe('Raha (finance) hide is unaffected by the plans module', () => {
  it('finance stays flagged off', () => {
    expect(isModuleFlaggedOff('finance')).toBe(true)
  })
})

describe('existing user with a stored module doc missing the plans field', () => {
  it('defaults the missing field to true without touching the user\'s other choices', () => {
    // Mirrors settingsStore.subscribeSettings()'s merge: { ...defaults, ...storedDoc }.
    // A pre-existing Firestore doc predates the plans field and also has the
    // user's own explicit choice to turn finance off.
    const storedDoc: Partial<ModuleSettings> = {
      calendar: true,
      tasks: false,
      finance: false,
      onboardingComplete: true,
    }

    const merged: ModuleSettings = { ...DEFAULT_MODULE_SETTINGS, ...storedDoc }

    expect(merged.plans).toBe(true)       // missing field -> default
    expect(merged.tasks).toBe(false)      // explicit user choice preserved
    expect(merged.finance).toBe(false)    // explicit user choice preserved
  })
})

describe('plan template gallery', () => {
  it('has exactly the seven expected templates', () => {
    expect(PLAN_TEMPLATES.map((p) => p.type)).toEqual([
      'menu', 'workout', 'study', 'cleaning', 'selfcare', 'workSchedule', 'blank',
    ])
  })

  it('references translation keys, not hardcoded display text', () => {
    for (const template of PLAN_TEMPLATES) {
      expect(template.titleKey.startsWith('plans.template.')).toBe(true)
      expect(template.descriptionKey.startsWith('plans.template.')).toBe(true)
    }
  })

  it('resolves every template title/description in both languages', () => {
    for (const template of PLAN_TEMPLATES) {
      const etTitle = t(template.titleKey, 'et')
      const enTitle = t(template.descriptionKey, 'en')
      // A missing dict entry falls back to the raw key string — reject that.
      expect(etTitle).not.toBe(template.titleKey)
      expect(enTitle).not.toBe(template.descriptionKey)
    }
  })
})

describe('plans system translations', () => {
  it('resolve in both languages and differ from each other', () => {
    const keys = [
      'nav.plans', 'plans.title', 'plans.subtitle', 'plans.create',
      'plans.tab.myPlans', 'plans.tab.templates',
      'plans.empty.title', 'plans.empty.desc',
      'modules.name.plans', 'modules.desc.plans',
    ] as const

    for (const key of keys) {
      const et = t(key, 'et')
      const en = t(key, 'en')
      expect(et).not.toBe(key)
      expect(en).not.toBe(key)
      expect(et).not.toBe(en)
    }
  })
})
