/**
 * OnboardingChatPage
 *
 * The first screen a brand-new user lands on after email verification
 * (see ProtectedRoute.tsx) — a short, free-flowing AI conversation (max
 * 10 minutes) that gets to know the user before handing a suggested
 * module selection to ModuleSelectionPage for review and confirmation.
 *
 * Nothing here ever writes to Firestore. The conversation transcript is
 * only ever kept in this component's state and, between visits, in this
 * browser's localStorage (onboardingConversationStore.ts) — see that
 * file's doc comment for the full data-handling rationale. The one
 * Firestore write onboarding ever produces (module settings +
 * onboardingComplete) happens later, in ModuleSelectionPage, only once the
 * user explicitly confirms.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import {
  loadOnboardingConversation,
  saveOnboardingConversation,
  clearOnboardingConversation,
  pruneExpiredOnboardingConversations,
  type OnboardingConversationMessage,
} from '@/lib/onboardingConversationStore'
import { streamOnboardingChatReply, fetchOnboardingSummary, getAiErrorCode } from '@/lib/onboardingAiClient'
import {
  ONBOARDING_TIME_LIMIT_MS,
  ONBOARDING_NUDGE_AT_MS,
  formatCountdown,
  extendStartedAtBy,
} from '@/lib/onboardingCountdown'

type Phase = 'chat' | 'time-up' | 'quota-exceeded' | 'summary-loading' | 'summary-error'

export default function OnboardingChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [messages, setMessages] = useState<OnboardingConversationMessage[]>([])
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString())
  const [resumed, setResumed] = useState(false)
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<{ code?: string } | null>(null)
  const [slowResponseNotice, setSlowResponseNotice] = useState(false)
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('chat')
  const [deletedNoticeVisible, setDeletedNoticeVisible] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const abortRef = useRef<AbortController | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const uid = user?.uid
  const initializedRef = useRef(false)

  // ── Resume or start fresh ──────────────────────────────────────────────────
  // Guarded by initializedRef so this only ever runs once per true component
  // lifetime: React StrictMode (see main.tsx) deliberately double-invokes
  // effects in development — mount, cleanup, mount again — and without this
  // guard the first invocation's fresh-start branch saves a brand-new
  // conversation to localStorage, which the second invocation would then
  // immediately read back and misreport as "resumed", on every single fresh
  // page load.
  useEffect(() => {
    if (!uid || initializedRef.current) return
    initializedRef.current = true
    pruneExpiredOnboardingConversations()
    const saved = loadOnboardingConversation(uid)
    if (saved && saved.messages.length > 0) {
      setMessages(saved.messages)
      setStartedAt(saved.startedAt)
      setResumed(true)
    } else {
      const freshStartedAt = new Date().toISOString()
      const greeting: OnboardingConversationMessage = { role: 'assistant', content: t('onboarding.chat.greeting', lang) }
      setMessages([greeting])
      setStartedAt(freshStartedAt)
      saveOnboardingConversation(uid, freshStartedAt, [greeting])
    }
    // Only ever run once per mount — re-running on `lang` change would
    // overwrite an in-progress conversation's greeting language mid-chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // ── 1s ticking clock for the countdown + time-limit cutover ────────────────
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedMs = nowMs - new Date(startedAt).getTime()
  const remainingMs = ONBOARDING_TIME_LIMIT_MS - elapsedMs
  const timeIsUp = remainingMs <= 0
  const nearingLimit = elapsedMs >= ONBOARDING_NUDGE_AT_MS && !timeIsUp

  useEffect(() => {
    if (timeIsUp && phase === 'chat') setPhase('time-up')
  }, [timeIsUp, phase])

  // Auto-scroll to the latest message/delta.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamingText])

  useEffect(() => () => abortRef.current?.abort(), [])

  function persist(nextMessages: OnboardingConversationMessage[]) {
    if (uid) saveOnboardingConversation(uid, startedAt, nextMessages)
  }

  // Takes the base history explicitly (rather than reading `messages` from
  // this closure) specifically so handleRetry can pass a freshly-computed
  // array (the failed turn already removed) without racing the asynchronous
  // setMessages() call that applies it — reading `messages` here instead
  // would still see last render's value at the moment this function runs
  // synchronously, silently duplicating the retried message.
  const sendMessage = useCallback(
    async (baseHistory: OnboardingConversationMessage[], userText: string) => {
      setStreamError(null)
      setSlowResponseNotice(false)
      setPendingUserMessage(userText)
      const userMessage: OnboardingConversationMessage = { role: 'user', content: userText }
      const historyWithUser = [...baseHistory, userMessage]
      setMessages(historyWithUser)
      setStreamingText('')
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const requestStartedAtMs = Date.now()
      let accumulated = ''
      try {
        await streamOnboardingChatReply({
          messages: historyWithUser,
          lang,
          startedAt,
          signal: controller.signal,
          onSlowResponse: () => setSlowResponseNotice(true),
          onDelta: (chunk) => {
            setSlowResponseNotice(false)
            accumulated += chunk
            setStreamingText(accumulated)
          },
        })

        const assistantMessage: OnboardingConversationMessage = { role: 'assistant', content: accumulated }
        const finalMessages = [...historyWithUser, assistantMessage]
        setMessages(finalMessages)
        setStreamingText('')
        setPendingUserMessage(null)
        persist(finalMessages)
      } catch (err) {
        const code = getAiErrorCode(err)
        if (code === 'ONBOARDING_TIME_LIMIT_REACHED') {
          setPhase('time-up')
        } else if (code === 'QUOTA_EXCEEDED') {
          // Progress is untouched — historyWithUser (already in state since
          // the optimistic update above) keeps the user's message visible;
          // only the assistant's reply never arrived. Persist so it
          // survives a reload while quota is exhausted.
          persist(historyWithUser)
          setPhase('quota-exceeded')
        } else {
          // A technical failure (stream interrupted, or timed out waiting
          // for the AI — see ONBOARDING_STALL_TIMEOUT_MS) must not eat into
          // the user's 10-minute conversation budget: push startedAt
          // forward by exactly how long this failed attempt took, and
          // persist it so a reload doesn't lose the adjustment.
          const wastedMs = Date.now() - requestStartedAtMs
          const extendedStartedAt = extendStartedAtBy(startedAt, wastedMs)
          setStartedAt(extendedStartedAt)
          if (uid) saveOnboardingConversation(uid, extendedStartedAt, historyWithUser)
          setStreamError({ code })
        }
      } finally {
        setIsStreaming(false)
        setSlowResponseNotice(false)
        abortRef.current = null
      }
    },
    [lang, startedAt, uid],
  )

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || timeIsUp) return
    setInput('')
    void sendMessage(messages, trimmed)
  }

  function handleRetry() {
    if (!pendingUserMessage) return
    // The failed attempt's user message is already the last entry in
    // `messages` (added optimistically before the request). Compute the
    // history without it and hand that straight to sendMessage, which
    // re-adds the same text — rather than calling setMessages here and
    // separately invoking sendMessage (which would read `messages` from
    // this render's stale closure before that update applies).
    const withoutFailedTurn = messages[messages.length - 1]?.content === pendingUserMessage
      ? messages.slice(0, -1)
      : messages
    void sendMessage(withoutFailedTurn, pendingUserMessage)
  }

  function goToManualSetup() {
    navigate('/onboarding', { replace: true })
  }

  async function handleFinish() {
    setPhase('summary-loading')
    try {
      const summary = await fetchOnboardingSummary({ messages, lang })
      navigate('/onboarding', {
        replace: true,
        state: { recommendedModules: summary.recommendedModules, profileSummary: summary.profileSummary },
      })
    } catch {
      setPhase('summary-error')
    }
  }

  function handleDeleteConversation() {
    if (!uid) return
    abortRef.current?.abort()
    clearOnboardingConversation(uid)
    const freshStartedAt = new Date().toISOString()
    const greeting: OnboardingConversationMessage = { role: 'assistant', content: t('onboarding.chat.greeting', lang) }
    setMessages([greeting])
    setStartedAt(freshStartedAt)
    setResumed(false)
    setStreamingText('')
    setStreamError(null)
    setPendingUserMessage(null)
    setPhase('chat')
    saveOnboardingConversation(uid, freshStartedAt, [greeting])
    setDeletedNoticeVisible(true)
    setTimeout(() => setDeletedNoticeVisible(false), 2500)
  }

  const CARD =
    'rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_30px_70px_-30px_rgba(111,90,232,0.35)]'

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex flex-col">
      <AuroraBackground />
      <div className="relative z-[1] flex flex-col min-h-[100dvh] px-4 py-6 sm:py-8">
        <div className="w-full max-w-[640px] mx-auto flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <KivoraLogo height={28} />
            <button
              onClick={goToManualSetup}
              className="text-sm font-semibold text-[#64748B] hover:text-[#1A1F36] transition-colors"
            >
              {t('onboarding.chat.skip', lang)}
            </button>
          </div>

          <div className="text-center mb-4 shrink-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-1">
              {t('onboarding.chat.pageTitle', lang)}
            </h1>
            <p className="text-[13px] text-[#64748B]">{t('onboarding.chat.subtitle', lang)}</p>
          </div>

          {resumed && (
            <p className="text-center text-[12.5px] text-[#6D28D9] font-semibold mb-3 shrink-0">
              {t('onboarding.chat.resumedNotice', lang)}
            </p>
          )}
          {deletedNoticeVisible && (
            <p className="text-center text-[12.5px] text-[#16A34A] font-semibold mb-3 shrink-0">
              {t('onboarding.chat.deletedNotice', lang)}
            </p>
          )}

          {/* Transcript */}
          <div className={`${CARD} flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 mb-3 space-y-3`}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#6F5AE8] text-white rounded-br-sm'
                      : 'bg-white/90 text-[#1A1F36] border border-[#E4DEFB] rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap bg-white/90 text-[#1A1F36] border border-[#E4DEFB]">
                  {streamingText.length > 0 ? streamingText : (
                    <span className="inline-flex gap-1 items-center text-[#9A94B8]" aria-label="…">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
                    </span>
                  )}
                </div>
              </div>
            )}
            {isStreaming && slowResponseNotice && (
              <p className="text-center text-[12px] text-[#9A94B8]">{t('onboarding.chat.slowResponseNotice', lang)}</p>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Bottom panel: varies by phase */}
          <div className="shrink-0">
            {phase === 'chat' && streamError && (
              <div className={`${CARD} px-4 py-3 mb-3 text-center`}>
                <p className="text-[13.5px] font-semibold text-[#DC2626] mb-2">{t('onboarding.chat.streamErrorTitle', lang)}</p>
                <p className="text-[12.5px] text-[#64748B] mb-3">{t('onboarding.chat.streamErrorBody', lang)}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 rounded-xl bg-[#6F5AE8] text-white text-[13px] font-semibold hover:bg-[#5B4AD5] transition-colors"
                >
                  {t('onboarding.chat.retry', lang)}
                </button>
              </div>
            )}

            {phase === 'chat' && nearingLimit && (
              <div className={`${CARD} px-4 py-3 mb-3 flex items-center justify-between gap-3`}>
                <p className="text-[12.5px] text-[#64748B]">{t('onboarding.chat.nineMinuteNudgeTitle', lang)}</p>
                <button
                  onClick={handleFinish}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[#6F5AE8]/10 text-[#6D28D9] text-[12.5px] font-semibold hover:bg-[#6F5AE8]/20 transition-colors"
                >
                  {t('onboarding.chat.nineMinuteNudgeAction', lang)}
                </button>
              </div>
            )}

            {phase === 'chat' && (
              <>
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={t('onboarding.chat.inputPlaceholder', lang)}
                    rows={1}
                    disabled={isStreaming}
                    className="flex-1 resize-none rounded-2xl border border-[#E4DEFB] bg-white/90 px-4 py-3 text-[14.5px] text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] max-h-32"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    aria-label={t('onboarding.chat.send', lang)}
                    className="shrink-0 w-11 h-11 rounded-full bg-[#6F5AE8] text-white flex items-center justify-center hover:bg-[#5B4AD5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={handleDeleteConversation}
                    className="inline-flex items-center gap-1.5 text-[12px] text-[#94A3B8] hover:text-[#DC2626] transition-colors"
                  >
                    <Trash2 size={13} />
                    {t('onboarding.chat.deleteConversation', lang)}
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={isStreaming}
                    className="text-[13px] font-semibold text-[#6D28D9] hover:underline disabled:opacity-40"
                  >
                    {t('onboarding.chat.finish', lang)} →
                  </button>
                </div>
                <p className="text-[11px] text-[#9A94B8] text-center mt-3">
                  {t('onboarding.chat.timeLabel', lang)}: {formatCountdown(remainingMs)} · {t('onboarding.chat.privacyNotice', lang)}
                </p>
              </>
            )}

            {phase === 'time-up' && (
              <div className={`${CARD} px-5 py-5 text-center`}>
                <p className="text-[15px] font-bold text-[#1A1F36] mb-1">{t('onboarding.chat.timeUpTitle', lang)}</p>
                <p className="text-[13px] text-[#64748B] mb-4">{t('onboarding.chat.timeUpBody', lang)}</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={handleFinish}
                    className="px-5 py-2.5 rounded-xl bg-[#6F5AE8] text-white text-[13.5px] font-semibold hover:bg-[#5B4AD5] transition-colors"
                  >
                    {t('onboarding.chat.finish', lang)}
                  </button>
                  <button
                    onClick={goToManualSetup}
                    className="px-5 py-2.5 rounded-xl bg-white/70 border border-[#E4DEFB] text-[#1A1F36] text-[13.5px] font-semibold hover:bg-white transition-colors"
                  >
                    {t('onboarding.chat.manualSetup', lang)}
                  </button>
                </div>
              </div>
            )}

            {phase === 'quota-exceeded' && (
              <div className={`${CARD} px-5 py-5 text-center`}>
                <p className="text-[15px] font-bold text-[#1A1F36] mb-1">{t('onboarding.chat.quotaExceededTitle', lang)}</p>
                <p className="text-[13px] text-[#64748B] mb-4">{t('onboarding.chat.quotaExceededBody', lang)}</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={goToManualSetup}
                    className="px-5 py-2.5 rounded-xl bg-[#6F5AE8] text-white text-[13.5px] font-semibold hover:bg-[#5B4AD5] transition-colors"
                  >
                    {t('onboarding.chat.manualSetup', lang)}
                  </button>
                  <button
                    onClick={() => setPhase('chat')}
                    className="px-5 py-2.5 rounded-xl bg-white/70 border border-[#E4DEFB] text-[#1A1F36] text-[13.5px] font-semibold hover:bg-white transition-colors"
                  >
                    {t('onboarding.chat.continueLater', lang)}
                  </button>
                </div>
              </div>
            )}

            {phase === 'summary-loading' && (
              <div className={`${CARD} px-5 py-6 text-center`}>
                <div className="w-6 h-6 border-2 border-[#6F5AE8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[13.5px] text-[#64748B]">{t('onboarding.chat.summaryLoading', lang)}</p>
              </div>
            )}

            {phase === 'summary-error' && (
              <div className={`${CARD} px-5 py-5 text-center`}>
                <p className="text-[15px] font-bold text-[#1A1F36] mb-1">{t('onboarding.chat.summaryErrorTitle', lang)}</p>
                <p className="text-[13px] text-[#64748B] mb-4">{t('onboarding.chat.summaryErrorBody', lang)}</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={handleFinish}
                    className="px-5 py-2.5 rounded-xl bg-[#6F5AE8] text-white text-[13.5px] font-semibold hover:bg-[#5B4AD5] transition-colors"
                  >
                    {t('onboarding.chat.summaryRetry', lang)}
                  </button>
                  <button
                    onClick={goToManualSetup}
                    className="px-5 py-2.5 rounded-xl bg-white/70 border border-[#E4DEFB] text-[#1A1F36] text-[13.5px] font-semibold hover:bg-white transition-colors"
                  >
                    {t('onboarding.chat.manualSetup', lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
