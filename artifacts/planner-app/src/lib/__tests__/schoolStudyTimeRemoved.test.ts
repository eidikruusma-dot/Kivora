/**
 * School change #14B — remove Study Time from School.
 *
 * Product decision: Study Time (both the planned/estimated study time on
 * learning blocks added in commit 9ea0456, and the pre-existing real-hours
 * "Õppetöö aeg" / "Õppetöö aeg nädalas" overview stat + weekly chart) is
 * not useful enough for Kivora V1 and is removed rather than expanded.
 * This is a targeted cleanup, not a general School refactor or a revert:
 * Assessment/Hindamine, learning-block detail/edit, Tasks, Kontrolltööd,
 * Eksamid, History, Calendar sync, and web links all remain untouched.
 *
 * Removed:
 *   - plannedStudyMinutes?: number and its computePlannedStudyMinutes()
 *     (SchoolPage.tsx) / mirrors (ScheduleLesson, SchoolLesson,
 *     StoredLesson) — the School change #14A feature in full.
 *   - The learning-block add/edit form's "Planeeritud õppeaeg" input and
 *     the learning-block detail's display of it (ScheduleTab.tsx),
 *     including the formatPlannedStudyTime helper.
 *   - computeStudyHoursFromLessons(), the "Õppetöö aeg" overview stat
 *     card, the "Õppetöö aeg nädalas" / StudyTimeChart sidebar card, and
 *     the per-weekday bars inside the "Õppimise statistika" Ülevaade
 *     card (SchoolPage.tsx) — the Tasks-done/Tests-done mini-stats in
 *     that same card are NOT study-time and were kept.
 *   - Now-unused translation keys: school.stat.studyTime(Sub),
 *     school.studytime.title, school.uv.statsTime,
 *     sched.field.plannedStudyTime(Ph), and the older already-orphaned
 *     school.stat.time(Sub) pair (unused before this cleanup too, but
 *     part of the same dead "study time" key family).
 *
 * Existing Firestore documents that already have a stored
 * plannedStudyMinutes value are left alone — no destructive migration —
 * they simply become an unread/unused field, matching the "may simply
 * become unused" instruction.
 *
 * No React rendering harness exists for SchoolPage.tsx/ScheduleTab.tsx in
 * this repo, so this is verified structurally against the raw source,
 * matching the pattern used throughout this session's School tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolStudyTimeRemoved.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

describe('every study-time identifier is gone from the School source files', () => {
  const STUDY_TIME_IDENTIFIERS = [
    'plannedStudyMinutes',
    'plannedStudyHours',
    'computeStudyHoursFromLessons',
    'computePlannedStudyMinutes',
    'formatPlannedStudyTime',
    'liveStudyHours',
    'StudyTimeChart',
    'STUDY_HOURS',
    'MAX_HOURS',
    'totalStudyHours',
    'totalStudyMinutes',
  ]

  it('SchoolPage.tsx contains none of them', () => {
    for (const id of STUDY_TIME_IDENTIFIERS) {
      expect(SCHOOL_PAGE_SRC).not.toContain(id)
    }
  })

  it('ScheduleTab.tsx contains none of them', () => {
    for (const id of STUDY_TIME_IDENTIFIERS) {
      expect(SCHEDULE_TAB_SRC).not.toContain(id)
    }
  })

  it('schoolStore.tsx contains none of them', () => {
    for (const id of STUDY_TIME_IDENTIFIERS) {
      expect(SCHOOL_STORE_SRC).not.toContain(id)
    }
  })
})

describe('every study-time translation key is gone', () => {
  const STUDY_TIME_KEYS = [
    'school.stat.studyTime',
    'school.stat.studyTimeSub',
    'school.studytime.title',
    'school.uv.statsTime',
    'sched.field.plannedStudyTime',
    'sched.field.plannedStudyTimePh',
    'school.stat.time',
    'school.stat.timeSub',
  ]

  it('none of the keys appear anywhere in translations.ts', () => {
    for (const key of STUDY_TIME_KEYS) {
      expect(TRANSLATIONS_SRC).not.toContain(`"${key}"`)
    }
  })
})

describe('SchoolPage.tsx: overview stat cards no longer include a study-time card', () => {
  it('exactly 4 StatCard instances remain: subjects, tasks, exams, progress', () => {
    const matches = SCHOOL_PAGE_SRC.match(/<StatCard\b/g) ?? []
    expect(matches.length).toBe(4)
  })

  it('the remaining stat cards are subjects/tasks/exams/progress, in that order, with no gap for a removed card', () => {
    const overviewSection = SCHOOL_PAGE_SRC.match(/\{\/\* Overview cards \*\/\}[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(overviewSection).toMatch(/tr\("school\.stat\.subjects", lang\)/)
    expect(overviewSection).toMatch(/tr\("school\.stat\.tasks", lang\)/)
    expect(overviewSection).toMatch(/tr\("school\.stat\.exams", lang\)/)
    expect(overviewSection).toMatch(/tr\("school\.stat\.progress", lang\)/)
  })
})

describe('SchoolPage.tsx: sidebar no longer renders the weekly study-time chart', () => {
  it('UpcomingExams is immediately followed by MaterialsLinks, with nothing study-time-related between them', () => {
    const upcomingIdx = SCHOOL_PAGE_SRC.indexOf('<UpcomingExams exams={exams}')
    const materialsIdx = SCHOOL_PAGE_SRC.indexOf('<MaterialsLinks />')
    expect(upcomingIdx).toBeGreaterThan(-1)
    expect(materialsIdx).toBeGreaterThan(upcomingIdx)
    const between = SCHOOL_PAGE_SRC.slice(upcomingIdx, materialsIdx)
    expect(between).not.toMatch(/StudyTime/)
  })
})

describe('UlevaadeTab: Õppimise statistika card keeps Tasks-done/Tests-done, drops the study-time total and weekday bars', () => {
  const cardBlock = SCHOOL_PAGE_SRC.match(/\{\/\* 6\. Õppimise statistika \*\/\}[\s\S]*?<\/UlevaadeCard>/)?.[0] ?? ''

  it('the card block was found', () => {
    expect(cardBlock.length).toBeGreaterThan(0)
  })

  it('still shows completed tasks and completed tests counts', () => {
    expect(cardBlock).toMatch(/tr\("school\.stat\.tasksDone", lang\)/)
    expect(cardBlock).toMatch(/\{completedTasksCount\} \/ \{tasks\.length\}/)
    expect(cardBlock).toMatch(/tr\("school\.stat\.testsDone", lang\)/)
    expect(cardBlock).toMatch(/\{completedTestsCount\}/)
  })

  it('no longer references studyHours, a per-day bar loop, or a study-time total row', () => {
    expect(cardBlock).not.toMatch(/studyHours/)
    expect(cardBlock).not.toMatch(/heightPct/)
    expect(cardBlock).not.toMatch(/school\.uv\.statsTime/)
  })

  it('UlevaadeTab no longer takes studyHours or plannedStudyMinutes props', () => {
    const signatureBlock = SCHOOL_PAGE_SRC.match(/function UlevaadeTab\(\{[\s\S]*?\}\) \{/)?.[0] ?? ''
    expect(signatureBlock).not.toMatch(/studyHours/)
    expect(signatureBlock).not.toMatch(/plannedStudyMinutes/)
    // scheduleLessons/scheduleMode/tasks/exams/subjects/onNavigate are unrelated and still present
    expect(signatureBlock).toMatch(/scheduleLessons/)
    expect(signatureBlock).toMatch(/scheduleMode/)
  })
})

describe('ScheduleTab.tsx: LessonModal and LessonDetailModal no longer mention planned study time', () => {
  it('LessonModal has no planned-study-time input, state, or save-payload field', () => {
    const block = SCHEDULE_TAB_SRC.match(/function LessonModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).not.toMatch(/plannedStudy/i)
    // The Hindamine/Assessment field is untouched and still the last field before the footer
    expect(block).toMatch(/t\('sched\.field\.assessment', lang\)/)
    const saveBlock = block.match(/await onSave\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(saveBlock).toMatch(/assessment: assessment\.trim\(\) \|\| undefined,/)
  })

  it('LessonDetailModal has no planned-study-time display block', () => {
    const block = SCHEDULE_TAB_SRC.match(/function LessonDetailModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).not.toMatch(/plannedStudy/i)
    expect(block).toMatch(/lesson\.assessment/)
  })
})

describe('ScheduleLesson / SchoolLesson / StoredLesson no longer declare plannedStudyMinutes, assessment intact', () => {
  it('ScheduleTab.tsx: ScheduleLesson has no plannedStudyMinutes, still has assessment', () => {
    const block = SCHEDULE_TAB_SRC.match(/export interface ScheduleLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).not.toMatch(/plannedStudyMinutes/)
    expect(block).toMatch(/assessment\?:\s*string/)
  })

  it('schoolStore.tsx: SchoolLesson and StoredLesson have no plannedStudyMinutes, still have assessment', () => {
    const schoolLessonBlock = SCHOOL_STORE_SRC.match(/export interface SchoolLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedLessonBlock = SCHOOL_STORE_SRC.match(/interface StoredLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(schoolLessonBlock).not.toMatch(/plannedStudyMinutes/)
    expect(storedLessonBlock).not.toMatch(/plannedStudyMinutes/)
    expect(schoolLessonBlock).toMatch(/assessment\?:\s*string/)
    expect(storedLessonBlock).toMatch(/assessment\?:\s*string/)
  })

  it('addSchoolLesson/updateSchoolLesson/storedToLesson bodies are unchanged by this removal (they never special-cased the field)', () => {
    const addBlock = SCHOOL_STORE_SRC.match(/export async function addSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    const updateBlock = SCHOOL_STORE_SRC.match(/export async function updateSchoolLesson\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(addBlock).not.toMatch(/plannedStudyMinutes/)
    expect(updateBlock).not.toMatch(/plannedStudyMinutes/)
  })
})

describe('Scope: no destructive Firestore migration was introduced', () => {
  it('no plannedStudyMinutes-specific migration/backfill helper exists in schoolStore.tsx', () => {
    expect(SCHOOL_STORE_SRC).not.toMatch(/plannedStudyMinutes/)
  })

  it('addSchoolLesson/updateSchoolLesson/deleteSchoolLesson signatures are unchanged (no new migration entry point added)', () => {
    expect(SCHOOL_STORE_SRC).toMatch(/export async function addSchoolLesson\(lesson: SchoolLesson\): Promise<void>/)
    expect(SCHOOL_STORE_SRC).toMatch(/export async function updateSchoolLesson\(/)
    expect(SCHOOL_STORE_SRC).toMatch(/export async function deleteSchoolLesson\(id: string\): Promise<void>/)
  })
})
