// @vitest-environment jsdom
/**
 * TasksPage.tsx's filter tabs used to default to "Kõik" / All, which mixed
 * completed tasks into the primary working view, and were ordered
 * All -> Active -> Completed. This changes only the filter semantics:
 * default filter is now Active, and tab order is Active -> Completed -> All
 * (see the reordered array + `useState<...>('active')` in TasksPage.tsx and
 * the matching structural update in tasksFilterTabStripMobileOverflow.test.ts).
 *
 * Everything else — filteredTasks' active/completed/all predicate itself,
 * counts, search/category/priority filters, sorting, task CRUD, Firestore
 * persistence, and the max-w-full overflow-x-auto mobile scroll fix on the
 * tab strip — is unchanged; this file proves the new default + order
 * behaviorally against a real render, not just via source regex.
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

describe('TasksPage defaults to the Active filter on mount', () => {
  it('renders only non-completed tasks by default, with the Active tab visually selected', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Buy milk', completed: false }),
      task({ id: 't2', title: 'Finished report', completed: true }),
    ])

    expect(screen.queryByText('Buy milk')).toBeTruthy()
    expect(screen.queryByText('Finished report')).toBeNull()

    const activeTab = screen.getByRole('button', { name: /Aktiivsed/ })
    expect(activeTab.className).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\]/)
  })
})

describe('Active excludes completed tasks', () => {
  it('switching away and back to Active shows only non-completed tasks', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Active task', completed: false }),
      task({ id: 't2', title: 'Done task', completed: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Kõik/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Aktiivsed/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeNull()
  })
})

describe('Completed contains only completed tasks', () => {
  it('the Completed tab shows only completed tasks', () => {
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

describe('All contains both active and completed tasks', () => {
  it('the All tab shows every task regardless of completion', () => {
    renderTasksPage()
    pumpTasks([
      task({ id: 't1', title: 'Active task', completed: false }),
      task({ id: 't2', title: 'Done task', completed: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Kõik/ }))
    expect(screen.queryByText('Active task')).toBeTruthy()
    expect(screen.queryByText('Done task')).toBeTruthy()
  })
})

describe('tab render order is Active -> Completed -> All', () => {
  it('the three filter-tab buttons appear in that order in the DOM', () => {
    renderTasksPage()
    pumpTasks([task({ id: 't1', completed: false })])

    const strip = screen.getByRole('button', { name: /Aktiivsed/ }).parentElement!
    const labels = within(strip).getAllByRole('button').map((b) => b.textContent)
    expect(labels[0]).toMatch(/Aktiivsed/)
    expect(labels[1]).toMatch(/Tehtud/)
    expect(labels[2]).toMatch(/Kõik/)
  })
})

describe('the mobile component-scoped horizontal scroll fix on the tab strip remains intact', () => {
  it('the strip wrapper still caps its width and scrolls internally on mobile', () => {
    renderTasksPage()
    pumpTasks([task({ id: 't1', completed: false })])

    const strip = screen.getByRole('button', { name: /Aktiivsed/ }).parentElement!
    expect(strip.className).toMatch(/max-w-full overflow-x-auto sm:w-fit/)
  })
})
