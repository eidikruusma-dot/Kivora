/**
 * Editing an existing Work Schedule shift item — previously
 * PlanDetailPage's edit form only let a user change label/note, so a shift's
 * date could never be corrected once created (only start/end time, via the
 * label text, and even that wasn't a real date/time field).
 *
 * Fix: updatePlanItem() (plansStore.ts) gained three new OPTIONAL patch
 * fields — date/startTime/endTime — layered onto the exact same
 * mutatePlanItems() transaction every other item mutation already goes
 * through. No data model change: PlanItem already carried date/startTime/
 * endTime (added when the Work Schedule template shipped). Passing none of
 * the three new fields (as every non-Work-Schedule caller still does)
 * leaves an item's date/startTime/endTime completely untouched.
 *
 * Because a Work Schedule shift's derived Calendar entry
 * (planItemToCalendarEvent, planGoalCalendarEvents.ts) is recomputed FRESH
 * from the live item on every read and NOTHING is ever persisted to the
 * calendarEvents collection, saving a new date/time through updatePlanItem
 * is automatically reflected the moment getDerivedCalendarEvents runs again
 * — under the exact same deterministic entry id (plan-cal-<planId>-<itemId>)
 * — so there is no separate "move the calendar event" step to implement,
 * and no way for a duplicate or orphaned entry to be left behind.
 *
 * This file drives the REAL updatePlanItem() through a fake transactional
 * Firestore (same harness as planDetailStage4.test.ts), then feeds the
 * resulting persisted Plan into the REAL getDerivedCalendarEvents() to
 * prove the whole edit -> Calendar chain end to end — not just the two
 * halves in isolation.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansWorkScheduleItemEdit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake transactional Firestore (same shape as planDetailStage4.test.ts) ──

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

import { initPlansStore, updatePlanItem, isValidShiftTimes, type Plan, type PlanItem } from '@/lib/plansStore'
import { getDerivedCalendarEvents, planItemCalendarEventId } from '@/lib/planGoalCalendarEvents'

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

// ── 1 & 3. the shift date can be edited, and the saved item retains it ─────

describe('1 & 3. a Work Schedule shift\'s date can be edited, and the saved item retains the new date', () => {
  it('updatePlanItem writes a new date onto the shift item', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-10',
      startTime: '09:00',
      endTime: '17:00',
    })

    const doc = readFakeDoc('user-a', 'ws-plan-1')!
    expect(doc.items[0].date).toBe('2026-09-10')
  })
})

// ── 2. start/end time can still be edited ───────────────────────────────────

describe('2. start and end time can still be edited', () => {
  it('updatePlanItem writes new start/end times onto the shift item', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '10:00–18:00',
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '18:00',
    })

    const doc = readFakeDoc('user-a', 'ws-plan-1')!
    expect(doc.items[0].startTime).toBe('10:00')
    expect(doc.items[0].endTime).toBe('18:00')
  })

  it('isValidShiftTimes still rejects an end time at or before the start time (reused unchanged from creation)', () => {
    expect(isValidShiftTimes('10:00', '18:00')).toBe(true)
    expect(isValidShiftTimes('18:00', '10:00')).toBe(false)
    expect(isValidShiftTimes('10:00', '10:00')).toBe(false)
  })
})

// ── 3 (full round trip). saved item retains BOTH the new date and times ────

describe('3. the saved item retains the new date AND the new start/end time together, plus the regenerated label', () => {
  it('a full edit (date + start + end + note) persists exactly as saved', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '14:00–22:00',
      note: 'Acme Ltd',
      date: '2026-09-15',
      startTime: '14:00',
      endTime: '22:00',
    })

    const item = readFakeDoc('user-a', 'ws-plan-1')!.items[0]
    expect(item.date).toBe('2026-09-15')
    expect(item.startTime).toBe('14:00')
    expect(item.endTime).toBe('22:00')
    expect(item.label).toBe('14:00–22:00')
    expect(item.note).toBe('Acme Ltd')
  })
})

// ── 4 & 5. the derived Calendar entry moves, with no duplicate/orphan ──────

describe('4 & 5. the derived Calendar entry uses the new date/time, with no duplicate or leftover old entry', () => {
  it('after saving a new date, getDerivedCalendarEvents shows exactly one entry, on the NEW date, at the SAME entry id', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())

    const before = getDerivedCalendarEvents([makeWorkSchedulePlan()], [])
    expect(before).toHaveLength(1)
    expect(before[0].date).toBe('2026-09-01')
    const originalEventId = before[0].id

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-20',
      startTime: '09:00',
      endTime: '17:00',
    })
    const updatedPlan = readFakeDoc('user-a', 'ws-plan-1')!

    const after = getDerivedCalendarEvents([updatedPlan], [])
    expect(after).toHaveLength(1) // still exactly one — no duplicate created
    expect(after[0].date).toBe('2026-09-20') // moved to the new date
    expect(after[0].id).toBe(originalEventId) // same entry id — not a new/second entry
    expect(after[0].id).toBe(planItemCalendarEventId('ws-plan-1', 'shift-1'))
    // The old date no longer appears anywhere in the derived output.
    expect(after.some((e) => e.date === '2026-09-01')).toBe(false)
  })

  it('after saving new start/end times (same date), the Calendar entry\'s time moves too, still exactly one entry', async () => {
    seedFakeDoc('user-a', makeWorkSchedulePlan())

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '12:00–20:00',
      date: '2026-09-01',
      startTime: '12:00',
      endTime: '20:00',
    })
    const updatedPlan = readFakeDoc('user-a', 'ws-plan-1')!

    const events = getDerivedCalendarEvents([updatedPlan], [])
    expect(events).toHaveLength(1)
    expect(events[0].startTime).toBe('12:00')
    expect(events[0].endTime).toBe('20:00')
  })

  it('editing one shift among several only moves that one entry — the others are untouched, and nothing is duplicated', async () => {
    const plan = makeWorkSchedulePlan({
      items: [
        makeShiftItem({ id: 'shift-1', date: '2026-09-01' }),
        makeShiftItem({ id: 'shift-2', date: '2026-09-02' }),
      ],
    })
    seedFakeDoc('user-a', plan)

    await updatePlanItem('ws-plan-1', 'shift-1', {
      label: '09:00–17:00',
      date: '2026-09-05',
      startTime: '09:00',
      endTime: '17:00',
    })
    const updatedPlan = readFakeDoc('user-a', 'ws-plan-1')!

    const events = getDerivedCalendarEvents([updatedPlan], [])
    expect(events).toHaveLength(2) // still exactly two — never three
    const dates = events.map((e) => e.date).sort()
    expect(dates).toEqual(['2026-09-02', '2026-09-05'])
    expect(events.some((e) => e.date === '2026-09-01')).toBe(false) // old date is gone, not left behind
  })
})

// ── 6. ordinary (non-Work-Schedule) plan items are completely unaffected ──

describe('6. ordinary Plan item editing is unchanged — no date/startTime/endTime involved', () => {
  it('editing a plain item\'s label/note never touches date/startTime/endTime (they were never set, and still are not)', async () => {
    const plainPlan: Plan = {
      id: 'blank-plan-1',
      type: 'blank',
      title: 'Tühi plaan',
      color: '#6F5AE8',
      items: [{ id: 'item-a', label: 'Old label', done: false, note: 'old note' }],
      createdAt: 1,
      updatedAt: 1,
    }
    seedFakeDoc('user-a', plainPlan)

    await updatePlanItem('blank-plan-1', 'item-a', { label: 'New label', note: 'new note' })

    const item = readFakeDoc('user-a', 'blank-plan-1')!.items[0]
    expect(item.label).toBe('New label')
    expect(item.note).toBe('new note')
    expect(item.date).toBeUndefined()
    expect(item.startTime).toBeUndefined()
    expect(item.endTime).toBeUndefined()

    // No Calendar entry is ever derived for a plain item either.
    expect(getDerivedCalendarEvents([{ ...plainPlan, items: [item] }], [])).toHaveLength(0)
  })

  it('a plain item that happens to already carry a date (e.g. an AI-generated plan item) is preserved as-is when only label/note are edited', async () => {
    const planWithDatedItem: Plan = {
      id: 'blank-plan-2',
      type: 'blank',
      title: 'Plaan',
      color: '#6F5AE8',
      items: [{ id: 'item-b', label: 'Old', done: false, date: '2026-09-01' }],
      createdAt: 1,
      updatedAt: 1,
    }
    seedFakeDoc('user-a', planWithDatedItem)

    await updatePlanItem('blank-plan-2', 'item-b', { label: 'New' })

    const item = readFakeDoc('user-a', 'blank-plan-2')!.items[0]
    expect(item.label).toBe('New')
    expect(item.date).toBe('2026-09-01') // untouched — patch never mentioned date
  })
})

// ── Component wiring: the edit form branches by plan type, nothing else changed ──

const PLAN_DETAIL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlanDetailPage.tsx'), 'utf8')

describe('PlanDetailPage wiring: date/time editing is scoped to Work Schedule items only', () => {
  it('branches the edit form on plan.type, and passes date/startTime/endTime to updatePlanItem only in that branch', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/const isWorkScheduleItem = plan\.type === 'workSchedule'/)
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/date: editDate,\s*\n\s*startTime: editStartTime,\s*\n\s*endTime: editEndTime,/)
  })

  it('the non-Work-Schedule branch still calls updatePlanItem with only label/note, exactly as before', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/await updatePlanItem\(plan\.id, id, \{ label: editLabel, note: editNote \}\)/)
  })

  it('the add-item flow (addPlanItem) is untouched by this change — no date/time fields were added there', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/await addPlanItem\(plan\.id, newItemLabel, newItemNote\)/)
  })
})
