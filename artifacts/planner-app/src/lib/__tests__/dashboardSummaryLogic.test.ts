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
import { computeDashboardSummary } from '@/lib/dashboardSummary'

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
