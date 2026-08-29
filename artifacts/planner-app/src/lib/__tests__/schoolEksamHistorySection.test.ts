/**
 * School change #11 — Eksamid's active list previously showed every exam of
 * type "eksam" regardless of status, with completed ones (status ===
 * "tehtud", already working per change #10) simply sorted to the bottom.
 * EksamidTab now splits the same `exams` array it always received into:
 *   - active: status === "ootel" only — the main list, keeping its existing
 *     daysLeft sort;
 *   - History: status === "tehtud" only, grouped by subject via the SAME
 *     groupExamsBySubjectAlpha function Kontrolltööd History already uses
 *     (School change #9) — reused as-is, not duplicated, since it already
 *     operates generically on Exam[] regardless of exam type.
 *
 * Entirely derived from the existing `status` field (already exercised by
 * change #10's mark-done/undone action, itself unchanged here) — no new
 * field, collection, or migration. Because active/completed partition
 * `exams` by mutually exclusive status values, a given exam can never
 * appear in both.
 *
 * Rendering the same row markup twice (active list and History) without
 * duplicating it required pulling EksamidTab's existing inline per-exam-row
 * JSX (with its own three-dot menu: edit / mark done-undone / delete) into a
 * standalone `EksamRow` component, and the per-subject-group heading into a
 * new `SubjectEksamGroups` — both local to SchoolPage.tsx and used only by
 * EksamidTab. `EksamRow` is intentionally its own component (not
 * Kontrolltööd's simpler `ExamRow`, which has no inline menu), so Eksamid's
 * richer existing row-level actions are preserved unchanged. Kontrolltööd,
 * School Tasks History, Calendar sync, and School<->Tasks sync are
 * untouched.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolExamHistorySection.test.ts for the closely analogous
 * precedent this file mirrors), so:
 *   - the active/History split + grouping algorithm is proven by
 *     reproducing it below and exercising it against fixtures, then
 *     cross-checked structurally against the actual source;
 *   - the UI wiring (History heading, reused EksamRow/color logic, existing
 *     actions untouched) is proven structurally.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolEksamHistorySection.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function eksamidTabSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function EksamRow\(\{[\s\S]*?\nfunction EksamidTab\([\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── The active/History split + grouping, reproduced verbatim from
// EksamidTab so its correctness can be exercised directly. ─────────────────

interface MiniExam {
  id: number
  subject: string
  status: 'ootel' | 'tehtud'
  daysLeft: number
  iconColor: string
  iconBg: string
}

function groupBySubject(list: MiniExam[]) {
  const subjectsAlpha = Array.from(new Set(list.map((e) => e.subject))).sort((a, b) =>
    a.localeCompare(b, 'et'),
  )
  return subjectsAlpha.map((subject) => {
    const groupExams = list.filter((e) => e.subject === subject)
    const [first] = groupExams
    return {
      subject,
      color: first.iconColor,
      bg: first.iconBg,
      exams: groupExams,
    }
  })
}

function splitActiveAndHistory(exams: MiniExam[]) {
  const activeExams = exams.filter((e) => e.status === 'ootel')
  const completedExams = exams.filter((e) => e.status === 'tehtud')
  return {
    activeGroups: groupBySubject(activeExams),
    historyGroups: groupBySubject(completedExams),
    activeExams,
  }
}

function exam(id: number, subject: string, status: 'ootel' | 'tehtud', daysLeft = 5, color = '#6F5AE8', bg = '#EDE9FB'): MiniExam {
  return { id, subject, status, daysLeft, iconColor: color, iconBg: bg }
}

// ── Active/History separation ───────────────────────────────────────────────

describe('the active Eksamid list shows only status === "ootel", never a completed exam', () => {
  it('a pending exam appears in the active set; a completed one does not', () => {
    const { activeExams } = splitActiveAndHistory([
      exam(1, 'Ajalugu', 'ootel'),
      exam(2, 'Ajalugu', 'tehtud'),
    ])
    expect(activeExams.map((e) => e.id)).toEqual([1])
  })
})

describe('status === "tehtud" exams appear in History, grouped by subject', () => {
  it('a completed exam appears in a history group', () => {
    const { historyGroups } = splitActiveAndHistory([exam(1, 'Ajalugu', 'tehtud')])
    expect(historyGroups.flatMap((g) => g.exams.map((e) => e.id))).toEqual([1])
  })

  it('completed exams from different subjects land in separate history groups, ordered alphabetically', () => {
    const { historyGroups } = splitActiveAndHistory([
      exam(1, 'Matemaatika', 'tehtud'),
      exam(2, 'Ajalugu', 'tehtud'),
    ])
    expect(historyGroups.map((g) => g.subject)).toEqual(['Ajalugu', 'Matemaatika'])
  })
})

describe('subject colors are reused in Eksam History (existing iconColor/iconBg, no new color system)', () => {
  it('a history group\'s color/bg comes from its completed exams\' existing iconColor/iconBg', () => {
    const { historyGroups } = splitActiveAndHistory([exam(1, 'Ajalugu', 'tehtud', 5, '#DC2626', '#FEE2E2')])
    expect(historyGroups[0].color).toBe('#DC2626')
    expect(historyGroups[0].bg).toBe('#FEE2E2')
  })
})

describe('empty subject groups are never produced', () => {
  it('an empty completed list produces zero history groups', () => {
    expect(splitActiveAndHistory([]).historyGroups).toEqual([])
  })

  it('every produced group has at least one exam', () => {
    const { historyGroups } = splitActiveAndHistory([exam(1, 'Ajalugu', 'tehtud'), exam(2, 'Matemaatika', 'tehtud')])
    for (const g of historyGroups) expect(g.exams.length).toBeGreaterThan(0)
  })
})

// ── No duplication or loss ──────────────────────────────────────────────────

describe('a completed exam appears exactly once overall (History only, never also active, never duplicated)', () => {
  it('with a mix of active and completed exams, every id appears in exactly one place', () => {
    const exams = [
      exam(1, 'Ajalugu', 'tehtud'),
      exam(2, 'Ajalugu', 'ootel'),
      exam(3, 'Matemaatika', 'tehtud'),
      exam(4, 'Matemaatika', 'ootel'),
    ]
    const { activeGroups, historyGroups, activeExams } = splitActiveAndHistory(exams)
    const activeIds = activeExams.map((e) => e.id)
    const activeGroupIds = activeGroups.flatMap((g) => g.exams.map((e) => e.id))
    const historyIds = historyGroups.flatMap((g) => g.exams.map((e) => e.id))
    const allIds = [...activeIds, ...historyIds].sort()
    expect(allIds).toEqual([1, 2, 3, 4])
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(activeIds.sort()).toEqual(activeGroupIds.sort())
  })
})

// ── completed -> History, reopened -> active ────────────────────────────────

describe('marking an exam done moves it to History; marking it undone (change #10) returns it to active immediately', () => {
  it('re-splitting after status flips to "tehtud" relocates the exam into History', () => {
    const before = splitActiveAndHistory([exam(1, 'Ajalugu', 'ootel')])
    expect(before.activeExams.map((e) => e.id)).toEqual([1])
    expect(before.historyGroups).toEqual([])

    // Same exam, marked done — this is exactly what onMarkDone (change #10,
    // unchanged here) does to `status`.
    const markedDone = { ...exam(1, 'Ajalugu', 'ootel'), status: 'tehtud' as const }
    const after = splitActiveAndHistory([markedDone])
    expect(after.activeExams).toEqual([])
    expect(after.historyGroups.flatMap((g) => g.exams.map((e) => e.id))).toEqual([1])
  })

  it('re-splitting after status flips back to "ootel" relocates the exam back to active and out of History', () => {
    const before = splitActiveAndHistory([exam(1, 'Ajalugu', 'tehtud')])
    expect(before.historyGroups.flatMap((g) => g.exams.map((e) => e.id))).toEqual([1])

    const reopened = { ...exam(1, 'Ajalugu', 'tehtud'), status: 'ootel' as const }
    const after = splitActiveAndHistory([reopened])
    expect(after.activeExams.map((e) => e.id)).toEqual([1])
    expect(after.historyGroups).toEqual([])
  })
})

// ── Structural: the real source implements this exact split/grouping ──────

describe('EksamidTab implements this exact active/History split and grouping (structural)', () => {
  const src = eksamidTabSource()

  it('splits by the existing status field only, with no new field/collection', () => {
    expect(src).toMatch(/exams\.filter\(\(e\) => e\.status === "ootel"\)/)
    expect(src).toMatch(/exams\.filter\(\(e\) => e\.status === "tehtud"\)/)
    expect(src).not.toMatch(/\.archived/)
    expect(src).not.toMatch(/isArchived/)
  })

  it('the active list sorts `activeExams` (not the raw `exams`), preserving the existing daysLeft comparator', () => {
    expect(src).toMatch(/const sorted = \[\.\.\.activeExams\]\.sort\(\(a, b\) => \{/)
    expect(src).toMatch(/return a\.daysLeft - b\.daysLeft;/)
  })

  it('History reuses groupExamsBySubjectAlpha (Kontrolltööd\'s change #9 function) rather than a divergent implementation', () => {
    expect(src).toMatch(/groupExamsBySubjectAlpha\(\s*\n?\s*\[\.\.\.completedExams\]\.sort/)
  })

  it('groupExamsBySubjectAlpha itself is defined exactly once (not duplicated for Eksamid)', () => {
    const defCount = (SCHOOL_PAGE_SRC.match(/function groupExamsBySubjectAlpha\(/g) ?? []).length
    expect(defCount).toBe(1)
  })

  it('renders a labeled History section only when there is at least one completed exam', () => {
    expect(src).toMatch(/\{historyGroups\.length > 0 && \(/)
    expect(src).toMatch(/\{tr\("school\.section\.history", lang\)\}/)
  })

  it('does not touch Kontrolltööd\'s ExamsTab/ExamRow or School Tasks History\'s grouping function', () => {
    expect(src).not.toMatch(/<ExamsTab/)
    expect(src).not.toMatch(/<ExamRow(?!s)/)
    expect(src).not.toMatch(/groupTasksBySubjectAlpha/)
  })
})

// ── Existing actions preserved ──────────────────────────────────────────────

describe('existing Eksam edit/delete/link/mark-done-undone actions are preserved — every row (active or History) keeps its own menu', () => {
  const src = eksamidTabSource()

  it('both the active list and History rows render via the same EksamRow component (no divergent row implementation)', () => {
    const subjectEksamGroupsBlock = SCHOOL_PAGE_SRC.match(/function SubjectEksamGroups[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(subjectEksamGroupsBlock).toMatch(/<EksamRow/)
    expect(src).toMatch(/<EksamRow\b/)
  })

  it('EksamRow still has its own three-dot menu with Edit, Märgi tehtuks/tegemata, and Delete, unchanged', () => {
    const examRowBlock = SCHOOL_PAGE_SRC.match(/function EksamRow\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(examRowBlock).toMatch(/onEdit\(exam\)/)
    expect(examRowBlock).toMatch(/onMarkDone\(exam\.id\)/)
    expect(examRowBlock).toMatch(/onMarkUndone\(exam\.id\)/)
    expect(examRowBlock).toMatch(/setConfirmDeleteId\(exam\.id\)/)
    expect(examRowBlock).toMatch(/onDelete\(exam\.id\)/)
  })

  it('EksamRow still opens the detail modal via onExamClick(exam), unchanged', () => {
    const examRowBlock = SCHOOL_PAGE_SRC.match(/function EksamRow\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(examRowBlock).toMatch(/onClick=\{\(\) => onExamClick\(exam\)\}/)
  })

  it('EksamidTab still receives and forwards onEdit/onMarkDone/onMarkUndone/onDelete props unchanged', () => {
    expect(src).toMatch(/onEdit: \(exam: Exam\) => void;/)
    expect(src).toMatch(/onMarkDone: \(id: number\) => void;/)
    expect(src).toMatch(/onMarkUndone: \(id: number\) => void;/)
    expect(src).toMatch(/onDelete: \(id: number\) => void;/)
  })
})

describe('school.section.history is reused, not a new translation key', () => {
  it('ET: "Ajalugu"', () => {
    expect(t('school.section.history', 'et')).toBe('Ajalugu')
  })
  it('EN: "History"', () => {
    expect(t('school.section.history', 'en')).toBe('History')
  })
})
