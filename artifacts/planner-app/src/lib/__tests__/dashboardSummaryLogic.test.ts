/**
 * computeDashboardSummary (src/lib/dashboardSummary.ts) is the Kivora AI
 * card's default "Tänane ülevaade" / "Today's overview" block — a pure,
 * local, rule-based function over the user's real task/calendar counts.
 * It must NEVER call the AI/model (that only happens via the separate,
 * explicitly-labelled "Küsi AI soovitust" button in KivoraAICard.tsx) and
 * must never fabricate data — every branch here is driven purely by the
 * numeric input, never a hardcoded "sample" sentence unrelated to it.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardSummary, computeSmartDailySummary } from '@/lib/dashboardSummary'
import type { DailyOverview } from '@/lib/dailyObservations'

describe('computeDashboardSummary: open day (nothing planned)', () => {
  it('ET: returns the calm open-day message when there are no tasks and no events', () => {
    const msg = computeDashboardSummary({ tasksTotal: 0, tasksCompleted: 0, eventsToday: 0 }, 'et')
    expect(msg).toBe('Täna pole veel ühtegi plaanitud tegevust — hea hetk endale sobivas tempos alustada.')
  })

  it('EN: returns the calm open-day message when there are no tasks and no events', () => {
    const msg = computeDashboardSummary({ tasksTotal: 0, tasksCompleted: 0, eventsToday: 0 }, 'en')
    expect(msg).toBe('Nothing is scheduled for today yet — a good moment to start at your own pace.')
  })
})

describe('computeDashboardSummary: all tasks done', () => {
  it('ET: congratulates when every task is completed and there are no events', () => {
    const msg = computeDashboardSummary({ tasksTotal: 3, tasksCompleted: 3, eventsToday: 0 }, 'et')
    expect(msg).toBe('Kõik tänased ülesanded on juba tehtud — tubli töö!')
  })

  it('ET: congratulates AND mentions remaining events (singular) when tasks are done but an event remains', () => {
    const msg = computeDashboardSummary({ tasksTotal: 2, tasksCompleted: 2, eventsToday: 1 }, 'et')
    expect(msg).toBe('Kõik tänased ülesanded on juba tehtud — tubli töö! Kalendris on täna 1 sündmus.')
  })

  it('EN: congratulates AND mentions remaining events (plural) when tasks are done but events remain', () => {
    const msg = computeDashboardSummary({ tasksTotal: 2, tasksCompleted: 2, eventsToday: 3 }, 'en')
    expect(msg).toBe("All of today's tasks are already done — great work! Your calendar has 3 events.")
  })
})

describe('computeDashboardSummary: tasks remaining (the common case)', () => {
  it('ET: singular "ülesanne" for exactly 1 remaining task, no events', () => {
    const msg = computeDashboardSummary({ tasksTotal: 1, tasksCompleted: 0, eventsToday: 0 }, 'et')
    expect(msg).toBe('Täna ootab sind veel 1 ülesanne.')
  })

  it('ET: partitive "ülesannet" for more than 1 remaining task', () => {
    const msg = computeDashboardSummary({ tasksTotal: 5, tasksCompleted: 2, eventsToday: 0 }, 'et')
    expect(msg).toBe('Täna ootab sind veel 3 ülesannet.')
  })

  it('ET: combines remaining tasks AND today\'s events in one sentence', () => {
    const msg = computeDashboardSummary({ tasksTotal: 3, tasksCompleted: 1, eventsToday: 2 }, 'et')
    expect(msg).toBe('Täna ootab sind veel 2 ülesannet. Kalendris on täna 2 sündmust.')
  })

  it('EN: singular "task" for exactly 1 remaining task', () => {
    const msg = computeDashboardSummary({ tasksTotal: 1, tasksCompleted: 0, eventsToday: 0 }, 'en')
    expect(msg).toBe('Today you still have 1 task.')
  })

  it('EN: plural "tasks" for more than 1 remaining task, combined with events', () => {
    const msg = computeDashboardSummary({ tasksTotal: 4, tasksCompleted: 1, eventsToday: 1 }, 'en')
    expect(msg).toBe('Today you still have 3 tasks. Your calendar has 1 event.')
  })
})

describe('computeDashboardSummary: events-only day (no tasks scheduled, but events exist)', () => {
  it('ET: mentions only the events note when there are zero tasks but events remain', () => {
    const msg = computeDashboardSummary({ tasksTotal: 0, tasksCompleted: 0, eventsToday: 2 }, 'et')
    expect(msg).toBe('Kalendris on täna 2 sündmust.')
  })
})

describe('computeDashboardSummary: purity and no AI involvement', () => {
  it('is a synchronous pure function — same input always returns the same output, no async/model call', () => {
    const input = { tasksTotal: 2, tasksCompleted: 1, eventsToday: 1 } as const
    const a = computeDashboardSummary(input, 'et')
    const b = computeDashboardSummary(input, 'et')
    expect(a).toBe(b)
  })

  it('never returns an empty string for any non-negative input combination', () => {
    for (const tasksTotal of [0, 1, 5]) {
      for (const tasksCompleted of [0, 1]) {
        for (const eventsToday of [0, 1, 2]) {
          if (tasksCompleted > tasksTotal) continue
          const msg = computeDashboardSummary({ tasksTotal, tasksCompleted, eventsToday }, 'et')
          expect(msg.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// ── computeSmartDailySummary (Kivora 2.0, Etapp 1) — composed from a
// DailyOverview (dailyObservations.ts). computeDashboardSummary above is
// untouched and still used wherever a caller only has the old, narrower
// input shape. ──────────────────────────────────────────────────────────

function overview(overrides: Partial<DailyOverview> = {}): DailyOverview {
  return {
    todayStr: '2026-06-15',
    hasAnyData: false,
    overdueTasks: [], overdueSchoolTasks: [], overdueSchoolExams: [], overdueCount: 0,
    todayTaskCount: 0, todaySchoolCount: 0, todayActiveCount: 0, todayCalendarCount: 0, todayTotalCount: 0,
    upcoming: [],
    conflicts: [],
    ...overrides,
  }
}

describe('computeSmartDailySummary: honest empty state (rule 4) — never a congratulation for work that never existed', () => {
  it('ET: a genuinely empty day returns the calm open-day message, never "all done"', () => {
    const msg = computeSmartDailySummary(overview(), 'et')
    expect(msg).toBe('Täna pole veel ühtegi plaanitud tegevust — hea hetk endale sobivas tempos alustada.')
  })

  it('EN: same for English', () => {
    const msg = computeSmartDailySummary(overview(), 'en')
    expect(msg).toBe('Nothing is scheduled for today yet — a good moment to start at your own pace.')
  })
})

describe('computeSmartDailySummary: a real, earned "all done" vs. an empty day are never conflated', () => {
  it('ET: says "all done" only when something existed today and all of it is finished (explicitly "tänase tähtajaga", never conflated with the generic computeDashboardSummary wording)', () => {
    const msg = computeSmartDailySummary(overview({ todayTotalCount: 2, todayActiveCount: 0 }), 'et')
    expect(msg).toBe('Kõik tänase tähtajaga ülesanded on juba tehtud — tubli töö!')
  })

  it('ET: nothing today, but something completed BEFORE today, is phrased distinctly from "empty" AND from "all done today" (the exact 26->27 Nov bug)', () => {
    const msg = computeSmartDailySummary(overview({ pastCompletedCount: 1 }), 'et')
    expect(msg).toBe('Täna ei ole tähtajaga ülesandeid. 1 varasem ülesanne on lõpetatud.')
    expect(msg).not.toContain('tänase tähtajaga ülesanded on juba tehtud')
    expect(msg).not.toBe('Täna pole veel ühtegi plaanitud tegevust — hea hetk endale sobivas tempos alustada.')
  })

  it('EN: same, with correct singular/plural "is/are done"', () => {
    const one = computeSmartDailySummary(overview({ pastCompletedCount: 1 }), 'en')
    expect(one).toBe('There are no tasks due today. 1 earlier task is done.')
    const two = computeSmartDailySummary(overview({ pastCompletedCount: 2 }), 'en')
    expect(two).toBe('There are no tasks due today. 2 earlier tasks are done.')
  })

  it('ET: nothing today but something real coming up is phrased distinctly from both "empty" and "all done"', () => {
    const msg = computeSmartDailySummary(
      overview({ upcoming: [{ type: 'task', id: 't1', title: 'X', date: '2026-06-17', daysUntil: 2 }] }),
      'et',
    )
    expect(msg).toContain('Täna pole midagi planeeritud, kuid lähiajal on tulekul tähtaegu.')
    expect(msg).not.toContain('tehtud')
  })
})

describe('computeSmartDailySummary: priority order — overdue and conflicts surface first', () => {
  it('ET: overdue is mentioned even when today itself has active items', () => {
    const msg = computeSmartDailySummary(
      overview({ overdueCount: 2, todayTotalCount: 1, todayActiveCount: 1 }),
      'et',
    )
    expect(msg).toContain('Sul on 2 tähtaja ületanud tegevust.')
    expect(msg).toContain('Täna on sul veel 1 tegevus.')
  })

  it('ET: a time conflict is mentioned, with correct singular/plural noun form', () => {
    const one = computeSmartDailySummary(
      overview({ conflicts: [{ a: { id: 'a', title: 'A', startTime: '10:00', endTime: '11:00' }, b: { id: 'b', title: 'B', startTime: '10:30', endTime: '11:30' } }] }),
      'et',
    )
    expect(one).toContain('Täna kattub ajaliselt 1 ajakonflikt.')
  })
})

describe('computeSmartDailySummary: never fabricates a duration/workload figure', () => {
  it('no output for any combination ever contains the words "tund"/"tundi" (hours) or "minut" (minutes)', () => {
    const combos: Partial<DailyOverview>[] = [
      {},
      { overdueCount: 3 },
      { todayTotalCount: 5, todayActiveCount: 5 },
      { todayTotalCount: 4, todayActiveCount: 0 },
      { upcoming: [{ type: 'task', id: 't1', title: 'X', date: '2026-06-20', daysUntil: 5 }] },
      { conflicts: [{ a: { id: 'a', title: 'A', startTime: '09:00', endTime: '10:00' }, b: { id: 'b', title: 'B', startTime: '09:30', endTime: '10:30' } }] },
    ]
    for (const c of combos) {
      const msg = computeSmartDailySummary(overview(c), 'et')
      expect(msg.toLowerCase()).not.toMatch(/\btund(i)?\b|\bminut/)
    }
  })

  it('is a synchronous pure function — same input always returns the same output', () => {
    const input = overview({ overdueCount: 1, todayTotalCount: 2, todayActiveCount: 1 })
    expect(computeSmartDailySummary(input, 'et')).toBe(computeSmartDailySummary(input, 'et'))
  })
})
