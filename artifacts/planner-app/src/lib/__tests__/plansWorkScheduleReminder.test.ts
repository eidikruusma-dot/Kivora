/**
 * Work Schedule shift reminders (Plans → Work Schedule): a per-shift
 * `reminder` field (Off / Previous evening / 1 hour before / Both), added
 * via updatePlanItem()/addPlanItem() using the exact same optional-field
 * pattern date/startTime/endTime already use — no new persistence path, no
 * new Firestore collection.
 *
 * This mirrors plansWorkScheduleItemEdit.test.ts's harness (same fake
 * transactional Firestore) and adds coverage specifically for `reminder`:
 * persistence for each of the four values, 'off' being equivalent to the
 * field being absent (so every pre-existing shift, and a shift explicitly
 * turned back off, both behave identically), and that editing a shift's
 * date/time does not disturb its independently-set reminder choice.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansWorkScheduleReminder.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake transactional Firestore (same shape as plansWorkScheduleItemEdit.test.ts) ──

interface FakeDocEntry { version: number; data: unknown }
const fakeDb = new Map<string, FakeDocEntry>()

function planPath(uid: string, planId: string) {
  return `users/${uid}/plans/${planId}`
}

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

interface FakeTx {
  get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
  set: (ref: { path: string }, data: unknown) => void
}

const runTransactionMock = vi.fn(async (_db: unknown, updateFn: (tx: FakeTx) => Promise<void>) => {
  const MAX_ATTEMPTS = 10
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let readPath: string | null = null
    let readVersion = -1
    let pendingWrite: { path: string; data: unknown } | null = null

    const tx: FakeTx = {
      get: async (ref) => {
        const entry = fakeDb.get(ref.path)
        readPath = ref.path
        readVersion = entry ? entry.version : -1
        return { exists: () => entry !== undefined, data: () => entry?.data }
      },
      set: (ref, data) => {
        pendingWrite = { path: ref.path, data }
      },
    }

    await updateFn(tx)

    const current = readPath ? fakeDb.get(readPath) : undefined
    const currentVersion = current ? current.version : -1
    if (currentVersion === readVersion) {
      if (pendingWrite) {
        const write = pendingWrite as { path: string; data: unknown }
        fakeDb.set(write.path, { version: currentVersion + 1, data: write.data })
      }
      return
    }
  }
  throw new Error('TRANSACTION_RETRY_EXCEEDED')
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  runTransaction: (...args: Parameters<typeof runTransactionMock>) => runTransactionMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initPlansStore, addPlanItem, updatePlanItem, type Plan, type PlanItem } from '@/lib/plansStore'

function seedFakeDoc(uid: string, plan: Plan) {
  fakeDb.set(planPath(uid, plan.id), { version: 0, data: plan })
}

function readFakeDoc(uid: string, planId: string): Plan | undefined {
  return fakeDb.get(planPath(uid, planId))?.data as Plan | undefined
}

function makeShiftItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'shift-1',
    label: '09:00–17:00',
    done: false,
    date: '2026-09-01',
    startTime: '09:00',
    endTime: '17:00',
    ...overrides,
  }
}

function makeWorkSchedulePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'ws-plan-1',
    type: 'workSchedule',
    title: 'Töögraafik',
    color: '#0D9488',
    items: [makeShiftItem()],
    addShiftsToCalendar: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  initPlansStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  runTransactionMock.mockClear()
  initPlansStore('user-a')
})

// ── Persistence for each of the four reminder values ────────────────────────

describe('updatePlanItem persists each reminder choice', () => {
  it('eveningBefore', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())
    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'eveningBefore',
    })
    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBe('eveningBefore')
  })

  it('oneHourBefore', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())
    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'oneHourBefore',
    })
    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBe('oneHourBefore')
  })

  it('both', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())
    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'both',
    })
    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBe('both')
  })
})

// ── 'off' is equivalent to the field being absent ───────────────────────────

describe("'off' clears the field rather than storing the literal string", () => {
  it('setting reminder to off after it was something else removes the field entirely', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan({ items: [makeShiftItem({ reminder: 'both' })] }))

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'off',
    })

    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBeUndefined()
  })

  it('a brand-new shift added with reminder: off has no reminder field at all', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan({ items: [] }))

    await addPlanItem('ws-plan-1', '09:00–17:00', undefined, {
      date: '2026-09-08',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'off',
    })

    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBeUndefined()
  })

  it('an existing shift with no reminder field (every shift saved before this feature existed) is unaffected by an edit that never mentions it', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan()) // makeShiftItem() sets no reminder field

    await updatePlanItem('ws-plan-1', 'shift-1', { label: '09:00–17:00', note: 'Acme Ltd' })

    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBeUndefined()
  })
})

// ── addPlanItem persists a real reminder choice too ─────────────────────────

describe('addPlanItem persists a non-off reminder on a brand-new shift', () => {
  it('a newly added shift with reminder: both is saved with that choice', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan({ items: [] }))

    await addPlanItem('ws-plan-1', '09:00–17:00', undefined, {
      date: '2026-09-08',
      startTime: '09:00',
      endTime: '17:00',
      reminder: 'both',
    })

    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBe('both')
  })
})

// ── Editing date/time does not disturb an independently-set reminder ───────

describe("editing a shift's date/time preserves its own reminder setting", () => {
  it('changing only the date/time via a patch that also repeats the same reminder keeps it intact', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan({ items: [makeShiftItem({ reminder: 'oneHourBefore' })] }))

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '10:00–18:00',
      date: '2026-09-10',
      startTime: '10:00',
      endTime: '18:00',
      reminder: 'oneHourBefore',
    })

    const item = readFakeDoc('user-a', 'ws-plan-1')!.items[0]
    expect(item.date).toBe('2026-09-10')
    expect(item.startTime).toBe('10:00')
    expect(item.reminder).toBe('oneHourBefore')
  })

  it('a patch that omits reminder entirely leaves the previously-set reminder untouched', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan({ items: [makeShiftItem({ reminder: 'eveningBefore' })] }))

    // Non-Work-Schedule-shaped call: only label/note, exactly what a caller
    // that knows nothing about the reminder field would send.
    await updatePlanItem('ws-plan-1', 'shift-1', { label: '09:00–17:00', note: 'updated note' })

    expect(readFakeDoc('user-a', 'ws-plan-1')!.items[0].reminder).toBe('eveningBefore')
  })
})

// ── Ordinary (non-Work-Schedule) items are never given a reminder field ────

describe('ordinary Plan items are unaffected — reminder is never set for them', () => {
  it('addPlanItem without the 4th argument never sets a reminder field', async () => {
    const plainPlan: Plan = {
      id: 'blank-plan-1',
      type: 'blank',
      title: 'Plaan',
      color: '#6F5AE8',
      items: [],
      createdAt: 1,
      updatedAt: 1,
    }
    seedFakeDoc('user-a', plainPlan)

    await addPlanItem('blank-plan-1', 'New task', 'a note')

    expect(readFakeDoc('user-a', 'blank-plan-1')!.items[0].reminder).toBeUndefined()
  })
})

// ── Component wiring: PlanDetailPage exposes the reminder selector ─────────

const PLAN_DETAIL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlanDetailPage.tsx'), 'utf8')

describe('PlanDetailPage wiring: the reminder selector is passed through on both add and edit', () => {
  it('the edit branch passes reminder: editReminder to updatePlanItem', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/reminder: editReminder,/)
  })

  it('the add branch passes reminder: newItemReminder to addPlanItem', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/reminder: newItemReminder,/)
  })

  it('both selectors offer exactly the four required options', () => {
    const optionValues = ['off', 'eveningBefore', 'oneHourBefore', 'both']
    for (const value of optionValues) {
      expect(PLAN_DETAIL_PAGE_SRC).toMatch(new RegExp(`<option value="${value}">`))
    }
  })

  it('the non-Work-Schedule branches are untouched — no reminder field involved', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/await updatePlanItem\(plan\.id, id, \{ label: editLabel, note: editNote \}\)/)
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/await addPlanItem\(plan\.id, newItemLabel, newItemNote\)/)
  })
})

describe('WorkScheduleFormModal.tsx is untouched by this change (explicit V1 scope decision)', () => {
  const SRC = readFileSync(resolve(process.cwd(), 'src/components/plans/WorkScheduleFormModal.tsx'), 'utf8')

  it('has no reminder selector — the whole-schedule creation form is out of scope for V1', () => {
    expect(SRC).not.toMatch(/reminder/i)
  })
})
