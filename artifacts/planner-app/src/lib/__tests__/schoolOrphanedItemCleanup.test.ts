/**
 * Live bug correction: deleting a School subject previously left its tasks
 * AND its tests/exams behind once the subject document itself (and, for a
 * ghost/synthetic subject, every referencing lesson) was gone —
 * deleteSchoolSubject's cascade (schoolStore.tsx) never reached exams at
 * all, only tasks. Any subject deleted before this fix (including by an
 * even older app version) can leave stranded tasks/exams that have no
 * subject left to resolve to, by id or by name — visible on every refresh
 * forever, since nothing ever deleted them.
 *
 * Fix, two parts:
 *   1. deleteSchoolSubject's cascade (both the real-subject branch and the
 *      ghost/synthetic-subject branch) now also deletes linked exams —
 *      exactly the same subjectId-first, name-fallback matching already
 *      used for tasks/lessons — so a FUTURE subject delete can never
 *      strand an exam again.
 *   2. cleanupOrphanedSchoolItems() (schoolStore.tsx) — a general,
 *      idempotent sweep that finds and permanently deletes every CURRENT
 *      task/exam whose subject (by subjectId or by legacy name) matches
 *      neither a real stored subject nor a lesson-derived synthetic one —
 *      repairing data already stranded by gap #1, however it arose. Wired
 *      to run once per SchoolPage.tsx mount; its own re-entrancy guard and
 *      idempotent "nothing orphaned → no Firestore call at all" behavior
 *      make repeated/overlapping mounts (incl. React Strict Mode) safe.
 *      Deleting the orphaned items' own auto-created Calendar events and
 *      EntityLinks (a separate collection/data model — see
 *      automaticLinking.ts) is wired at the SchoolPage.tsx call site, via
 *      the callback cleanupOrphanedSchoolItems accepts, because
 *      schoolStore.tsx cannot import automaticLinking.ts (which itself
 *      imports schoolStore.tsx) without a circular dependency.
 *
 * Firestore mock mirrors schoolCalendarEventDeleteCleanup.test.ts (three
 * stores — schoolStore, entityLinksStore, calendarStore — sharing one fake
 * Firestore and tracked onSnapshot call order) combined with the
 * writeBatch-commit/fakeDb harness used throughout the School delete
 * regression suite.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolOrphanedItemCleanup.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeSchoolId } from '@/types/entityLinks'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/tasksStore', () => ({ setTaskCompleted: vi.fn(), getAllTasks: vi.fn(() => []) }))
vi.mock('@/lib/quickNotesStore', () => ({ getAllNotes: vi.fn(() => []) }))
vi.mock('@/lib/goalsStore', () => ({ getAllGoals: vi.fn(() => []) }))
vi.mock('@/lib/habitsStore', () => ({ getAllHabits: vi.fn(() => []) }))
vi.mock('@/lib/aiConversationsStore', () => ({ getAllChats: vi.fn(() => []) }))
vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

// ── Shared fake Firestore (school items + entityLinks + calendarEvents) ────

const UID = 'user-a'
const fakeDb = new Map<string, Record<string, unknown>>()
function schoolItemPath(docId: string) { return `users/${UID}/schoolItems/${docId}` }
function calendarEventPath(id: string) { return `users/${UID}/calendarEvents/${id}` }

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  fakeDb.set(ref.path, { ...data })
})
const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  fakeDb.delete(ref.path)
})

let nextCommitError: Error | null = null
const writeBatchDeleteMock = vi.fn((_path: string) => {})
const writeBatchMock = vi.fn(() => {
  const pending: string[] = []
  return {
    delete: (ref: { path: string }) => { pending.push(ref.path); writeBatchDeleteMock(ref.path) },
    commit: async () => {
      if (nextCommitError) {
        const err = nextCommitError
        nextCommitError = null
        throw err
      }
      for (const p of pending) fakeDb.delete(p)
    },
  }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  writeBatch: (...args: Parameters<typeof writeBatchMock>) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import {
  initSchoolStore,
  addSchoolSubject,
  addSchoolTask,
  addSchoolExam,
  addSchoolLesson,
  deleteSchoolSubject,
  getAllSchoolTasks,
  getAllSchoolExams,
  getAllSchoolSubjects,
  findOrphanedSchoolTasks,
  findOrphanedSchoolExams,
  previewOrphanedSchoolItems,
  cleanupOrphanedSchoolItems,
  mergeStoredAndLessonSubjects,
  type SchoolLesson,
  type SchoolTask,
  type SchoolExam,
  type SchoolSubject,
} from '@/lib/schoolStore'
import { initEntityLinksStore, getLinksForEntity, addLink } from '@/lib/entityLinksStore'
import { initCalendarStore, getAllEvents, addCalendarEvent } from '@/lib/calendarStore'
import { deleteSchoolCalendarEvent } from '@/lib/automaticLinking'
import { removeLinksForEntity } from '@/lib/entityLinksStore'

// initSchoolStore -> onSnapshot call 0, initEntityLinksStore -> call 1,
// initCalendarStore -> call 2 (fixed order set in beforeEach below).
function pumpSchool() {
  const [, onNext] = onSnapshotMock.mock.calls[0]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}
function pumpLinks() {
  const [, onNext] = onSnapshotMock.mock.calls[1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/entityLinks/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}
function pumpCalendar() {
  const [, onNext] = onSnapshotMock.mock.calls[2]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/calendarEvents/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function simulatePageReload() {
  initSchoolStore(null)
  initSchoolStore(UID)
  pumpSchool()
}

/** Wires exactly what SchoolPage.tsx's mount effect wires (see its own test below). */
async function runRealCleanup() {
  return cleanupOrphanedSchoolItems(({ taskIds, examIds }) => {
    for (const id of taskIds) {
      deleteSchoolCalendarEvent('task', id)
      removeLinksForEntity('school', encodeSchoolId('task', id))
    }
    for (const id of examIds) {
      deleteSchoolCalendarEvent('exam', id)
      removeLinksForEntity('school', encodeSchoolId('exam', id))
    }
  })
}

