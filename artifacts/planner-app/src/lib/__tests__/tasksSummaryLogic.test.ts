/**
 * tasksSummary.ts — the Tasks module's "Kivora AI soovitab" banner logic.
 * Free, local, rule-based (no AI/model call), computed purely from the
 * user's real tasks. Mirrors dashboardSummary.ts's philosophy for the
 * "Minu päev" module.
 */
import { describe, it, expect } from 'vitest'
import { computeTaskSuggestion, getMostImportantTask, localTodayStr, localDateStrWithOffset } from '@/lib/tasksSummary'
import type { Task } from '@/types'

const TODAY = '2026-06-15'
const YESTERDAY = '2026-06-14'
const TOMORROW = '2026-06-16'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-x',
    title: 'Task',
    completed: false,
    priority: 'medium',
    date: undefined,
    time: undefined,
    ...overrides,
  } as Task
}

describe('localTodayStr / localDateStrWithOffset: local calendar day, never UTC', () => {
  it('formats a given Date as YYYY-MM-DD using its local fields (no toISOString/UTC conversion)', () => {
    const d = new Date(2026, 5, 15, 1, 30) // local June 15, 2026, 01:30 — would be June 14 in some UTC+ zones if toISOString() were used
    expect(localTodayStr(d)).toBe('2026-06-15')
  })

  it('offsets by local calendar days, correctly rolling over month/year boundaries', () => {
    const d = new Date(2026, 0, 1) // Jan 1, 2026
    expect(localDateStrWithOffset(-1, d)).toBe('2025-12-31')
    expect(localDateStrWithOffset(1, d)).toBe('2026-01-02')
  })
})

describe('getMostImportantTask: overdue first, then today-high-priority, then today-any, then soonest active', () => {
  it('picks an overdue active task over everything else', () => {
    const tasks = [
      task({ id: 'overdue', date: YESTERDAY, priority: 'low' }),
      task({ id: 'today-high', date: TODAY, priority: 'high' }),
    ]
    expect(getMostImportantTask(tasks, TODAY)?.id).toBe('overdue')
  })

  it('picks the highest-priority today task when nothing is overdue', () => {
    const tasks = [
      task({ id: 'today-medium', date: TODAY, priority: 'medium' }),
      task({ id: 'today-high', date: TODAY, priority: 'high' }),
    ]
    expect(getMostImportantTask(tasks, TODAY)?.id).toBe('today-high')
  })

  it('falls back to any today task when none is high priority', () => {
    const tasks = [task({ id: 'today-low', date: TODAY, priority: 'low' })]
    expect(getMostImportantTask(tasks, TODAY)?.id).toBe('today-low')
  })

  it('falls back to the soonest other active task when nothing is today or overdue', () => {
    const tasks = [
      task({ id: 'future-late', date: '2026-07-01' }),
      task({ id: 'future-soon', date: TOMORROW }),
    ]
    expect(getMostImportantTask(tasks, TODAY)?.id).toBe('future-soon')
  })

  it('ignores completed tasks entirely', () => {
    const tasks = [task({ id: 'done-overdue', date: YESTERDAY, completed: true })]
    expect(getMostImportantTask(tasks, TODAY)).toBeUndefined()
  })

  it('returns undefined when there are no active tasks at all', () => {
    expect(getMostImportantTask([], TODAY)).toBeUndefined()
  })
})

describe('computeTaskSuggestion: real-data-only text, never fabricated', () => {
  it('reports overdue count first when overdue tasks exist', () => {
    const tasks = [
      task({ id: 'o1', date: YESTERDAY }),
      task({ id: 'o2', date: YESTERDAY }),
      task({ id: 'today-high', date: TODAY, priority: 'high' }),
    ]
    expect(computeTaskSuggestion(tasks, 'et', TODAY)).toBe('Sul on 2 tähtaja ületanud ülesannet. Tegele nendega esimesena.')
  })

  it('reports today high-priority count when nothing is overdue', () => {
    const tasks = [task({ id: 't1', date: TODAY, priority: 'high' })]
    expect(computeTaskSuggestion(tasks, 'et', TODAY)).toBe('Sul on täna 1 tähtsat ülesannet. Tee need ära esimesena – nii püsib päev selge ja produktiivne.')
  })

  it('reports today count (any priority) when no high-priority today task exists', () => {
    const tasks = [task({ id: 't1', date: TODAY, priority: 'low' })]
    expect(computeTaskSuggestion(tasks, 'et', TODAY)).toBe('Sul on täna 1 ülesannet. Vaata need üle ja alusta sobivaimast.')
  })

  it('reports remaining active count when nothing is due today or overdue', () => {
    const tasks = [task({ id: 't1', date: TOMORROW })]
    expect(computeTaskSuggestion(tasks, 'et', TODAY)).toBe('Täna pole tähtajaga ülesandeid, kuid sul on veel 1 lõpetamata ülesannet.')
  })

  it('reports all-done when there are no active tasks', () => {
    expect(computeTaskSuggestion([], 'et', TODAY)).toBe('Kõik ülesanded on tehtud! Tubli töö.')
  })

  it('EN equivalents exist for every branch', () => {
    expect(computeTaskSuggestion([task({ date: YESTERDAY })], 'en', TODAY)).toMatch(/overdue tasks/)
    expect(computeTaskSuggestion([task({ date: TODAY, priority: 'high' })], 'en', TODAY)).toMatch(/important tasks today/)
    expect(computeTaskSuggestion([task({ date: TODAY, priority: 'low' })], 'en', TODAY)).toMatch(/tasks today/)
    expect(computeTaskSuggestion([task({ date: TOMORROW })], 'en', TODAY)).toMatch(/open tasks/)
    expect(computeTaskSuggestion([], 'en', TODAY)).toMatch(/All tasks are done/)
  })
})
