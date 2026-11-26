import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

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
