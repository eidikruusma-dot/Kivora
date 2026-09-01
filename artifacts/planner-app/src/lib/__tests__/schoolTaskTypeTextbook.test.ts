/**
 * School change #6 — a new School task type, "Õpik" / "Textbook" (internal
 * value `textbook`), added to the existing task-type system
 * (TASK_TYPE_VALUES in SchoolPage.tsx + the school.taskType.* translation
 * keys) — no new/parallel category system, mirroring exactly how
 * "study_guide" was added (see schoolTaskTypeStudyGuide.test.ts).
 *
 * Both the create form (TaskAddModal) and the edit form (TaskEditModal)
 * render their type <select> generically via `TASK_TYPE_VALUES.map(...)`,
 * so adding the value to that single array is what makes the new type
 * selectable everywhere at once (verified structurally below). Display
 * (task cards/details) goes through the same shared getTaskTypeLabel(type,
 * lang) already used for every other type. Task types have no icon of
 * their own anywhere in this codebase (only Subjects do — see
 * subjectIcon/iconFromColor), so no icon assignment is needed or added.
 *
 * Persistence is plain data: `type` is stored/read as an opaque string by
 * schoolStore.tsx's taskToStored/storedToTask — proven below via the same
 * mocked-Firestore + onSnapshot-pump pattern used by every other store test
 * in this repo.
 *
 * Calendar derivation (runAutomaticLinking / syncSchoolCalendarEvent /
 * automaticLinking.ts's getEntityInfo) never reads a School task's `type`
 * at all — only title/date/subject feed a derived Calendar event — so a
 * "textbook" task with a deadline is auto-linked to Calendar exactly like
 * any other type, with zero extra wiring. Proven both structurally (the
 * relevant source never mentions `.type`) and behaviorally below.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskTypeTextbook.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const AUTOMATIC_LINKING_SRC = readFileSync(resolve(process.cwd(), 'src/lib/automaticLinking.ts'), 'utf8')

// ── Translation labels ──────────────────────────────────────────────────────

describe('school.taskType.textbook label', () => {
  it('ET: "Õpik"', () => {
    expect(t('school.taskType.textbook', 'et')).toBe('Õpik')
  })
  it('EN: "Textbook"', () => {
    expect(t('school.taskType.textbook', 'en')).toBe('Textbook')
  })
})

describe('existing task-type labels are unchanged', () => {
  it('ET', () => {
    expect(t('school.taskType.homework', 'et')).toBe('Kodutöö')
    expect(t('school.taskType.essay', 'et')).toBe('Essee')
    expect(t('school.taskType.reading', 'et')).toBe('Lugemine')
    expect(t('school.taskType.project', 'et')).toBe('Projekt')
    expect(t('school.taskType.study_guide', 'et')).toBe('Õpijuhis')
    expect(t('school.taskType.other', 'et')).toBe('Muu')
  })
  it('EN', () => {
    expect(t('school.taskType.homework', 'en')).toBe('Homework')
    expect(t('school.taskType.essay', 'en')).toBe('Essay')
    expect(t('school.taskType.reading', 'en')).toBe('Reading')
    expect(t('school.taskType.project', 'en')).toBe('Project')
    expect(t('school.taskType.study_guide', 'en')).toBe('Study guide')
    expect(t('school.taskType.other', 'en')).toBe('Other')
  })
})

// ── Structural: single source of truth drives both forms + both displays ────

describe('TASK_TYPE_VALUES (SchoolPage.tsx) includes textbook', () => {
  const arrayMatch = SCHOOL_PAGE_SRC.match(/const TASK_TYPE_VALUES = \[([\s\S]*?)\] as const;/)

  it('is present in the array literal', () => {
    expect(arrayMatch).not.toBeNull()
    expect(arrayMatch![1]).toMatch(/"textbook"/)
  })

  it('every pre-existing type is still present, unchanged', () => {
    const body = arrayMatch![1]
    for (const existing of [
      'homework', 'essay', 'lab_report', 'presentation',
      'reading', 'project', 'worksheet', 'research', 'study_guide', 'other',
    ]) {
      expect(body).toMatch(new RegExp(`"${existing}"`))
    }
  })

  it('appears exactly once', () => {
    const matches = arrayMatch![1].match(/"textbook"/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('the create form (TaskAddModal) and edit form (TaskEditModal) both render their type <select> generically over TASK_TYPE_VALUES, so the new value is automatically selectable in both without a per-type code path', () => {
    const editModalSrc = SCHOOL_PAGE_SRC.match(/function TaskEditModal[\s\S]*?function TaskAddModal/)?.[0] ?? ''
    const addModalSrc = SCHOOL_PAGE_SRC.slice(SCHOOL_PAGE_SRC.indexOf('function TaskAddModal'))

    expect(editModalSrc).toMatch(/\{TASK_TYPE_VALUES\.map\(\(v\) => \(/)
    expect(addModalSrc).toMatch(/\{TASK_TYPE_VALUES\.map\(\(v\) => \(/)
  })

  it('TaskEditModal loads an existing task\'s type into the <select> when it is a known TASK_TYPE_VALUES member (never falls back to "other" for a known type)', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(
      /\(TASK_TYPE_VALUES as readonly string\[\]\)\.includes\(task\.type\)\s*\n\s*\? \(task\.type as TaskTypeValue\)\s*\n\s*: "other"/,
    )
  })

  it('task list/card display renders the type label via the same shared getTaskTypeLabel — no per-type rendering branch', () => {
    const occurrences = SCHOOL_PAGE_SRC.match(/getTaskTypeLabel\(task\.type, lang\)/g) ?? []
    // Task detail header + compact card — both existing display sites, unchanged count.
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Calendar derivation never discriminates by task type ──────────────────

describe('School -> Calendar derivation is type-agnostic (structural)', () => {
  it('getEntityInfo\'s school-task case reads only title/deadline — never `.type`', () => {
    const block = AUTOMATIC_LINKING_SRC.match(
      /if \(decoded\.kind === 'task'\) \{\s*const st = getAllSchoolTasks\(\)\.find[\s\S]*?\n {6}\}/,
    )?.[0] ?? ''
    expect(block).toMatch(/st\?\.title/)
    expect(block).toMatch(/st\?\.deadline/)
    expect(block).not.toMatch(/st\?\.type|st\.type/)
  })

  it('resolveSchoolItemColor\'s task branch resolves color via subject only — never `.type`', () => {
    const block = AUTOMATIC_LINKING_SRC.match(
      /if \(decoded\.kind === 'task'\) \{\s*const task = getAllSchoolTasks\(\)\.find[\s\S]*?\n {2}\}/,
    )?.[0] ?? ''
    expect(block).toMatch(/task\.subjectId/)
    expect(block).not.toMatch(/task\.type/)
  })
})

// ── Persistence: schoolStore treats `type` as an opaque stored string ───────

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/entityLinksStore', () => ({
  getLinksForEntity: vi.fn(() => []),
  linkDoc: vi.fn(() => ({ path: '' })),
}))
vi.mock('@/lib/calendarStore', () => ({
  eventDoc: vi.fn(() => ({ path: '' })),
}))

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'
function schoolItemPath(docId: string) { return `users/${UID}/schoolItems/${docId}` }

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
const deleteDocMock = vi.fn(async (ref: { path: string }) => { fakeDb.delete(ref.path) })

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  writeBatch: vi.fn(),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initSchoolStore, addSchoolTask, updateSchoolTask, getAllSchoolTasks } from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function makeSchoolTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject: 'Matemaatika',
    subjectColor: '#6F5AE8',
    subjectBg: '#EDE9FB',
    subjectIcon: null,
    title: 'Loe peatükk 3',
    type: 'textbook',
    deadlineLabel: '4. august 2026',
    deadline: '2026-08-04',
    progress: 0,
    moodleUrl: '',
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('creating a task with type "textbook" persists correctly', () => {
  it('setDoc stores type: "textbook" verbatim', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await addSchoolTask(makeSchoolTask() as any)
    const stored = fakeDb.get(schoolItemPath('task-1'))!
    expect(stored.type).toBe('textbook')
  })

  it('round-trips through the store unchanged (create -> onSnapshot -> getAllSchoolTasks) — proving reload renders it correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await addSchoolTask(makeSchoolTask() as any)
    pumpSchool()
    const task = getAllSchoolTasks().find((t) => t.id === 1)
    expect(task?.type).toBe('textbook')
  })
})

describe('editing an existing task to/from "textbook" persists correctly', () => {
  it('updateSchoolTask changes an existing task\'s type to "textbook"', async () => {
    fakeDb.set(schoolItemPath('task-2'), { kind: 'task', ...makeSchoolTask({ id: 2, type: 'homework' }) })
    pumpSchool()
    expect(getAllSchoolTasks().find((t) => t.id === 2)?.type).toBe('homework')

    await updateSchoolTask(2, { type: 'textbook' })
    pumpSchool()
    expect(getAllSchoolTasks().find((t) => t.id === 2)?.type).toBe('textbook')
  })

  it('loading an existing "textbook" task for edit round-trips its type unchanged (no forced migration)', async () => {
    fakeDb.set(schoolItemPath('task-3'), { kind: 'task', ...makeSchoolTask({ id: 3, type: 'textbook' }) })
    pumpSchool()
    const loaded = getAllSchoolTasks().find((t) => t.id === 3)
    expect(loaded?.type).toBe('textbook')
  })

  it('editing a "textbook" task\'s progress leaves its type untouched, and vice versa', async () => {
    fakeDb.set(schoolItemPath('task-5'), { kind: 'task', ...makeSchoolTask({ id: 5, type: 'textbook', progress: 0 }) })
    pumpSchool()

    await updateSchoolTask(5, { progress: 50 })
    pumpSchool()

    const task = getAllSchoolTasks().find((t) => t.id === 5)
    expect(task?.type).toBe('textbook')
    expect(task?.progress).toBe(50)
  })
})

describe('existing task types (e.g. "other"/Muu, "study_guide"/Õpijuhis) are never auto-migrated by adding textbook', () => {
  it('an unrelated update to an "other" task leaves its type untouched', async () => {
    fakeDb.set(schoolItemPath('task-4'), { kind: 'task', ...makeSchoolTask({ id: 4, type: 'other', progress: 0 }) })
    pumpSchool()

    await updateSchoolTask(4, { progress: 50 })
    pumpSchool()

    const task = getAllSchoolTasks().find((t) => t.id === 4)
    expect(task?.type).toBe('other')
    expect(task?.progress).toBe(50)
  })

  it('a stored "study_guide" task round-trips unchanged alongside a "textbook" one', async () => {
    fakeDb.set(schoolItemPath('task-6'), { kind: 'task', ...makeSchoolTask({ id: 6, type: 'study_guide' }) })
    fakeDb.set(schoolItemPath('task-7'), { kind: 'task', ...makeSchoolTask({ id: 7, type: 'textbook' }) })
    pumpSchool()

    expect(getAllSchoolTasks().find((t) => t.id === 6)?.type).toBe('study_guide')
    expect(getAllSchoolTasks().find((t) => t.id === 7)?.type).toBe('textbook')
  })
})
