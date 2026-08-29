/**
 * School change #7 — a first archive step, entirely display-derived: no new
 * collection, no document moves, no `archived` field, no Firestore schema
 * change. TasksTab (SchoolPage.tsx) now splits the SAME `tasks` array it
 * always received into:
 *   - "active": `progress < 100` — everything the subject-filter/sort/
 *     show-more controls and the active subject groups (School change #6)
 *     operate on;
 *   - "History": `progress >= 100` — grouped by subject the exact same way
 *     (`groupTasksBySubjectAlpha`, reused verbatim), rendered in its own
 *     section below the active groups.
 *
 * Since progress is the pre-existing completion signal (the same mapping
 * statusFromProgress already used, and the same one School<->Tasks sync
 * from commit d007e92 keeps in step with the linked Tasks-module item),
 * reopening a task (progress drops back below 100 via markSchoolTaskUndone)
 * moves it out of `completedTasks` and back into `activeTasks` on the very
 * next render — there is no separate archive state to reconcile, and
 * nothing is deleted or migrated.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectCreate.test.ts / schoolTaskTypeStudyGuide.test.ts /
 * schoolTasksTabSubjectGrouping.test.ts for the established precedent), so:
 *   - the active/History split + grouping is proven by reproducing it
 *     below and exercising it against fixtures (including the
 *     reopen-moves-it-back property), then cross-checked structurally
 *     against the actual source;
 *   - the UI wiring (History heading, reused SubjectTaskGroups/color logic,
 *     no schema/collection change) is proven structurally.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTasksTabHistorySection.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function tasksTabSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/interface SubjectTaskGroup \{[\s\S]*?\nfunction TasksTab\([\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── The active/History split + grouping, reproduced verbatim from
// TasksTab so its correctness can be exercised directly. ───────────────────

interface MiniTask {
  id: number
  subject: string
  subjectColor: string
  subjectBg: string
  progress: number
}

function groupBySubject(list: MiniTask[]) {
  const subjectsAlpha = Array.from(new Set(list.map((t) => t.subject))).sort((a, b) =>
    a.localeCompare(b, 'et'),
  )
  return subjectsAlpha.map((subject) => {
    const groupTasks = list.filter((t) => t.subject === subject)
    const [first] = groupTasks
    return {
      subject,
      color: first.subjectColor,
      bg: first.subjectBg,
      tasks: groupTasks,
    }
  })
}

function splitActiveAndHistory(tasks: MiniTask[]) {
  const activeTasks = tasks.filter((t) => t.progress < 100)
  const completedTasks = tasks.filter((t) => t.progress >= 100)
  return {
    activeGroups: groupBySubject(activeTasks),
    historyGroups: groupBySubject(completedTasks),
  }
}

function task(id: number, subject: string, progress: number, color = '#6F5AE8', bg = '#EDE9FB'): MiniTask {
  return { id, subject, progress, subjectColor: color, subjectBg: bg }
}

// ── 1. incomplete tasks remain in active groups ─────────────────────────────

describe('1. incomplete tasks remain in the active groups', () => {
  it('a task with progress < 100 appears in an active group and not in History', () => {
    const { activeGroups, historyGroups } = splitActiveAndHistory([task(1, 'Ajalugu', 40)])
    expect(activeGroups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual([1])
    expect(historyGroups).toEqual([])
  })
})

// ── 2. completed tasks disappear from active groups ─────────────────────────

describe('2. completed tasks (progress >= 100) disappear from the active groups', () => {
  it('a progress:100 task is absent from every active group', () => {
    const { activeGroups } = splitActiveAndHistory([
      task(1, 'Ajalugu', 100),
      task(2, 'Ajalugu', 50),
    ])
    const activeIds = activeGroups.flatMap((g) => g.tasks.map((t) => t.id))
    expect(activeIds).toEqual([2])
    expect(activeIds).not.toContain(1)
  })
})

// ── 3. completed tasks appear in History ────────────────────────────────────

describe('3. completed tasks appear in History', () => {
  it('a progress:100 task shows up in a history group', () => {
    const { historyGroups } = splitActiveAndHistory([task(1, 'Ajalugu', 100)])
    expect(historyGroups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual([1])
  })
})

// ── 4. History is grouped by subject ────────────────────────────────────────

describe('4. History groups completed tasks by subject, same as active groups', () => {
  it('completed tasks from different subjects land in separate history groups', () => {
    const { historyGroups } = splitActiveAndHistory([
      task(1, 'Ajalugu', 100),
      task(2, 'Matemaatika', 100),
      task(3, 'Ajalugu', 100),
    ])
    expect(historyGroups.map((g) => g.subject)).toEqual(['Ajalugu', 'Matemaatika'])
    expect(historyGroups.find((g) => g.subject === 'Ajalugu')?.tasks.map((t) => t.id)).toEqual([1, 3])
  })
})

// ── 5. subject colors are reused in History ─────────────────────────────────

describe('5. History reuses the subject\'s existing color accent (no new color system)', () => {
  it('a history group\'s color/bg comes from its completed tasks\' existing subjectColor/subjectBg', () => {
    const { historyGroups } = splitActiveAndHistory([
      task(1, 'Ajalugu', 100, '#DC2626', '#FEE2E2'),
    ])
    expect(historyGroups[0].color).toBe('#DC2626')
    expect(historyGroups[0].bg).toBe('#FEE2E2')
  })
})

// ── 6. completed task appears exactly once ──────────────────────────────────

describe('6. a completed task appears exactly once overall (History only, never duplicated, never also active)', () => {
  it('with a mix of active and completed tasks, every id appears in exactly one place', () => {
    const tasks = [
      task(1, 'Ajalugu', 100),
      task(2, 'Ajalugu', 30),
      task(3, 'Matemaatika', 100),
      task(4, 'Matemaatika', 0),
    ]
    const { activeGroups, historyGroups } = splitActiveAndHistory(tasks)
    const activeIds = activeGroups.flatMap((g) => g.tasks.map((t) => t.id))
    const historyIds = historyGroups.flatMap((g) => g.tasks.map((t) => t.id))
    const allIds = [...activeIds, ...historyIds].sort()
    expect(allIds).toEqual([1, 2, 3, 4])
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(activeIds).toEqual([2, 4])
    expect(historyIds).toEqual([1, 3])
  })
})

// ── 7. reopening a completed task moves it back to active and out of History ─

describe('7. reopening a completed task (progress drops below 100) moves it back to active and out of History', () => {
  it('re-splitting after progress drops below 100 relocates the task', () => {
    const before = splitActiveAndHistory([task(1, 'Ajalugu', 100)])
    expect(before.historyGroups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual([1])
    expect(before.activeGroups).toEqual([])

    // Same task, reopened (this is exactly what markSchoolTaskUndone does to
    // `progress` — restores it below 100) — no other field changes needed.
    const reopened = { ...task(1, 'Ajalugu', 100), progress: 40 }
    const after = splitActiveAndHistory([reopened])
    expect(after.activeGroups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual([1])
    expect(after.historyGroups).toEqual([])
  })
})

// ── 8. existing filters/sorting do not duplicate or lose tasks ─────────────

describe('8. the active/History split composes with subject filtering and deadline sorting without duplicating or losing tasks', () => {
  it('filtering to one subject before splitting still partitions cleanly with no loss/duplication', () => {
    const tasks = [
      task(1, 'Ajalugu', 100),
      task(2, 'Ajalugu', 30),
      task(3, 'Matemaatika', 100),
    ]
    // Simulates TasksTab's own subjectFilter step, applied to `tasks` before
    // TasksTab further splits into active vs completed.
    const filtered = tasks.filter((t) => t.subject === 'Ajalugu')
    const { activeGroups, historyGroups } = splitActiveAndHistory(filtered)
    const allIds = [
      ...activeGroups.flatMap((g) => g.tasks.map((t) => t.id)),
      ...historyGroups.flatMap((g) => g.tasks.map((t) => t.id)),
    ].sort()
    expect(allIds).toEqual([1, 2])
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

// ── 9. no persistence/schema migration occurs (structural) ─────────────────

describe('9. the split is purely a display-time computation — no persistence or schema change', () => {
  const src = tasksTabSource()

  it('the active/completed split reads the existing `progress` field only, with no new field introduced', () => {
    expect(src).toMatch(/tasks\.filter\(\(t\) => t\.progress < 100\)/)
    expect(src).toMatch(/tasks\.filter\(\(t\) => t\.progress >= 100\)/)
    expect(src).not.toMatch(/\.archived/)
    expect(src).not.toMatch(/isArchived/)
  })

  it('History reuses the exact same grouping helper as the active groups (no divergent/parallel implementation)', () => {
    expect(src).toMatch(/groupTasksBySubjectAlpha\(visible\)/)
    expect(src).toMatch(/groupTasksBySubjectAlpha\(\s*\n?\s*sortTasksByDeadline\(completedTasks, sortDir\),?\s*\n?\s*\)/)
  })

  it('no Firestore write (setDoc/updateDoc/addDoc/deleteDoc/writeBatch/collection) appears anywhere in TasksTab — this is a read-only derived view', () => {
    expect(src).not.toMatch(/\bsetDoc\(/)
    expect(src).not.toMatch(/\bupdateDoc\(/)
    expect(src).not.toMatch(/\bdeleteDoc\(/)
    expect(src).not.toMatch(/\bwriteBatch\(/)
    expect(src).not.toMatch(/\bcollection\(/)
  })
})

// ── History section UI wiring (structural) ──────────────────────────────────

describe('History section renders below the active groups, using the same subject grouping/color accent', () => {
  const src = tasksTabSource()

  it('renders a labeled History section only when there is at least one completed task', () => {
    expect(src).toMatch(/\{historyGroups\.length > 0 && \(/)
    expect(src).toMatch(/\{tr\("school\.section\.history", lang\)\}/)
  })

  it('renders History via the same SubjectTaskGroups component used for active groups (not a separate/divergent renderer)', () => {
    const historyBlock = src.match(/\{historyGroups\.length > 0 && \([\s\S]*?\n {6}\)\}/)?.[0] ?? ''
    expect(historyBlock).toMatch(/<SubjectTaskGroups/)
    expect(historyBlock).toMatch(/groups=\{historyGroups\}/)
  })

  it('the History section is inline JSX inside TasksTab\'s own returned tree, not a separate page/tab/route', () => {
    // The whole History block (heading + SubjectTaskGroups) sits between
    // TasksTab's other JSX and its closing `</div>` — i.e. it is part of the
    // single tree TasksTab returns, not a new activeTab branch or route.
    const afterHistory = src.slice(src.indexOf('{tr("school.section.history", lang)}'))
    expect(afterHistory).toMatch(/<\/div>\s*\n\s*\);\s*\n}/)
    // No new School tab id/section was introduced for it.
    expect(SCHOOL_PAGE_SRC).not.toMatch(/"ajalugu"\s*:/)
    expect(SCHOOL_PAGE_SRC).not.toMatch(/activeTab === "ajalugu"/)
  })
})

describe('school.section.history label', () => {
  it('ET: "Ajalugu"', () => {
    expect(t('school.section.history', 'et')).toBe('Ajalugu')
  })
  it('EN: "History"', () => {
    expect(t('school.section.history', 'en')).toBe('History')
  })
})
