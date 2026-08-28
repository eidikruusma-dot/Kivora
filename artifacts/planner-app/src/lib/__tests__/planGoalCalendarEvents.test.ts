/**
 * Regression tests for automatic Calendar integration of dated Plans and
 * dated Goals.
 *
 * Architecture: unlike Tasks (which get one real calendarEvents Firestore
 * document, created via automaticLinking.ts and kept in sync via
 * syncTaskCalendarEvent), a Plan/Goal calendar entry is DERIVED — computed
 * fresh from the live Plan/Goal object every time (see
 * planGoalCalendarEvents.ts, merged into CalendarPage.tsx's event list).
 * Nothing is ever written to Firestore for these entries, so:
 *   - editing a title/date/deadline is reflected the instant the Plan/Goal
 *     itself changes — there is no separate copy that could go stale;
 *   - deleting the Plan/Goal removes the entry, because there is nothing
 *     left to derive it from;
 *   - repeated computation (refresh, re-render, calling this twice) can
 *     never create a duplicate — the id is deterministic
 *     (plan-cal-<planId> / goal-cal-<goalId>) and nothing is persisted;
 *   - every EXISTING dated Plan/Goal is covered immediately, with no
 *     backfill/migration needed, because there is no stored copy to be
 *     out of sync with the source in the first place.
 *
 * This file tests the pure derivation functions directly — no Firestore
 * mocking needed, since planGoalCalendarEvents.ts never touches Firestore.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/planGoalCalendarEvents.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  planToCalendarEvent,
  goalToCalendarEvent,
  getDerivedCalendarEvents,
  planCalendarEventId,
  goalCalendarEventId,
} from '@/lib/planGoalCalendarEvents'
import { eventOccursOnDate, eventDateKeys } from '@/lib/calendar/eventLayout'
import type { Plan } from '@/lib/plansStore'
import type { Goal } from '@/data/goalsData'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    type: 'blank',
    title: 'Kitchen renovation',
    color: '#3B82F6',
    items: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'Run a marathon',
    description: '',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    icon: 'other',
    status: 'active',
    progressType: 'fraction',
    progressValue: 0,
    progressMax: 1,
    deadline: '2026-09-15',
    deadlineShort: '',
    barColor: '#6F5AE8',
    steps: [],
    ...overrides,
  }
}

describe('Plans -> Calendar: derivation', () => {
  it('1. a dated Plan exposes exactly one linked all-day calendar entry', () => {
    const plan = makePlan({ startDate: '2026-08-28', endDate: '2026-08-28' })
    const evt = planToCalendarEvent(plan)
    expect(evt).not.toBeNull()
    expect(evt!.id).toBe(planCalendarEventId(plan.id))
    expect(evt!.allDay).toBe(true)
    expect(evt!.source).toEqual({ type: 'plan', id: plan.id })
    expect(getDerivedCalendarEvents([plan], []).filter((e) => e.source?.id === plan.id)).toHaveLength(1)
  })

  it('2. a multi-day Plan has the correct start/end range and includes every day in between (no off-by-one)', () => {
    const plan = makePlan({ startDate: '2026-08-28', endDate: '2026-09-01' })
    const evt = planToCalendarEvent(plan)!
    expect(evt.date).toBe('2026-08-28')
    expect(evt.endDate).toBe('2026-09-01')
    expect(eventOccursOnDate(evt, '2026-08-27')).toBe(false)
    expect(eventOccursOnDate(evt, '2026-08-28')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-08-31')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-09-01')).toBe(true)
    expect(eventOccursOnDate(evt, '2026-09-02')).toBe(false)
    expect(eventDateKeys(evt)).toEqual([
      '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
    ])
  })

  it('a Plan with only one date (start or end) is a one-day entry — the model permits either alone', () => {
    const startOnly = planToCalendarEvent(makePlan({ startDate: '2026-08-28' }))!
    expect(startOnly.date).toBe('2026-08-28')
    expect(startOnly.endDate).toBeUndefined()

    const endOnly = planToCalendarEvent(makePlan({ endDate: '2026-09-01' }))!
    expect(endOnly.date).toBe('2026-09-01')
    expect(endOnly.endDate).toBeUndefined()
  })

  it('the calendar title equals the Plan title, and uses the Plan\'s own selected color', () => {
    const plan = makePlan({ title: 'Trip to Tallinn', color: '#F97316', startDate: '2026-08-28' })
    const evt = planToCalendarEvent(plan)!
    expect(evt.title).toBe('Trip to Tallinn')
    expect(evt.color).toBe('#F97316')
  })

  it('3. a title change is reflected because the entry is derived fresh from the current Plan object', () => {
    const before = planToCalendarEvent(makePlan({ title: 'Old name', startDate: '2026-08-28' }))!
    const after = planToCalendarEvent(makePlan({ title: 'New name', startDate: '2026-08-28' }))!
    expect(before.id).toBe(after.id)
    expect(before.title).toBe('Old name')
    expect(after.title).toBe('New name')
  })

  it('4. a date change moves/reshapes the range, same entry id', () => {
    const before = planToCalendarEvent(makePlan({ startDate: '2026-08-28', endDate: '2026-08-28' }))!
    const after = planToCalendarEvent(makePlan({ startDate: '2026-09-01', endDate: '2026-09-05' }))!
    expect(before.id).toBe(after.id)
    expect(after.date).toBe('2026-09-01')
    expect(after.endDate).toBe('2026-09-05')
  })

  it('5. removing both dates removes the Plan from Calendar entirely', () => {
    expect(planToCalendarEvent(makePlan({ startDate: undefined, endDate: undefined }))).toBeNull()
  })

  it('6. deleting the Plan removes its calendar entry — nothing to derive it from once the plan is gone', () => {
    const plan = makePlan({ startDate: '2026-08-28' })
    const withPlan = getDerivedCalendarEvents([plan], [])
    const withoutPlan = getDerivedCalendarEvents([], [])
    expect(withPlan.some((e) => e.source?.id === plan.id)).toBe(true)
    expect(withoutPlan.some((e) => e.source?.id === plan.id)).toBe(false)
  })

  it('7. an undated Plan does not appear in Calendar', () => {
    const plan = makePlan()
    expect(planToCalendarEvent(plan)).toBeNull()
    expect(getDerivedCalendarEvents([plan], [])).toHaveLength(0)
  })

  it('8. calling the derivation repeatedly never creates duplicates — deterministic id, nothing persisted', () => {
    const plan = makePlan({ startDate: '2026-08-28' })
    const run1 = getDerivedCalendarEvents([plan], [])
    const run2 = getDerivedCalendarEvents([plan], [])
    const run3 = getDerivedCalendarEvents([plan], [])
    expect(run1).toHaveLength(1)
    expect(run1[0].id).toBe(run2[0].id)
    expect(run2[0].id).toBe(run3[0].id)
    // Every existing dated Plan is covered on the very first computation —
    // no backfill/migration step is needed for pre-existing data.
    expect(run1[0].id).toBe(planCalendarEventId(plan.id))
  })
})

describe('Goals -> Calendar: derivation', () => {
  it('9. a Goal with a deadline exposes exactly one linked all-day calendar entry', () => {
    const goal = makeGoal({ deadline: '2026-09-15' })
    const evt = goalToCalendarEvent(goal)
    expect(evt).not.toBeNull()
    expect(evt!.id).toBe(goalCalendarEventId(goal.id))
    expect(evt!.allDay).toBe(true)
    expect(evt!.source).toEqual({ type: 'goal', id: goal.id })
    expect(getDerivedCalendarEvents([], [goal]).filter((e) => e.source?.id === goal.id)).toHaveLength(1)
  })

  it('10. the calendar entry uses the correct deadline date, and the Goal\'s own color', () => {
    const goal = makeGoal({ deadline: '2026-09-15', barColor: '#EAB308' })
    const evt = goalToCalendarEvent(goal)!
    expect(evt.date).toBe('2026-09-15')
    expect(evt.endDate).toBeUndefined()
    expect(evt.color).toBe('#EAB308')
  })

  it('11. a title change is reflected because the entry is derived fresh from the current Goal object', () => {
    const before = goalToCalendarEvent(makeGoal({ title: 'Old goal' }))!
    const after = goalToCalendarEvent(makeGoal({ title: 'New goal' }))!
    expect(before.id).toBe(after.id)
    expect(before.title).toBe('Old goal')
    expect(after.title).toBe('New goal')
  })

  it('12. a deadline change moves the entry to the new date, same entry id', () => {
    const before = goalToCalendarEvent(makeGoal({ deadline: '2026-09-15' }))!
    const after = goalToCalendarEvent(makeGoal({ deadline: '2026-10-01' }))!
    expect(before.id).toBe(after.id)
    expect(before.date).toBe('2026-09-15')
    expect(after.date).toBe('2026-10-01')
  })

  it('13. removing the deadline removes the Goal from Calendar', () => {
    // GoalsPage.tsx stores a translated "no deadline" placeholder string
    // (not an empty string) when the field is cleared — must not be
    // mistaken for a real date.
    expect(goalToCalendarEvent(makeGoal({ deadline: 'Tähtaeg määramata' }))).toBeNull()
    expect(goalToCalendarEvent(makeGoal({ deadline: 'No deadline set' }))).toBeNull()
    expect(goalToCalendarEvent(makeGoal({ deadline: '' }))).toBeNull()
  })

  it('14. deleting the Goal removes its calendar entry', () => {
    const goal = makeGoal({ deadline: '2026-09-15' })
    const withGoal = getDerivedCalendarEvents([], [goal])
    const withoutGoal = getDerivedCalendarEvents([], [])
    expect(withGoal.some((e) => e.source?.id === goal.id)).toBe(true)
    expect(withoutGoal.some((e) => e.source?.id === goal.id)).toBe(false)
  })

  it('15. a Goal without a deadline does not appear in Calendar', () => {
    const goal = makeGoal({ deadline: 'Tähtaeg määramata' })
    expect(goalToCalendarEvent(goal)).toBeNull()
    expect(getDerivedCalendarEvents([], [goal])).toHaveLength(0)
  })

  it('16. progress and step completion changes never add/duplicate an entry — only title + deadline are read', () => {
    const inProgress = goalToCalendarEvent(makeGoal({
      progressValue: 0,
      status: 'active',
      steps: [{ id: 's1', title: 'Step 1', done: false }],
    }))!
    const completed = goalToCalendarEvent(makeGoal({
      progressValue: 1,
      status: 'completed',
      steps: [{ id: 's1', title: 'Step 1', done: true }],
    }))!
    expect(inProgress).toEqual(completed)

    const goal = makeGoal({ steps: [{ id: 's1', title: 'Step 1', done: false }] })
    const before = getDerivedCalendarEvents([], [goal])
    goal.steps[0].done = true
    goal.progressValue = 1
    const after = getDerivedCalendarEvents([], [goal])
    expect(before).toHaveLength(1)
    expect(after).toHaveLength(1)
    expect(before[0].id).toBe(after[0].id)
  })

  it('17. calling the derivation repeatedly never creates duplicates — deterministic id, nothing persisted', () => {
    const goal = makeGoal({ deadline: '2026-09-15' })
    const run1 = getDerivedCalendarEvents([], [goal])
    const run2 = getDerivedCalendarEvents([], [goal])
    expect(run1).toHaveLength(1)
    expect(run1[0].id).toBe(run2[0].id)
    expect(run1[0].id).toBe(goalCalendarEventId(goal.id))
  })
})

describe('mixed Plans + Goals, and non-interference', () => {
  it('derives independent entries for multiple dated Plans and Goals in one pass', () => {
    const plans = [
      makePlan({ id: 'p1', startDate: '2026-08-28', endDate: '2026-09-01' }),
      makePlan({ id: 'p2' }), // undated — excluded
    ]
    const goals = [
      makeGoal({ id: 'g1', deadline: '2026-09-15' }),
      makeGoal({ id: 'g2', deadline: 'Tähtaeg määramata' }), // no deadline — excluded
    ]
    const result = getDerivedCalendarEvents(plans, goals)
    expect(result.map((e) => e.id).sort()).toEqual([
      goalCalendarEventId('g1'),
      planCalendarEventId('p1'),
    ].sort())
  })

  it('plan and goal derived-event ids never collide with each other or with the task-auto-created id prefix', () => {
    expect(planCalendarEventId('x')).not.toBe(goalCalendarEventId('x'))
    expect(planCalendarEventId('x').startsWith('cal-auto-')).toBe(false)
    expect(goalCalendarEventId('x').startsWith('cal-auto-')).toBe(false)
  })
})
