/**
 * Work Schedule ("Töögraafik") plan template.
 *
 * Reuses the existing Plans architecture end to end — no new module, no
 * parallel scheduling/calendar system, no new Firestore collection:
 *   - the template is one more entry in PLAN_TEMPLATES (data/planTemplates.ts),
 *     rendered by the SAME template gallery/card grid every other template uses;
 *   - a created schedule is a plain Plan whose items are plain PlanItems
 *     (plansStore.ts), written via the SAME addPlan() every other template
 *     already uses — PlanItem only gained two new OPTIONAL fields
 *     (startTime/endTime) that every other template simply never sets;
 *   - "add the generated shifts to Calendar" reuses the existing DERIVED
 *     (never persisted) Plan -> Calendar link (planGoalCalendarEvents.ts),
 *     the same mechanism a dated Plan already used for its whole-plan-range
 *     entry — extended with one new per-item derivation function, gated by
 *     a new opt-in Plan field (addShiftsToCalendar) so this bigger,
 *     multi-entry generation is a conscious choice, not automatic like the
 *     existing single whole-plan entry;
 *   - because every derived entry is computed fresh from the live Plan/item
 *     data and NOTHING is ever persisted to the calendarEvents collection,
 *     editing a shift's date/time, deleting a shift, or deleting the whole
 *     plan is reflected the very next render — there is no separate copy
 *     that could go stale, and so no orphan/duplicate calendar entry can
 *     ever exist (see "no orphan/duplicate calendar entries" below for the
 *     exact reproduction of each case: edit, delete-item, delete-plan);
 *   - a shift-sourced Calendar entry carries the SAME `source: { type:
 *     'plan', id: planId }` shape the existing whole-plan entry already
 *     used, so CalendarPage.tsx's existing "click a plan-sourced entry ->
 *     open that plan" routing (evt.source.type === 'plan') works completely
 *     unchanged for every shift, with no new per-item click-routing case.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/plansWorkScheduleTemplate.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

import { PLAN_TEMPLATES, getTemplateIcon } from '@/data/planTemplates'
import {
  initPlansStore,
  addPlan,
  generatePlanId,
  isValidShiftTimes,
  isValidWorkScheduleShift,
  hasValidWorkScheduleShift,
  buildWorkScheduleItems,
  type Plan,
  type WorkScheduleShiftDraft,
} from '@/lib/plansStore'
import {
  planToCalendarEvent,
  planItemToCalendarEvent,
  planItemCalendarEventId,
  planCalendarEventId,
  getDerivedCalendarEvents,
} from '@/lib/planGoalCalendarEvents'
import { t } from '@/lib/translations'

function makeShift(overrides: Partial<WorkScheduleShiftDraft> = {}): WorkScheduleShiftDraft {
  return { date: '2026-09-01', startTime: '09:00', endTime: '17:00', ...overrides }
}

function makeSchedulePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'ws-plan-1',
    type: 'workSchedule',
    title: 'Töögraafik',
    color: '#0D9488',
    items: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

// ── Template registration ───────────────────────────────────────────────────

describe('Work Schedule template registration', () => {
  it('is registered in PLAN_TEMPLATES with its own icon, translation keys, and empty (user-authored) blueprints', () => {
    const tpl = PLAN_TEMPLATES.find((p) => p.type === 'workSchedule')
    expect(tpl).toBeDefined()
    expect(tpl!.titleKey).toBe('plans.template.workSchedule.title')
    expect(tpl!.descriptionKey).toBe('plans.template.workSchedule.desc')
    expect(tpl!.itemBlueprints).toEqual([])
    expect(getTemplateIcon('workSchedule')).toBe(tpl!.icon)
  })

  it('translation keys resolve to real, non-empty ET/EN text (not the raw key)', () => {
    const tpl = PLAN_TEMPLATES.find((p) => p.type === 'workSchedule')!
    for (const lang of ['et', 'en'] as const) {
      expect(t(tpl.titleKey, lang)).not.toBe(tpl.titleKey)
      expect(t(tpl.descriptionKey, lang).length).toBeGreaterThan(0)
    }
    expect(t('plans.template.workSchedule.title', 'et')).toBe('Töögraafik')
    expect(t('plans.template.workSchedule.title', 'en')).toBe('Work schedule')
  })
})

// ── Shift validation ─────────────────────────────────────────────────────────

describe('shift time validation', () => {
  it('a valid shift requires a date and an end time strictly after the start time', () => {
    expect(isValidWorkScheduleShift(makeShift())).toBe(true)
    expect(isValidWorkScheduleShift(makeShift({ date: '' }))).toBe(false)
    expect(isValidWorkScheduleShift(makeShift({ startTime: '' }))).toBe(false)
    expect(isValidWorkScheduleShift(makeShift({ endTime: '' }))).toBe(false)
  })

  it('rejects an end time equal to or before the start time (V1 does not support overnight-crossing shifts)', () => {
    expect(isValidShiftTimes('09:00', '09:00')).toBe(false)
    expect(isValidShiftTimes('17:00', '09:00')).toBe(false)
    expect(isValidShiftTimes('09:00', '17:00')).toBe(true)
  })

  it('hasValidWorkScheduleShift requires at least ONE valid row among many, incomplete rows included', () => {
    expect(hasValidWorkScheduleShift([])).toBe(false)
    expect(hasValidWorkScheduleShift([makeShift({ date: '' })])).toBe(false)
    expect(hasValidWorkScheduleShift([makeShift({ date: '' }), makeShift()])).toBe(true)
  })
})

// ── Building plan items from shift rows (supports different shifts on different days) ──

describe('buildWorkScheduleItems: shifts -> PlanItem[]', () => {
  it('builds one item per valid shift, using the time range as the label and the item date/startTime/endTime set exactly from the shift', () => {
    const items = buildWorkScheduleItems([makeShift({ date: '2026-09-01', startTime: '08:00', endTime: '16:00' })], '')
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('08:00–16:00')
    expect(items[0].date).toBe('2026-09-01')
    expect(items[0].startTime).toBe('08:00')
    expect(items[0].endTime).toBe('16:00')
    expect(items[0].done).toBe(false)
    expect(items[0].note).toBeUndefined()
  })

  it('different shifts on different days are preserved independently — no assumption of identical hours', () => {
    const items = buildWorkScheduleItems([
      makeShift({ date: '2026-09-01', startTime: '08:00', endTime: '16:00' }),
      makeShift({ date: '2026-09-02', startTime: '14:00', endTime: '22:00' }),
      makeShift({ date: '2026-09-05', startTime: '06:00', endTime: '12:30' }),
    ], '')
    expect(items.map((i) => `${i.date} ${i.startTime}-${i.endTime}`)).toEqual([
      '2026-09-01 08:00-16:00',
      '2026-09-02 14:00-22:00',
      '2026-09-05 06:00-12:30',
    ])
  })

  it('applies the optional workplace/note identically to every generated shift', () => {
    const items = buildWorkScheduleItems([makeShift(), makeShift({ date: '2026-09-02' })], '  Acme Ltd  ')
    expect(items.every((i) => i.note === 'Acme Ltd')).toBe(true)
  })

  it('an empty/whitespace-only workplace note is omitted, not stored as an empty string', () => {
    const items = buildWorkScheduleItems([makeShift()], '   ')
    expect(items[0].note).toBeUndefined()
  })

  it('silently drops incomplete/invalid rows (a row still being filled in) rather than throwing', () => {
    const items = buildWorkScheduleItems([makeShift(), makeShift({ date: '' }), makeShift({ startTime: '10:00', endTime: '09:00' })], '')
    expect(items).toHaveLength(1)
  })

  it('every generated item gets a unique id', () => {
    const items = buildWorkScheduleItems([makeShift(), makeShift({ date: '2026-09-02' }), makeShift({ date: '2026-09-03' })], '')
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

// ── Calendar derivation: opt-in per-shift entries ───────────────────────────

describe('Work Schedule -> Calendar: per-shift derivation (opt-in)', () => {
  it('a shift item produces no calendar entry unless addShiftsToCalendar is true', () => {
    const plan = makeSchedulePlan({
      addShiftsToCalendar: false,
      items: buildWorkScheduleItems([makeShift()], ''),
    })
    expect(planItemToCalendarEvent(plan, plan.items[0])).toBeNull()
    expect(getDerivedCalendarEvents([plan], [])).toHaveLength(0)
  })

  it('opting in derives exactly one timed calendar entry per shift, linked back to the plan', () => {
    const items = buildWorkScheduleItems([
      makeShift({ date: '2026-09-01', startTime: '08:00', endTime: '16:00' }),
      makeShift({ date: '2026-09-02', startTime: '14:00', endTime: '22:00' }),
    ], '')
    const plan = makeSchedulePlan({ addShiftsToCalendar: true, items })

    const events = getDerivedCalendarEvents([plan], [])
    expect(events).toHaveLength(2)
    for (const [i, evt] of events.entries()) {
      expect(evt.id).toBe(planItemCalendarEventId(plan.id, items[i].id))
      expect(evt.allDay).toBeFalsy()
      expect(evt.date).toBe(items[i].date)
      expect(evt.startTime).toBe(items[i].startTime)
      expect(evt.endTime).toBe(items[i].endTime)
      expect(evt.color).toBe(plan.color)
      expect(evt.source).toEqual({ type: 'plan', id: plan.id })
    }
  })

  it('a shift missing a date/time (should not normally happen, but defensively) yields no calendar entry', () => {
    const plan = makeSchedulePlan({
      addShiftsToCalendar: true,
      items: [{ id: 'item-1', label: '09:00–17:00', done: false }], // no date/startTime/endTime
    })
    expect(planItemToCalendarEvent(plan, plan.items[0])).toBeNull()
  })

  it('a non-Work-Schedule plan never derives per-item shift entries, even if a PlanItem happened to carry date/startTime/endTime', () => {
    const plan = makeSchedulePlan({
      type: 'blank',
      addShiftsToCalendar: true,
      items: [{ id: 'item-1', label: '09:00–17:00', done: false, date: '2026-09-01', startTime: '09:00', endTime: '17:00' }],
    })
    expect(planItemToCalendarEvent(plan, plan.items[0])).toBeNull()
  })

  it('the whole-plan-range all-day entry is suppressed for Work Schedule plans, even when a start/end period is set — the per-shift entries are what should show, not a redundant banner on top', () => {
    const plan = makeSchedulePlan({ startDate: '2026-09-01', endDate: '2026-09-05' })
    expect(planToCalendarEvent(plan)).toBeNull()
  })

  it('other templates keep their existing whole-plan-range entry unchanged', () => {
    const plan = makeSchedulePlan({ type: 'blank', startDate: '2026-09-01', endDate: '2026-09-05' })
    expect(planToCalendarEvent(plan)).not.toBeNull()
  })
})

// ── No orphan/duplicate calendar entries on edit/delete ─────────────────────

describe('editing/deleting the source schedule never leaves an orphan or duplicate calendar entry', () => {
  it('editing a shift\'s time is reflected instantly (derived fresh, same entry id) — no stale duplicate left behind', () => {
    const item = buildWorkScheduleItems([makeShift({ startTime: '09:00', endTime: '17:00' })], '')[0]
    const plan = makeSchedulePlan({ addShiftsToCalendar: true, items: [item] })

    const before = getDerivedCalendarEvents([plan], [])
    expect(before[0].startTime).toBe('09:00')

    const editedItem = { ...item, startTime: '10:00', endTime: '18:00' }
    const after = getDerivedCalendarEvents([{ ...plan, items: [editedItem] }], [])
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(before[0].id) // same derived id — not a second entry
    expect(after[0].startTime).toBe('10:00')
    expect(after[0].endTime).toBe('18:00')
  })

  it('deleting one shift item removes exactly its own calendar entry, leaving the others untouched', () => {
    const items = buildWorkScheduleItems([
      makeShift({ date: '2026-09-01' }),
      makeShift({ date: '2026-09-02' }),
      makeShift({ date: '2026-09-03' }),
    ], '')
    const plan = makeSchedulePlan({ addShiftsToCalendar: true, items })

    const before = getDerivedCalendarEvents([plan], [])
    expect(before).toHaveLength(3)

    const remaining = items.filter((i) => i.date !== '2026-09-02')
    const after = getDerivedCalendarEvents([{ ...plan, items: remaining }], [])
    expect(after).toHaveLength(2)
    expect(after.some((e) => e.date === '2026-09-02')).toBe(false)
    expect(after.map((e) => e.date).sort()).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('deleting the whole plan removes every one of its shift-derived calendar entries at once', () => {
    const items = buildWorkScheduleItems([makeShift({ date: '2026-09-01' }), makeShift({ date: '2026-09-02' })], '')
    const plan = makeSchedulePlan({ addShiftsToCalendar: true, items })

    const withPlan = getDerivedCalendarEvents([plan], [])
    const withoutPlan = getDerivedCalendarEvents([], [])
    expect(withPlan).toHaveLength(2)
    expect(withoutPlan).toHaveLength(0)
  })

  it('recomputing repeatedly never creates duplicates — deterministic per-item ids, nothing persisted', () => {
    const items = buildWorkScheduleItems([makeShift()], '')
    const plan = makeSchedulePlan({ addShiftsToCalendar: true, items })
    const run1 = getDerivedCalendarEvents([plan], [])
    const run2 = getDerivedCalendarEvents([plan], [])
    expect(run1).toHaveLength(1)
    expect(run1[0].id).toBe(run2[0].id)
    expect(run1[0].id).toBe(planItemCalendarEventId(plan.id, items[0].id))
  })

  it('a shift-derived entry id never collides with the whole-plan entry id format, or with another plan\'s shift', () => {
    const id1 = planItemCalendarEventId('plan-a', 'item-1')
    const id2 = planItemCalendarEventId('plan-b', 'item-1')
    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(planCalendarEventId('plan-a'))
    expect(id1.startsWith(planCalendarEventId('plan-a'))).toBe(true)
  })
})

// ── End-to-end creation flow (mirrors what WorkScheduleFormModal submits) ──

describe('end-to-end: creating a Work Schedule plan writes through the exact same addPlan() every template uses', () => {
  it('a schedule with different per-day shifts, a workplace note, and calendar sync enabled is written as one plain Plan document', async () => {
    initPlansStore('user-a')
    setDocMock.mockClear()
    const shifts: WorkScheduleShiftDraft[] = [
      { date: '2026-09-01', startTime: '08:00', endTime: '16:00' },
      { date: '2026-09-02', startTime: '12:00', endTime: '20:00' },
    ]
    const plan: Plan = {
      id: generatePlanId(),
      type: 'workSchedule',
      title: 'Septembri graafik',
      color: '#0D9488',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      items: buildWorkScheduleItems(shifts, 'Acme Ltd'),
      addShiftsToCalendar: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await addPlan(plan)

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const written = setDocMock.mock.calls[0][1] as Plan
    expect(written.type).toBe('workSchedule')
    expect(written.items).toHaveLength(2)
    expect(written.addShiftsToCalendar).toBe(true)
    expect(written.items[0].note).toBe('Acme Ltd')

    // And it is immediately usable by the existing calendar derivation —
    // no separate write/sync step needed.
    const events = getDerivedCalendarEvents([written], [])
    expect(events).toHaveLength(2)
  })
})

// ── Component wiring: reuses the existing architecture, no parallel system ──

const PLANS_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlansPage.tsx'), 'utf8')
const PLAN_DETAIL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/PlanDetailPage.tsx'), 'utf8')
const CALENDAR_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/CalendarPage.tsx'), 'utf8')

describe('component wiring reuses the existing Plans/Calendar architecture', () => {
  it('PlansPage opens a dedicated Work Schedule form instead of the generic modal, but still calls the shared addPlan()', () => {
    expect(PLANS_PAGE_SRC).toMatch(/import WorkScheduleFormModal/)
    expect(PLANS_PAGE_SRC).toMatch(/if \(type === 'workSchedule'\) \{ setWorkScheduleModalOpen\(true\); return \}/)
    expect(PLANS_PAGE_SRC).toMatch(/await addPlan\(newPlan\)/)
  })

  it('PlanDetailPage displays a shift item\'s date using the existing formatPlanDate helper — no new date-formatting code', () => {
    expect(PLAN_DETAIL_PAGE_SRC).toMatch(/formatPlanDate\(item\.date, lang\)/)
  })

  it('CalendarPage.tsx needed NO changes for shift entries — it already merges getDerivedCalendarEvents(plans, goals) generically and routes any plan-sourced entry by evt.source.id', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/getDerivedCalendarEvents\(plans, goals\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/evt\?\.source\?\.type === 'plan'/)
    // No Work-Schedule-specific special case was added to CalendarPage.tsx.
    expect(CALENDAR_PAGE_SRC).not.toMatch(/workSchedule/)
  })

  it('no new Firestore collection was introduced for shifts/schedules', () => {
    expect(PLANS_PAGE_SRC).not.toMatch(/collection\(db, ['"]users['"], .*['"](shifts|schedules|workSchedules)['"]\)/)
  })
})
