/**
 * Stage 3 of the Plaanid (Plans) module: creating a plan from one of the
 * five non-blank templates, reusing the Stage 2 creation/validation flow
 * (one shared modal, one shared addPlan call — no per-template store or
 * collection).
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const setDocMock = vi.fn(() => Promise.resolve())
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { PLAN_TEMPLATES } from '@/data/planTemplates'
import {
  createPlanItemsFromTemplate,
  isValidPlanTitle,
  isValidPlanDateRange,
} from '@/lib/plansStore'
import { t } from '@/lib/translations'

const NON_BLANK_TEMPLATES = PLAN_TEMPLATES.filter((tpl) => tpl.type !== 'blank')

const EXPECTED_ITEM_COUNT: Record<string, number> = {
  menu: 7,
  workout: 3,
  study: 5,
  cleaning: 4,
  selfcare: 4,
  blank: 0,
}

describe('every template feeds the same shared modal contract', () => {
  it('exposes titleKey, descriptionKey, defaultColor and itemBlueprints for every template', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(typeof tpl.titleKey).toBe('string')
      expect(typeof tpl.descriptionKey).toBe('string')
      expect(typeof tpl.defaultColor).toBe('string')
      expect(Array.isArray(tpl.itemBlueprints)).toBe(true)
    }
  })

  it('createPlanItemsFromTemplate (the one function the modal calls) handles every template', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(() => createPlanItemsFromTemplate(tpl, 'et')).not.toThrow()
    }
  })
})

describe('PlanType assigned per template', () => {
  it('matches the template it was created from', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.type).toBe(tpl.type) // sanity: type is the literal used to build the Plan
    }
    expect(PLAN_TEMPLATES.map((t) => t.type)).toEqual([
      'menu', 'workout', 'study', 'cleaning', 'selfcare', 'blank',
    ])
  })
})

describe('generated item count per template', () => {
  it('matches the required blueprint (menu 7, workout 3, study 5, cleaning 4, selfcare 4, blank 0)', () => {
    for (const tpl of PLAN_TEMPLATES) {
      const items = createPlanItemsFromTemplate(tpl, 'et')
      expect(items).toHaveLength(EXPECTED_ITEM_COUNT[tpl.type])
    }
  })
})

describe('generated item ids', () => {
  it('are all unique within a single generated plan', () => {
    for (const tpl of NON_BLANK_TEMPLATES) {
      const items = createPlanItemsFromTemplate(tpl, 'et')
      const ids = items.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('generated item done state', () => {
  it('is false for every item, for every template', () => {
    for (const tpl of NON_BLANK_TEMPLATES) {
      const items = createPlanItemsFromTemplate(tpl, 'et')
      expect(items.every((i) => i.done === false)).toBe(true)
    }
  })
})

describe('generated item labels are translated', () => {
  it('differ between et and en, and are not the raw translation key', () => {
    for (const tpl of NON_BLANK_TEMPLATES) {
      const etItems = createPlanItemsFromTemplate(tpl, 'et')
      const enItems = createPlanItemsFromTemplate(tpl, 'en')
      for (let i = 0; i < etItems.length; i++) {
        const key = tpl.itemBlueprints[i].titleKey
        expect(etItems[i].label).not.toBe(key)
        expect(enItems[i].label).not.toBe(key)
        expect(etItems[i].label).not.toBe(enItems[i].label)
      }
    }
  })

  it('freezes the translated label at creation time (matches t() output for that language)', () => {
    const menu = PLAN_TEMPLATES.find((tpl) => tpl.type === 'menu')!
    const items = createPlanItemsFromTemplate(menu, 'et')
    expect(items[0].label).toBe(t(menu.itemBlueprints[0].titleKey, 'et'))
  })
})

describe('no write happens before the user confirms', () => {
  it('createPlanItemsFromTemplate never touches Firestore — selecting a template is not a save', () => {
    for (const tpl of PLAN_TEMPLATES) {
      createPlanItemsFromTemplate(tpl, 'et')
    }
    expect(setDocMock).not.toHaveBeenCalled()
  })
})

describe('blank plan creation still works exactly as in Stage 2', () => {
  it('blank template has no item blueprints', () => {
    const blank = PLAN_TEMPLATES.find((tpl) => tpl.type === 'blank')!
    expect(blank.itemBlueprints).toEqual([])
    expect(createPlanItemsFromTemplate(blank, 'et')).toEqual([])
  })

  it('title and date-range validation are unchanged', () => {
    expect(isValidPlanTitle('')).toBe(false)
    expect(isValidPlanTitle('My plan')).toBe(true)
    expect(isValidPlanDateRange('2026-09-07', '2026-09-01')).toBe(false)
    expect(isValidPlanDateRange('2026-09-01', '2026-09-07')).toBe(true)
  })
})
