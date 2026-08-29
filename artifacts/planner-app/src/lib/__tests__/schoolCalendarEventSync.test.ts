/**
 * School change #2 — a School task's or exam's auto-created Calendar event
 * used to go stale when the item's own date was edited: runAutomaticLinking
 * only ever ran on CREATE (SchoolPage.tsx's addTask/addExam save handlers),
 * never on edit, so the already-created `calendarEvents` document stayed on
 * its original date forever after.
 *
 * Fix: syncSchoolCalendarEvent(kind, rawId, date) (automaticLinking.ts) —
 * the School equivalent of the existing syncTaskCalendarEvent, reusing the
 * exact same "find the owned `scheduled` EntityLink to a `cal-auto-`
 * prefixed event, then updateCalendarEvent() on that same id" pattern. No
 * new link/calendar architecture — this is the identical mechanism Tasks
 * already used, just wired up for School's compound entity id.
 *
 * Wired into SchoolPage.tsx's `updateTask`/`updateExam` (the two functions
 * every edit-save handler already calls), so it fires automatically after
 * every School task/exam save that carries a date field — never touching
 * status-only patches (markDone/markUndone) since those never include a
 * date, and never creating a new event on its own (only runAutomaticLinking
 * creates events; this function only ever finds-and-updates one that
 * already exists).
 *
 * Uses the same fake-Firestore harness as taskCalendarAllDayLinking.test.ts:
 * real entityLinksStore/calendarStore modules against mocked
 * firebase/firestore, onSnapshot callbacks fired manually to seed state.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolCalendarEventSync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntityLink } from '@/types/entityLinks'
import { encodeSchoolId } from '@/types/entityLinks'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore (same shape as taskCalendarAllDayLinking.test.ts) ───────

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import { syncSchoolCalendarEvent } from '@/lib/automaticLinking'

const UID = 'user-a'

// initEntityLinksStore -> onSnapshot call 0, initCalendarStore -> call 1
// (fixed order set in beforeEach below).
function seedLinks(links: EntityLink[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: links.map((l) => ({ data: () => l })) })
}
function seedCalendarEvents(events: MockCalendarEvent[]) {
  const onNext = onSnapshotMock.mock.calls[1][1]
  onNext({ docs: events.map((e) => ({ data: () => e })) })
}

function makeLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: `link-${Math.random().toString(36).slice(2, 8)}`,
    fromType: 'school',
    fromId: encodeSchoolId('task', 1),
    toType: 'calendar',
    toId: 'cal-auto-1000-abcd',
    relationType: 'scheduled',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeEvent(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return {
    id: 'cal-auto-1000-abcd',
    title: 'Matemaatika kodutöö',
    date: '2026-08-30',
    allDay: true,
    startTime: '',
    endTime: '',
    color: '#6F5AE8',
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
  initEntityLinksStore(null)
  initCalendarStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchMock.mockClear()

  initEntityLinksStore(UID) // onSnapshot call index 0
  initCalendarStore(UID)    // onSnapshot call index 1
  seedLinks([])
  seedCalendarEvents([])
})

// ── 1. School task date edit updates its existing Calendar event ──────────

describe('1. editing a School task\'s date moves its existing auto-created Calendar event', () => {
  it('updateCalendarEvent is called with the same event, date changed to the new one', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd', date: '2026-08-30' })])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-1000-abcd')
    expect(writes[0].data.date).toBe('2026-09-15')
  })
})

// ── 2. School exam/test date edit updates its existing Calendar event ─────

describe('2. editing a School exam/test\'s date moves its existing auto-created Calendar event', () => {
  it('updateCalendarEvent is called with the same event, date changed to the new one', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 7), toId: 'cal-auto-2000-wxyz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Ajaloo kontrolltöö', date: '2026-09-01' })])

    await syncSchoolCalendarEvent('exam', 7, '2026-09-08')

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-2000-wxyz')
    expect(writes[0].data.date).toBe('2026-09-08')
  })

  it('works identically for an eksam (same "exam" kind, just a different type field on the School item)', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 9), toId: 'cal-auto-3000-ijkl' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-3000-ijkl', title: 'Bioloogia eksam', date: '2026-10-01' })])

    await syncSchoolCalendarEvent('exam', 9, '2026-10-10')

    const writes = calendarEventWrites()
    expect(writes[0].data.date).toBe('2026-10-10')
  })
})

// ── 3. event id remains unchanged ───────────────────────────────────────────

describe('3. the Calendar event id never changes across a date sync', () => {
  it('the same event id is reused for the write — never a freshly generated id', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd' })])

    await syncSchoolCalendarEvent('task', 1, '2026-11-11')

    expect(calendarEventWrites()[0].data.id).toBe('cal-auto-1000-abcd')
  })
})

// ── 4. no duplicate Calendar event is created ───────────────────────────────

describe('4. syncing never creates a second Calendar event', () => {
  it('after the sync write is applied to the in-memory store, exactly one event exists — not two', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd', date: '2026-08-30' })])

    await syncSchoolCalendarEvent('task', 1, '2026-09-20')

    // Simulate the real onSnapshot echo of the write that just happened.
    const written = calendarEventWrites()[0].data
    seedCalendarEvents([written])

    expect(getAllEvents()).toHaveLength(1)
    expect(getAllEvents()[0].date).toBe('2026-09-20')
  })

  it('calling the sync repeatedly with the same date never adds extra writes (no-op once already in sync)', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd', date: '2026-08-30' })])

    await syncSchoolCalendarEvent('task', 1, '2026-08-30') // already on this date
    expect(calendarEventWrites()).toHaveLength(0)
  })
})

// ── 5. no existing link/event => editing never creates one ─────────────────

describe('5. a School item with no existing Calendar event never gains one from this sync', () => {
  it('no owned link at all — no calendar write happens, no event appears', async () => {
    seedLinks([])
    seedCalendarEvents([])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()).toHaveLength(0)
    expect(getAllEvents()).toHaveLength(0)
  })

  it('a link exists but points to an event that was never auto-created (no cal-auto- prefix) — left untouched', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'evt-manual-1' })])
    seedCalendarEvents([makeEvent({ id: 'evt-manual-1', date: '2026-08-30' })])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()).toHaveLength(0)
  })

  it('a link exists for a DIFFERENT school item — an unrelated item\'s sync never touches it', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd', date: '2026-08-30' })])

    await syncSchoolCalendarEvent('task', 2, '2026-09-15') // task 2, not task 1

    expect(calendarEventWrites()).toHaveLength(0)
  })

  it('no date supplied (e.g. a status-only patch) is a no-op, even with an existing linked event', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 7), toId: 'cal-auto-2000-wxyz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-2000-wxyz', date: '2026-09-01' })])

    await syncSchoolCalendarEvent('exam', 7, undefined)

    expect(calendarEventWrites()).toHaveLength(0)
  })
})

// ── Component wiring: SchoolPage.tsx calls the sync after every edit-save ──

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('SchoolPage.tsx wiring: updateTask/updateExam sync the Calendar event after every save', () => {
  it('imports syncSchoolCalendarEvent from the existing automaticLinking service — no parallel sync system', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/import \{ runAutomaticLinking, syncSchoolCalendarEvent, deleteSchoolCalendarEvent, type AutoLinkResult \} from "@\/lib\/automaticLinking"/)
  })

  it('updateTask awaits the school store write, then syncs using patch.deadline', () => {
    const fn = SCHOOL_PAGE_SRC.match(/const updateTask\s*=\s*async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/await storeUpdateSchoolTask\(id, patch\)/)
    expect(fn).toMatch(/await syncSchoolCalendarEvent\('task', id, patch\.deadline\)/)
  })

  it('updateExam awaits the school store write, then syncs using patch.date', () => {
    const fn = SCHOOL_PAGE_SRC.match(/const updateExam\s*=\s*async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/await storeUpdateSchoolExam\(id, patch\)/)
    expect(fn).toMatch(/await syncSchoolCalendarEvent\('exam', id, patch\.date\)/)
  })

  it('markTaskDone/markTaskUndone/togglePart/addTask/addExam are untouched — they still call the store directly, not the sync-wrapped updateTask/updateExam', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/const markTaskDone\s+=\s*\(id: number\)\s*=>\s*storeMarkSchoolTaskDone\(id\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const markTaskUndone\s*=\s*\(id: number\)\s*=>\s*storeMarkSchoolTaskUndone\(id\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const togglePart\s+=\s*\(taskId: number, partId: string\)\s*=>\s*storeToggleSchoolTaskPart\(taskId, partId\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const addTask\s+=\s*\(task: Task\)\s*=>\s*addSchoolTask\(task\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const addExam\s+=\s*\(exam: Exam\)\s*=>\s*addSchoolExam\(exam\);/)
  })

  it('deleteTask/deleteExam still remove the school<->calendar EntityLinks (unaffected by this date-sync fix)', () => {
    // Orphan Calendar-event cleanup on delete is covered separately in
    // schoolCalendarEventDeleteCleanup.test.ts — this file only asserts the
    // pre-existing link cleanup this fix must not disturb.
    expect(SCHOOL_PAGE_SRC).toMatch(/removeLinksForEntity\('school', encodeSchoolId\('task', id\)\)/)
    expect(SCHOOL_PAGE_SRC).toMatch(/removeLinksForEntity\('school', encodeSchoolId\('exam', id\)\)/)
  })
})
