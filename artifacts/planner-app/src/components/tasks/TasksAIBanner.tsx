import { useMemo } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import type { Task } from '@/types'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { computeTaskSuggestion, getMostImportantTask, localTodayStr } from '@/lib/tasksSummary'
import kivoraMascot from '@/assets/dashboard/kivora-ai-mascot.webp'

interface TasksAIBannerProps {
  tasks: Task[]
  lang: AppLang
  /** Opens the edit modal for the single most relevant task (overdue, then
   * today's highest-priority, then today's, then the soonest other active
   * one) — reuses TasksPage's existing openEdit, no new navigation target. */
  onOpenMostImportant: (task: Task) => void
}

/**
 * "Kivora AI soovitab" — the Tasks module's own compact AI banner. Uses the
 * same confirmed mascot image as the "Minu päev" Kivora AI card (never a
 * new/different robot). The suggestion text is a free, local, rule-based
 * computation over the user's real tasks (see tasksSummary.ts) — no AI
 * backend call, consistent with the approved round for this module.
 */
export default function TasksAIBanner({ tasks, lang, onOpenMostImportant }: TasksAIBannerProps) {
  const todayStr = useMemo(() => localTodayStr(), [])
  const suggestion = useMemo(() => computeTaskSuggestion(tasks, lang, todayStr), [tasks, lang, todayStr])
  const mostImportant = useMemo(() => getMostImportantTask(tasks, todayStr), [tasks, todayStr])

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#EDE7FD] to-[#E4D6FB] dark:from-[#2E2452] dark:to-[#241B42] px-4 py-3.5 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4">
      <img
        src={kivoraMascot}
        alt={t('dash.ai.mascotAlt', lang)}
        className="w-14 h-14 sm:w-[72px] sm:h-[72px] object-contain flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-[#3D2B6B] dark:text-[#F1EFFB]">
          {t('tasks.ai.bannerTitle', lang)}
          <Sparkles size={14} className="text-[#6F5AE8] dark:text-[#A78BFA]" />
        </h2>
        <p className="text-xs sm:text-sm text-[#5B4A8A] dark:text-[#C4B5FD] leading-relaxed mt-0.5">
          {suggestion}
        </p>
      </div>
      {mostImportant && (
        <button
          onClick={() => onOpenMostImportant(mostImportant)}
          aria-label={t('tasks.action.edit', lang)}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-white/70 dark:bg-white/10 flex items-center justify-center text-[#6F5AE8] dark:text-[#C4B5FD] hover:bg-white dark:hover:bg-white/20 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}