function makeTask(overrides: Partial<SchoolTask> = {}): SchoolTask {
  return {
    id: 1, subject: 'Matemaatika', subjectColor: '#6F5AE8', subjectBg: '#EDE9FB', subjectIcon: null,
    title: 'Kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-01-01', progress: 0, moodleUrl: '',
    ...overrides,
  } as SchoolTask
}

function makeExam(overrides: Partial<SchoolExam> = {}): SchoolExam {
  return {
    id: 1, subject: 'Matemaatika', title: 'Kontrolltöö', type: 'kontrolltöö', date: '2026-01-01',
    status: 'ootel', iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    ...overrides,
  } as unknown as SchoolExam
}

beforeEach(() => {
  initSchoolStore(null)
  initEntityLinksStore(null)
  initCalendarStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  writeBatchMock.mockClear()
  writeBatchDeleteMock.mockClear()
  nextCommitError = null

  initSchoolStore(UID)       // onSnapshot call index 0
  initEntityLinksStore(UID)  // onSnapshot call index 1
  initCalendarStore(UID)     // onSnapshot call index 2
  pumpSchool()
  pumpLinks()
  pumpCalendar()
})

// ── 1. orphaned homework/task is deleted ────────────────────────────────────

describe('1. an orphaned task (its subject no longer exists at all) is deleted', () => {
  it('a task whose subjectId points at nothing, and whose name matches no real or synthetic subject, is permanently removed', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Ununenud Aine', subjectId: 'sub-gone' }))
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()

    expect(result.taskIds).toEqual([1])
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
  })
})

// ── 2. orphaned test/exam is deleted ────────────────────────────────────────

describe('2. an orphaned exam/test (its subject no longer exists at all) is deleted', () => {
  it('an exam whose subjectId points at nothing, and whose name matches no real or synthetic subject, is permanently removed', async () => {
    await addSchoolExam(makeExam({ id: 1, subject: 'Ununenud Aine', subjectId: 'sub-gone' }))
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()

    expect(result.examIds).toEqual([1])
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(false)
  })

  it('works identically for an eksam (same orphan rule, different type field)', async () => {
    await addSchoolExam(makeExam({ id: 2, subject: 'Ununenud Aine', subjectId: 'sub-gone', type: 'eksam' }))
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()

    expect(result.examIds).toEqual([2])
    expect(fakeDb.has(schoolItemPath('exam-2'))).toBe(false)
  })
})

// ── 3. linked Calendar entries are also removed ─────────────────────────────

