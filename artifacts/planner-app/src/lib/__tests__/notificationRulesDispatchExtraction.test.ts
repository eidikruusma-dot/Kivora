// @vitest-environment jsdom
/**
 * Phase 0 of the V1 reminder architecture: the decision logic
 * notificationItemsStore.dispatch() already applied inline (quiet hours,
 * module toggle, same-day dedup, in-app channel) was extracted into a
 * pure module (notificationRules.ts) with no Firebase/DOM imports, so it
 * can be reused by a future server-side reminder job. dispatch() itself
 * was repointed to call the extracted `shouldDispatch()`.
 *
 * This is a pure extraction — no behavior change. This file proves that
 * in two layers:
 *   1. Unit tests on the extracted pure functions themselves, covering
 *      every branch the old inline code had (including the subtle
 *      "unknown module falls through as allowed" case).
 *   2. An integration test exercising the real, repointed dispatch()
 *      against a mocked Firestore/push layer, proving the end-to-end
 *      gating behavior is unchanged.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/notificationRulesDispatchExtraction.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NotificationSettings } from '@/lib/notificationsStore'
import {
  isInQuietHours,
  isModuleEnabled,
  hasDuplicateOnDay,
  shouldDispatch,
  type DedupCandidate,
} from '@/lib/notificationRules'

function baseSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    modules: {
      tasks: true,
      calendar: true,
      habits: true,
      goals: true,
      school: true,
      assistant: false,
      security: true,
    },
    inApp: true,
    systemNotifications: false,
    defaultReminder: '15min',
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '08:00',
    ...overrides,
  }
}

// ── 1. isInQuietHours ────────────────────────────────────────────────────────

describe('isInQuietHours', () => {
  it('returns false when quiet hours are disabled, regardless of time', () => {
    const settings = baseSettings({ quietHoursEnabled: false })
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 23, 0))).toBe(false)
  })

  it('normal (non-overnight) window: inside is true, outside is false', () => {
    const settings = baseSettings({ quietHoursEnabled: true, quietStart: '09:00', quietEnd: '17:00' })
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 12, 0))).toBe(true)
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 8, 0))).toBe(false)
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 17, 0))).toBe(false) // end exclusive
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 9, 0))).toBe(true) // start inclusive
  })

  it('overnight window (e.g. 22:00–08:00): wraps past midnight', () => {
    const settings = baseSettings({ quietHoursEnabled: true, quietStart: '22:00', quietEnd: '08:00' })
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 23, 0))).toBe(true)
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 3, 0))).toBe(true)
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 12, 0))).toBe(false)
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 8, 0))).toBe(false) // end exclusive
    expect(isInQuietHours(settings, new Date(2026, 0, 1, 22, 0))).toBe(true) // start inclusive
  })

  it('defaults `now` to the current time when omitted', () => {
    const settings = baseSettings({ quietHoursEnabled: false })
    expect(() => isInQuietHours(settings)).not.toThrow()
  })
})

// ── 2. isModuleEnabled ───────────────────────────────────────────────────────

describe('isModuleEnabled', () => {
  it('"system" is always enabled, regardless of settings', () => {
    const settings = baseSettings({ modules: { ...baseSettings().modules, security: false } })
    expect(isModuleEnabled(settings, 'system')).toBe(true)
  })

  it('a known module reflects its toggle value', () => {
    const settings = baseSettings()
    expect(isModuleEnabled(settings, 'tasks')).toBe(true)
    expect(isModuleEnabled(settings, 'assistant')).toBe(false)
  })

  it('a module name not present in settings.modules falls through as enabled (matches prior inline behavior)', () => {
    const settings = baseSettings()
    expect(isModuleEnabled(settings, 'some-future-module')).toBe(true)
  })
})

// ── 3. hasDuplicateOnDay ─────────────────────────────────────────────────────

describe('hasDuplicateOnDay', () => {
  const now = new Date(2026, 5, 15, 10, 0)

  it('true when an item of the same type exists with a createdAt on the same calendar day', () => {
    const items: DedupCandidate[] = [{ type: 'task-due-1', createdAt: new Date(2026, 5, 15, 2, 0).getTime() }]
    expect(hasDuplicateOnDay(items, 'task-due-1', now)).toBe(true)
  })

  it('false when the same type exists but on a different day', () => {
    const items: DedupCandidate[] = [{ type: 'task-due-1', createdAt: new Date(2026, 5, 14, 23, 59).getTime() }]
    expect(hasDuplicateOnDay(items, 'task-due-1', now)).toBe(false)
  })

  it('false when only a different type exists on the same day', () => {
    const items: DedupCandidate[] = [{ type: 'task-due-2', createdAt: now.getTime() }]
    expect(hasDuplicateOnDay(items, 'task-due-1', now)).toBe(false)
  })
})

// ── 4. shouldDispatch — the combined gate ───────────────────────────────────

describe('shouldDispatch', () => {
  const now = new Date(2026, 5, 15, 10, 0)
  const candidate = { type: 'task-due-1', module: 'tasks' }

  it('blocks when inApp is off', () => {
    const settings = baseSettings({ inApp: false })
    expect(shouldDispatch(settings, [], candidate, now)).toBe(false)
  })

  it('blocks during quiet hours', () => {
    const settings = baseSettings({ quietHoursEnabled: true, quietStart: '09:00', quietEnd: '17:00' })
    expect(shouldDispatch(settings, [], candidate, now)).toBe(false)
  })

  it('blocks when the module toggle is off', () => {
    const settings = baseSettings({ modules: { ...baseSettings().modules, tasks: false } })
    expect(shouldDispatch(settings, [], candidate, now)).toBe(false)
  })

  it('blocks a same-type, same-day duplicate', () => {
    const settings = baseSettings()
    const items: DedupCandidate[] = [{ type: candidate.type, createdAt: now.getTime() }]
    expect(shouldDispatch(settings, items, candidate, now)).toBe(false)
  })

  it('allows through when every gate passes', () => {
    const settings = baseSettings()
    expect(shouldDispatch(settings, [], candidate, now)).toBe(true)
  })
})

// ── 5. Integration: the real, repointed dispatch() behaves identically ─────

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/pushNotifications', () => ({ notifyOtherDevices: vi.fn(() => Promise.resolve()) }))

const setDocMock = vi.fn(() => Promise.resolve())
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}))

const settingsRef: { current: NotificationSettings } = { current: baseSettings() }
vi.mock('@/lib/notificationsStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notificationsStore')>('@/lib/notificationsStore')
  return {
    ...actual,
    getLocalNotificationSettings: () => settingsRef.current,
  }
})

import { initNotificationItemsStore, dispatch } from '@/lib/notificationItemsStore'
import { notifyOtherDevices } from '@/lib/pushNotifications'

function makeItem(type: string, module: 'tasks' | 'habits' | 'goals' = 'tasks') {
  return {
    type,
    module,
    title: 'Title',
    description: 'Desc',
    timeLabel: 'Today',
    read: false,
    icon: 'check' as const,
    accent: '#000',
  }
}

beforeEach(() => {
  settingsRef.current = baseSettings()
  setDocMock.mockClear()
  vi.mocked(notifyOtherDevices).mockClear()
  initNotificationItemsStore(null)
  initNotificationItemsStore('user-a')
})

describe('dispatch() end-to-end, after repointing to the extracted rules', () => {
  it('inApp off blocks dispatch — no Firestore write, no push', () => {
    settingsRef.current = baseSettings({ inApp: false })
    expect(dispatch(makeItem('task-due-1'))).toBe(false)
    expect(setDocMock).not.toHaveBeenCalled()
    expect(notifyOtherDevices).not.toHaveBeenCalled()
  })

  it('quiet hours blocks dispatch', () => {
    settingsRef.current = baseSettings({ quietHoursEnabled: true, quietStart: '00:00', quietEnd: '23:59' })
    expect(dispatch(makeItem('task-due-1'))).toBe(false)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('a disabled module blocks dispatch', () => {
    settingsRef.current = baseSettings({ modules: { ...baseSettings().modules, habits: false } })
    expect(dispatch(makeItem('habit-reminder', 'habits'))).toBe(false)
  })

  it('a same-day duplicate type is blocked on the second call', () => {
    expect(dispatch(makeItem('task-due-1'))).toBe(true)
    expect(dispatch(makeItem('task-due-1'))).toBe(false)
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('a normal call succeeds: persists to Firestore and pushes to other devices', () => {
    expect(dispatch(makeItem('task-due-1'))).toBe(true)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(notifyOtherDevices).toHaveBeenCalledTimes(1)
  })
})
