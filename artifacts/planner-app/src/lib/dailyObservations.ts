/**
 * dailyObservations.ts
 *
 * Pure, deterministic, AI-free analysis of the user's real Tasks, Calendar,
 * School, Plans and Goals data, producing one structured "today" picture —
 * the data layer for the smarter "Minu päev" / KivoraAICard summary
 * (dashboardSummary.ts turns this into prose). Intentionally a separate,
 * typed result object (not natural-language text) so the exact same
 * computation can later be reused by automatic organizing, notifications,
 * or AI-assistant suggestions without re-deriving any of this logic.
 *
 * Hard rules this file is built around (do not relax these without
 * re-reading the comments below — each one fixes a real, verified risk):
 *
 * 1. NO DOUBLE-COUNTING. A Task/School item that already has its own
 *    auto-created Calendar event (automaticLinking.ts's `cal-auto-`
 *    mirror, found via findOwnedCalendarEventId()) is counted ONCE, via
 *    the Task/School item itself — its mirror calendar event is excluded
 *    from the "today's calendar entries" count/list and from
 *    conflict-checking against itself. Likewise, a Plan or Goal is
 *    represented on the calendar surface ONLY via its derived entry
 *    (planGoalCalendarEvents.ts's getDerivedCalendarEvents — these are
 *    never persisted/linked, so there's nothing to deduplicate there
 *    except not also listing the Plan/Goal a second time as a separate
 *    non-calendar item for the same date).
 * 2. NO INVENTED DURATIONS. Nothing in this file computes or returns a
 *    number of hours/minutes "busy" — there is no duration field on Task
 *    anywhere in this codebase (verified). Workload is a plain COUNT of
 *    today's commitments, nothing more; conflict-checking only ever
 *    compares entries that already carry a REAL stored startTime/endTime
 *    (never a guessed duration for a bare task `time`).
 * 3. NO ASSUMED DATE FORMATS. Every date is validated against ISO_DATE
 *    before being used in date arithmetic or sorting. Goal.deadline in
 *    particular is a display string for legacy goals and only sometimes a
 *    real ISO date (the same validity convention planGoalCalendarEvents.ts
 *    already established for it) — an invalid value is skipped, never
 *    guessed at or allowed to throw.
 * 4. NO MISLEADING EMPTY STATES. `hasAnyData` distinguishes "nothing
 *    exists at all today" from "everything today is already done" from
 *    "something needs attention" — three different, non-interchangeable
 *    messages (handled by the caller/dashboardSummary.ts), never a
 *    congratulatory message when there was simply nothing to begin with.
 */

import type { Task } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Plan } from '@/lib/plansStore'
import type { Goal } from '@/data/goalsData'
import { encodeSchoolId } from '@/types/entityLinks'
import { findOwnedCalendarEventId } from '@/lib/automaticLinking'
import { getDerivedCalendarEvents } from '@/lib/planGoalCalendarEvents'
import { localTodayStr, localDateStrWithOffset } from '@/lib/tasksSummary'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Minimal structural shapes — SchoolTask/SchoolExam are not exported from
// schoolStore.tsx; these list only the fields actually read here, and the
// real store arrays satisfy them structurally.
export interface SchoolTaskLike {
  id: number
  title: string
  deadline: string
  progress: number
}
export interface SchoolExamLike {
  id: number
  title: string
  date: string
  status: 'ootel' | 'tehtud'
}

export interface DailyObservationsInput {
  tasks: Task[]
  events: MockCalendarEvent[]
  schoolTasks: SchoolTaskLike[]
  schoolExams: SchoolExamLike[]
  plans: Plan[]
  goals: Goal[]
  /** Injectable for tests; defaults to `new Date()`. */
  now?: Date
  /** How many days ahead counts as "dueSoon". Defaults to 7. */
  upcomingWindowDays?: number
}

export type UpcomingItemType = 'task' | 'school' | 'plan' | 'goal'

export interface UpcomingItem {
  type: UpcomingItemType
  id: string
  title: string
  /** Always a validated YYYY-MM-DD string. */
  date: string
  daysUntil: number
}

