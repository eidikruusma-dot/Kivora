/**
 * School change #4 — a School-derived Calendar event's color was always
 * the same hardcoded default (#6F5AE8), regardless of which School subject
 * the task/exam belonged to, and never picked up a later subject recolor.
 *
 * Fix: automaticLinking.ts's resolveSchoolItemColor(schoolId) resolves the
 * SAME color School itself already shows for that item — never a second,
 * Calendar-specific color mapping:
 *
 *   1. subjectId -> getAllSchoolSubjects() (live lookup, the same subject
 *      registry School's own subject editor writes to) — so a subject's
 *      color change is picked up by later syncs, not just at first creation.
 *   2. no subjectId, or it no longer resolves -> an exact trimmed-name
 *      match against getAllSchoolSubjects(), the same `matchedSubject`
 *      lookup SchoolPage.tsx itself already uses when assigning a task/exam
 *      to a subject (`subjects.find((s) => s.name === subject.trim())`) —
 *      the "safest existing name-based fallback" for legacy items.
 *   3. still nothing -> the item's own last-stored subjectColor/iconColor
 *      snapshot.
 *   4. still nothing -> the same generic default every other auto-created
 *      calendar event already uses.
 *
 * This resolution is used both when a School item's Calendar event is
 * first auto-created (runAutomaticLinking) and whenever it's synced again
 * through an ALREADY EXISTING sync path:
 *   - syncSchoolCalendarEvent (the date-edit sync from School change #2) —
 *     now also refreshes color alongside date, so a subject recolor is
 *     reflected the next time the item is saved with its date field
 *     present, without a dedicated "resync every event for this subject"
 *     mechanism;
 *   - syncSchoolCalendarEventCompletion (the completion hide/reappear sync
 *     from commit c4daecb, School change #3) — recreating an uncompleted
 *     item's event already resolves its CURRENT color.
 *
 * This file focuses on color only — the completion hide/reappear behavior
 * itself (c4daecb) has its own full regression suite in
 * schoolCalendarEventCompletionSync.test.ts; the smoke test in section 5
 * below only re-confirms that this round's edits didn't disturb it.
 *
 * Uses the same fake-Firestore harness as schoolCalendarEventCompletionSync.test.ts.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolCalendarEventColorSync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EntityLink } from '@/types/entityLinks'
import { encodeSchoolId } from '@/types/entityLinks'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore (same shape as schoolCalendarEventCompletionSync.test.ts) ─

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

// resolveSchoolItemColor (automaticLinking.ts) reads subjects/tasks/exams
// straight from schoolStore — mocked here so each test controls exactly
// what "current" means, independent of Firestore.
type FakeSchoolTask = {
  id: number
  subject: string
  title: string
  deadline?: string
  subjectId?: string
  subjectColor?: string
}
type FakeSchoolExam = {
  id: number
  subject: string
  title: string
  date?: string
  subjectId?: string
  iconColor?: string
}
type FakeSchoolSubject = { id: string; name: string; color: string }
let schoolTasks: FakeSchoolTask[] = []
let schoolExams: FakeSchoolExam[] = []
let schoolSubjects: FakeSchoolSubject[] = []
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolTasks: () => schoolTasks,
  getAllSchoolExams: () => schoolExams,
  getAllSchoolSubjects: () => schoolSubjects,
}))

import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import { syncSchoolCalendarEvent, syncSchoolCalendarEventCompletion } from '@/lib/automaticLinking'

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
    title: 'Ajaloo kodutöö',
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
  schoolTasks = []
  schoolExams = []
  schoolSubjects = []

  initEntityLinksStore(UID) // onSnapshot call index 0
  initCalendarStore(UID)    // onSnapshot call index 1
  seedLinks([])
  seedCalendarEvents([])
})

// ── 1. Ajalugu-derived event uses Ajalugu's stored School color ───────────

describe('1. an Ajalugu-derived Calendar event uses Ajalugu\'s stored School subject color', () => {
  it('resolved via subjectId, through the existing date-edit sync path', async () => {
    schoolSubjects = [{ id: 'subj-ajalugu', name: 'Ajalugu', color: '#B45309' }]
    schoolTasks = [
      { id: 1, subject: 'Ajalugu', title: 'Ajaloo kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
    ]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.color).toBe('#B45309')
  })
})

// ── 2. Kirjandus-derived event uses Kirjandus's different stored color ────

describe('2. a Kirjandus-derived Calendar event uses Kirjandus\'s different stored School subject color', () => {
  it('two subjects with different stored colors stay differently colored in Calendar', async () => {
    schoolSubjects = [
      { id: 'subj-ajalugu', name: 'Ajalugu', color: '#B45309' },
      { id: 'subj-kirjandus', name: 'Kirjandus', color: '#0EA5E9' },
    ]
    schoolTasks = [
      { id: 1, subject: 'Ajalugu', title: 'Ajaloo kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
      { id: 2, subject: 'Kirjandus', title: 'Kirjanduse essee', deadline: '2026-09-01', subjectId: 'subj-kirjandus' },
    ]
    seedLinks([
      makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' }),
      makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-2000-wxyz' }),
    ])
    seedCalendarEvents([
      makeEvent({ id: 'cal-auto-1000-abcd' }),
      makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Kirjanduse essee' }),
    ])

    await syncSchoolCalendarEvent('task', 1, '2026-09-16')
    await syncSchoolCalendarEvent('task', 2, '2026-09-17')

    const writes = calendarEventWrites()
    const ajalugu = writes.find((w) => w.data.id === 'cal-auto-1000-abcd')
    const kirjandus = writes.find((w) => w.data.id === 'cal-auto-2000-wxyz')
    expect(ajalugu?.data.color).toBe('#B45309')
    expect(kirjandus?.data.color).toBe('#0EA5E9')
    expect(ajalugu?.data.color).not.toBe(kirjandus?.data.color)
  })

  it('a subject color change is reflected the next time the existing sync path runs', async () => {
    schoolSubjects = [{ id: 'subj-kirjandus', name: 'Kirjandus', color: '#0EA5E9' }]
    schoolTasks = [
      { id: 2, subject: 'Kirjandus', title: 'Kirjanduse essee', deadline: '2026-09-01', subjectId: 'subj-kirjandus' },
    ]
    seedLinks([makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-2000-wxyz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Kirjanduse essee', color: '#0EA5E9' })])

    // The user recolors the Kirjandus subject in School's own subject editor.
    schoolSubjects = [{ id: 'subj-kirjandus', name: 'Kirjandus', color: '#DB2777' }]

    await syncSchoolCalendarEvent('task', 2, '2026-09-20')

    expect(calendarEventWrites()[0]?.data.color).toBe('#DB2777')
  })
})

// ── 3. legacy/no-subjectId fallback remains safe ───────────────────────────

describe('3. legacy items without a (resolvable) subjectId fall back safely — the same resolution School itself already uses', () => {
  it('no subjectId at all, but the subject name matches an existing subject — resolved by name, like SchoolPage.tsx\'s own matchedSubject lookup', async () => {
    schoolSubjects = [{ id: 'subj-keemia', name: 'Keemia', color: '#16A34A' }]
    schoolTasks = [{ id: 1, subject: 'Keemia', title: 'Vana ülesanne', deadline: '2026-08-30' }] // no subjectId
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()[0]?.data.color).toBe('#16A34A')
  })

  it('subjectId set but no longer resolves (subject since deleted) — falls back to the task\'s own stored subjectColor', async () => {
    schoolSubjects = [] // the subject this task pointed at no longer exists
    schoolTasks = [
      { id: 1, subject: 'Füüsika', title: 'Vana ülesanne', deadline: '2026-08-30', subjectId: 'deleted-subject', subjectColor: '#123456' },
    ]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()[0]?.data.color).toBe('#123456')
  })

  it('nothing resolves at all — falls back to the same generic default every other auto-created event already uses', async () => {
    schoolTasks = [{ id: 1, subject: 'Tundmatu aine', title: 'Vana ülesanne', deadline: '2026-08-30' }]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()[0]?.data.color).toBe('#6F5AE8')
  })

  it('the same name-based fallback applies to exams/tests, not just tasks', async () => {
    schoolSubjects = [{ id: 'subj-bio', name: 'Bioloogia', color: '#7C3AED' }]
    schoolExams = [{ id: 7, subject: 'Bioloogia', title: 'Bioloogia kontrolltöö', date: '2026-09-01' }] // no subjectId
    seedLinks([makeLink({ fromId: encodeSchoolId('exam', 7), toId: 'cal-auto-9000-zzzz' })])
    seedCalendarEvents([makeEvent({ id: 'cal-auto-9000-zzzz', title: 'Bioloogia kontrolltöö' })])

    await syncSchoolCalendarEvent('exam', 7, '2026-09-08')

    expect(calendarEventWrites()[0]?.data.color).toBe('#7C3AED')
  })
})

// ── 4. unrelated Calendar events are untouched ─────────────────────────────

describe('4. unrelated Calendar events are never touched by this color resolution', () => {
  it('a manually-created event with no owned School link is left completely untouched', async () => {
    seedLinks([])
    seedCalendarEvents([makeEvent({ id: 'cal-manual-1', title: 'Doctor appointment', color: '#334155' })])

    await syncSchoolCalendarEvent('task', 1, '2026-09-15')

    expect(calendarEventWrites()).toHaveLength(0)
    expect(getAllEvents().find((e) => e.id === 'cal-manual-1')?.color).toBe('#334155')
  })

  it('a DIFFERENT School task\'s owned event keeps its own color untouched by another item\'s sync', async () => {
    schoolSubjects = [
      { id: 'subj-ajalugu', name: 'Ajalugu', color: '#B45309' },
      { id: 'subj-kirjandus', name: 'Kirjandus', color: '#0EA5E9' },
    ]
    schoolTasks = [
      { id: 1, subject: 'Ajalugu', title: 'Ajaloo kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
      { id: 2, subject: 'Kirjandus', title: 'Kirjanduse essee', deadline: '2026-09-01', subjectId: 'subj-kirjandus' },
    ]
    seedLinks([
      makeLink({ fromId: encodeSchoolId('task', 1), toId: 'cal-auto-1000-abcd' }),
      makeLink({ fromId: encodeSchoolId('task', 2), toId: 'cal-auto-2000-wxyz' }),
    ])
    seedCalendarEvents([
      makeEvent({ id: 'cal-auto-1000-abcd' }),
      makeEvent({ id: 'cal-auto-2000-wxyz', title: 'Kirjanduse essee', color: '#0EA5E9' }),
    ])

    await syncSchoolCalendarEvent('task', 1, '2026-09-16') // only task 1 is synced

    expect(calendarEventWrites()).toHaveLength(1)
    expect(calendarEventWrites()[0].data.id).toBe('cal-auto-1000-abcd')
    expect(getAllEvents().find((e) => e.id === 'cal-auto-2000-wxyz')?.color).toBe('#0EA5E9')
  })

  it('already-in-sync date AND color together stay a true no-op — no pointless write', async () => {
    schoolSubjects = [{ id: 'subj-ajalugu', name: 'Ajalugu', color: '#B45309' }]
    schoolTasks = [
      { id: 1, subject: 'Ajalugu', title: 'Ajaloo kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
    ]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent({ date: '2026-08-30', color: '#B45309' })])

    await syncSchoolCalendarEvent('task', 1, '2026-08-30') // same date, subject color unchanged

    expect(calendarEventWrites()).toHaveLength(0)
  })
})

// ── 5. the c4daecb completion hide/reappear behavior remains intact ───────

describe('5. commit c4daecb\'s completion hide/reappear behavior is unaffected by this round\'s color changes', () => {
  it('marking a task completed still deletes its owned event, and marking it incomplete still recreates it (now with its resolved color)', async () => {
    schoolSubjects = [{ id: 'subj-ajalugu', name: 'Ajalugu', color: '#B45309' }]
    schoolTasks = [
      { id: 1, subject: 'Ajalugu', title: 'Ajaloo kodutöö', deadline: '2026-08-30', subjectId: 'subj-ajalugu' },
    ]
    seedLinks([makeLink()])
    seedCalendarEvents([makeEvent()])

    await syncSchoolCalendarEventCompletion('task', 1, true)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)

    seedCalendarEvents([]) // simulate the delete's onSnapshot refresh
    await syncSchoolCalendarEventCompletion('task', 1, false)

    const writes = calendarEventWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].data.id).toBe('cal-auto-1000-abcd')
    expect(writes[0].data.color).toBe('#B45309')
  })
})
