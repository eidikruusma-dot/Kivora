import { useState, useEffect, useMemo } from 'react'
import { Sparkles, MessageCircle, AlertTriangle, Clock3, CalendarClock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTasks } from '@/lib/tasksStore'
import { useCalendarEvents } from '@/lib/calendarStore'
import { useSchoolTasks, useSchoolExams } from '@/lib/schoolStore'
import { usePlans } from '@/lib/plansStore'
import { useGoals } from '@/lib/goalsStore'
import { computeDailyOverview } from '@/lib/dailyObservations'
import { computeSmartDailySummary } from '@/lib/dashboardSummary'
import { fetchAIReply, getAiErrorCode } from '@/lib/aiClient'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import kivoraMascot from '@/assets/dashboard/kivora-ai-mascot.webp'

/**
 * The dashboard's centerpiece card — placed directly below HeroCard, per
 * the confirmed design reference. Two clearly separate content types live
 * inside it, deliberately never blurred together:
 *
 *   1. The default block ("Tänane ülevaade" / "Today's overview") is a
 *      pure, local, rule-based summary (see dashboardSummary.ts) computed
 *      from the user's real tasks/calendar data already shown elsewhere on
 *      the dashboard. It costs nothing, needs no network call, and is
 *      NEVER labelled as AI-generated.
 *   2. A real AI-generated suggestion only ever appears after the user
 *      explicitly presses "Küsi AI soovitust" — a single on-demand
 *      /api/ai/chat call (same quota/privacy rules as the AI Assistant
 *      chat). Its result is marked with its own "✨ Tänane soovitus" label
 *      so it's always visually distinguishable from the free local summary.
 *
 * "Vestle AI-ga" and "Loo plaan" never call the AI themselves — both just
 * navigate to the existing /app/assistant chat (the second via the same
 * sessionStorage "kivora_ai_prompt" hand-off SchoolPage already uses), so
 * any actual plan generation goes through the existing, already-reviewed
 * AIPlanGeneratorModal confirm-before-save flow — nothing is ever saved or
 * changed here without the user's own explicit action in that flow.
 *
 * The summary/suggestion bubble's PLACEMENT (never its content — text is
 * never truncated or hidden) depends on how long the text is relative to
 * the viewport: short text sits beside the mascot as before; a longer
 * response (the model isn't always perfectly compliant with the "2-3
 * sentences" instruction below) moves to its own full-card-width block
 * below the mascot+title row instead, so it never produces a tall column
 * with empty space left under the mascot. See useViewportWidth() below.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export default function KivoraAICard() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const allTasks = useTasks()
  const allEvents = useCalendarEvents()
  const schoolTasks = useSchoolTasks()
  const schoolExams = useSchoolExams()
  const plans = usePlans()
  const goals = useGoals()
  const viewportWidth = useViewportWidth()

  // Each input here is already its own store's filtered array (not a
  // shared/global reference), so this only recomputes when one of these
  // specific stores actually changes — same lesson applied in
  // SuggestedLinksPanel.tsx's unrelated-global-update fix.
  const overview = useMemo(
    () => computeDailyOverview({ tasks: allTasks, events: allEvents, schoolTasks, schoolExams, plans, goals }),
    [allTasks, allEvents, schoolTasks, schoolExams, plans, goals],
  )

  const localSummary = useMemo(
    () => computeSmartDailySummary(overview, lang),
    [overview, lang],
  )

  // On-demand real AI suggestion — undefined until the user asks for one.
  const [aiSuggestion, setAiSuggestion] = useState<string | undefined>(undefined)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | undefined>(undefined)

  const handleAskAi = async () => {
    setAiLoading(true)
    setAiError(undefined)
    try {
      const prompt = lang === 'en'
        ? 'Give me a short, personal and practical suggestion for today based on my real Kivora data (tasks, calendar, habits, goals). Answer in at most 2-3 short, concrete sentences, with no greeting or introduction.'
        : 'Anna mulle lühike, personaalne ja praktiline soovitus tänaseks päevaks, lähtudes minu tegelikest Kivora andmetest (ülesanded, kalender, harjumused, eesmärgid). Vasta maksimaalselt 2-3 lühikese ja konkreetse lausega, ilma sissejuhatuse ega tervituseta.'
      const res = await fetchAIReply([{ role: 'user', content: prompt }], lang)
      setAiSuggestion(res.reply)
    } catch (err) {
      setAiError(
        getAiErrorCode(err) === 'QUOTA_EXCEEDED'
          ? t('ai.chat.quotaExceeded', lang)
          : t('ai.chat.error', lang),
      )
    } finally {
      setAiLoading(false)
    }
  }

  const handleChatClick = () => navigate('/app/assistant')

  const handlePlanClick = () => {
    sessionStorage.setItem('kivora_ai_prompt', t('dash.ai.planPrompt', lang))
    navigate('/app/assistant')
  }

  // The bubble's body text, whichever is currently shown — never truncated;
  // only its PLACEMENT below depends on its length and the viewport width.
  const bodyText = aiSuggestion ?? localSummary

  // A narrower card has less room beside the mascot before text looks
  // cramped, so the "switch to full width" length threshold scales with
  // viewport width rather than using one fixed character count everywhere.
  const longTextThreshold = viewportWidth < 400 ? 70 : viewportWidth < 1024 ? 110 : 170
  const isLongText = !aiLoading && !aiError && bodyText.length > longTextThreshold

  const summaryBubble = (
    <div className="rounded-2xl bg-[#F5F2FD] dark:bg-[#2A2150]/70 border border-[#EADFFB] dark:border-white/15 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-[#6F5AE8] dark:text-[#D4C8FC] mb-1">
        {aiSuggestion ? t('dash.ai.suggestionLabel', lang) : t('dash.ai.summaryLabel', lang)}
      </p>
      {aiLoading ? (
        <p className="text-sm text-[#94A3B8] dark:text-[#B4AFD1] italic">{t('dash.ai.askButtonLoading', lang)}</p>
      ) : aiError ? (
        <p className="text-sm text-[#DC2626] dark:text-red-300">{aiError}</p>
      ) : (
        <p className="text-sm text-[#1A1F36] dark:text-[#F8F7FD] leading-relaxed">
          {bodyText}
        </p>
      )}
    </div>
  )

  return (
    <div className="relative rounded-[28px] p-[1.5px] bg-gradient-to-br from-[#C9B6F7] via-[#E4D6FB] to-[#F3C9E0] dark:from-[#4A3B82] dark:via-[#3B2F66] dark:to-[#5B3D6B] shadow-[0_18px_40px_rgba(99,69,181,0.16)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="rounded-[26.5px] bg-white/90 dark:bg-[#1E1B33]/95 backdrop-blur-xl px-3 sm:px-5 py-3 sm:py-4">
        {/* Header row: mascot always on the left, title/subtitle always on the
           right — even at 320px (never stacked). The summary bubble joins
           this row only while its text is short enough for the viewport;
           see isLongText below. When the text IS long (and moves to its own
           full-width block below), the title/subtitle column is noticeably
           shorter than the mascot, so it's centered against the mascot
           instead of sitting top-aligned with empty space below it — the
           short-text case keeps its original top alignment unchanged. */}
        <div className={`flex gap-3 sm:gap-4 ${isLongText ? 'items-center' : 'items-start'}`}>
          <img
            src={kivoraMascot}
            alt={t('dash.ai.mascotAlt', lang)}
            className="w-32 h-32 sm:w-40 sm:h-40 object-contain flex-shrink-0 drop-shadow-[0_8px_18px_rgba(111,90,232,0.28)]"
          />

          <div className={`flex-1 min-w-0 ${isLongText ? '' : 'pt-1'}`}>
            <h2 className="flex items-center gap-1.5 text-base sm:text-lg font-bold text-[#1A1F36] dark:text-[#F8F7FD]">
              {t('dash.ai.title', lang)}
              <Sparkles size={16} className="text-[#A78BFA]" />
            </h2>
            <p className="text-xs text-[#94A3B8] dark:text-[#B4AFD1] mb-2">
              {t('dash.ai.subtitle', lang)}
            </p>

            {!isLongText && summaryBubble}
          </div>
        </div>

        {/* Long text (relative to the current viewport) breaks out of the
           mascot row entirely and spans the full card width here instead —
           never truncated, just given room that doesn't leave empty space
           under the mascot. */}
        {isLongText && <div className="mt-3">{summaryBubble}</div>}

        {/* Compact, tappable fact chips — one per observation KIND (never
           per individual item, keeping this scannable), each a count the
           user can open for detail. These are the same deduplicated,
           duration-free facts computeDailyOverview() already produced for
           the prose above — shown here again only as a quick-navigation
           shortcut, never as extra/different claims. Hidden while the
           on-demand AI suggestion or its loading/error state occupies the
           bubble, since they'd read as unrelated clutter next to that. */}
        {!aiLoading && !aiError && !aiSuggestion && (
          overview.overdueCount > 0 || overview.conflicts.length > 0 || overview.upcoming.length > 0
        ) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {overview.overdueCount > 0 && (
              <button
                onClick={() => navigate('/app/tasks')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF2F2] dark:bg-red-500/10 text-[#DC2626] dark:text-red-300 text-[11px] font-semibold hover:opacity-80 transition-opacity"
              >
                <AlertTriangle size={11} />
                {overview.overdueCount}
              </button>
            )}
            {overview.conflicts.length > 0 && (
              <button
                onClick={() => navigate('/app/calendar')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF7ED] dark:bg-orange-500/10 text-[#C2410C] dark:text-orange-300 text-[11px] font-semibold hover:opacity-80 transition-opacity"
              >
                <Clock3 size={11} />
                {overview.conflicts.length}
              </button>
            )}
            {overview.upcoming.length > 0 && (
              <button
                onClick={() => navigate('/app/tasks')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EDE9FB] dark:bg-[#3B2F66] text-[#6F5AE8] dark:text-[#D4C8FC] text-[11px] font-semibold hover:opacity-80 transition-opacity"
              >
                <CalendarClock size={11} />
                {overview.upcoming.length}
              </button>
            )}
          </div>
        )}

        {/* Actions — a single full-width row below the mascot+text header,
           not confined under the text column, so they have the whole card's
           width to wrap into on narrow phones. */}
        <div className="flex flex-wrap gap-2 justify-start mt-3">
          <button
            onClick={handleChatClick}
            className="min-h-[40px] px-4 flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#7C5FE0] to-[#6F5AE8] dark:from-[#9381F0] dark:to-[#7C5FE0] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(99,69,181,0.25)] hover:opacity-90 transition-opacity"
          >
            <MessageCircle size={14} />
            {t('dash.ai.chatButton', lang)}
          </button>
          <button
            onClick={handlePlanClick}
            className="min-h-[40px] px-4 flex items-center gap-1.5 rounded-xl bg-[#EDE9FB] dark:bg-[#3B2F66] text-[#6F5AE8] dark:text-[#D4C8FC] text-xs font-semibold hover:opacity-80 transition-opacity"
          >
            <Sparkles size={14} />
            {t('dash.ai.planButton', lang)}
          </button>
          <button
            onClick={handleAskAi}
            disabled={aiLoading}
            className="min-h-[40px] px-4 flex items-center gap-1.5 rounded-xl border border-[#C4B5FD] dark:border-[#9381F0]/70 text-[#6F5AE8] dark:text-[#D4C8FC] text-xs font-semibold hover:bg-[#F5F2FD] dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={14} />
            {aiLoading ? t('dash.ai.askButtonLoading', lang) : t('dash.ai.askButton', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
