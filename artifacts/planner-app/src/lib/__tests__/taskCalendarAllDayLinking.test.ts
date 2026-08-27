/**
 * Regression tests for linked calendar-event behavior on dated tasks
 * without a time.
 *
 * Approved behavior:
 *   - A task with a date + explicit time -> timed calendar event.
 *   - A task with a date but no time -> all-day calendar event (never a
 *     fake 00:00-23:59 block, never the old 09:00-10:00 fallback).
 *   - All-day events are excluded from the hourly grid (layoutEvents) and
 *     rendered in the existing compact all-day row (Day/Week views already
 *     had this — reused as-is, not reimplemented).
 *   - Editing a task's title/date/time keeps updating the SAME linked
 *     calendar event (found via its `scheduled` EntityLink to a
 *     `cal-auto-`-prefixed event id) — never a duplicate — and converts it
 *     between timed/all-day as the task's own time comes and goes,
 *     including converting a legacy 09:00-10:00 event to all-day the next
 *     time a now-timeless task is saved.
 *   - Events the task didn't create (no owned `cal-auto-` link) are never
 *     touched by this sync.
 *
 * Uses the same fake-Firestore harness as taskDeleteCascade.test.ts: real
 * store modules (tasksStore/entityLinksStore/calendarStore) running against
 * mocked firebase/firestore, with onSnapshot callbacks captured by call
 * order and fired manually to seed in-memory state.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/taskCalendarAllDayLinking.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EntityLink } from '@/types/entityLinks'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Task } from '@/types'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore (same shape as taskDeleteCascade.test.ts) ───────────────

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const updateDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initTasksStore } from '@/lib/tasksStore'
import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import { runAutomaticLinking, syncTaskCalendarEvent } from '@/lib/automaticLinking'
import { layoutEvents } from '@/lib/calendar/eventLayout'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const UID = 'user-a'

// initTasksStore -> onSnapshot call 0, initEntityLinksStore -> call 1,
// initCalendarStore -> call 2 (fixed order set in beforeEach below).
function seedLinks(links: EntityLink[]) {
  const onNext = onSnapshotMock.mock.calls[1][1]
  onNext({ docs: links.map((l) => ({ data: () => l })) })
}
function seedCalendarEvents(events: MockCalendarEvent[]) {
  const onNext = onSnapshotMock.mock.calls[2][1]
  onNext({ docs: events.map((e) => ({ data: () => e })) })
}

function makeLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: `link-${Math.random().toString(36).slice(2, 8)}`,
    fromType: 'task',
    fromId: 'task-1',
    toType: 'calendar',
    toId: 'cal-auto-1000-abcd',
    relationType: 'scheduled',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Osta lilled',
    date: '2026-08-30',
    priority: 'medium',
    completed: false,
    ...overrides,
  }
}

/** All setDoc calls whose doc path is under this user's calendarEvents collection. */
function calendarEventWrites(): { path: string; data: MockCalendarEvent }[] {
  return setDocMock.mock.calls
    .map((c) => ({ path: (c[0] as { path: string }).path, data: c[1] as MockCalendarEvent }))
    .filter((c) => c.path.startsWith(`users/${UID}/calendarEvents/`))
}

beforeEach(() => {
  initTasksStore(null)
  initEntityLinksStore(null)
  initCalendarStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchMock.mockClear()

  initTasksStore(UID)     // onSnapshot call index 0
  initEntityLinksStore(UID) // onSnapshot call index 1
  initCalendarStore(UID)  // onSnapshot call index 2
  seedLinks([])
  seedCalendarEvents([])
})

// ── Creation: dated task, no time -> all-day event ──────────────────────────

describe('runAutomaticLinking — dated task with no time creates an all-day event', () => {
  it('creates exactly one calendar event, marked allDay, for a dated task with no time', async () => {
    const result = await runAutomaticLinking('task', 'task-1', 'et', {
      title: 'Osta lilled',
      date: '2026-08-30',
    })

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.allDay).toBe(true)
    expect(writes[0].data.title).toBe('Osta lilled')
    expect(writes[0].data.date).toBe('2026-08-30')
    expect(result.calendarEventId).toBe(writes[0].data.id)
  })

  it('never uses the old 09:00-10:00 fallback for a no-time task', async () => {
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-08-30' })

    const writes = calendarEventWrites()
    expect(writes[0].data.startTime).not.toBe('09:00')
    expect(writes[0].data.endTime).not.toBe('10:00')
  })

  it('does not fake all-day with a 00:00-23:59 block', async () => {
    await runAutomaticLinking('task', 'task-1', 'et', { title: 'Osta lilled', date: '2026-08-30' })

    const writes = calendarEventWrites()
    expect(writes[0].data.startTime).not.toBe('00:00')
    expect(writes[0].data.endTime).not.toBe('23:59')
  })

  it('a task with a date AND a time creates a normal timed event, not all-day', async () => {
    const result = await runAutomaticLinking('task', 'task-2', 'et', {
      title: 'Hambaarst',
      date: '2026-08-30',
      time: '14:00',
    })

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.allDay).toBe(false)
    expect(writes[0].data.startTime).toBe('14:00')
    expect(writes[0].data.endTime).toBe('15:00')
    expect(result.calendarEventId).not.toBeNull()
  })
})

// ── layoutEvents: all-day events never enter the hourly grid ───────────────

