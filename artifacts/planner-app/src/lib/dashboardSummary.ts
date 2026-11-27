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
    const prefix = t('dash.ai.summary.todayActivePrefix', lang)
    clauses.push(`${prefix} ${countNoun(overview.todayActiveCount, lang, 'tegevus', 'tegevust', 'thing to do', 'things to do')}.`)
  } else if (overview.todayTotalCount > 0) {
    // Something existed for today and all of it is already done — a real,
    // earned "all done", never shown when there was simply nothing at all
    // (see the empty-data branch below).
    clauses.push(t('dash.ai.summary.allDone', lang))
  } else if (overview.upcoming.length > 0) {
    // Nothing at all today, but something real is coming — never phrased
    // as "all done" (nothing was ever here to finish) and never silent
    // about what's ahead.
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