export interface ConflictEntry {
  id: string
  title: string
  startTime: string
  endTime: string
}

export interface ConflictPair {
  a: ConflictEntry
  b: ConflictEntry
}

export interface DailyOverview {
  todayStr: string
  /** True if there is anything at all today, overdue, or due soon — lets the caller avoid a congratulatory message over genuinely empty data. */
  hasAnyData: boolean

  overdueTasks: Task[]
  overdueSchoolTasks: SchoolTaskLike[]
  overdueSchoolExams: SchoolExamLike[]
  overdueCount: number

  /** Deduplicated counts — see rule 1 above. */
  todayTaskCount: number
  todaySchoolCount: number
  todayCalendarCount: number
  /** Plain sum of the three counts above. A count, never a duration — see rule 2. */
  todayTotalCount: number
  /**
   * How many of today's items are NOT yet done (tasks not completed,
   * school items not at progress 100 / status 'tehtud'; calendar entries
   * have no completion concept of their own, so each one always counts
   * here). Lets the caller distinguish "nothing was ever planned today"
   * from "everything planned today is already done" — see rule 4.
   */
  todayActiveCount: number

  /** Sorted ascending by date, within the upcoming window, excluding today/overdue. */
  upcoming: UpcomingItem[]

  /** Pairs of today's timed calendar-surface entries whose time ranges overlap. */
  conflicts: ConflictPair[]
}

function timeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** The same "what's on the calendar" merge CalendarPage.tsx already uses — real stored events plus Plan/Goal-derived ones (never persisted, never duplicated by construction). */
function buildCalendarSurface(events: MockCalendarEvent[], plans: Plan[], goals: Goal[]): MockCalendarEvent[] {
  return [...events, ...getDerivedCalendarEvents(plans, goals)]
}

