/**
 * School change #3 — deleting a School task/exam that owns an auto-created
 * Calendar event used to leave that event orphaned: SchoolPage.tsx's
 * deleteTask/deleteExam removed the `EntityLink` rows (removeLinksForEntity)
 * and the School item itself, but never deleted the `cal-auto-*`
 * calendarEvents document the link pointed to.
 *
 * Fix: deleteSchoolCalendarEvent(kind, rawId) (automaticLinking.ts) —
 * resolves the item's owned `scheduled` EntityLink (the exact same "owned
 * vs. merely linked" `cal-auto-` prefix rule syncSchoolCalendarEvent and
 * Tasks' own deleteTask cascade already use — never by matching title/
 * date) and deletes that one calendarEvents document via the existing
 * calendarStore.deleteCalendarEvent(). No new store, no new link type.
 *
 * Wired into SchoolPage.tsx's deleteTask/deleteExam, called BEFORE
 * removeLinksForEntity so the owned link (and thus the event id) can still
 * be resolved — removeLinksForEntity continues to clean up the link rows
 * exactly as before; this only adds the missing calendarEvents delete.
 *
 * Uses the same fake-Firestore harness as schoolCalendarEventSync.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolCalendarEventDeleteCleanup.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntityLink } from '@/types/entityLinks'
import { encodeSchoolId } from '@/types/entityLinks'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore (same shape as schoolCalendarEventSync.test.ts) ─────────

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

import { initEntityLinksStore, getLinksForEntity } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import { deleteSchoolCalendarEvent } from '@/lib/automaticLinking'

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

/** All deleteDoc calls whose doc path is under this user's calendarEvents collection. */
function calendarEventDeletes(): string[] {
  return deleteDocMock.mock.calls
    .map((c) => (c[0] as { path: string }).path)
    .filter((p) => p.startsWith(`users/${UID}/calendarEvents/`))
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

// ── 1. Task deletion removes its owned auto-created Calendar event ────────

describe('1. deleting a School task removes its owned auto-created Calendar event', () => {
  it('deleteCalendarEvent is called with the exact event id the scheduled link points to', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd' })])

    await deleteSchoolCalendarEvent('task', 1)

    expect(calendarEventDeletes()).toEqual([`users/${UID}/calendarEvents/cal-auto-1000-abcd`])
  })
})

// ── 2. Exam/test deletion removes its owned auto-created Calendar event ───

describe('2. deleting a School exam/test removes its owned auto-created Calendar event', () => {
  it('deleteCalendarEvent is called with the exact event id the scheduled link points to', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 7), toId: 'cal-auto-2000-wxyz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Ajaloo kontrolltöö' })])

    await deleteSchoolCalendarEvent('exam', 7)

    expect(calendarEventDeletes()).toEqual([`users/${UID}/calendarEvents/cal-auto-2000-wxyz`])
  })

  it('works identically for an eksam (same "exam" kind, just a different type field on the School item)', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 9), toId: 'cal-auto-3000-ijkl' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-3000-ijkl', title: 'Bioloogia eksam' })])

    await deleteSchoolCalendarEvent('exam', 9)

    expect(calendarEventDeletes()).toEqual([`users/${UID}/calendarEvents/cal-auto-3000-ijkl`])
  })
})

// ── 3. No owned event -> deletion continues normally, nothing touched ─────

describe('3. a School item with no owned Calendar event: deletion continues normally', () => {
  it('no owned link at all — no calendar delete happens, nothing throws', async () => {
    seedLinks([])
    seedCalendarEvents([])

    await expect(deleteSchoolCalendarEvent('task', 1)).resolves.toBeUndefined()
    expect(calendarEventDeletes()).toHaveLength(0)
  })

  it('a link exists for a DIFFERENT school item — deleting item 1 never deletes item 2\'s event', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-9999-zzzz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-9999-zzzz' })])

    await deleteSchoolCalendarEvent('task', 1) // task 1, not task 2

    expect(calendarEventDeletes()).toHaveLength(0)
    expect(getAllEvents().some((e) => e.id === 'cal-auto-9999-zzzz')).toBe(true)
  })
})

// ── 4. Manually created / unrelated Calendar events are never deleted ─────

