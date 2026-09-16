/**
 * The "Lähenevad kontrolltööd ja eksamid" sidebar card (UpcomingExams in
 * SchoolPage.tsx) received the full, unfiltered `exams` list — unlike every
 * other "upcoming" view in the same file (ExamsTab/EksamidTab's completed
 * split, UlevaadeTab's own upcoming lists), which already filter on the
 * existing `status` field. A test/exam marked done (status: 'tehtud') kept
 * showing up in this one card indefinitely.
 *
 * Fix: filter at the call site, reusing the exact same `status !== "tehtud"`
 * check used elsewhere — no new completion flag, no `daysLeft` condition
 * (an overdue-but-incomplete item must remain visible), no other view
 * touched.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectCreate.test.ts and schoolExamMarkDone.test.ts), so the
 * call-site wiring is proven structurally against the source, and the
 * filtering behavior itself is proven by exercising the same predicate the
 * source uses against representative exam data.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolUpcomingExamsHidesCompleted.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

interface ExamLike {
  id: number
  status: 'ootel' | 'tehtud'
  daysLeft: number
}

/** Mirrors the exact predicate now applied at the UpcomingExams call site. */
function upcomingExamsFilter(exams: ExamLike[]): ExamLike[] {
  return exams.filter((e) => e.status !== 'tehtud')
}

describe('call-site wiring: UpcomingExams now receives a status-filtered list', () => {
  it('the call site filters on exam.status !== "tehtud" before passing exams to UpcomingExams', () => {
    const match = SCHOOL_PAGE_SRC.match(/<UpcomingExams\s+exams=\{[\s\S]*?\}\s+onShowAll=\{[\s\S]*?\}\s*\/>/)
    expect(match).not.toBeNull()
    const callSite = match![0]
    expect(callSite).toMatch(/exams=\{exams\.filter\(\(e\) => e\.status !== "tehtud"\)\}/)
  })

  it('the fix does not add a daysLeft condition — overdue-but-incomplete items must stay eligible', () => {
    const match = SCHOOL_PAGE_SRC.match(/<UpcomingExams\s+exams=\{[\s\S]*?\}\s+onShowAll=\{[\s\S]*?\}\s*\/>/)
    const callSite = match![0]
    expect(callSite).not.toMatch(/daysLeft/)
  })

  it('AllExamsModal still receives the full, unfiltered exams list (unrelated view, untouched)', () => {
    const match = SCHOOL_PAGE_SRC.match(/<AllExamsModal[\s\S]*?\/>/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatch(/exams=\{exams\}/)
  })

  it('AIStudyHelper still receives the full, unfiltered exams list (unrelated view, untouched)', () => {
    const match = SCHOOL_PAGE_SRC.match(/<AIStudyHelper[\s\S]*?\/>/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatch(/exams=\{exams\}/)
  })
})

describe('filtering behavior: completed items are hidden, incomplete overdue items remain', () => {
  it('a completed test/exam (status === "tehtud") is excluded, regardless of date', () => {
    const exams: ExamLike[] = [
      { id: 1, status: 'tehtud', daysLeft: 5 },
      { id: 2, status: 'tehtud', daysLeft: -3 },
    ]
    expect(upcomingExamsFilter(exams)).toEqual([])
  })

  it('an incomplete overdue item (status === "ootel", daysLeft < 0) remains eligible for the card', () => {
    const exams: ExamLike[] = [{ id: 3, status: 'ootel', daysLeft: -7 }]
    expect(upcomingExamsFilter(exams)).toEqual([{ id: 3, status: 'ootel', daysLeft: -7 }])
  })

  it('a mix of completed and incomplete items keeps only the incomplete ones, including an overdue one', () => {
    const exams: ExamLike[] = [
      { id: 1, status: 'tehtud', daysLeft: 2 },
      { id: 2, status: 'ootel', daysLeft: 10 },
      { id: 3, status: 'ootel', daysLeft: -1 },
      { id: 4, status: 'tehtud', daysLeft: -5 },
    ]
    expect(upcomingExamsFilter(exams)).toEqual([
      { id: 2, status: 'ootel', daysLeft: 10 },
      { id: 3, status: 'ootel', daysLeft: -1 },
    ])
  })
})