export function computeDailyOverview(input: DailyObservationsInput): DailyOverview {
  const now = input.now ?? new Date()
  const todayStr = localTodayStr(now)
  const windowEnd = localDateStrWithOffset(input.upcomingWindowDays ?? 7, now)

  // ── Rule 1: which calendar events are just a mirror of a task/school item ──
  const ownedEventIds = new Set<string>()
  for (const task of input.tasks) {
    const ownedId = findOwnedCalendarEventId('task', task.id)
    if (ownedId) ownedEventIds.add(ownedId)
  }
  for (const st of input.schoolTasks) {
    const ownedId = findOwnedCalendarEventId('school', encodeSchoolId('task', st.id))
    if (ownedId) ownedEventIds.add(ownedId)
  }
  for (const se of input.schoolExams) {
    const ownedId = findOwnedCalendarEventId('school', encodeSchoolId('exam', se.id))
    if (ownedId) ownedEventIds.add(ownedId)
  }

  const calendarSurface = buildCalendarSurface(input.events, input.plans, input.goals)
  const dedupedTodayCalendar = calendarSurface.filter(
    (e) => e.date === todayStr && !ownedEventIds.has(e.id),
  )

  // ── Overdue ──────────────────────────────────────────────────────────────
  const overdueTasks = input.tasks.filter(
    (t) => !t.completed && !!t.date && ISO_DATE.test(t.date) && t.date < todayStr,
  )
  const overdueSchoolTasks = input.schoolTasks.filter(
    (t) => t.progress < 100 && ISO_DATE.test(t.deadline) && t.deadline < todayStr,
  )
  const overdueSchoolExams = input.schoolExams.filter(
    (e) => e.status !== 'tehtud' && ISO_DATE.test(e.date) && e.date < todayStr,
  )
  const overdueCount = overdueTasks.length + overdueSchoolTasks.length + overdueSchoolExams.length

  // ── Today (deduplicated counts — rule 1) ────────────────────────────────
  const todayTasks = input.tasks.filter((t) => t.date === todayStr)
  const todaySchoolTasks = input.schoolTasks.filter((t) => t.deadline === todayStr)
  const todaySchoolExams = input.schoolExams.filter((e) => e.date === todayStr)

  const todayTaskCount = todayTasks.length
  const todaySchoolCount = todaySchoolTasks.length + todaySchoolExams.length
  const todayCalendarCount = dedupedTodayCalendar.length
  const todayTotalCount = todayTaskCount + todaySchoolCount + todayCalendarCount

  const todayActiveCount =
    todayTasks.filter((t) => !t.completed).length +
    todaySchoolTasks.filter((t) => t.progress < 100).length +
    todaySchoolExams.filter((e) => e.status !== 'tehtud').length +
    todayCalendarCount

  // ── Upcoming (strictly after today, within the window) — rule 3 ────────
  const upcoming: UpcomingItem[] = []

  for (const t of input.tasks) {
    if (t.completed || !t.date || !ISO_DATE.test(t.date)) continue
    if (t.date <= todayStr || t.date > windowEnd) continue
    upcoming.push({ type: 'task', id: t.id, title: t.title, date: t.date, daysUntil: daysBetween(todayStr, t.date) })
  }
  for (const st of input.schoolTasks) {
    if (st.progress >= 100 || !ISO_DATE.test(st.deadline)) continue
    if (st.deadline <= todayStr || st.deadline > windowEnd) continue
    upcoming.push({ type: 'school', id: encodeSchoolId('task', st.id), title: st.title, date: st.deadline, daysUntil: daysBetween(todayStr, st.deadline) })
  }
  for (const se of input.schoolExams) {
    if (se.status === 'tehtud' || !ISO_DATE.test(se.date)) continue
    if (se.date <= todayStr || se.date > windowEnd) continue
    upcoming.push({ type: 'school', id: encodeSchoolId('exam', se.id), title: se.title, date: se.date, daysUntil: daysBetween(todayStr, se.date) })
  }
  for (const p of input.plans) {
    const date = p.startDate
    if (!date || !ISO_DATE.test(date)) continue
    if (date <= todayStr || date > windowEnd) continue
    upcoming.push({ type: 'plan', id: p.id, title: p.title, date, daysUntil: daysBetween(todayStr, date) })
  }
  for (const g of input.goals) {
    if (g.status === 'completed' || g.status === 'expired') continue
    // Goal.deadline is a display string for legacy goals and only
    // sometimes a real ISO date — same validity check
    // planGoalCalendarEvents.ts's goalToCalendarEvent already uses; an
    // invalid value is skipped, never guessed at.
    if (!ISO_DATE.test(g.deadline)) continue
    if (g.deadline <= todayStr || g.deadline > windowEnd) continue
    upcoming.push({ type: 'goal', id: g.id, title: g.title, date: g.deadline, daysUntil: daysBetween(todayStr, g.deadline) })
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date))

  // ── Conflicts — only ever between entries with a REAL stored time range (rule 2) ──
  const timedToday = dedupedTodayCalendar.filter(
    (e) => !e.allDay && e.startTime && e.endTime,
  )
  const conflicts: ConflictPair[] = []
  for (let i = 0; i < timedToday.length; i++) {
    for (let j = i + 1; j < timedToday.length; j++) {
      const a = timedToday[i]
      const b = timedToday[j]
      const aStart = timeToMinutes(a.startTime)
      const aEnd = timeToMinutes(a.endTime)
      const bStart = timeToMinutes(b.startTime)
      const bEnd = timeToMinutes(b.endTime)
      if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue
      if (rangesOverlap(aStart, aEnd, bStart, bEnd)) {
        conflicts.push({
          a: { id: a.id, title: a.title, startTime: a.startTime, endTime: a.endTime },
          b: { id: b.id, title: b.title, startTime: b.startTime, endTime: b.endTime },
        })
      }
    }
  }

  const hasAnyData =
    overdueCount > 0 || todayTotalCount > 0 || upcoming.length > 0

  return {
    todayStr,
    hasAnyData,
    overdueTasks,
    overdueSchoolTasks,
    overdueSchoolExams,
    overdueCount,
    todayTaskCount,
    todaySchoolCount,
    todayActiveCount,
    todayCalendarCount,
    todayTotalCount,
    upcoming,
    conflicts,
  }
}

function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number)
  const [ty, tm, td] = toStr.split('-').map(Number)
  const from = new Date(fy, fm - 1, fd)
  const to = new Date(ty, tm - 1, td)
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}
