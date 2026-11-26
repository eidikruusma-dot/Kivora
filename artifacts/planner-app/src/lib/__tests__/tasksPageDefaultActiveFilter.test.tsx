// @vitest-environment jsdom
/**
 * TasksPage.tsx's filter tabs (round 5 of the Tasks module redesign, per
 * the confirmed design reference): default filter is now "Kõik" (All) —
 * previously it defaulted to "Aktiivsed" (Active), which mixed well with a
 * 3-tab strip but hid tasks from the new primary view once the module
 * gained date-based filters. "Aktiivsed" is KEPT as its own filter (the
 * user explicitly asked to preserve it), alongside two new date-based
 * filters, "Täna" (today) and "Tulevased" (upcoming). Tab order is now
 * Kõik -> Aktiivsed -> Täna -> Tulevased -> Tehtud.
 *
 * Everything else — filteredTasks' per-filter predicate structure, counts,
 * task CRUD, Firestore persistence, and the max-w-full overflow-x-auto
 * mobile scroll fix on the tab strip — is unchanged; this file proves the
 * new default + full tab set behaviorally against a real render, not just
 * via source regex.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksPageDefaultActiveFilter.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(async () => {}) })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import { initTasksStore } from '@/lib/tasksStore'
import { localTodayStr, localDateStrWithOffset } from '@/lib/tasksSummary'
import TasksPage from '@/views/TasksPage'
import type { Task } from '@/types'

function pumpTasks(tasks: Task[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  act(() => {
    onNext({ docs: tasks.map((task) => ({ data: () => task })) })
  })
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-x',
    title: 'Task',
    completed: false,
    priority: 'medium',
    category: 'Töö',
    date: '',
    time: '',
    ...overrides,
  } as Task
}

function renderTasksPage() {
  return render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  initTasksStore(null)
  fakeDb.clear()
  onSnapshotMock.mockClear()
  unsubscribeMock.mockClear()
  initTasksStore(UID) // onSnapshot call index 0
})

afterEach(cleanup)

describe('TasksPage defaults to the "Kõik" (All) filter on mount', () => {
  it('renders both completed and non-completed tasks by default, with the Kõik tab visually selected', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Buy milk', completed: false }),
      task({ id: 't2', title: 'Finished report', completed: true }),
    ])

    expect(screen.queryByText('Buy milk')).toBeTruthy()
    expect(screen.queryByText('Finished report')).toBeTruthy()

    const allTab = screen.getByRole('button', { name: /Kõik/ })
    expect(allTab.className).toMatch(/bg-\[#EDE9FB\] dark:bg-\[#3B2F66\] text-\[#6F5AE8\] dark:text-\[#C4B5FD\]/)
  })
})

describe('Aktiivsed (kept, per explicit requirement) excludes completed tasks regardless of date', () => {
  it('switching to Aktiivsed shows only non-completed tasks', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Active task', completed: false }),
      task({ id: 't2', title: 'Done task', completed: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Aktiivsed/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Kõik/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeTruthy()
  })
})

describe('Täna shows only tasks dated today (local calendar day, not UTC)', () => {
  it('the Täna tab includes a task dated today and excludes one dated tomorrow', () => {
    renderTasksPage()
    const today = localTodayStr()
    const tomorrow = localDateStrWithOffset(1)
    pumpTasks([
      task({ id: 't1', title: 'Today task', date: today }),
      task({ id: 't2', title: 'Tomorrow task', date: tomorrow }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Täna/ }))
    expect(screen.queryByText('Today task')).toBeTruthy()
    expect(screen.queryByText('Tomorrow task')).toBeNull()
  })
})

describe('Tulevased shows only tasks dated after today', () => {
  it('the Tulevased tab includes a task dated tomorrow and excludes one dated today', () => {
    renderTasksPage()
    const today = localTodayStr()
    const tomorrow = localDateStrWithOffset(1)
    pumpTasks([
      task({ id: 't1', title: 'Today task', date: today }),
      task({ id: 't2', title: 'Tomorrow task', date: tomorrow }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Tulevased/ }))
    expect(screen.queryByText('Tomorrow task')).toBeTruthy()
    expect(screen.queryByText('Today task')).toBeNull()
  })
})

describe('Tehtud contains only completed tasks', () => {
  it('the Tehtud tab shows only completed tasks', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Active task', completed: false }),
      task({ id: 't2', title: 'Done task', completed: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Tehtud/ }))
    expect(screen.queryByText('Done task')).toBeTruthy()
    expect(screen.queryByText('Active task')).toBeNull()
  })
})

describe('Kõik contains every task regardless of completion or date', () => {
  it('the Kõik tab shows every task', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Active task', completed: false }),
      task({ id: 't2', title: 'Done task', completed: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Tehtud/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Kõik/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeTruthy()
  })
})

describe('tab render order is Kõik -> Aktiivsed -> Täna -> Tulevased -> Tehtud', () => {
  it('the five filter-tab buttons appear in that order in the DOM', () => {
    renderTasksPage()
    pumpTasks([task({ id: 't1', completed: false })])

    const strip = screen.getByRole('button', { name: /^Kõik/ }).parentElement!
    const labels = within(strip).getAllByRole('button').map((b) => b.textContent)
    expect(labels[0]).toMatch(/^Kõik/)
    expect(labels[1]).toMatch(/Aktiivsed/)
    expect(labels[2]).toMatch(/Täna/)
    expect(labels[3]).toMatch(/Tulevased/)
    expect(labels[4]).toMatch(/Tehtud/)
  })
})

describe('the mobile component-scoped horizontal scroll fix on the tab strip remains intact', () => {
  it('the strip wrapper still caps its width and scrolls internally on mobile', () => {
    renderTasksPage()
    pumpTasks([task({ id: 't1', completed: false })])

    const strip = screen.getByRole('button', { name: /^Kõik/ }).parentElement!
    expect(strip.className).toMatch(/max-w-full overflow-x-auto sm:w-fit/)
  })
})
