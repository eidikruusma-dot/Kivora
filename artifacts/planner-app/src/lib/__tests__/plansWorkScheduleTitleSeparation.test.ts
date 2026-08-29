/**
 * Work Schedule: separating the user-facing schedule TITLE from the
 * template TYPE and from the workplace/note field.
 *
 * These are, and remain, three separate existing concepts — no data model
 * change was needed, only making sure each piece of UI reads/writes the
 * right one:
 *   - Plan.type === 'workSchedule' — the template/system type, always
 *     displayed as "Töögraafik" / "Work schedule" (plans.template.
 *     workSchedule.title) — the template gallery card, and now also a
 *     secondary label on the plan detail header and the "My plans" card.
 *   - Plan.title — the user's own name for this specific schedule (e.g.
 *     "Tööl", "Tööpäev", "Minu graafik"), defaulting to "Tööl"/"Work" in
 *     WorkScheduleFormModal's create form but freely editable — shown as
 *     the main heading, and used verbatim as the title of every derived
 *     shift Calendar entry.
 *   - PlanItem.note — the existing, separate workplace/note field (e.g.
 *     "RR Lektus (Meie Toidukaubad)") — never conflated with the title,
 *     on create or on later edits.
 *
 * The derived-Calendar-title behavior (planItemToCalendarEvent already used
 * plan.title, unchanged by this round) is exactly why editing Plan.title
 * later moves every shift's Calendar title automatically: it's the SAME
 * live, never-persisted derivation every other Work Schedule
 * edit/delete/date-move already relies on — same entry id, no duplicates.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansWorkScheduleTitleSeparation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore: field-level partial updates (same shape as planEditDeleteStage4_1.test.ts) ──

const fakeDb = new Map<string, Record<string, unknown>>()
function planPath(uid: string, planId: string) {
  return `users/${uid}/plans/${planId}`
}
function seedFakeDoc(uid: string, plan: Record<string, unknown>) {
  fakeDb.set(planPath(uid, plan.id as string), { ...plan })
}
function readFakeDoc(uid: string, planId: string) {
  return fakeDb.get(planPath(uid, planId))
}

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const updateDocMock = vi.fn(async (ref: { path: string }, patch: Record<string, unknown>) => {
  const entry = fakeDb.get(ref.path)
  if (!entry) throw new Error('not-found')
  Object.assign(entry, patch)
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: Parameters<typeof updateDocMock>) => updateDocMock(...args),
  deleteField: vi.fn(() => undefined),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))
vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initPlansStore,
  updatePlanDetails,
  buildWorkScheduleItems,
  generatePlanId,
  type Plan,
  type WorkScheduleShiftDraft,
} from '@/lib/plansStore'
import { getDerivedCalendarEvents, planItemCalendarEventId } from '@/lib/planGoalCalendarEvents'
import { PLAN_TEMPLATES } from '@/data/planTemplates'
import { t } from '@/lib/translations'

function makeSchedulePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'ws-plan-1',
    type: 'workSchedule',
    title: 'Tööl',
    color: '#0D9488',
    items: [],
    addShiftsToCalendar: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  initPlansStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  initPlansStore('user-a')
})

// ── Template type vs. user title stay visibly distinct ──────────────────────

describe('the template/type label is unchanged: always "Töögraafik" / "Work schedule"', () => {
  it('the template card title is not affected by the create form default changing', () => {
    const tpl = PLAN_TEMPLATES.find((p) => p.type === 'workSchedule')!
    expect(t(tpl.titleKey, 'et')).toBe('Töögraafik')
    expect(t(tpl.titleKey, 'en')).toBe('Work schedule')
  })
})

describe('the create form defaults the title to "Tööl" / "Work" — separate from the template name', () => {
  it('the new titleDefault key is "Tööl"/"Work", distinct from the template name "Töögraafik"/"Work schedule"', () => {
    expect(t('plans.workSchedule.titleDefault', 'et')).toBe('Tööl')
    expect(t('plans.workSchedule.titleDefault', 'en')).toBe('Work')
    expect(t('plans.workSchedule.titleDefault', 'et')).not.toBe(t('plans.template.workSchedule.title', 'et'))
    expect(t('plans.workSchedule.titleDefault', 'en')).not.toBe(t('plans.template.workSchedule.title', 'en'))
  })

  it('the title field is now labeled "Pealkiri"/"Title", not the shared "Plaani nimi"/"Plan name"', () => {
    expect(t('plans.workSchedule.titleLabel', 'et')).toBe('Pealkiri')
    expect(t('plans.workSchedule.titleLabel', 'en')).toBe('Title')
    expect(t('plans.workSchedule.titleLabel', 'et')).not.toBe(t('plans.modal.nameLabel', 'et'))
  })
})

// ── Creating a schedule keeps title and workplace/note independent ─────────

describe('creating a Work Schedule keeps the user title and the workplace/note field independent', () => {
  it('a custom title and a workplace note are both preserved, neither overwriting the other', async () => {
    initPlansStore('user-a')
    const shifts: WorkScheduleShiftDraft[] = [{ date: '2026-09-01', startTime: '07:00', endTime: '20:00' }]
    const plan: Plan = {
      id: generatePlanId(),
      type: 'workSchedule',
      title: 'Minu graafik',
      color: '#0D9488',
      items: buildWorkScheduleItems(shifts, 'RR Lektus (Meie Toidukaubad)'),
      addShiftsToCalendar: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(plan.title).toBe('Minu graafik')
    expect(plan.items[0].note).toBe('RR Lektus (Meie Toidukaubad)')
    expect(plan.items[0].label).not.toContain('Minu graafik')
    expect(plan.title).not.toContain('RR Lektus')
  })
})

// ── 6. Derived Calendar shift events use Plan.title, not type or workplace ──

describe('6. derived Calendar shift events use the user\'s Plan.title as their event title', () => {
  it('the event title is exactly Plan.title ("Tööl"), the time is the shift\'s own start/end, and the workplace note is available separately, never folded into the title', () => {
    const shifts: WorkScheduleShiftDraft[] = [{ date: '2026-09-01', startTime: '07:00', endTime: '20:00' }]
    const items = buildWorkScheduleItems(shifts, 'RR Lektus (Meie Toidukaubad)')
    const plan = makeSchedulePlan({ title: 'Tööl', items })

    const events = getDerivedCalendarEvents([plan], [])
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Tööl')
    expect(events[0].startTime).toBe('07:00')
    expect(events[0].endTime).toBe('20:00')
    // The workplace/note lives on the source item, reachable separately —
    // never appended to, or replacing, the derived event's title.
    expect(items[0].note).toBe('RR Lektus (Meie Toidukaubad)')
    expect(events[0].title).not.toContain('RR Lektus')
    expect(events[0].title).not.toBe('Töögraafik') // never the template/type name either
  })

  it('every shift of the same schedule shares the same Plan.title as its event title, even with different times', () => {
    const items = buildWorkScheduleItems([
      { date: '2026-09-01', startTime: '07:00', endTime: '15:00' },
      { date: '2026-09-02', startTime: '15:00', endTime: '23:00' },
    ], 'RR Lektus')
    const plan = makeSchedulePlan({ title: 'Tööpäev', items })

    const events = getDerivedCalendarEvents([plan], [])
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.title === 'Tööpäev')).toBe(true)
  })
})

// ── 7. editing Plan.title updates every derived event's title, same ids, no duplicates ──

describe('7. editing the plan title automatically updates derived Calendar event titles — same ids, no duplicates', () => {
  it('updatePlanDetails changes Plan.title, and re-deriving shows the new title under the exact same entry ids', async () => {
    const items = buildWorkScheduleItems([
      { date: '2026-09-01', startTime: '07:00', endTime: '15:00' },
      { date: '2026-09-02', startTime: '15:00', endTime: '23:00' },
    ], 'RR Lektus')
    const original = makeSchedulePlan({ title: 'Tööl', items })
    seedFakeDoc('user-a', original)

    const before = getDerivedCalendarEvents([original], [])
    expect(before).toHaveLength(2)
    expect(before.every((e) => e.title === 'Tööl')).toBe(true)
    const beforeIds = before.map((e) => e.id).sort()

    await updatePlanDetails('ws-plan-1', {
      title: 'Minu tööpäev',
      color: original.color,
      startDate: '',
      endDate: '',
    })

    const updatedDoc = readFakeDoc('user-a', 'ws-plan-1')!
    expect(updatedDoc.title).toBe('Minu tööpäev')
    // updatePlanDetails never touches items — the shifts (and their note) survive untouched.
    expect(updatedDoc.items).toEqual(items)

    const updatedPlan: Plan = { ...original, title: updatedDoc.title as string, items: updatedDoc.items as Plan['items'] }
    const after = getDerivedCalendarEvents([updatedPlan], [])

    expect(after).toHaveLength(2) // still exactly two — no duplicate created
    expect(after.every((e) => e.title === 'Minu tööpäev')).toBe(true) // title moved everywhere
    expect(after.every((e) => e.title !== 'Tööl')).toBe(true) // old title is gone, not left behind
    expect(after.map((e) => e.id).sort()).toEqual(beforeIds) // same entry ids — not new/second entries
    for (const e of after) {
      expect(e.id).toBe(planItemCalendarEventId('ws-plan-1', items.find((i) => i.date === e.date)!.id))
    }
  })

  it('editing the title never touches the workplace/note stored on the shift items', async () => {
    const items = buildWorkScheduleItems([{ date: '2026-09-01', startTime: '07:00', endTime: '20:00' }], 'RR Lektus (Meie Toidukaubad)')
    seedFakeDoc('user-a', makeSchedulePlan({ title: 'Tööl', items }))

    await updatePlanDetails('ws-plan-1', { title: 'Uus nimi', color: '#0D9488', startDate: '', endDate: '' })

    const doc = readFakeDoc('user-a', 'ws-plan-1')!
    expect((doc.items as Plan['items'])[0].note).toBe('RR Lektus (Meie Toidukaubad)')
  })
})

// ── Component wiring: title vs. type vs. workplace stay visibly separate ──

const WORK_SCHEDULE_MODAL_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/plans/WorkScheduleFormModal.tsx'),
  'utf8',
)
const PLAN_DETAIL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlanDetailPage.tsx'), 'utf8')
const PLANS_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlansPage.tsx'), 'utf8')
const CALENDAR_EVENTS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/planGoalCalendarEvents.ts'), 'utf8')

describe('component wiring keeps title, type, and workplace/note as three separate reads', () => {
  it('WorkScheduleFormModal labels the field "titleLabel" and defaults it to "titleDefault", not the template name', () => {
    expect(WORK_SCHEDULE_MODAL_SRC).toMatch(/t\('plans\.workSchedule\.titleLabel', lang\)/)
    expect(WORK_SCHEDULE_MODAL_SRC).toMatch(/useState\(t\('plans\.workSchedule\.titleDefault', lang\)\)/)
    expect(WORK_SCHEDULE_MODAL_SRC).not.toMatch(/useState\(t\('plans\.template\.workSchedule\.title', lang\)\)/)
    // The workplace/note field is untouched — still its own separate input.
    expect(WORK_SCHEDULE_MODAL_SRC).toMatch(/t\('plans\.workSchedule\.workplaceLabel', lang\)/)
  })

  it('PlanDetailPage shows Plan.title as the heading and the template type as a secondary label, only for workSchedule plans', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/plan\.type === 'workSchedule' &&[\s\S]{0,300}t\('plans\.template\.workSchedule\.title', lang\)/)
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/<h1[^>]*>\{plan\.title\}<\/h1>/)
  })

  it('PlansPage shows the same secondary type label on a Work Schedule card, without changing other templates\' cards', () => {
    expect(PLANS_PAGE_SRC).toMatch(/plan\.type === 'workSchedule' &&[\s\S]{0,300}t\('plans\.template\.workSchedule\.title', lang\)/)
  })

  it('the derived shift Calendar event title still reads plan.title, not plan.type or an item\'s note', () => {
    const fn = CALENDAR_EVENTS_SRC.match(/export function planItemToCalendarEvent\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(fn).toMatch(/title: plan\.title/)
    expect(fn).not.toMatch(/item\.note/)
  })
})