describe('4. manually created or unrelated Calendar events are protected', () => {
  it('a link exists but points to an event with no cal-auto- prefix (never auto-created) — left untouched', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'evt-manual-1' })])
    seedCalendarEvents([makeEvent({ id: 'evt-manual-1' })])

    await deleteSchoolCalendarEvent('task', 1)

    expect(calendarEventDeletes()).toHaveLength(0)
    expect(getAllEvents().some((e) => e.id === 'evt-manual-1')).toBe(true)
  })

  it('identification is exclusively via the scheduled EntityLink + cal-auto- prefix, never by matching title or date', async () => {
    // A manually created event that happens to share the same title/date as
    // a "cal-auto-" event elsewhere must never be matched/deleted by guessing.
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    seedCalendarEvents([
      makeEvent({ id: 'cal-auto-1000-abcd', title: 'Matemaatika kodutöö', date: '2026-08-30' }),
      makeEvent({ id: 'evt-manual-lookalike', title: 'Matemaatika kodutöö', date: '2026-08-30' }),
    ])

    await deleteSchoolCalendarEvent('task', 1)

    expect(calendarEventDeletes()).toEqual([`users/${UID}/calendarEvents/cal-auto-1000-abcd`])
    expect(getAllEvents().some((e) => e.id === 'evt-manual-lookalike')).toBe(true)
  })

  it('a link the item is merely linked to (relationType other than "scheduled") is not treated as owned', async () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd', relationType: 'related' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-1000-abcd' })])

    await deleteSchoolCalendarEvent('task', 1)

    expect(calendarEventDeletes()).toHaveLength(0)
  })
})

// ── Event-id resolution order: link must still be resolvable at call time ──

describe('event id resolution happens safely before the link row is removed', () => {
  it('resolving via getLinksForEntity still finds the link at the moment deleteSchoolCalendarEvent runs', () => {
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' })])
    // Sanity: the link is genuinely present and resolvable before any cleanup call.
    const links = getLinksForEntity('school', encodeSchoolId('task', 1))
    expect(links.some((l) => l.toId === 'cal-auto-1000-abcd')).toBe(true)
  })
})

// ── Component wiring ─────────────────────────────────────────────────────────

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('SchoolPage.tsx wiring: deleteTask/deleteExam clean up the owned Calendar event before removing links', () => {
  it('imports deleteSchoolCalendarEvent from the existing automaticLinking service — no parallel sync system', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(
      /import \{ runAutomaticLinking, syncSchoolCalendarEvent, syncSchoolCalendarEventCompletion, deleteSchoolCalendarEvent, type AutoLinkResult \} from "@\/lib\/automaticLinking"/,
    )
  })

  it('deleteTask calls deleteSchoolCalendarEvent BEFORE removeLinksForEntity, and still deletes the linked Task', () => {
    const fn = SCHOOL_PAGE_SRC.match(/const deleteTask\s*=\s*\(id: number\)\s*=>\s*\{[\s\S]*?\n  \};/)?.[0] ?? ''
    const calendarCallIdx = fn.indexOf("deleteSchoolCalendarEvent('task', id)")
    const linksCallIdx = fn.indexOf("removeLinksForEntity('school', encodeSchoolId('task', id))")
    expect(calendarCallIdx).toBeGreaterThan(-1)
    expect(linksCallIdx).toBeGreaterThan(-1)
    expect(calendarCallIdx).toBeLessThan(linksCallIdx)
    // Existing linked-Task cleanup is preserved unchanged.
    expect(fn).toMatch(/if \(task\?\.linkedTaskId\) \{ tasksStoreDeleteTask\(task\.linkedTaskId\); \}/)
  })

  it('deleteExam calls deleteSchoolCalendarEvent BEFORE removeLinksForEntity', () => {
    const fn = SCHOOL_PAGE_SRC.match(/const deleteExam\s*=\s*\(id: number\)\s*=>\s*\{[\s\S]*?\n  \};/)?.[0] ?? ''
    const calendarCallIdx = fn.indexOf("deleteSchoolCalendarEvent('exam', id)")
    const linksCallIdx = fn.indexOf("removeLinksForEntity('school', encodeSchoolId('exam', id))")
    expect(calendarCallIdx).toBeGreaterThan(-1)
    expect(linksCallIdx).toBeGreaterThan(-1)
    expect(calendarCallIdx).toBeLessThan(linksCallIdx)
  })

  it('the date-edit sync wiring (syncSchoolCalendarEvent in updateTask/updateExam) is untouched by this change', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/await syncSchoolCalendarEvent\('task', id, patch\.deadline\);/)
    expect(SCHOOL_PAGE_SRC).toMatch(/await syncSchoolCalendarEvent\('exam', id, patch\.date\);/)
  })
})
