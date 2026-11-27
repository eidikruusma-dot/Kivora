import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import type { DailyOverview } from '@/lib/dailyObservations'

/**
 * Rule-based ("Tänane ülevaade" / "Today's overview") summary for the
 * Kivora AI card — computed entirely from the user's own real data
 * (tasksStore/calendarStore, same numbers DashboardStatCards already
 * shows), with NO AI/model call involved. This is deliberately a plain
 * deterministic function, not a wrapper around fetchAIReply(): it must
 * never be presented as an AI-generated recommendation (see
 * KivoraAICard.tsx's separate, explicitly-labelled on-demand
 * "Küsi AI soovitust" result for the one place a real model call happens).
 */
export interface DashboardSummaryInput {
  tasksTotal: number
  tasksCompleted: number
  eventsToday: number
}

function countNoun(
  count: number,
  lang: AppLang,
  singularEt: string,
  pluralEt: string,
  singularEn: string,
  pluralEn: string,
): string {
  if (lang === 'en') return `${count} ${count === 1 ? singularEn : pluralEn}`
  return `${count} ${count === 1 ? singularEt : pluralEt}`
}

function eventsNote(count: number, lang: AppLang): string {
  const prefix = t('dash.ai.summary.eventsPrefix', lang)
  return `${prefix} ${countNoun(count, lang, 'sündmus', 'sündmust', 'event', 'events')}.`
}

/** "N varasem(at) ülesanne/ülesannet on lõpetatud." / "N earlier task(s) is/are done." — see computeSmartDailySummary's state 2. */
function pastCompletedNote(count: number, lang: AppLang): string {
  const noun = countNoun(count, lang, 'varasem ülesanne', 'varasemat ülesannet', 'earlier task', 'earlier tasks')
  return lang === 'en' ? `${noun} ${count === 1 ? 'is' : 'are'} done.` : `${noun} on lõpetatud.`
}

export function computeDashboardSummary(input: DashboardSummaryInput, lang: AppLang): string {
  const { tasksTotal, tasksCompleted, eventsToday } = input
  const tasksRemaining = Math.max(tasksTotal - tasksCompleted, 0)

  // Nothing planned at all today — calm, open-day message.
  if (tasksTotal === 0 && eventsToday === 0) {
    return t('dash.ai.summary.openDay', lang)
  }

  // Every scheduled task for today is already done.
  if (tasksTotal > 0 && tasksRemaining === 0) {
    const base = t('dash.ai.summary.allDone', lang)
    return eventsToday > 0 ? `${base} ${eventsNote(eventsToday, lang)}` : base
  }

  // Tasks remain today — the main, most common case.
  const taskNote = tasksRemaining > 0
    ? `${t('dash.ai.summary.tasksRemainingPrefix', lang)} ${countNoun(tasksRemaining, lang, 'ülesanne', 'ülesannet', 'task', 'tasks')}.`
    : ''
  const eventNote = eventsToday > 0 ? eventsNote(eventsToday, lang) : ''

  return [taskNote, eventNote].filter(Boolean).join(' ') || t('dash.ai.summary.openDay', lang)
}

/**
 * The smarter "Minu päev" summary — composed from a DailyOverview
 * (dailyObservations.ts), itself computed purely from the user's real
 * Tasks/Calendar/School/Plans/Goals data. Still 100% rule-based, free, and
 * local — exactly the same philosophy as computeDashboardSummary() above
 * (which is kept, unmodified, for backward compatibility), just fed a
 * richer, deduplicated input.
 *
 * Priority order mirrors what actually needs attention first: overdue,
 * then today's time conflicts, then what's still open today / already
 * done, then what's coming up soon. Every count is exactly that — a count
 * of items — never a fabricated duration or "workload" figure, since no
 * duration data exists anywhere in this codebase (see dailyObservations.ts's
 * module doc comment).
 */
export function computeSmartDailySummary(overview: DailyOverview, lang: AppLang): string {
  const clauses: string[] = []

  if (overview.overdueCount > 0) {
    const prefix = t('dash.ai.summary.overduePrefix', lang)
    clauses.push(`${prefix} ${countNoun(overview.overdueCount, lang, 'tähtaja ületanud tegevus', 'tähtaja ületanud tegevust', 'overdue item', 'overdue items')}.`)
  }

  if (overview.conflicts.length > 0) {
    const prefix = t('dash.ai.summary.conflictPrefix', lang)
    clauses.push(`${prefix} ${countNoun(overview.conflicts.length, lang, 'ajakonflikt', 'ajakonflikti', 'time conflict', 'time conflicts')}.`)
  }

  if (overview.todayActiveCount > 0) {
    // State 4: today has its own not-yet-done items.
    const prefix = t('dash.ai.summary.todayActivePrefix', lang)
    clauses.push(`${prefix} ${countNoun(overview.todayActiveCount, lang, 'tegevus', 'tegevust', 'thing to do', 'things to do')}.`)
  } else if (overview.todayTotalCount > 0) {
    // State 3: today had its own items and every one of them is done — a
    // real, earned "all done for TODAY specifically". This is deliberately
    // its own, more explicit message (dash.ai.summary.allDoneToday) rather
    // than reusing computeDashboardSummary()'s plain "allDone" key, so it
    // can never be confused with state 2 below: a task due YESTERDAY that
    // gets completed today must never produce this message — it has
    // nothing to do with today's own (empty) set of items.
    clauses.push(t('dash.ai.summary.allDoneToday', lang))
  } else if (overview.pastCompletedCount > 0) {
    // State 2: nothing is due today at all, but something — dated earlier
    // or undated — was completed. Never phrased as "today is done" (today
    // never had anything to begin with) and never silently dropped either.
    clauses.push(t('dash.ai.summary.todayEmptyPastDonePrefix', lang))
    clauses.push(pastCompletedNote(overview.pastCompletedCount, lang))
  } else if (overview.upcoming.length > 0) {
    // State 1b: nothing today, nothing completed before either, but
    // something real is coming — never phrased as "all done" (nothing was
    // ever here to finish) and never silent about what's ahead.
    clauses.push(t('dash.ai.summary.nothingTodayButSoon', lang))
  }

  if (overview.upcoming.length > 0) {
    const prefix = t('dash.ai.summary.dueSoonPrefix', lang)
    clauses.push(`${prefix} ${countNoun(overview.upcoming.length, lang, 'tähtaeg', 'tähtaega', 'deadline', 'deadlines')}.`)
  }

  if (clauses.length === 0) {
    // Nothing overdue, nothing today, nothing upcoming, nothing done to
    // report either — a genuinely empty day, not a congratulatory message
    // for work that never existed.
    return t('dash.ai.summary.openDay', lang)
  }

  return clauses.join(' ')
}
