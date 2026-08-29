/**
 * School change #6 — the School "Ülesanded" tab (TasksTab, SchoolPage.tsx)
 * renders its currently-visible task list grouped into per-subject sections
 * instead of one flat list. Display/UI change only:
 *   - no task data, Firestore schema, or create/edit/delete/completion
 *     behavior changed;
 *   - no new archive/history;
 *   - Kontrolltööd/Eksamid/Ained/timetable/Calendar/School<->Tasks
 *     sync/AI/Settings untouched.
 *
 * TasksTab computes `groupedVisible` directly from its existing `visible`
 * array (the same list that was already being rendered — post subject
 * filter, deadline sort, and the show-4/show-all toggle), by:
 *   1. collecting the distinct subjects present in `visible`, sorted
 *      alphabetically (`localeCompare(..., "et")`);
 *   2. for each subject, `visible.filter((t) => t.subject === subject)` —
 *      which preserves each task's existing relative order (the deadline
 *      sort) and, being derived only from subjects actually present in
 *      `visible`, can never produce an empty group;
 *   3. taking the group's accent color/bg from its first task's existing
 *      `subjectColor`/`subjectBg` (no new color system).
 *
 * SchoolPage.tsx has no exported pure functions and no React rendering
 * harness is available in this repo (see schoolSubjectCreate.test.ts /
 * schoolTaskTypeStudyGuide.test.ts for the established precedent), so:
 *   - the grouping ALGORITHM's correctness (same-subject-one-block,
 *     different-subjects-separate-blocks, no duplication/loss, no empty
 *     groups) is proven by literally reproducing it below and exercising it
 *     against fixtures, then cross-checked structurally against the actual
 *     source so the two can't silently diverge;
 *   - the UI wiring (headings, color reuse, preserved controls, no
 *     accordion/collapse, translations intact) is proven structurally
 *     against the source, as in the precedent tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTasksTabSubjectGrouping.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function tasksTabSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function TasksTab\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── The grouping algorithm, reproduced verbatim from TasksTab so its
// correctness can be exercised directly (not just pattern-matched). ────────

interface MiniTask {
  id: number
  subject: string
  subjectColor: string
  subjectBg: string
}

function groupBySubject(visible: MiniTask[]) {
  const visibleSubjectsAlpha = Array.from(
    new Set(visible.map((t) => t.subject)),
  ).sort((a, b) => a.localeCompare(b, 'et'))
  return visibleSubjectsAlpha.map((subject) => {
    const groupTasks = visible.filter((t) => t.subject === subject)
    const [first] = groupTasks
    return {
      subject,
      color: first.subjectColor,
      bg: first.subjectBg,
      tasks: groupTasks,
    }
  })
}

function task(id: number, subject: string, color = '#6F5AE8', bg = '#EDE9FB'): MiniTask {
  return { id, subject, subjectColor: color, subjectBg: bg }
}

// ── 1 & 7. same subject -> one block; no task duplicated or lost ───────────

describe('1 & 7. tasks from the same subject land in exactly one block, with none duplicated or lost', () => {
  it('three same-subject tasks all land in the single "Ajalugu" group', () => {
    const visible = [
      task(1, 'Ajalugu'),
      task(2, 'Ajalugu'),
      task(3, 'Ajalugu'),
    ]
    const groups = groupBySubject(visible)
    expect(groups).toHaveLength(1)
    expect(groups[0].subject).toBe('Ajalugu')
    expect(groups[0].tasks.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('every input task appears in exactly one output group, across mixed subjects', () => {
    const visible = [
      task(1, 'Ajalugu'),
      task(2, 'Matemaatika'),
      task(3, 'Ajalugu'),
      task(4, 'Eesti keel'),
      task(5, 'Matemaatika'),
    ]
    const groups = groupBySubject(visible)
    const allGroupedIds = groups.flatMap((g) => g.tasks.map((t) => t.id)).sort()
    expect(allGroupedIds).toEqual([1, 2, 3, 4, 5])
    // no id appears twice across groups
    expect(new Set(allGroupedIds).size).toBe(allGroupedIds.length)
  })
})

// ── 2. different subjects -> separate blocks ────────────────────────────────

describe('2. different subjects render as separate blocks', () => {
  it('three distinct subjects produce three distinct groups', () => {
    const visible = [
      task(1, 'Ajalugu'),
      task(2, 'Eesti keel'),
      task(3, 'Matemaatika'),
    ]
    const groups = groupBySubject(visible)
    expect(groups.map((g) => g.subject)).toEqual(['Ajalugu', 'Eesti keel', 'Matemaatika'])
  })
})

// ── 5. empty subject groups are never rendered ──────────────────────────────

describe('5. empty subject groups are never produced', () => {
  it('an empty visible list produces zero groups', () => {
    expect(groupBySubject([])).toEqual([])
  })

  it('every produced group has at least one task (by construction, groups are only built from subjects present in `visible`)', () => {
    const visible = [task(1, 'Ajalugu'), task(2, 'Matemaatika')]
    const groups = groupBySubject(visible)
    for (const g of groups) {
      expect(g.tasks.length).toBeGreaterThan(0)
    }
  })
})

// ── 4. existing subject colors are reused for the block accent ─────────────

describe('4. the block accent reuses the group\'s existing subject color/bg (no new color system)', () => {
  it('the group\'s color/bg come from its tasks\' existing subjectColor/subjectBg', () => {
    const visible = [
      task(1, 'Ajalugu', '#DC2626', '#FEE2E2'),
      task(2, 'Ajalugu', '#DC2626', '#FEE2E2'),
    ]
    const [group] = groupBySubject(visible)
    expect(group.color).toBe('#DC2626')
    expect(group.bg).toBe('#FEE2E2')
  })
})

// ── Ordering: within-group order preserved; groups ordered alphabetically ──

describe('within-group task order is preserved from the (already deadline-sorted) visible list', () => {
  it('does not reorder tasks within a subject group', () => {
    const visible = [
      task(3, 'Matemaatika'),
      task(1, 'Matemaatika'),
      task(2, 'Matemaatika'),
    ]
    const [group] = groupBySubject(visible)
    expect(group.tasks.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('subject groups are ordered alphabetically, matching the example in the requirements (Ajalugu, Eesti keel, Matemaatika)', () => {
    const visible = [
      task(1, 'Matemaatika'),
      task(2, 'Ajalugu'),
      task(3, 'Eesti keel'),
    ]
    const groups = groupBySubject(visible)
    expect(groups.map((g) => g.subject)).toEqual(['Ajalugu', 'Eesti keel', 'Matemaatika'])
  })
})

// ── Structural: the real source implements this exact algorithm ────────────

describe('SchoolPage.tsx TasksTab implements this exact grouping (structural)', () => {
  it('derives distinct subjects from `visible`, sorted with localeCompare(..., "et")', () => {
    const src = tasksTabSource()
    expect(src).toMatch(
      /Array\.from\(\s*\n?\s*new Set\(visible\.map\(\(t\) => t\.subject\)\),?\s*\n?\s*\)\.sort\(\(a, b\) => a\.localeCompare\(b, "et"\)\)/,
    )
  })

  it('builds each group by filtering `visible` for that subject (never a separate/duplicated list)', () => {
    const src = tasksTabSource()
    expect(src).toMatch(/visible\.filter\(\(t\) => t\.subject === subject\)/)
  })

  it('takes the group accent color/bg from the group\'s own first task (existing subjectColor/subjectBg, not a new field)', () => {
    const src = tasksTabSource()
    expect(src).toMatch(/color:\s*first\.subjectColor/)
    expect(src).toMatch(/bg:\s*first\.subjectBg/)
  })
})

// ── 3. subject headings are shown ───────────────────────────────────────────

describe('3. each subject block renders a visible heading with the subject name', () => {
  it('renders group.subject inside a heading element', () => {
    const src = tasksTabSource()
    expect(src).toMatch(/<h4[\s\S]*?\{group\.subject\}[\s\S]*?<\/h4>/)
  })

  it('the heading is styled with the group\'s color (visual accent)', () => {
    const src = tasksTabSource()
    const headingBlock = src.match(/<h4[\s\S]*?<\/h4>/)?.[0] ?? ''
    expect(headingBlock).toMatch(/color:\s*group\.color/)
  })
})

// ── Not folders/accordions/collapsed sections ───────────────────────────────

describe('subject blocks are always directly visible — not folders, accordions, or collapsed sections', () => {
  it('the grouped rendering block has no collapse/expand state or <details> element', () => {
    const src = tasksTabSource()
    const groupedBlock = src.match(/\{groupedVisible\.map\(\(group\) => \([\s\S]*?\n {8}\)\)\}/)?.[0] ?? ''
    expect(groupedBlock).not.toMatch(/<details/)
    expect(groupedBlock).not.toMatch(/collapsed/i)
    expect(groupedBlock).not.toMatch(/isOpen/i)
    expect(groupedBlock).not.toMatch(/max-height/i)
  })
})

// ── 6. existing task controls/actions remain present inside each block ─────

describe('6. existing task-row controls and actions are preserved inside each subject block', () => {
  const src = tasksTabSource()

  it('edit, mark done/undone, and delete actions are still wired', () => {
    expect(src).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*setOpenMenuId\(null\);\s*\n\s*onEdit\(task\);/)
    expect(src).toMatch(/onMarkUndone\(task\.id\)/)
    expect(src).toMatch(/onMarkDone\(task\.id\)/)
    expect(src).toMatch(/setConfirmDeleteId\(task\.id\)/)
    expect(src).toMatch(/onDelete\(task\.id\)/)
  })

  it('the Moodle/external-link button and progress ring are still rendered per task', () => {
    expect(src).toMatch(/task\.moodleUrl/)
    expect(src).toMatch(/<ProgressRing pct=\{task\.progress\} color=\{task\.subjectColor\} \/>/)
  })

  it('the three-dot row menu and delete confirmation dialog are still present', () => {
    expect(src).toMatch(/<MoreHorizontal size=\{16\} \/>/)
    expect(src).toMatch(/confirmDeleteId === task\.id/)
  })
})

// ── 8. ET/EN task content continues to render normally ─────────────────────

describe('8. ET/EN localized task content still renders inside the grouped rows', () => {
  const src = tasksTabSource()

  it('the task type label is still localized via getTaskTypeLabel(task.type, lang)', () => {
    expect(src).toMatch(/\{getTaskTypeLabel\(task\.type, lang\)\}/)
  })

  it('row actions still go through tr(..., lang) rather than hardcoded strings', () => {
    expect(src).toMatch(/tr\("school\.action\.edit", lang\)/)
    expect(src).toMatch(/tr\("school\.action\.markDone", lang\)/)
    expect(src).toMatch(/tr\("school\.action\.markUndone", lang\)/)
    expect(src).toMatch(/tr\("school\.action\.delete", lang\)/)
  })

  it('the new subject heading renders the subject\'s own name (language-neutral, same as the existing subject label elsewhere in the row)', () => {
    expect(src).toMatch(/\{group\.subject\}/)
    expect(src).toMatch(/\{task\.subject\}/)
  })
})
