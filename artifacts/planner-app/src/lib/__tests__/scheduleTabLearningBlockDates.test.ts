/**
 * Regression tests for the School learning-block form semantics fix.
 *
 * Prior defect: the E-learning / flexible-learning modal asked for an
 * optional weekday, one optional free-text date, and optional start/end
 * times — none of which match how a flexible study block actually works
 * (a date RANGE, not a single anchor date or a recurring weekday/time).
 *
 * This fix:
 *   - Traditional (recurring) timetable mode is untouched: subject, weekday
 *     (required), start/end time, room, teacher.
 *   - Flexible/e-learning mode now uses subject, startDate, endDate (both
 *     required, real `<input type="date">` pickers), room, teacher — no
 *     weekday field, no start/end time fields.
 *   - ScheduleLesson/SchoolLesson/StoredLesson gain startDate?/endDate?,
 *     kept structurally in sync (mirrors the existing three-type pattern).
 *   - filterLessonsForToday ("Today's schedule") now treats a flexible
 *     block as included on every local day from startDate..endDate
 *     inclusive, via plain ISO string comparison (never Date/UTC math).
 *   - formatDateRange (dateUtils.ts) renders a localized ET/EN range,
 *     collapsing to one date when startDate === endDate.
 *   - Old single-`date` flexible records remain readable: LessonModal
 *     initialises startDate/endDate from `lesson.date` when the new fields
 *     aren't present yet.
 *   - LessonModal's save path is now awaited end-to-end (ScheduleTab's
 *     handleSave awaits onAdd/onUpdate before closing the modal; LessonModal
 *     awaits onSave in a try/catch and only clears its error/closes on
 *     success) so a failed write can no longer falsely close the modal or
 *     report success.
 *
 * Pure logic (filterLessonsForToday, formatDateRange) is exercised
 * directly. The form's field visibility, validation wiring, and
 * save/error-handling behavior are proven structurally against the
 * component source, since this repo has no React rendering harness (same
 * precedent as every other ScheduleTab/SchoolPage regression test here).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabLearningBlockDates.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

import { filterLessonsForToday, DAYS_ET, type ScheduleLesson } from '@/components/school/ScheduleTab'
import { formatDateRange } from '@/lib/dateUtils'

function makeLesson(overrides: Partial<ScheduleLesson> = {}): ScheduleLesson {
  return {
    id: `lesson-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Matemaatika',
    dotColor: '#6F5AE8',
    cardBg: '#EDE9FB',
    ...overrides,
  }
}

// ── filterLessonsForToday: inclusive date-range membership ─────────────────

describe('filterLessonsForToday — flexible-block date range (new)', () => {
  const TODAY = '2026-08-26'
  const WEEKDAY = DAYS_ET[2] // Wednesday

  it('includes a multi-day block when today falls inside the range', () => {
    const block = makeLesson({ id: 'in-range', startDate: '2026-08-20', endDate: '2026-08-31' })
    expect(filterLessonsForToday([block], TODAY, WEEKDAY).map((l) => l.id)).toEqual(['in-range'])
  })

  it('includes a block on its first day and its last day (inclusive boundaries)', () => {
    const startBoundary = makeLesson({ id: 'start-boundary', startDate: TODAY, endDate: '2026-09-05' })
    const endBoundary = makeLesson({ id: 'end-boundary', startDate: '2026-08-01', endDate: TODAY })
    const result = filterLessonsForToday([startBoundary, endBoundary], TODAY, WEEKDAY)
    expect(result.map((l) => l.id).sort()).toEqual(['end-boundary', 'start-boundary'])
  })

  it('excludes a block entirely before today and one entirely after today', () => {
    const past = makeLesson({ id: 'past', startDate: '2026-07-01', endDate: '2026-07-15' })
    const future = makeLesson({ id: 'future', startDate: '2026-09-01', endDate: '2026-09-10' })
    expect(filterLessonsForToday([past, future], TODAY, WEEKDAY)).toEqual([])
  })

  it('a same-day block (startDate === endDate) is included exactly on that day, excluded otherwise', () => {
    const sameDayToday = makeLesson({ id: 'today-only', startDate: TODAY, endDate: TODAY })
    const sameDayElsewhere = makeLesson({ id: 'other-day-only', startDate: '2026-08-27', endDate: '2026-08-27' })
    const result = filterLessonsForToday([sameDayToday, sameDayElsewhere], TODAY, WEEKDAY)
    expect(result.map((l) => l.id)).toEqual(['today-only'])
  })

  it('range membership takes precedence over a stale legacy `date` or `day` on the same record', () => {
    // Guards against stale weekday/date fields leaking through if a record
    // somehow retains them alongside the new startDate/endDate.
    const stale = makeLesson({
      id: 'range-wins',
      startDate: TODAY,
      endDate: TODAY,
      date: '2026-01-01',
      day: 'Esmaspäev',
    })
    expect(filterLessonsForToday([stale], TODAY, WEEKDAY).map((l) => l.id)).toEqual(['range-wins'])
  })

  it('traditional recurring (day-only) filtering is unchanged by the range addition', () => {
    const wed = makeLesson({ id: 'wed', day: 'Kolmapäev' })
    const mon = makeLesson({ id: 'mon', day: 'Esmaspäev' })
    expect(filterLessonsForToday([wed, mon], TODAY, WEEKDAY).map((l) => l.id)).toEqual(['wed'])
  })

  it('legacy single-date filtering is unchanged by the range addition', () => {
    const onDate = makeLesson({ id: 'on-date', date: TODAY })
    const otherDate = makeLesson({ id: 'other-date', date: '2026-07-27' })
    expect(filterLessonsForToday([onDate, otherDate], TODAY, WEEKDAY).map((l) => l.id)).toEqual(['on-date'])
  })
})

// ── formatDateRange: localized ET/EN display, no UTC shifting ──────────────

describe('formatDateRange', () => {
  it('collapses a same-day range to a single formatted date (not the same date twice)', () => {
    const et = formatDateRange('2026-08-26', '2026-08-26', 'et')
    expect(et).not.toContain('–')
    expect(et).toContain('26')
    expect(et).toContain('august')
  })

  it('formats a multi-day range as "start – end" in Estonian', () => {
    const et = formatDateRange('2026-08-26', '2026-09-02', 'et')
    expect(et).toContain('26. august 2026')
    expect(et).toContain('2. september 2026')
    expect(et).toContain('–')
  })

  it('formats a multi-day range in English', () => {
    const en = formatDateRange('2026-08-26', '2026-09-02', 'en')
    expect(en).toContain('August')
    expect(en).toContain('September')
    expect(en).toContain('–')
  })

  it('does not use toISOString/UTC slicing — implementation is local-date-string based', () => {
    expect(formatDateRange.toString()).not.toMatch(/toISOString/)
  })

  it('a late-evening local Date at a UTC offset boundary does not shift the reported day', () => {
    // The function parses via `${dateStr}T00:00:00` (local midnight), so an
    // ISO date string always renders as that same calendar day regardless
    // of the machine's timezone — never derived from a UTC-shiftable Date.
    const result = formatDateRange('2026-08-26', '2026-08-26', 'et')
    expect(result).not.toMatch(/25\.\s*august|27\.\s*august/)
  })
})

// ── Structural checks against ScheduleTab.tsx's LessonModal ────────────────

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)

function extractBlock(src: string, startMarker: string): string {
  const idx = src.indexOf(startMarker)
  expect(idx).toBeGreaterThan(-1)
  // Grab a generous slice — enough to cover one JSX conditional block.
  return src.slice(idx, idx + 1200)
}

describe('LessonModal — traditional mode fields unchanged (structural)', () => {
  it('traditional mode still renders a required weekday <select> (day/dayPh), unconditional', () => {
    const block = extractBlock(SCHEDULE_TAB_SRC, '{isTraditional && (\n            <div>')
    expect(block).toMatch(/sched\.field\.day/)
    expect(block).toMatch(/sched\.field\.dayPh/)
    expect(block).toMatch(/DAYS_ET\.map/)
  })

  it('traditional mode still renders unconditional start/end time <input type="time"> fields, not gated by "optional"', () => {
    const block = extractBlock(SCHEDULE_TAB_SRC, '{isTraditional && (\n            <div className="grid grid-cols-2 gap-3">')
    expect(block).toMatch(/type="time"/)
    expect(block).toMatch(/value=\{startTime\}/)
    expect(block).toMatch(/value=\{endTime\}/)
    expect(block).not.toMatch(/optional\}/)
  })

  it('room and teacher fields are rendered for both modes, unconditionally present in the source', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/value=\{room\}/)
    expect(SCHEDULE_TAB_SRC).toMatch(/value=\{teacher\}/)
  })
})

describe('LessonModal — flexible/e-learning mode fields (structural)', () => {
  const elearningBlock = (() => {
    const idx = SCHEDULE_TAB_SRC.indexOf("{!isTraditional && (\n            <div className=\"grid grid-cols-2 gap-3\">")
    expect(idx).toBeGreaterThan(-1)
    return SCHEDULE_TAB_SRC.slice(idx, idx + 1200)
  })()

  it('renders two real <input type="date"> pickers bound to startDate/endDate', () => {
    expect(elearningBlock).toMatch(/type="date"/)
    expect(elearningBlock).toMatch(/value=\{startDate\}/)
    expect(elearningBlock).toMatch(/value=\{endDate\}/)
    // Uses the same Kivora date-picker input pattern as PlanFormModal.tsx
    expect(elearningBlock).toMatch(/border-\[#ECECF2\]/)
  })

  it('startDate and endDate are marked required (red asterisk), not "optional"', () => {
    expect(elearningBlock).toMatch(/sched\.field\.startDate.*<span className="text-red-500">\*<\/span>/s)
    expect(elearningBlock).toMatch(/sched\.field\.endDate.*<span className="text-red-500">\*<\/span>/s)
    expect(elearningBlock).not.toMatch(/optional/)
  })

  it('has no weekday <select> and no start/end time <input type="time"> inside the flexible-mode block', () => {
    expect(elearningBlock).not.toMatch(/DAYS_ET\.map/)
    expect(elearningBlock).not.toMatch(/type="time"/)
    expect(elearningBlock).not.toMatch(/value=\{startTime\}/)
    expect(elearningBlock).not.toMatch(/value=\{endTime\}/)
  })

  it('no free-text date input (old placeholder-based date field) remains anywhere in the file', () => {
    expect(SCHEDULE_TAB_SRC).not.toMatch(/placeholder=\{t\('sched\.field\.datePh'/)
    expect(SCHEDULE_TAB_SRC).not.toMatch(/sched\.field\.dayNone/)
  })

  it('the day <select> that traditional mode uses is not also rendered a second time for flexible mode', () => {
    // Only one occurrence of the weekday select construction in the whole file.
    const dayPhCount = (SCHEDULE_TAB_SRC.match(/sched\.field\.dayPh/g) ?? []).length
    expect(dayPhCount).toBe(1)
  })
})

describe('LessonModal — state initialisation for old single-date records (structural)', () => {
  it('startDate/endDate state fall back to the legacy `lesson.date` field when editing an old flexible block', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/useState\(lesson\?\.startDate \?\? lesson\?\.date \?\? ''\)/)
    expect(SCHEDULE_TAB_SRC).toMatch(/useState\(lesson\?\.endDate \?\? lesson\?\.date \?\? ''\)/)
  })
})

describe('LessonModal — validation (structural)', () => {
  function extractHandleSave(src: string): string {
    const match = src.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}\n\n  return \(/)
    expect(match).not.toBeNull()
    return match![0]
  }

  it('validates subject first, then (flexible mode only) startDate required, endDate required, and endDate >= startDate, in that order', () => {
    const fn = extractHandleSave(SCHEDULE_TAB_SRC)
    const subjectIdx = fn.indexOf("t('sched.field.error.subject'")
    const startDateIdx = fn.indexOf("t('sched.field.error.startDate'")
    const endDateIdx = fn.indexOf("t('sched.field.error.endDate'")
    const rangeIdx = fn.indexOf("t('sched.field.error.dateRange'")
    expect(subjectIdx).toBeGreaterThan(-1)
    expect(startDateIdx).toBeGreaterThan(subjectIdx)
    expect(endDateIdx).toBeGreaterThan(startDateIdx)
    expect(rangeIdx).toBeGreaterThan(endDateIdx)
    expect(fn).toMatch(/if \(endDate < startDate\)/)
  })

  it('date validation only runs in flexible mode (guarded by !isTraditional), never for traditional saves', () => {
    const fn = extractHandleSave(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/if \(!isTraditional\) \{[\s\S]*?if \(!startDate\)/)
  })

  it('a same-day range (endDate === startDate) passes validation — only endDate < startDate is rejected', () => {
    const fn = extractHandleSave(SCHEDULE_TAB_SRC)
    expect(fn).not.toMatch(/endDate <= startDate/)
    expect(fn).not.toMatch(/endDate === startDate/)
  })
})

describe('LessonModal / ScheduleTab — mode-exclusive field clearing on save (structural)', () => {
  function extractHandleSave(src: string): string {
    const match = src.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}\n\n  return \(/)
    expect(match).not.toBeNull()
    return match![0]
  }

  it('a flexible-mode save explicitly clears day/date/startTime/endTime (undefined), not just omits them', () => {
    const fn = extractHandleSave(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/day: isTraditional \? \(day \|\| undefined\) : undefined/)
    expect(fn).toMatch(/date: undefined/)
    expect(fn).toMatch(/startTime: isTraditional \? \(startTime \|\| undefined\) : undefined/)
    expect(fn).toMatch(/endTime: isTraditional \? \(endTime \|\| undefined\) : undefined/)
  })

  it('a traditional-mode save explicitly clears startDate/endDate (undefined)', () => {
    const fn = extractHandleSave(SCHEDULE_TAB_SRC)
    expect(fn).toMatch(/startDate: isTraditional \? undefined : startDate/)
    expect(fn).toMatch(/endDate: isTraditional \? undefined : endDate/)
  })
})

describe('Failed writes do not falsely close the modal or report success (structural)', () => {
  it("ScheduleTab's top-level handleSave (passed as LessonModal's onSave) awaits onAdd/onUpdate before closing the modal", () => {
    const fn = SCHEDULE_TAB_SRC.match(/const handleSave = async \(lesson: ScheduleLesson\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/await onUpdate\(/)
    expect(fn).toMatch(/await onAdd\(/)
    const awaitUpdateIdx = fn.indexOf('await onUpdate(')
    const awaitAddIdx = fn.indexOf('await onAdd(')
    const closeIdx = fn.indexOf('setModalOpen(false)')
    expect(closeIdx).toBeGreaterThan(Math.max(awaitUpdateIdx, awaitAddIdx))
  })

  it("LessonModal's own handleSave awaits onSave inside a try/catch and sets a localized error on failure", () => {
    const fn = SCHEDULE_TAB_SRC.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}\n\n  return \(/)?.[0] ?? ''
    expect(fn).toMatch(/try \{[\s\S]*?await onSave\(/)
    const catchBlock = fn.match(/\} catch \{[\s\S]*?\n    \}/)?.[0] ?? ''
    expect(catchBlock).toMatch(/setError\(/)
  })

  it('LessonModal never calls onClose() itself from inside handleSave — closing only happens via the parent after a successful await', () => {
    const fn = SCHEDULE_TAB_SRC.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}\n\n  return \(/)?.[0] ?? ''
    expect(fn).not.toMatch(/onClose\(\)/)
  })

  it('the Save button is disabled while saving (prevents double-submit / a second write racing a failed one)', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/onClick=\{\(\) => void handleSave\(\)\}\s*\n\s*disabled=\{saving\}/)
  })
})

describe('ScheduleLesson / SchoolLesson / StoredLesson stay structurally in sync (startDate/endDate)', () => {
  const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')

  it('SchoolLesson and StoredLesson both declare startDate?/endDate? alongside the legacy date? field', () => {
    const schoolLessonBlock = SCHOOL_STORE_SRC.match(/export interface SchoolLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedLessonBlock = SCHOOL_STORE_SRC.match(/interface StoredLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    for (const block of [schoolLessonBlock, storedLessonBlock]) {
      expect(block).toMatch(/startDate\?: string/)
      expect(block).toMatch(/endDate\?: string/)
      expect(block).toMatch(/date\?: string/)
    }
  })

  it('ScheduleLesson (ScheduleTab.tsx) also declares startDate?/endDate?', () => {
    const scheduleLessonBlock = SCHEDULE_TAB_SRC.match(/export interface ScheduleLesson \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(scheduleLessonBlock).toMatch(/startDate\?: string/)
    expect(scheduleLessonBlock).toMatch(/endDate\?: string/)
  })

  it('storedToLesson is still an identity pass-through — new fields round-trip without a dedicated conversion branch', () => {
    expect(SCHOOL_STORE_SRC).toMatch(/function storedToLesson\(s: StoredLesson\): SchoolLesson \{[\s\S]*?const \{ kind, \.\.\.rest \} = s[\s\S]*?return rest\n\}/)
  })
})

// ── SchoolPage.tsx "Today's schedule" card range display (structural) ──────

describe('SchoolPage.tsx TodaySchedule card — flexible-block date-range fallback (structural)', () => {
  const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

  it('imports formatDateRange from dateUtils', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/import \{[^}]*formatDateRange[^}]*\} from "@\/lib\/dateUtils"/)
  })

  it('the per-card badge falls back to a formatted startDate–endDate range before the "—" placeholder', () => {
    const badge = SCHOOL_PAGE_SRC.match(/\{lesson\.startTime && lesson\.endTime[\s\S]*?"—"\}/)?.[0] ?? ''
    expect(badge).toMatch(/lesson\.startDate && lesson\.endDate/)
    expect(badge).toMatch(/formatDateRange\(lesson\.startDate, lesson\.endDate, lang\)/)
  })

  it('traditional lessons (which always have startTime+endTime) still display the time range first, unaffected', () => {
    const badge = SCHOOL_PAGE_SRC.match(/\{lesson\.startTime && lesson\.endTime[\s\S]*?"—"\}/)?.[0] ?? ''
    expect(badge.trim().startsWith('{lesson.startTime && lesson.endTime')).toBe(true)
  })
})
