// @vitest-environment jsdom
/**
 * TasksWidget.tsx previously computed "today" via
 * `new Date().toISOString().slice(0, 10)`, which reads the UTC calendar
 * date. For a user in a positive UTC-offset timezone (e.g. Estonia,
 * UTC+2/+3), the local calendar day rolls over to the next date 2-3 hours
 * before the UTC day does — so for those first few hours after local
 * midnight, toISOString() still reports *yesterday's* date, and a task
 * dated "today" silently disappeared from the "Minu päev" widget.
 *
 * Fix: TasksWidget now computes todayStr via the shared `localTodayStr()`
 * helper (src/lib/tasksSummary.ts), which reads the Date object's local
 * fields (getFullYear/getMonth/getDate) instead of converting to UTC.
 *
 * This test proves the fix against a real render: it sets the process
 * timezone to Europe/Tallinn and fakes the system clock to a moment
 * shortly after local midnight where the local and UTC calendar dates
 * differ, then confirms a task dated with today's *local* date still
 * renders — and a task dated with yesterday's local date does not.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksWidgetUtcMidnightFix.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

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
import TasksWidget from '@/components/dashboard/TasksWidget'
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

function renderWidget() {
  return render(
    <MemoryRouter>
      <TasksWidget />
    </MemoryRouter>,
  )
}

const ORIGINAL_TZ = process.env.TZ

beforeEach(() => {
  process.env.TZ = 'Europe/Tallinn'
  initTasksStore(null)
  onSnapshotMock.mockClear()
  unsubscribeMock.mockClear()
  initTasksStore(UID) // onSnapshot call index 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  process.env.TZ = ORIGINAL_TZ
})

describe('TasksWidget shows today\'s task correctly shortly after local midnight in a UTC+ timezone', () => {
  it('a task dated with the local calendar date still renders at 00:30 local time, even though the UTC date is still yesterday', () => {
    // Local June 15, 2026, 00:30 in Europe/Tallinn (UTC+3 in June) is still
    // June 14 in UTC — this is exactly the window where the old
    // `toISOString().slice(0, 10)` code computed the wrong day.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 0, 30))

    renderWidget()
    pumpTasks([
      task({ id: 't1', title: 'Today local task', date: '2026-06-15' }),
      task({ id: 't2', title: 'Yesterday local task', date: '2026-06-14' }),
    ])

    expect(screen.queryByText('Today local task')).toBeTruthy()
    expect(screen.queryByText('Yesterday local task')).toBeNull()
  })

  it('a task with no date is always treated as today\'s (unchanged behavior)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 0, 30))

    renderWidget()
    pumpTasks([task({ id: 't1', title: 'Undated task', date: '' })])

    expect(screen.queryByText('Undated task')).toBeTruthy()
  })
})

describe('TasksWidget.tsx source no longer uses the UTC-based date pattern', () => {
  it('imports and uses localTodayStr() instead of toISOString().slice(0, 10)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/TasksWidget.tsx'),
      'utf8',
    )
    expect(src).toMatch(/import \{ localTodayStr \} from '@\/lib\/tasksSummary'/)
    expect(src).toMatch(/const todayStr = localTodayStr\(\)/)
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/)
  })
})
