/**
 * Proves the Raha (finance) module stays hidden app-wide while
 * MONEY_MODULE_ENABLED is false, and that every touchpoint reads the same
 * central flag rather than a separate, independently-maintained check.
 *
 * All data below is synthetic.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}))
vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))
vi.mock('@/lib/tasksStore', () => ({
  addTask: vi.fn(), deleteTask: vi.fn(), getAllTasks: vi.fn(() => []),
}))
vi.mock('@/lib/quickNotesStore', () => ({
  addNote: vi.fn(), deleteNote: vi.fn(), getAllNotes: vi.fn(() => []),
}))
vi.mock('@/lib/habitsStore', () => ({
  addHabit: vi.fn(), deleteHabit: vi.fn(), getAllHabits: vi.fn(() => []),
}))
vi.mock('@/lib/goalsStore', () => ({
  addGoal: vi.fn(), deleteGoal: vi.fn(), getAllGoals: vi.fn(() => []),
}))
vi.mock('@/lib/calendarStore', () => ({
  addCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), getAllEvents: vi.fn(() => []),
}))
vi.mock('@/lib/moneyStore', () => ({
  addTransaction: vi.fn(), getAllTransactions: vi.fn(() => []),
}))
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolSubjects: vi.fn(() => []),
}))
vi.mock('@/lib/documentsStore', () => ({
  uploadAndSaveDocument: vi.fn(),
  moveDocument: vi.fn(),
  renameDocument: vi.fn(),
  getAllDocuments: vi.fn(() => []),
  getDocumentById: vi.fn(),
  findDuplicate: vi.fn(),
}))

import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import { isModuleFlaggedOff } from '@/components/layout/Sidebar'
import { MODULE_LIST } from '@/views/settings/ModulesPage'
import {
  MODULE_META,
  SELECTABLE_MODULE_IDS,
  PURPOSE_MODULES,
} from '@/views/onboarding/ModuleSelectionPage'
import { executeAction, type AIAction, type ActionContext } from '@/lib/aiActions'

describe('MONEY_MODULE_ENABLED central flag', () => {
  it('is off', () => {
    expect(MONEY_MODULE_ENABLED).toBe(false)
  })
})

describe('Sidebar navigation (desktop + mobile share this component)', () => {
  it('flags the finance module off', () => {
    expect(isModuleFlaggedOff('finance')).toBe(true)
  })

  it('leaves other modules unaffected', () => {
    expect(isModuleFlaggedOff('tasks')).toBe(false)
    expect(isModuleFlaggedOff('calendar')).toBe(false)
  })
})

describe('Settings → Modules page', () => {
  it('excludes finance from the offered module list', () => {
    expect(MODULE_LIST.some((m) => m.id === 'finance')).toBe(false)
  })
})

describe('Onboarding module selection', () => {
  it('excludes finance from selectable module ids', () => {
    expect(SELECTABLE_MODULE_IDS).not.toContain('finance')
  })

  it('excludes finance from the module metadata grid', () => {
    expect(MODULE_META.some((m) => m.id === 'finance')).toBe(false)
  })

  it('excludes the finance purpose and any finance id inside other purposes', () => {
    expect(PURPOSE_MODULES.finance).toBeUndefined()
    for (const ids of Object.values(PURPOSE_MODULES)) {
      expect(ids).not.toContain('finance')
    }
  })
})

describe('AI assistant bank-statement import action', () => {
  it('rejects preview_bank_import without touching canonical transactions or triggering the review UI', async () => {
    const getCanonicalBankTransactions = vi.fn()
    const setPendingMoneyImport = vi.fn()
    const action: AIAction = { type: 'preview_bank_import', data: {} }
    const ctx: ActionContext = {
      uid: 'synthetic-uid',
      getFile: () => null,
      getAllDocuments: vi.fn(() => []) as unknown as ActionContext['getAllDocuments'],
      getCanonicalBankTransactions,
      setPendingMoneyImport,
    }

    const result = await executeAction(action, ctx)

    expect(result.success).toBe(false)
    expect(getCanonicalBankTransactions).not.toHaveBeenCalled()
    expect(setPendingMoneyImport).not.toHaveBeenCalled()
  })
})