describe('3. the orphaned item\'s own separately-stored Calendar entry is also removed', () => {
  it('an orphaned task\'s auto-created calendar event and EntityLink are deleted by the real cleanup wiring', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Ununenud Aine', subjectId: 'sub-gone' }))
    pumpSchool()

    const link = addLink({
      fromType: 'school', fromId: encodeSchoolId('task', 1),
      toType: 'calendar', toId: 'cal-auto-1000-abcd', relationType: 'scheduled',
    })
    await addCalendarEvent({
      id: 'cal-auto-1000-abcd', title: 'Kodutöö', date: '2026-01-01',
      allDay: true, startTime: '', endTime: '', color: '#6F5AE8',
    })
    pumpCalendar()

    await runRealCleanup()
    pumpCalendar()

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
    expect(fakeDb.has(calendarEventPath('cal-auto-1000-abcd'))).toBe(false)
    expect(getAllEvents().some((e) => e.id === 'cal-auto-1000-abcd')).toBe(false)
    expect(getLinksForEntity('school', encodeSchoolId('task', 1)).some((l) => l.id === link.id)).toBe(false)
  })

  it('an orphaned exam\'s auto-created calendar event and EntityLink are deleted by the real cleanup wiring', async () => {
    await addSchoolExam(makeExam({ id: 7, subject: 'Ununenud Aine', subjectId: 'sub-gone' }))
    pumpSchool()

    addLink({
      fromType: 'school', fromId: encodeSchoolId('exam', 7),
      toType: 'calendar', toId: 'cal-auto-2000-wxyz', relationType: 'scheduled',
    })
    await addCalendarEvent({
      id: 'cal-auto-2000-wxyz', title: 'Kontrolltöö', date: '2026-01-01',
      allDay: true, startTime: '', endTime: '', color: '#6F5AE8',
    })
    pumpCalendar()

    await runRealCleanup()
    pumpCalendar()

    expect(fakeDb.has(schoolItemPath('exam-7'))).toBe(false)
    expect(fakeDb.has(calendarEventPath('cal-auto-2000-wxyz'))).toBe(false)
    expect(getAllEvents().some((e) => e.id === 'cal-auto-2000-wxyz')).toBe(false)
  })
})

// ── 4. removed records stay gone after a simulated reload ──────────────────

describe('4. removed records stay gone after a simulated reload', () => {
  it('a fresh subscription never brings back the deleted orphaned task/exam', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Kadunud 1', subjectId: 'gone-1' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Kadunud 2', subjectId: 'gone-2' }))
    pumpSchool()

    await cleanupOrphanedSchoolItems()
    simulatePageReload()

    expect(getAllSchoolTasks().some((t) => t.id === 1)).toBe(false)
    expect(getAllSchoolExams().some((e) => e.id === 1)).toBe(false)
  })
})

// ── 5. records belonging to real subjects remain ────────────────────────────

