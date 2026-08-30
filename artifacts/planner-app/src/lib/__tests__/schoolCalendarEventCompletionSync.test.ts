/**
 * School change #3 — a completed School task's auto-created Calendar event
 * used to keep showing up in Calendar forever, even after the deadline was
 * marked done in School. Calendar has no notion of "done" of its own; the
 * only completion signal that already exists is schoolStore.tsx's
 * SchoolTask.progress (>= 100 means done, written exclusively by
 * markSchoolTaskDone/markSchoolTaskUndone) — there is no second completion
 * field to introduce.
 *
 * Fix: syncSchoolCalendarEventCompletion(kind, rawId, completed)
 * (automaticLinking.ts), wired into SchoolPage.tsx's markTaskDone/
 * markTaskUndone (the exact two call sites that already flip
 * progress via the store). It reuses the same "owned `scheduled` EntityLink
 * to a `cal-auto-` prefixed event" lookup as syncSchoolCalendarEvent/
 * deleteSchoolCalendarEvent:
 *
 *   completed: true  -> deletes the owned calendar event (entry disappears).
 *   completed: false -> recreates it under the SAME event id, using the
 *                        item's current title/date (entry reappears).
 *
 * The School item's own Firestore record is never written by this function
 * — only the derived calendarEvents document is created/deleted. Exams
 * (kontrolltööd/eksamid) use a separate `status` field (`'ootel' | 'tehtud'`)
 * but are wired to this same function from SchoolPage.tsx's `updateExam`
 * whenever a patch touches `status` — see the "component wiring" section
 * below for that structural proof; the behavioral coverage above only
 * exercises 'task' directly since the underlying function is identical for
 * both kinds (SchoolEntityKind), just addressed by a different EntityLink.
 *
 * Also covers a second, related fix: a recreated (or freshly auto-created)
 * School calendar event's color used to always be the same hardcoded
 * default (#6F5AE8) regardless of subject — it now reuses the exact color
 * already assigned by School's own subject/color system
 * (resolveSchoolItemColor in automaticLinking.ts), preferring a live
 * subjectId -> getAllSchoolSubjects() lookup and falling back to the item's
 * own last-stored subjectColor/iconColor only for legacy/unresolved
 * subjects — never a second, Calendar-specific color mapping.
 *
 * Uses the same fake-Firestore harness as schoolCalendarEventSync.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolCalendarEventCompletionSync.test.ts
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

// getEntityInfo('school', ...) and resolveSchoolItemColor (automaticLinking.ts)
// read the School item's CURRENT title/date/subject straight from
// schoolStore — mocked here so each test controls exactly what "current"
// means, independent of Firestore.
type FakeSchoolTask = {
  id: number
  title: string
  deadline?: string
  subjectId?: string
  subjectColor?: string
}
type FakeSchoolSubject = { id: string; color: string }
let schoolTasks: FakeSchoolTask[] = []
let schoolSubjects: FakeSchoolSubject[] = []
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolTasks: () => schoolTasks,
  getAllSchoolExams: () => [],
  getAllSchoolSubjects: () => schoolSubjects,
}))

import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import { syncSchoolCalendarEventCompletion } from '@/lib/automaticLinking'

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
  schoolTasks = [{ id: 1, title: 'Matemaatika kodutöö', deadline: '2026-08-30' }]
  schoolSubjects = []

  initEntityLinksStore(UID) // onSnapshot call index 0
  initCalendarStore(UID)    // onSnapshot call index 1
  seedLinks([])
  seedCalendarEvents([])
})

// ── 1. Baseline: an active deadline's derived Calendar entry is present ────

describe('1. baseline — an active School task\'s auto-created Calendar entry is present', () => {
  it('the owned event exists in the calendar store before any completion sync runs', () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    expect(getAllEvents().some((e) => e.id === 'cal-auto-1000-abcd')).toBe(true)
  })
})

// ── 2. Marking a task completed hides its derived Calendar entry ──────────

describe('2. marking a School task completed deletes its owned Calendar entry', () => {
  it('deleteDoc is called for the owned event\'s document', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])
    expect(getAllEvents().some((e) => e.id === 'cal-auto-1000-abcd')).toBe(true)

    await syncSchoolCalendarEventCompletion('task', 1, true)

    expect(calendarEventDeletes()).toEqual(['users/user-a/calendarEvents/cal-auto-1000-abcd'])
  })

  it('is idempotent — calling it a second time while already hidden does not error or write a duplicate', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    expect(calendarEventDeletes()).toHaveLength(1)

    // Firestore delete succeeding fires onSnapshot again with the event gone.
    seedCalendarEvents([])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    // deleteCalendarEvent is called again (it's a no-op against an already-gone
    // doc), but critically no calendar event write ever happens.
    expect(calendarEventDeletes()).toHaveLength(2)
    expect(calendarEventWrites()).toHaveLength(0)
  })
})

// ── 3. Marking it incomplete again brings the Calendar entry back ─────────

describe('3. marking a School task incomplete again recreates its Calendar entry', () => {
  it('addCalendarEvent recreates the SAME event id, using the current title/date', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)

    // Firestore delete succeeding fires onSnapshot again with the event gone —
    // this is what makes the "not already visible" recreation guard pass.
    seedCalendarEvents([])

    await syncSchoolCalendarEventCompletion('task', 1, false)

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-1000-abcd')
    expect(writes[0].data.title).toBe('Matemaatika kodutöö')
    expect(writes[0].data.date).toBe('2026-08-30')
  })

  it('reflects an edit made while completed — recreates using the CURRENT title/date, not the stale one', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    seedCalendarEvents([])

    // The School item's date/title changed while its Calendar entry was hidden.
    schoolTasks = [{ id: 1, title: 'Matemaatika kontrolltöö', deadline: '2026-09-15' }]

    await syncSchoolCalendarEventCompletion('task', 1, false)

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.title).toBe('Matemaatika kontrolltöö')
    expect(writes[0].data.date).toBe('2026-09-15')
  })

  it('is idempotent — calling it while already visible does not create a duplicate', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, false)

    expect(calendarEventWrites()).toHaveLength(0)
    expect(getAllEvents().filter((e) => e.id === 'cal-auto-1000-abcd')).toHaveLength(1)
  })
})

// ── 4. The School record itself is never touched by this function ─────────

describe('4. the School item\'s own record is never written by this function', () => {
  it('no Firestore write ever targets a school/ path — only calendarEvents create/delete', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    seedCalendarEvents([]) // simulate the delete's onSnapshot refresh
    await syncSchoolCalendarEventCompletion('task', 1, false)

    const allSetDocPaths = setDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    const allDeleteDocPaths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect(allSetDocPaths.some((p) => p.includes('school'))).toBe(false)
    expect(allDeleteDocPaths.some((p) => p.includes('school'))).toBe(false)
    // schoolTasks (the in-memory store stand-in) is untouched — still holds
    // the same record, proving the School item's data was never deleted.
    expect(schoolTasks).toEqual([{ id: 1, title: 'Matemaatika kodutöö', deadline: '2026-08-30' }])
  })
})

// ── 5. Unrelated Calendar/School entries are unaffected ───────────────────

describe('5. unrelated Calendar/School entries are unaffected', () => {
  it('no-op when the item has no owned auto-created calendar event at all (never had a due date)', async () => {
    seedLinks([]) // no scheduled link for school-task-2
    seedCalendarEvents([makeEvent({ id: 'cal-manual-1', title: 'Unrelated manual event' })])

    await syncSchoolCalendarEventCompletion('task', 2, true)

    expect(calendarEventDeletes()).toHaveLength(0)
    expect(getAllEvents().some((e) => e.id === 'cal-manual-1')).toBe(true)
  })

  it('a manually-created (non cal-auto-) linked event is left untouched even if linked', async () => {
    seedLinks([makeLink({ toId: 'cal-manual-42' })])
    seedCalendarEvents([makeEvent({ id: 'cal-manual-42' })])

    await syncSchoolCalendarEventCompletion('task', 1, true)

    expect(calendarEventDeletes()).toHaveLength(0)
    expect(getAllEvents().some((e) => e.id === 'cal-manual-42')).toBe(true)
  })

  it('a different School task\'s owned event is untouched', async () => {
    seedLinks([
      makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' }),
      makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-2000-wxyz' }),
    ])
    seedCalendarEvents([
      makeEvent({ id: 'cal-auto-1000-abcd' }),
      makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Eesti keel essee' }),
    ])

    await syncSchoolCalendarEventCompletion('task', 1, true)

    expect(calendarEventDeletes()).toEqual(['users/user-a/calendarEvents/cal-auto-1000-abcd'])
    expect(getAllEvents().some((e) => e.id === 'cal-auto-2000-wxyz')).toBe(true)
  })

  it('a plain unrelated calendar-only event (no School link at all) is untouched', async () => {
    seedLinks([makeLink()])
    seedCalendarEvents([
      makeEvent(),
      makeEvent({ id: 'cal-manual-999', title: 'Doctor appointment' }),
    ])

    await syncSchoolCalendarEventCompletion('task', 1, true)

    expect(getAllEvents().some((e) => e.id === 'cal-manual-999')).toBe(true)
  })
})

// ── 6. The recreated Calendar entry uses the item's actual subject color ──

describe('6. a recreated School Calendar entry uses the SAME color as the School subject system — never a second color mapping', () => {
  it('resolves the color via subjectId against the current School subjects list, not a hardcoded default', async () => {
    schoolTasks = [{ id: 1, title: 'Ajalugu kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu', subjectColor: '#000000' }]
    schoolSubjects = [{ id: 'subj-ajalugu', color: '#B45309' }]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    seedCalendarEvents([])
    await syncSchoolCalendarEventCompletion('task', 1, false)

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.color).toBe('#B45309')
  })

  it('two differently-colored subjects (e.g. Ajalugu vs. Kirjandus) recreate with two different colors', async () => {
    schoolSubjects = [
      { id: 'subj-ajalugu', color: '#B45309' },
      { id: 'subj-kirjandus', color: '#0EA5E9' },
    ]
    schoolTasks = [
      { id: 1, title: 'Ajalugu kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
      { id: 2, title: 'Kirjandus essee', deadline: '2026-09-01', subjectId: 'subj-kirjandus' },
    ]
    seedLinks([
      makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' }),
      makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-2000-wxyz' }),
    ])
    seedCalendarEvents([
      makeEvent({ id: 'cal-auto-1000-abcd' }),
      makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Kirjandus essee' }),
    ])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    await syncSchoolCalendarEventCompletion('task', 2, true)
    seedCalendarEvents([])
    await syncSchoolCalendarEventCompletion('task', 1, false)
    await syncSchoolCalendarEventCompletion('task', 2, false)

    const writes = calendarEventWrites()
    const ajalugu = writes.find((w) => w.data.id === 'cal-auto-1000-abcd')
    const kirjandus = writes.find((w) => w.data.id === 'cal-auto-2000-wxyz')
    expect(ajalugu?.data.color).toBe('#B45309')
    expect(kirjandus?.data.color).toBe('#0EA5E9')
    expect(ajalugu?.data.color).not.toBe(kirjandus?.data.color)
  })

  it('falls back to the task\'s own stored subjectColor when subjectId does not resolve (legacy/deleted subject)', async () => {
    schoolTasks = [{ id: 1, title: 'Vanem ülesanne', deadline: '2026-08-30', subjectId: 'deleted-subject', subjectColor: '#123456' }]
    schoolSubjects = [] // the subject this task pointed at no longer exists
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    seedCalendarEvents([])
    await syncSchoolCalendarEventCompletion('task', 1, false)

    expect(calendarEventWrites()[0]?.data.color).toBe('#123456')
  })

  it('falls back to the generic default color when neither subjectId nor a stored subjectColor is available', async () => {
    schoolTasks = [{ id: 1, title: 'Ilma aineta ülesanne', deadline: '2026-08-30' }]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    seedCalendarEvents([])
    await syncSchoolCalendarEventCompletion('task', 1, false)

    expect(calendarEventWrites()[0]?.data.color).toBe('#6F5AE8')
  })
})

// ── 7. Component wiring: SchoolPage.tsx also drives exam completion ───────

describe('7. SchoolPage.tsx wiring: updateExam syncs Calendar completion whenever a patch touches `status`', () => {
  const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

  it('updateExam calls syncSchoolCalendarEventCompletion with the patch\'s new status, only when status is present', () => {
    const fn = SCHOOL_PAGE_SRC.match(/const updateExam\s*=\s*async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/if \(patch\.status !== undefined\)/)
    expect(fn).toMatch(/syncSchoolCalendarEventCompletion\('exam', id, patch\.status === "tehtud"\)/)
  })
})
