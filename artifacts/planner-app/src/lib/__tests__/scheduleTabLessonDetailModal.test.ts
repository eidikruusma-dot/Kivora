/**
 * School UX improvement — learning-block cards in ScheduleTab become
 * clickable, opening a small read-only LessonDetailModal for that specific
 * ScheduleLesson: subject/activity, start/end date (or day/times for
 * traditional lessons), room and teacher when present, and Hindamine/
 * Assessment when present with multiline formatting preserved.
 *
 * Reuses the existing ScheduleLesson data exactly as-is (including
 * `assessment?: string` added the previous round) — no new entity, no new
 * persistence, no changes to creation, timetable modes, or unrelated School
 * code. The detail modal's Edit action hands off to the already-existing
 * LessonModal edit flow (openEdit), never a new edit surface.
 *
 * Every existing action icon (quick-add-assignment, pencil/Edit,
 * trash/Delete, and the delete-confirmation Cancel/Delete buttons) now
 * needs to stop propagation, since the whole card became clickable — this
 * file specifically checks that fix for every one of them, since a missed
 * stopPropagation is the single most likely regression from this change.
 *
 * No React rendering harness is available in this repo for ScheduleTab.tsx
 * (see scheduleTabInlineSubjectCreate.test.ts for the established
 * precedent), so this is proven structurally against the source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabLessonDetailModal.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)

function lessonDetailModalSource(): string {
  const match = SCHEDULE_TAB_SRC.match(/function LessonDetailModal\(\{[\s\S]*?\n\}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

function cardBlockSource(): string {
  // The lessons.map(...) card render, from its opening `return (` through
  // the closing of that one card's JSX.
  const match = SCHEDULE_TAB_SRC.match(/\{lessons\.map\(\(lesson\) => \{[\s\S]*?\n\s*\)\s*\n\s*\}\)\}/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── 1. card click -> detail ──────────────────────────────────────────────

describe('1. clicking a learning-block card opens the detail modal for that specific lesson', () => {
  it('the card div has an onClick that sets selectedLesson to this exact lesson', () => {
    const card = cardBlockSource()
    expect(card).toMatch(/onClick=\{\(\) => setSelectedLesson\(lesson\)\}/)
    expect(card).toMatch(/className="rounded-xl border border-\[#ECECF2\] p-3\.5 cursor-pointer"/)
  })

  it('selectedLesson drives a conditionally-rendered LessonDetailModal', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/\{selectedLesson && \(/)
    const renderBlock = SCHEDULE_TAB_SRC.match(/\{selectedLesson && \([\s\S]*?\n {6}\)\}/)?.[0] ?? ''
    expect(renderBlock).toMatch(/<LessonDetailModal/)
    expect(renderBlock).toMatch(/lesson=\{selectedLesson\}/)
  })
})

// ── Data reuse: no new entity, existing ScheduleLesson fields only ─────────

describe('the detail modal reuses the existing ScheduleLesson data exactly — no new entity/field', () => {
  const src = lessonDetailModalSource()

  it('reads only existing lesson fields (subject/day/startDate/endDate/date/startTime/endTime/room/teacher/assessment)', () => {
    for (const field of ['subject', 'day', 'startDate', 'endDate', 'date', 'startTime', 'endTime', 'room', 'teacher', 'assessment']) {
      expect(src).toMatch(new RegExp(`lesson\\.${field}\\b`))
    }
  })

  it('takes a plain `lesson: ScheduleLesson` prop, not a new type', () => {
    expect(src).toMatch(/lesson: ScheduleLesson/)
  })
})

// ── 2. assessment display + 3. multiline preserved ─────────────────────────

describe('2 & 3. Hindamine/Assessment displays with multiline formatting preserved, only when present', () => {
  const src = lessonDetailModalSource()

  it('assessment is guarded by lesson.assessment (not shown as an empty section when absent)', () => {
    expect(src).toMatch(/\{lesson\.assessment && \(/)
  })

  it('assessment text renders with whitespace-pre-wrap', () => {
    const block = src.match(/\{lesson\.assessment && \([\s\S]*?<\/div>\s*\n\s*\)\}/)?.[0] ?? ''
    expect(block).toMatch(/whitespace-pre-wrap[^"]*"\s*>\{lesson\.assessment\}/)
  })

  it('uses the existing sched.field.assessment label (no new/duplicated label key)', () => {
    const block = src.match(/\{lesson\.assessment && \([\s\S]*?<\/div>\s*\n\s*\)\}/)?.[0] ?? ''
    expect(block).toMatch(/t\('sched\.field\.assessment', lang\)/)
  })
})

// ── Empty optional fields never render as empty sections ───────────────────

describe('empty optional fields (room, teacher, times, dates, assessment) never render as empty sections', () => {
  const src = lessonDetailModalSource()

  it('room, teacher, startTime/endTime, day, and dates are each guarded by their own presence check', () => {
    expect(src).toMatch(/\{lesson\.room && \(/)
    expect(src).toMatch(/\{lesson\.teacher && \(/)
    expect(src).toMatch(/\{lesson\.startTime && \(/)
    expect(src).toMatch(/\{lesson\.day && \(/)
    expect(src).toMatch(/\{\(lesson\.startDate \|\| lesson\.date\) && \(/)
  })

  it('endTime inside the time block is independently guarded (a lesson can have a start time with no end time)', () => {
    const timeBlock = src.match(/\{lesson\.startTime && \([\s\S]*?\n {10}\)\}/)?.[0] ?? ''
    expect(timeBlock).toMatch(/\{lesson\.endTime && \(/)
  })

  it('subject is the only field always shown (no presence guard)', () => {
    const subjectBlock = src.match(/<div>\s*\n\s*<p[^>]*>\s*\n\s*\{t\('sched\.field\.subject', lang\)\}/)?.[0] ?? ''
    expect(subjectBlock).not.toMatch(/lesson\.subject &&/)
  })
})

// ── 4. Edit handoff to the existing edit flow ───────────────────────────────

describe('4. the detail modal\'s Edit action hands off to the existing LessonModal edit flow, not a new one', () => {
  it('LessonDetailModal\'s Edit button calls the onEdit prop', () => {
    const src = lessonDetailModalSource()
    expect(src).toMatch(/onClick=\{onEdit\}[\s\S]*?\{t\('school\.action\.edit', lang\)\}/)
  })

  it('the call site\'s onEdit closes the detail modal and calls the existing openEdit(selectedLesson)', () => {
    const renderBlock = SCHEDULE_TAB_SRC.match(/\{selectedLesson && \([\s\S]*?\n {6}\)\}/)?.[0] ?? ''
    expect(renderBlock).toMatch(/onEdit=\{\(\) => \{\s*\n\s*setSelectedLesson\(null\)\s*\n\s*openEdit\(selectedLesson\)\s*\n\s*\}\}/)
  })

  it('no second/parallel edit modal or entity was introduced — openEdit and LessonModal are unchanged', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/const openEdit = \(lesson: ScheduleLesson\) => \{/)
    const defCount = (SCHEDULE_TAB_SRC.match(/function LessonModal\(\{/g) ?? []).length
    expect(defCount).toBe(1)
  })
})

// ── 5. action buttons must not also trigger the card click ─────────────────

describe('5. every existing action icon stops propagation so it never also opens the card detail modal', () => {
  const card = cardBlockSource()

  it('the quick-add-assignment button stops propagation before its own action', () => {
    const block = card.match(/onQuickAddAssignment && \([\s\S]*?<\/button>\s*\n\s*\)\}/)?.[0] ?? ''
    expect(block).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); onQuickAddAssignment\(lesson\.subject\) \}\}/)
  })

  it('the Edit (pencil) button stops propagation before calling openEdit', () => {
    expect(card).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); openEdit\(lesson\) \}\}/)
  })

  it('the Delete (trash) button stops propagation before opening the delete confirmation', () => {
    expect(card).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); setConfirmDeleteId\(lesson\.id\) \}\}/)
  })

  it('the delete-confirmation row (Cancel/Delete) stops propagation at its container, so neither button can bubble to the card', () => {
    const confirmBlock = card.match(/\{isConfirming && \([\s\S]*?\n {20}\)\}/)?.[0] ?? ''
    expect(confirmBlock).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/)
  })

  it('the card itself keeps exactly one onClick (setSelectedLesson) — action buttons are nested and independently stop propagation, not a second competing card-level handler', () => {
    const cardOnClicks = card.match(/<div\s+key=\{lesson\.id\}[\s\S]*?onClick=\{\(\) => setSelectedLesson\(lesson\)\}/)
    expect(cardOnClicks).not.toBeNull()
  })
})

// ── Unrelated behavior untouched ────────────────────────────────────────────

describe('creation, timetable modes, and unrelated School code are untouched', () => {
  it('openAdd (creation) is unchanged and does not reference selectedLesson', () => {
    const openAddBlock = SCHEDULE_TAB_SRC.match(/const openAdd = \(\) => \{[\s\S]*?\n {2}\}/)?.[0] ?? ''
    expect(openAddBlock).not.toMatch(/selectedLesson/)
  })

  it('handleSave/handleDelete (the existing add/edit/delete flow) are unchanged by this addition', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/const handleSave = async \(lesson: ScheduleLesson\) => \{/)
    expect(SCHEDULE_TAB_SRC).toMatch(/const handleDelete = \(id: string\) => \{/)
  })
})
