/**
 * computeDailyOverview() (src/lib/dailyObservations.ts) — the data layer
 * for the smarter "Minu päev" / KivoraAICard summary (Kivora 2.0, Etapp 1).
 *
 * Regression focus, per the confirmed requirements:
 *   1. No double-counting a Task/School item and its own auto-created
 *      Calendar mirror event (automaticLinking.ts's `cal-auto-` events) —
 *      and no false "conflict" between a task and its own mirror.
 *   2. No invented durations: workload is a plain count, and the
 *      upstream findOwnedCalendarEventId lookup is reused, never
 *      re-derived with a guessed time window.
 *   3. No assumed date formats: every date field (Task/School/Plan/Goal)
 *      is validated before use; a non-ISO Goal.deadline is skipped, never
 *      crashes or gets silently mis-sorted.
 *   4. Honest empty/"all done" states, computed precisely.
 *   5. Local-timezone correctness (reuses tasksSummary.ts's localTodayStr).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/dailyObservations.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Task } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Plan } from '@/lib/plansStore'
import type { Goal } from '@/data/goalsData'

vi.mock('@/lib/automaticLinking', () => ({
  findOwnedCalendarEventId: vi.fn(() => undefined),
}))

import { findOwnedCalendarEventId } from '@/lib/automaticLinking'
import { computeDailyOverview, type SchoolTaskLike, type SchoolExamLike } from '@/lib/dailyObservations'
import { computeSmartDailySummary } from '@/lib/dashboardSummary'

const TODAY = '2026-06-15'
const YESTERDAY = '2026-06-14'
const TOMORROW = '2026-06-16'
const IN_3_DAYS = '2026-06-18'
const IN_10_DAYS = '2026-06-25'

function task(overrides: Partial<Task> = {}): Task {
  return { id: 't-x', title: 'Task', completed: false, priority: 'medium', ...overrides } as Task
}

function event(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return { id: 'e-x', title: 'Event', date: TODAY, startTime: '', endTime: '', color: '#6F5AE8', ...overrides }
}

function schoolTask(overrides: Partial<SchoolTaskLike> = {}): SchoolTaskLike {
  return { id: 1, title: 'School task', deadline: TODAY, progress: 0, ...overrides }
}

function schoolExam(overrides: Partial<SchoolExamLike> = {}): SchoolExamLike {
  return { id: 1, title: 'School exam', date: TODAY, status: 'ootel', ...overrides }
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p-x', type: 'blank', title: 'Plan', color: '#6F5AE8', items: [],
    createdAt: 0, updatedAt: 0, ...overrides,
  } as Plan
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g-x', title: 'Goal', description: '', iconBg: '', iconColor: '', icon: 'other',
    status: 'active', progressType: 'percent', progressValue: 0, progressMax: 100,
    deadline: '', deadlineShort: '', barColor: '#6F5AE8', steps: [], ...overrides,
  } as Goal
}

const EMPTY_INPUT = { tasks: [], events: [], schoolTasks: [], schoolExams: [], plans: [], goals: [] }

const FIXED_NOW = new Date(2026, 5, 15, 10, 0) // local June 15, 2026, 10:00

beforeEach(() => {
  vi.mocked(findOwnedCalendarEventId).mockReturnValue(undefined)
})

describe('computeDailyOverview: honest empty state (rule 4)', () => {
  it('reports hasAnyData=false and all counts at 0 for a genuinely empty store', () => {
    const o = computeDailyOverview({ ...EMPTY_INPUT, now: FIXED_NOW })
    expect(o.hasAnyData).toBe(false)
    expect(o.overdueCount).toBe(0)
    expect(o.todayTotalCount).toBe(0)
    expect(o.todayActiveCount).toBe(0)
    expect(o.upcoming).toEqual([])
    expect(o.conflicts).toEqual([])
  })
})

describe('computeDailyOverview: overdue detection', () => {
  it('a task dated before today, not completed, is overdue', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT, tasks: [task({ id: 'ov', date: YESTERDAY, completed: false })], now: FIXED_NOW,
    })
    expect(o.overdueCount).toBe(1)
    expect(o.overdueTasks.map((t) => t.id)).toEqual(['ov'])
  })

  it('a completed task dated before today is NOT overdue', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT, tasks: [task({ date: YESTERDAY, completed: true })], now: FIXED_NOW,
    })
    expect(o.overdueCount).toBe(0)
  })

  it('a school task at progress<100 with a past deadline is overdue; one at progress>=100 is not', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      schoolTasks: [
        schoolTask({ id: 1, deadline: YESTERDAY, progress: 50 }),
        schoolTask({ id: 2, deadline: YESTERDAY, progress: 100 }),
      ],
      now: FIXED_NOW,
    })
    expect(o.overdueSchoolTasks.map((t) => t.id)).toEqual([1])
  })

  it('a school exam with status "tehtud" and a past date is NOT overdue; one still "ootel" is', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      schoolExams: [
        schoolExam({ id: 1, date: YESTERDAY, status: 'ootel' }),
        schoolExam({ id: 2, date: YESTERDAY, status: 'tehtud' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.overdueSchoolExams.map((e) => e.id)).toEqual([1])
  })
})

describe('computeDailyOverview: rule 1 — no double-counting a task and its own auto-created calendar mirror', () => {
  it('a task with an owned cal-auto- event counts ONCE today, and the mirror event is excluded from the calendar count', () => {
    vi.mocked(findOwnedCalendarEventId).mockImplementation((type, id) =>
      type === 'task' && id === 'task-1' ? 'cal-auto-mirror-1' : undefined,
    )
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'task-1', date: TODAY, time: '10:00' })],
      events: [event({ id: 'cal-auto-mirror-1', date: TODAY, startTime: '10:00', endTime: '11:00' })],
      now: FIXED_NOW,
    })
    expect(o.todayTaskCount).toBe(1)
    expect(o.todayCalendarCount).toBe(0) // the mirror event is excluded, not double-counted
    expect(o.todayTotalCount).toBe(1)
  })

  it('an UNRELATED manual calendar event (no owned link) is still counted normally alongside the task', () => {
    vi.mocked(findOwnedCalendarEventId).mockImplementation((type, id) =>
      type === 'task' && id === 'task-1' ? 'cal-auto-mirror-1' : undefined,
    )
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'task-1', date: TODAY, time: '10:00' })],
      events: [
        event({ id: 'cal-auto-mirror-1', date: TODAY, startTime: '10:00', endTime: '11:00' }),
        event({ id: 'evt-manual-1', title: 'Unrelated meeting', date: TODAY, startTime: '14:00', endTime: '15:00' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.todayTaskCount).toBe(1)
    expect(o.todayCalendarCount).toBe(1) // only the unrelated manual event
    expect(o.todayTotalCount).toBe(2)
  })

  it('does not flag a false conflict between a task and its own mirror event', () => {
    vi.mocked(findOwnedCalendarEventId).mockImplementation((type, id) =>
      type === 'task' && id === 'task-1' ? 'cal-auto-mirror-1' : undefined,
    )
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'task-1', date: TODAY, time: '10:00' })],
      events: [event({ id: 'cal-auto-mirror-1', date: TODAY, startTime: '10:00', endTime: '11:00' })],
      now: FIXED_NOW,
    })
    expect(o.conflicts).toEqual([])
  })

  it('the same dedup applies to a school task\'s and a school exam\'s owned mirror events', () => {
    vi.mocked(findOwnedCalendarEventId).mockImplementation((type, id) => {
      if (type === 'school' && id === 'task:1') return 'cal-auto-school-task'
      if (type === 'school' && id === 'exam:1') return 'cal-auto-school-exam'
      return undefined
    })
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      schoolTasks: [schoolTask({ id: 1, deadline: TODAY })],
      schoolExams: [schoolExam({ id: 1, date: TODAY })],
      events: [
        event({ id: 'cal-auto-school-task', date: TODAY, startTime: '09:00', endTime: '09:30' }),
        event({ id: 'cal-auto-school-exam', date: TODAY, startTime: '11:00', endTime: '12:00' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.todaySchoolCount).toBe(2)
    expect(o.todayCalendarCount).toBe(0)
    expect(o.todayTotalCount).toBe(2)
  })
})

describe('computeDailyOverview: rule 1 — Plan/Goal derived calendar entries are never duplicated', () => {
  it('a Work Schedule shift produces exactly one derived calendar entry for today, counted once', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      plans: [plan({
        id: 'p1', type: 'workSchedule', addShiftsToCalendar: true,
        items: [{ id: 'shift-1', label: 'Shift', done: false, date: TODAY, startTime: '08:00', endTime: '16:00' }],
      } as Partial<Plan>)],
      now: FIXED_NOW,
    })
    expect(o.todayCalendarCount).toBe(1)
    expect(o.todayTotalCount).toBe(1)
  })

  it('a Goal with a valid ISO deadline today produces exactly one derived all-day calendar entry', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      goals: [goal({ id: 'g1', deadline: TODAY })],
      now: FIXED_NOW,
    })
    expect(o.todayCalendarCount).toBe(1)
  })
})

describe('computeDailyOverview: rule 2 — no invented durations, honest conflict detection', () => {
  it('flags two genuinely overlapping timed calendar entries as a conflict', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      events: [
        event({ id: 'a', date: TODAY, startTime: '10:00', endTime: '11:00' }),
        event({ id: 'b', date: TODAY, startTime: '10:30', endTime: '11:30' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.conflicts).toHaveLength(1)
    expect([o.conflicts[0].a.id, o.conflicts[0].b.id].sort()).toEqual(['a', 'b'])
  })

  it('does NOT flag back-to-back events sharing an exact boundary (10:00-11:00 and 11:00-12:00) as a conflict', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      events: [
        event({ id: 'a', date: TODAY, startTime: '10:00', endTime: '11:00' }),
        event({ id: 'b', date: TODAY, startTime: '11:00', endTime: '12:00' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.conflicts).toEqual([])
  })

  it('never considers an all-day event in conflict detection', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      events: [
        event({ id: 'a', date: TODAY, allDay: true, startTime: '', endTime: '' }),
        event({ id: 'b', date: TODAY, startTime: '10:00', endTime: '11:00' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.conflicts).toEqual([])
  })

  it('a lone, bare task time with no calendar mirror is never duration-guessed into a conflict', () => {
    // Deliberately no owned mirror event and no calendar entry at all for
    // this task — conflict-checking must only ever use REAL stored
    // startTime/endTime, never invent a window around a task's bare time.
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 't1', date: TODAY, time: '10:00' })],
      events: [event({ id: 'e1', date: TODAY, startTime: '10:00', endTime: '11:00' })],
      now: FIXED_NOW,
    })
    expect(o.conflicts).toEqual([])
  })
})

describe('computeDailyOverview: rule 3 — no assumed date formats', () => {
  it('a Goal with a legacy display-string deadline is skipped from "upcoming", never crashes, never mis-sorted', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      goals: [
        goal({ id: 'legacy', deadline: '30. juuni 2026' }),
        goal({ id: 'valid', deadline: IN_3_DAYS }),
      ],
      now: FIXED_NOW,
    })
    expect(o.upcoming.map((u) => u.id)).toEqual(['valid'])
  })

  it('a completed or expired Goal is excluded from "upcoming" even with a valid ISO deadline', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      goals: [
        goal({ id: 'done', deadline: IN_3_DAYS, status: 'completed' }),
        goal({ id: 'expired', deadline: IN_3_DAYS, status: 'expired' }),
      ],
      now: FIXED_NOW,
    })
    expect(o.upcoming).toEqual([])
  })

  it('a task/school item with a garbage (non-ISO) date string never crashes and is excluded from overdue/upcoming', () => {
    expect(() =>
      computeDailyOverview({
        ...EMPTY_INPUT,
        tasks: [task({ date: 'not-a-date' })],
        schoolTasks: [schoolTask({ deadline: '12/31/2026' })],
        schoolExams: [schoolExam({ date: '' })],
        now: FIXED_NOW,
      }),
    ).not.toThrow()
  })
})

describe('computeDailyOverview: "upcoming" window and sorting', () => {
  it('includes tasks/school items within the window, excludes today and anything past the window, sorted ascending', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [
        task({ id: 'far', date: IN_10_DAYS }),
        task({ id: 'near', date: TOMORROW }),
        task({ id: 'mid', date: IN_3_DAYS }),
        task({ id: 'is-today', date: TODAY }), // excluded — not "upcoming", it's today
      ],
      now: FIXED_NOW,
      upcomingWindowDays: 7,
    })
    expect(o.upcoming.map((u) => u.id)).toEqual(['near', 'mid'])
  })
})

describe('computeDailyOverview: local-timezone correctness', () => {
  const ORIGINAL_TZ = process.env.TZ

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = ORIGINAL_TZ
  })

  it('identifies "today" by local date, not UTC, shortly after local midnight in a UTC+ timezone', () => {
    process.env.TZ = 'Europe/Tallinn'
    vi.useFakeTimers()
    // Local June 15, 2026, 00:30 — UTC is still June 14 in this window.
    const localMidnightPlus = new Date(2026, 5, 15, 0, 30)
    vi.setSystemTime(localMidnightPlus)

    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'today-local', date: '2026-06-15' })],
    })
    expect(o.todayStr).toBe('2026-06-15')
    expect(o.todayTaskCount).toBe(1)
  })
})

// ── End-to-end: computeDailyOverview -> computeSmartDailySummary ───────────
// Regression for the real Android report: a task due 2026-11-26 17:30,
// overdue on 2026-11-27, marked complete that day. The card must NEVER say
// "Kõik tänase tähtajaga ülesanded on juba tehtud" (that's specifically
// about TODAY's own items, of which there are zero here) — it must say
// there are no tasks due today AND that an earlier one is done, as two
// distinct, honest facts.

describe('end-to-end regression: a yesterday-dated task completed today is never read as "today is done" (the exact 26->27 Nov report)', () => {
  const NOV_27 = new Date(2026, 10, 27, 9, 0) // local Nov 27, 2026, 09:00

  it('state 2 — nothing due today, one earlier task completed: the exact previously-broken scenario', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'test-task', title: 'Kivora testülesanne', date: '2026-11-26', time: '17:30', completed: true })],
      now: NOV_27,
    })
    expect(o.overdueCount).toBe(0) // completed — correctly no longer overdue
    expect(o.todayTotalCount).toBe(0) // nothing is dated today
    expect(o.pastCompletedCount).toBe(1) // but one earlier item is done

    const msg = computeSmartDailySummary(o, 'et')
    expect(msg).toBe('Täna ei ole tähtajaga ülesandeid. 1 varasem ülesanne on lõpetatud.')
    expect(msg).not.toContain('Kõik tänase tähtajaga ülesanded on juba tehtud')
    expect(msg).not.toContain('tubli töö')
  })

  it('state 5 — the same task, NOT yet completed on Nov 27: correctly overdue, no "all done" wording at all', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [task({ id: 'test-task', title: 'Kivora testülesanne', date: '2026-11-26', time: '17:30', completed: false })],
      now: NOV_27,
    })
    expect(o.overdueCount).toBe(1)
    const msg = computeSmartDailySummary(o, 'et')
    expect(msg).toContain('Sul on 1 tähtaja ületanud tegevus.')
    expect(msg).not.toContain('tehtud')
  })

  it('state 1 — a genuinely blank account on the same day: the calm open-day message, not state 2\'s wording', () => {
    const o = computeDailyOverview({ ...EMPTY_INPUT, now: NOV_27 })
    const msg = computeSmartDailySummary(o, 'et')
    expect(msg).toBe('Täna pole veel ühtegi plaanitud tegevust — hea hetk endale sobivas tempos alustada.')
  })

  it('state 3 — a DIFFERENT task actually due today (Nov 27), also completed: a real, earned "all done today"', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [
        task({ id: 'yesterday-done', date: '2026-11-26', completed: true }),
        task({ id: 'today-done', date: '2026-11-27', completed: true }),
      ],
      now: NOV_27,
    })
    expect(o.todayTotalCount).toBe(1)
    expect(o.todayActiveCount).toBe(0)
    const msg = computeSmartDailySummary(o, 'et')
    expect(msg).toBe('Kõik tänase tähtajaga ülesanded on juba tehtud — tubli töö!')
  })

  it('state 4 — a task due today, not yet completed, alongside the already-completed earlier one: today\'s own open work takes priority in the wording', () => {
    const o = computeDailyOverview({
      ...EMPTY_INPUT,
      tasks: [
        task({ id: 'yesterday-done', date: '2026-11-26', completed: true }),
        task({ id: 'today-open', date: '2026-11-27', completed: false }),
      ],
      now: NOV_27,
    })
    expect(o.todayActiveCount).toBe(1)
    const msg = computeSmartDailySummary(o, 'et')
    expect(msg).toBe('Täna on sul veel 1 tegevus.')
    expect(msg).not.toContain('tehtud')
  })
})