describe('layoutEvents — all-day events are excluded from the hourly grid (reused, unmodified)', () => {
  it('an all-day event produces zero positioned entries — never occupies the hourly grid', () => {
    const allDayEvent: MockCalendarEvent = {
      id: 'cal-auto-1-allday',
      title: 'Osta lilled',
      date: '2026-08-30',
      allDay: true,
      startTime: '',
      endTime: '',
      color: '#6F5AE8',
    }
    expect(layoutEvents([allDayEvent], 0, 22)).toEqual([])
  })

  it('a manually created timed event is still positioned normally (unaffected by this change)', () => {
    const timedEvent: MockCalendarEvent = {
      id: 'evt-manual-1',
      title: 'Team sync',
      date: '2026-08-30',
      startTime: '10:00',
      endTime: '11:00',
      color: '#3B82F6',
    }
    const positioned = layoutEvents([timedEvent], 0, 22)
    expect(positioned).toHaveLength(1)
    expect(positioned[0].event.id).toBe('evt-manual-1')
  })

  it('Day and Week views already have a dedicated compact all-day row (reused, not reimplemented here)', () => {
    const dayViewSrc = readFileSync(resolve(process.cwd(), 'src/components/calendar/DayView.tsx'), 'utf8')
    const weekGridSrc = readFileSync(resolve(process.cwd(), 'src/components/calendar/CalendarGrid.tsx'), 'utf8')
    for (const src of [dayViewSrc, weekGridSrc]) {
      expect(src).toMatch(/All-day \/ date-only event row/)
      expect(src).toMatch(/allDayEvents|dayAllDay/)
    }
  })
})

// ── Edit sync: same event updated, never duplicated ─────────────────────────

describe('syncTaskCalendarEvent — editing a task keeps its existing linked event in sync', () => {
  it('adding a time to a previously all-day task converts the same event to timed', async () => {
    seedLinks([makeLink({ toId: 'cal-auto-100-abc' })])
    seedCalendarEvents([{
      id: 'cal-auto-100-abc', title: 'Osta lilled', date: '2026-08-30',
      allDay: true, startTime: '', endTime: '', color: '#6F5AE8', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ time: '14:00' }))

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-100-abc')
    expect(writes[0].data.allDay).toBe(false)
    expect(writes[0].data.startTime).toBe('14:00')
    expect(writes[0].data.endTime).toBe('15:00')
  })

  it('removing the time from a previously timed task converts the same event back to all-day', async () => {
    seedLinks([makeLink({ toId: 'cal-auto-100-abc' })])
    seedCalendarEvents([{
      id: 'cal-auto-100-abc', title: 'Osta lilled', date: '2026-08-30',
      allDay: false, startTime: '14:00', endTime: '15:00', color: '#6F5AE8', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ time: undefined }))

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-100-abc')
    expect(writes[0].data.allDay).toBe(true)
    expect(writes[0].data.startTime).toBe('')
    expect(writes[0].data.endTime).toBe('')
  })

  it('editing the title and date updates the same event — no duplicate event is created', async () => {
    seedLinks([makeLink({ toId: 'cal-auto-100-abc' })])
    seedCalendarEvents([{
      id: 'cal-auto-100-abc', title: 'Osta lilled', date: '2026-08-30',
      allDay: true, startTime: '', endTime: '', color: '#6F5AE8', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ title: 'Osta roosid', date: '2026-09-01' }))

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1) // exactly one write — the existing event, not a new one
    expect(writes[0].data.id).toBe('cal-auto-100-abc')
    expect(writes[0].data.title).toBe('Osta roosid')
    expect(writes[0].data.date).toBe('2026-09-01')
  })

  it('saving a legacy no-time task whose linked event still holds the old 09:00-10:00 fallback converts it to all-day', async () => {
    seedLinks([makeLink({ toId: 'cal-auto-100-abc' })])
    seedCalendarEvents([{
      // Simulates an event auto-created before this fix, still carrying the
      // old fallback and no allDay flag at all.
      id: 'cal-auto-100-abc', title: 'Osta lilled', date: '2026-08-30',
      startTime: '09:00', endTime: '10:00', color: '#6F5AE8', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ time: undefined }))

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.allDay).toBe(true)
    expect(writes[0].data.startTime).toBe('')
    expect(writes[0].data.endTime).toBe('')
  })

  it('a manually created timed calendar event with no owned auto-link is never touched', async () => {
    // The task has no scheduled link to any cal-auto- event at all.
    seedLinks([])
    seedCalendarEvents([{
      id: 'evt-manual-1', title: 'Unrelated meeting', date: '2026-08-30',
      startTime: '10:00', endTime: '11:00', color: '#3B82F6', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ time: '14:00' }))

    expect(calendarEventWrites()).toHaveLength(0)
    expect(getAllEvents().find((e) => e.id === 'evt-manual-1')).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })

  it('a link pointing at a non-cal-auto- event (manually linked, not owned) is never touched', async () => {
    seedLinks([makeLink({ toId: 'cal-1234-manual' })])
    seedCalendarEvents([{
      id: 'cal-1234-manual', title: 'Pre-existing event', date: '2026-08-30',
      startTime: '10:00', endTime: '11:00', color: '#3B82F6', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ time: undefined }))

    expect(calendarEventWrites()).toHaveLength(0)
  })

  it('a task with no date is a no-op, even if it has an owned linked event', async () => {
    seedLinks([makeLink({ toId: 'cal-auto-100-abc' })])
    seedCalendarEvents([{
      id: 'cal-auto-100-abc', title: 'Osta lilled', date: '2026-08-30',
      allDay: true, startTime: '', endTime: '', color: '#6F5AE8', calendarId: 'mine',
    }])

    await syncTaskCalendarEvent(makeTask({ date: undefined }))

    expect(calendarEventWrites()).toHaveLength(0)
  })
})