describe('5. tasks/exams linked to a still-existing real stored subject remain', () => {
  it('a task and exam with subjectId pointing at a real subject document survive cleanup untouched', async () => {
    await addSchoolSubject({ id: 'sub-real', name: 'Matemaatika', color: '#6F5AE8', bg: '#EDE9FB', icon: null })
    await addSchoolTask(makeTask({ id: 1, subject: 'Matemaatika', subjectId: 'sub-real' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Matemaatika', subjectId: 'sub-real' }))
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()

    expect(result.taskIds).toEqual([])
    expect(result.examIds).toEqual([])
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(true)
  })
})

// ── 6. records belonging to lesson-derived synthetic subjects remain ───────

describe('6. tasks/exams linked to a lesson-derived synthetic subject remain', () => {
  it('a task/exam matched (by subjectId or name) to a ghost subject that a live lesson still synthesizes are kept', async () => {
    await addSchoolLesson({
      id: 'lesson-muusika-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    } as never)
    pumpSchool()

    const merged = mergeStoredAndLessonSubjects(
      [{ id: 'lesson-muusika-1', subject: 'Muusikaõpetus', dotColor: '#6F5AE8', cardBg: '#EDE9FB' } as SchoolLesson],
      getAllSchoolSubjects(),
    )
    const syntheticId = merged.find((s) => s.name === 'Muusikaõpetus')!.id

    await addSchoolTask(makeTask({ id: 1, subject: 'Muusikaõpetus', subjectId: syntheticId }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Muusikaõpetus' })) // legacy: name-only match
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()

    expect(result.taskIds).toEqual([])
    expect(result.examIds).toEqual([])
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(true)
  })
})

// ── 7. unrelated tasks and calendar events remain ───────────────────────────

describe('7. unrelated tasks, exams, and calendar events are never touched', () => {
  it('a real subject\'s own items and their calendar events survive alongside an unrelated orphan being cleaned', async () => {
    await addSchoolSubject({ id: 'sub-real', name: 'Eesti keel', color: '#DC2626', bg: '#FEE2E2', icon: null })
    await addSchoolTask(makeTask({ id: 10, subject: 'Eesti keel', subjectId: 'sub-real' }))
    await addSchoolExam(makeExam({ id: 10, subject: 'Eesti keel', subjectId: 'sub-real' }))
    await addSchoolTask(makeTask({ id: 99, subject: 'Kadunud Aine', subjectId: 'sub-gone' }))
    pumpSchool()

    addLink({
      fromType: 'school', fromId: encodeSchoolId('task', 10),
      toType: 'calendar', toId: 'cal-auto-keep', relationType: 'scheduled',
    })
    await addCalendarEvent({
      id: 'cal-auto-keep', title: 'Eesti keele kodutöö', date: '2026-01-01',
      allDay: true, startTime: '', endTime: '', color: '#DC2626',
    })
    pumpCalendar()

    await runRealCleanup()

    expect(fakeDb.has(schoolItemPath('task-10'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('exam-10'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('subject-sub-real'))).toBe(true)
    expect(fakeDb.has(calendarEventPath('cal-auto-keep'))).toBe(true)
    expect(getAllEvents().some((e) => e.id === 'cal-auto-keep')).toBe(true)
    expect(fakeDb.has(schoolItemPath('task-99'))).toBe(false)
  })
})

// ── 8. legacy name-linked records are cleaned ───────────────────────────────

describe('8. a legacy task/exam with no subjectId, matched purely by name, is cleaned when that name no longer exists anywhere', () => {
  it('a pre-subjectId-era task and exam (name-only, no subjectId field) are both deleted', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Vana Aine' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Vana Aine' }))
    pumpSchool()
    // Sanity: these really are the legacy, no-subjectId shape findOrphanedSchoolTasks/Exams must handle.
    expect(getAllSchoolTasks()[0].subjectId).toBeUndefined()
    expect(getAllSchoolExams()[0].subjectId).toBeUndefined()

    const existingSubjects = mergeStoredAndLessonSubjects([], getAllSchoolSubjects())
    expect(findOrphanedSchoolTasks(getAllSchoolTasks(), existingSubjects)).toHaveLength(1)
    expect(findOrphanedSchoolExams(getAllSchoolExams(), existingSubjects)).toHaveLength(1)

    await cleanupOrphanedSchoolItems()

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(false)
  })
})

// ── 9. failed Firestore writes do not falsely remove local data ────────────

describe('9. a failed Firestore write never falsely removes local data', () => {
  it('a rejected batch commit leaves the orphaned task/exam fully intact, both immediately and across a reload', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    pumpSchool()

    nextCommitError = new Error('simulated Firestore outage')
    await expect(cleanupOrphanedSchoolItems()).rejects.toThrow('simulated Firestore outage')

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(true)

    simulatePageReload()
    expect(getAllSchoolTasks().some((t) => t.id === 1)).toBe(true)
    expect(getAllSchoolExams().some((e) => e.id === 1)).toBe(true)
  })

  it('the onDeleted callback never fires when the commit fails — no calendar/link cleanup happens for data that was not actually deleted', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    pumpSchool()

    nextCommitError = new Error('simulated Firestore outage')
    const onDeleted = vi.fn()
    await expect(cleanupOrphanedSchoolItems(onDeleted)).rejects.toThrow()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

// ── 10. repeated cleanup is safe (idempotent) ───────────────────────────────

describe('10. repeated cleanup is safe and idempotent', () => {
  it('running cleanup a second time after the first finds and deletes nothing, with no extra Firestore writes', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    pumpSchool()

    const first = await cleanupOrphanedSchoolItems()
    expect(first.taskIds).toEqual([1])
    pumpSchool()
    writeBatchMock.mockClear()

    const second = await cleanupOrphanedSchoolItems()
    expect(second).toEqual({ taskIds: [], examIds: [] })
    expect(writeBatchMock).not.toHaveBeenCalled()
  })

  it('running cleanup when nothing is orphaned at all is a complete no-op', async () => {
    await addSchoolSubject({ id: 'sub-real', name: 'Füüsika', color: '#2563EB', bg: '#EFF6FF', icon: null })
    await addSchoolTask(makeTask({ id: 1, subject: 'Füüsika', subjectId: 'sub-real' }))
    pumpSchool()

    const result = await cleanupOrphanedSchoolItems()
    expect(result).toEqual({ taskIds: [], examIds: [] })
    expect(writeBatchMock).not.toHaveBeenCalled()
  })
})

// ── previewOrphanedSchoolItems: read-only, never deletes ───────────────────

describe('previewOrphanedSchoolItems reports exactly what cleanup would delete, without deleting anything', () => {
  it('preview lists the orphan, and it is still there afterward', async () => {
    await addSchoolTask(makeTask({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Kadunud', subjectId: 'gone' }))
    pumpSchool()

    const preview = previewOrphanedSchoolItems()
    expect(preview.tasks.map((t) => t.id)).toEqual([1])
    expect(preview.exams.map((e) => e.id)).toEqual([1])

    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(true)
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(true)
  })
})

// ── Bonus: deleteSchoolSubject's own cascade now also reaches exams ────────

describe('deleteSchoolSubject (both branches) now also cascades to linked exams, closing the original gap', () => {
  it('deleting a real subject also deletes its linked exams, not just its tasks', async () => {
    await addSchoolSubject({ id: 'sub-real', name: 'Keemia', color: '#16A34A', bg: '#DCFCE7', icon: null })
    await addSchoolTask(makeTask({ id: 1, subject: 'Keemia', subjectId: 'sub-real' }))
    await addSchoolExam(makeExam({ id: 1, subject: 'Keemia', subjectId: 'sub-real' }))
    pumpSchool()

    await deleteSchoolSubject('sub-real')

    expect(writeBatchDeleteMock).toHaveBeenCalledWith(schoolItemPath('exam-1'))
    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('task-1'))).toBe(false)
  })

  it('deleting a ghost/synthetic subject also deletes its name-matched exams, not just its lessons/tasks', async () => {
    await addSchoolLesson({ id: 'lesson-geo-1', subject: 'Geograafia', dotColor: '#DC2626', cardBg: '#FFF1F2' } as never)
    await addSchoolExam(makeExam({ id: 1, subject: 'Geograafia' }))
    pumpSchool()

    const syntheticId = mergeStoredAndLessonSubjects(
      [{ id: 'lesson-geo-1', subject: 'Geograafia', dotColor: '#DC2626', cardBg: '#FFF1F2' } as SchoolLesson],
      getAllSchoolSubjects(),
    ).find((s) => s.name === 'Geograafia')!.id

    await deleteSchoolSubject(syntheticId)

    expect(fakeDb.has(schoolItemPath('exam-1'))).toBe(false)
    expect(fakeDb.has(schoolItemPath('lesson-lesson-geo-1'))).toBe(false)
  })
})

// ── SchoolPage.tsx wiring ───────────────────────────────────────────────────

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('SchoolPage.tsx wiring: cleanup runs once on mount and cleans up calendar/link side effects', () => {
  it('imports cleanupOrphanedSchoolItems from the existing schoolStore — no parallel cleanup system', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/cleanupOrphanedSchoolItems,\s*\n\} from "@\/lib\/schoolStore"/)
  })

  it('a useEffect with empty deps calls cleanupOrphanedSchoolItems with a callback wiring both taskIds and examIds', () => {
    const block = SCHOOL_PAGE_SRC.match(/useEffect\(\(\) => \{\s*cleanupOrphanedSchoolItems\([\s\S]*?\n {2}\}, \[\]\);/)?.[0] ?? ''
    expect(block).toMatch(/for \(const id of taskIds\) \{/)
    expect(block).toMatch(/deleteSchoolCalendarEvent\('task', id\);/)
    expect(block).toMatch(/removeLinksForEntity\('school', encodeSchoolId\('task', id\)\);/)
    expect(block).toMatch(/for \(const id of examIds\) \{/)
    expect(block).toMatch(/deleteSchoolCalendarEvent\('exam', id\);/)
    expect(block).toMatch(/removeLinksForEntity\('school', encodeSchoolId\('exam', id\)\);/)
    expect(block).toMatch(/\.catch\(\(\) => \{/)
  })
})
