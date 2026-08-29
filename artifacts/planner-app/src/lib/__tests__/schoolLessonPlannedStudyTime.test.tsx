// @vitest-environment jsdom
/**
 * School change #14A — planned/estimated study time on learning blocks.
 *
 * Additive-only: `plannedStudyMinutes?: number` added to ScheduleLesson
 * (ScheduleTab.tsx) and its schoolStore.tsx mirrors (SchoolLesson,
 * StoredLesson) — same generic pass-through + sanitizeForFirestore
 * undefined-stripping pattern already used for Lesson.assessment (School
 * UX fix) and every other optional field in this store. This is NOT a
 * timer: no start/stop tracking, no new collection.
 *
 * The user enters hours (decimal allowed) in the shared LessonModal
 * add/edit form; the form converts to integer minutes on save
 * (Math.round(hours * 60)) and stores minutes, matching how the existing
 * study-time engine already thinks internally (start/end times are
 * converted to minutes before being divided back to hours for display).
 *
 * Totals: computeStudyHoursFromLessons() (the per-weekday bars) is
 * untouched. A new computePlannedStudyMinutes() sums plannedStudyMinutes
 * only for lessons that do NOT have a complete day+startTime+endTime
 * triple, so a block contributes either its real schedule duration or its
 * own estimate, never both, and planned time never lands in a weekday bar
 * (a date-ranged flexible block has no single weekday to attach to).
 *
 * No React rendering harness exists for SchoolPage.tsx/ScheduleTab.tsx in
 * this repo, so:
 *   - the pure total/format functions are unit-tested directly (both were
 *     given `export` for this purpose, mirroring mergeTaskWebLinks);
 *   - persistence/back-compat are proven via the REAL schoolStore
 *     functions against a mocked Firestore with the REAL
 *     sanitizeForFirestore, reading back through useSchoolLessons()
 *     (there is no synchronous getAllSchoolLessons getter);
 *   - UI wiring (pre-fill, save conversion, display, placement) is proven
 *     structurally against the source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolLessonPlannedStudyTime.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'
import {
  computeStudyHoursFromLessons,
  computePlannedStudyMinutes,
} from '@/views/SchoolPage'
import { formatPlannedStudyTime, type ScheduleLesson } from '@/components/school/ScheduleTab'

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')
const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function lessonModalSource(): string {
  const match = SCHEDULE_TAB_SRC.match(/function LessonModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

function lessonDetailModalSource(): string {
  const match = SCHEDULE_TAB_SRC.match(/function LessonDetailModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── 2 & 3: pure functions — hours→minutes conversion and display format ────

describe('2. hours -> minutes conversion (LessonModal.handleSave)', () => {
  const src = lessonModalSource()

  it('parses the friendly hours input and rounds to integer minutes on save', () => {
    expect(src).toMatch(/const parsedHours = parseFloat\(plannedStudyHours\.trim\(\)\.replace\(',', '\.'\)\)/)
    expect(src).toMatch(/Math\.round\(parsedHours \* 60\)/)
  })

  it('empty/invalid/non-positive input clears the field (undefined, not 0 or NaN)', () => {
    const block = src.match(/const plannedStudyMinutes =[\s\S]*?undefined/)?.[0] ?? ''
    expect(block).toMatch(/plannedStudyHours\.trim\(\) && !isNaN\(parsedHours\) && parsedHours > 0/)
  })

  it('6 hours converts to 360 minutes, 1.5 hours to 90 minutes (arithmetic sanity, same formula as the source)', () => {
    expect(Math.round(6 * 60)).toBe(360)
    expect(Math.round(1.5 * 60)).toBe(90)
  })
})

describe('3. formatPlannedStudyTime: human-readable display', () => {
  it('360 minutes -> "6 h"', () => {
    expect(formatPlannedStudyTime(360)).toBe('6 h')
  })
  it('90 minutes -> "1 h 30 min"', () => {
    expect(formatPlannedStudyTime(90)).toBe('1 h 30 min')
  })
  it('45 minutes -> "45 min" (no whole hour)', () => {
    expect(formatPlannedStudyTime(45)).toBe('45 min')
  })
  it('600 minutes -> "10 h" (matches the "10 h" example from the requirements)', () => {
    expect(formatPlannedStudyTime(600)).toBe('10 h')
  })
})

// ── 4 & 5: totals — flexible contributes, scheduled does not double-count ──

describe('4. computePlannedStudyMinutes: a flexible block (no day/startTime/endTime) contributes its estimate', () => {
  it('a startDate/endDate block with plannedStudyMinutes counts toward the total', () => {
    const flexible: ScheduleLesson = {
      id: 'l1', subject: 'Matemaatika', startDate: '2026-09-01', endDate: '2026-09-30',
      dotColor: '#6F5AE8', cardBg: '#EDE9FB', plannedStudyMinutes: 360,
    }
    expect(computePlannedStudyMinutes([flexible])).toBe(360)
  })

  it('several flexible blocks sum together', () => {
    const a: ScheduleLesson = { id: 'l1', subject: 'A', startDate: '2026-09-01', endDate: '2026-09-30', dotColor: '#000', cardBg: '#000', plannedStudyMinutes: 360 }
    const b: ScheduleLesson = { id: 'l2', subject: 'B', startDate: '2026-09-01', endDate: '2026-09-30', dotColor: '#000', cardBg: '#000', plannedStudyMinutes: 90 }
    expect(computePlannedStudyMinutes([a, b])).toBe(450)
  })
})

describe('5. a scheduled block (real day+startTime+endTime) uses only its real duration — no double-counting', () => {
  it('a scheduled lesson with plannedStudyMinutes also set contributes 0 to computePlannedStudyMinutes', () => {
    const scheduled: ScheduleLesson = {
      id: 'l1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
      dotColor: '#DC2626', cardBg: '#FEE2E2', plannedStudyMinutes: 999,
    }
    expect(computePlannedStudyMinutes([scheduled])).toBe(0)
  })

  it('that same scheduled lesson still contributes its real duration to computeStudyHoursFromLessons, unaffected by plannedStudyMinutes', () => {
    const scheduled: ScheduleLesson = {
      id: 'l1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
      dotColor: '#DC2626', cardBg: '#FEE2E2', plannedStudyMinutes: 999,
    }
    const result = computeStudyHoursFromLessons([scheduled])
    const monday = result.find((d) => d.day === 'E')
    expect(monday?.hours).toBe(0.8) // 45 minutes, rounded to 1 decimal by computeStudyHoursFromLessons
  })

  it('mixed: one scheduled + one flexible block — total planned minutes counts only the flexible one', () => {
    const scheduled: ScheduleLesson = {
      id: 'l1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
      dotColor: '#000', cardBg: '#000', plannedStudyMinutes: 999,
    }
    const flexible: ScheduleLesson = {
      id: 'l2', subject: 'Inglise keel', startDate: '2026-09-01', endDate: '2026-09-30',
      dotColor: '#000', cardBg: '#000', plannedStudyMinutes: 300,
    }
    expect(computePlannedStudyMinutes([scheduled, flexible])).toBe(300)
  })
})

// ── 6: weekday bars are completely unaffected ───────────────────────────────

describe('6. weekday bars (computeStudyHoursFromLessons) remain unchanged by plannedStudyMinutes', () => {
  it('the function body never references plannedStudyMinutes', () => {
    const block = SCHOOL_PAGE_SRC.match(/export function computeStudyHoursFromLessons\([\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).not.toMatch(/plannedStudyMinutes/)
  })

  it('output is identical whether or not a lesson carries plannedStudyMinutes', () => {
    const withoutPlanned: ScheduleLesson = {
      id: 'l1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
      dotColor: '#000', cardBg: '#000',
    }
    const withPlanned: ScheduleLesson = { ...withoutPlanned, plannedStudyMinutes: 500 }
    expect(computeStudyHoursFromLessons([withPlanned])).toEqual(computeStudyHoursFromLessons([withoutPlanned]))
  })

  it('a flexible block with only plannedStudyMinutes (no day/time) contributes 0 to every weekday bar', () => {
    const flexible: ScheduleLesson = {
      id: 'l1', subject: 'Keemia', startDate: '2026-09-01', endDate: '2026-09-30',
      dotColor: '#000', cardBg: '#000', plannedStudyMinutes: 600,
    }
    const result = computeStudyHoursFromLessons([flexible])
    expect(result.every((d) => d.hours === 0)).toBe(true)
  })

  it('SchoolPage.tsx never passes plannedStudyMinutes/planned totals into StudyTimeChart\'s data prop', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/<StudyTimeChart data=\{liveStudyHours\}\s*\/>/)
  })
})

// ── Structural: data model gains plannedStudyMinutes?: number only ─────────

describe('ScheduleLesson / SchoolLesson / StoredLesson gain plannedStudyMinutes?: number only', () => {
  it('ScheduleTab.tsx: ScheduleLesson declares plannedStudyMinutes?: number', () => {
    const block = SCHEDULE_TAB_SRC.match(/export interface ScheduleLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/plannedStudyMinutes\?:\s*number/)
  })

  it('schoolStore.tsx: SchoolLesson and StoredLesson both declare plannedStudyMinutes?: number', () => {
    const schoolLessonBlock = SCHOOL_STORE_SRC.match(/export interface SchoolLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedLessonBlock = SCHOOL_STORE_SRC.match(/interface StoredLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(schoolLessonBlock).toMatch(/plannedStudyMinutes\?:\s*number/)
    expect(storedLessonBlock).toMatch(/plannedStudyMinutes\?:\s*number/)
  })

  it('addSchoolLesson/updateSchoolLesson/storedToLesson function bodies are unchanged — no special-casing', () => {
    const addBlock = SCHOOL_STORE_SRC.match(/export async function addSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    const updateBlock = SCHOOL_STORE_SRC.match(/export async function updateSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    const storedToLessonBlock = SCHOOL_STORE_SRC.match(/function storedToLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(addBlock).not.toMatch(/plannedStudyMinutes/)
    expect(updateBlock).not.toMatch(/plannedStudyMinutes/)
    expect(storedToLessonBlock).not.toMatch(/plannedStudyMinutes/)
  })
})

// ── Translations ─────────────────────────────────────────────────────────────

describe('sched.field.plannedStudyTime translation', () => {
  it('ET reads "Planeeritud õppeaeg"', () => {
    expect(t('sched.field.plannedStudyTime', 'et')).toBe('Planeeritud õppeaeg')
  })
  it('EN reads "Planned study time"', () => {
    expect(t('sched.field.plannedStudyTime', 'en')).toBe('Planned study time')
  })
})

// ── UI wiring (structural) ───────────────────────────────────────────────────

describe('LessonModal: planned study time field pre-fill, placement, and save payload', () => {
  const src = lessonModalSource()

  it('pre-fills from the existing lesson\'s plannedStudyMinutes, converted to an hours string', () => {
    expect(src).toMatch(/const \[plannedStudyHours, setPlannedStudyHours\] = useState\(/)
    expect(src).toMatch(/lesson\?\.plannedStudyMinutes\s*\n\s*\? String\(Math\.round\(\(lesson\.plannedStudyMinutes \/ 60\) \* 100\) \/ 100\)/)
  })

  it('renders an input labeled Planeeritud õppeaeg/Planned study time, placed after the assessment textarea', () => {
    const assessmentTextareaIdx = src.indexOf('<textarea')
    const plannedLabelIdx = src.indexOf("t('sched.field.plannedStudyTime'")
    expect(assessmentTextareaIdx).toBeGreaterThan(-1)
    expect(plannedLabelIdx).toBeGreaterThan(assessmentTextareaIdx)
  })

  it('is an always-optional field, regardless of traditional vs. flexible mode', () => {
    const fieldBlock = src.match(/<label[^>]*>\s*\{t\('sched\.field\.plannedStudyTime', lang\)\}[\s\S]*?<\/label>/)?.[0] ?? ''
    expect(fieldBlock).toMatch(/\{optional\}/)
  })

  it('saving includes plannedStudyMinutes in the lesson payload', () => {
    const saveBlock = src.match(/await onSave\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(saveBlock).toMatch(/plannedStudyMinutes,/)
  })

  it('does not touch the other existing fields\' save logic (room/teacher/assessment unchanged)', () => {
    const saveBlock = src.match(/await onSave\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(saveBlock).toMatch(/room: room \|\| undefined,/)
    expect(saveBlock).toMatch(/teacher: teacher \|\| undefined,/)
    expect(saveBlock).toMatch(/assessment: assessment\.trim\(\) \|\| undefined,/)
  })
})

describe('LessonDetailModal: planned study time display', () => {
  const src = lessonDetailModalSource()

  it('shows the formatted value only when plannedStudyMinutes is a positive number', () => {
    expect(src).toMatch(/\{!!lesson\.plannedStudyMinutes && lesson\.plannedStudyMinutes > 0 && \(/)
  })

  it('renders it via formatPlannedStudyTime, labeled with the shared translation key', () => {
    const startIdx = src.indexOf('{!!lesson.plannedStudyMinutes')
    expect(startIdx).toBeGreaterThan(-1)
    const block = src.slice(startIdx, startIdx + 400)
    expect(block).toMatch(/t\('sched\.field\.plannedStudyTime', lang\)/)
    expect(block).toMatch(/formatPlannedStudyTime\(lesson\.plannedStudyMinutes\)/)
  })

  it('is placed after the assessment display block', () => {
    const assessmentIdx = src.indexOf("t('sched.field.assessment'")
    const plannedIdx = src.indexOf("t('sched.field.plannedStudyTime'")
    expect(assessmentIdx).toBeGreaterThan(-1)
    expect(plannedIdx).toBeGreaterThan(assessmentIdx)
  })
})

describe('SchoolPage.tsx: planned minutes are folded into total-only figures, not the per-day chart', () => {
  it('the overview stat card combines real minutes + plannedStudyMinutes for its total', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/const totalMinutes = realMinutes \+ plannedStudyMinutes;/)
  })

  it('UlevaadeTab combines the same way and receives plannedStudyMinutes as a prop', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/plannedStudyMinutes=\{plannedStudyMinutes\}/)
    expect(SCHOOL_PAGE_SRC).toMatch(/const totalStudyMinutes =\s*\n\s*Math\.round\(studyHours\.reduce\(\(sum, d\) => sum \+ d\.hours, 0\) \* 60\) \+ plannedStudyMinutes;/)
  })
})

// ── Persistence, hours-input round-trip, and back-compat — real store ──────

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: vi.fn(),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

// Real sanitizeForFirestore (not the identity mock some sibling tests use)
// so field-removal-on-clear is actually exercised.

import { renderHook, act } from '@testing-library/react'
import { initSchoolStore, addSchoolLesson, updateSchoolLesson, useSchoolLessons } from '@/lib/schoolStore'

function pumpSchool() {
  act(() => {
    const onNext = onSnapshotMock.mock.calls[0][1]
    const docs = [...fakeDb.entries()]
      .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
      .map(([, data]) => ({ data: () => data }))
    onNext({ docs })
  })
}

function baseLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-1', subject: 'Ajalugu', day: 'Esmaspäev', startTime: '10:00', endTime: '10:45',
    dotColor: '#DC2626', cardBg: '#FEE2E2',
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

describe('1. save/load/edit/clear of planned study time', () => {
  it('addSchoolLesson with plannedStudyMinutes set stores and loads it', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ plannedStudyMinutes: 360 }) as never)
    pumpSchool()

    const stored = fakeDb.get(schoolItemPath('lesson-lesson-1')) as Record<string, unknown>
    expect(stored.plannedStudyMinutes).toBe(360)
    const loaded = result.current.find((l) => l.id === 'lesson-1')
    expect(loaded?.plannedStudyMinutes).toBe(360)
  })

  it('updateSchoolLesson changes an existing block\'s plannedStudyMinutes', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson() as never)
    pumpSchool()
    expect(result.current.find((l) => l.id === 'lesson-1')?.plannedStudyMinutes).toBeUndefined()

    await updateSchoolLesson('lesson-1', { plannedStudyMinutes: 90 })
    pumpSchool()

    expect(result.current.find((l) => l.id === 'lesson-1')?.plannedStudyMinutes).toBe(90)
  })

  it('clearing plannedStudyMinutes (set to undefined) strips the key from the stored document', async () => {
    await addSchoolLesson(baseLesson({ plannedStudyMinutes: 120 }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-1', { plannedStudyMinutes: undefined })

    const stored = fakeDb.get(schoolItemPath('lesson-lesson-1')) as Record<string, unknown>
    expect('plannedStudyMinutes' in stored).toBe(false)
  })

  it('a planned-study-time-only edit leaves every other learning-block field untouched', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ room: '101', teacher: 'Jaan Tamm' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-1', { plannedStudyMinutes: 240 })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'lesson-1')
    expect(lesson?.subject).toBe('Ajalugu')
    expect(lesson?.day).toBe('Esmaspäev')
    expect(lesson?.startTime).toBe('10:00')
    expect(lesson?.room).toBe('101')
    expect(lesson?.teacher).toBe('Jaan Tamm')
    expect(lesson?.plannedStudyMinutes).toBe(240)
  })
})

describe('7. backward compatibility: existing learning blocks without plannedStudyMinutes remain compatible', () => {
  it('a lesson document with no plannedStudyMinutes key at all loads fine, other fields intact', () => {
    const { result } = renderHook(() => useSchoolLessons())
    fakeDb.set(schoolItemPath('lesson-legacy-1'), {
      kind: 'lesson', id: 'legacy-1', subject: 'Matemaatika', day: 'Teisipäev',
      startTime: '09:00', endTime: '09:45', room: '204', teacher: 'Mari Maasikas',
      dotColor: '#6F5AE8', cardBg: '#EDE9FB',
    })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'legacy-1')
    expect(lesson).toBeDefined()
    expect(lesson?.plannedStudyMinutes).toBeUndefined()
    expect(lesson?.subject).toBe('Matemaatika')
    expect(lesson?.room).toBe('204')
  })

  it('a legacy flexible block (startDate/endDate, no plannedStudyMinutes) contributes 0 to computePlannedStudyMinutes, not NaN/crash', () => {
    const legacyFlexible: ScheduleLesson = {
      id: 'legacy-2', subject: 'Bioloogia', startDate: '2026-09-01', endDate: '2026-09-30',
      dotColor: '#000', cardBg: '#000',
    }
    expect(computePlannedStudyMinutes([legacyFlexible])).toBe(0)
  })

  it('a legacy scheduled lesson (no plannedStudyMinutes) still computes its real weekday hours normally', () => {
    const legacyScheduled: ScheduleLesson = {
      id: 'legacy-3', subject: 'Füüsika', day: 'Kolmapäev', startTime: '08:00', endTime: '08:45',
      dotColor: '#000', cardBg: '#000',
    }
    const result = computeStudyHoursFromLessons([legacyScheduled])
    expect(result.find((d) => d.day === 'K')?.hours).toBe(0.8) // 45 minutes, rounded to 1 decimal
  })

  it('editing other fields on a legacy lesson (no plannedStudyMinutes) leaves it absent, not null/0', async () => {
    const { result } = renderHook(() => useSchoolLessons())
    await addSchoolLesson(baseLesson({ id: 'lesson-2', room: '101' }) as never)
    pumpSchool()

    await updateSchoolLesson('lesson-2', { room: '305' })
    pumpSchool()

    const lesson = result.current.find((l) => l.id === 'lesson-2')
    expect(lesson?.room).toBe('305')
    expect(lesson?.plannedStudyMinutes).toBeUndefined()
    const stored = fakeDb.get(schoolItemPath('lesson-lesson-2')) as Record<string, unknown>
    expect('plannedStudyMinutes' in stored).toBe(false)
  })
})

// ── Scope: Tasks/Exams/Subjects and Assessment are untouched ────────────────

describe('Scope: nothing outside the learning block was touched', () => {
  it('plannedStudyMinutes does not appear on StoredTask, StoredExam, StoredSubject, SchoolTask, SchoolExam, or SchoolSubject', () => {
    const forbiddenBlocks = [
      'interface StoredTask',
      'interface StoredExam',
      'interface StoredSubject',
      'export interface SchoolTask',
      'export interface SchoolExam',
      'export interface SchoolSubject',
    ]
    for (const marker of forbiddenBlocks) {
      const re = new RegExp(`${marker.replace(/\s/g, '\\s+')} \\{[\\s\\S]*?\\n\\}`)
      const block = SCHOOL_STORE_SRC.match(re)?.[0] ?? ''
      expect(block).not.toMatch(/plannedStudyMinutes/)
    }
  })

  it('Subject-level assessment (a separate, pre-existing field) is untouched by this change', () => {
    const subjectBlock = SCHOOL_STORE_SRC.match(/interface StoredSubject \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(subjectBlock).toMatch(/assessment\?:\s*string/)
    expect(subjectBlock).not.toMatch(/plannedStudyMinutes/)
  })
})
