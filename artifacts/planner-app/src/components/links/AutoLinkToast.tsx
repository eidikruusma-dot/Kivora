/**
 * AutoLinkToast.tsx
 *
 * Non-blocking bottom-right toast shown after automatic cross-module linking.
 * Displays a count of auto-created links, a "View links" action, and an Undo
 * button that removes only the links created by this save action.
 *
 * - Auto-dismisses after 8 seconds.
 * - Undo is only available while the toast is visible.
 * - Closing the toast (or letting it auto-dismiss) does NOT undo anything.
 */

import { useEffect, useRef, useState } from 'react'
import { Link2, Undo2, X, ExternalLink, Sparkles } from 'lucide-react'
import { removeLink } from '@/lib/entityLinksStore'
import { deleteCalendarEvent } from '@/lib/calendarStore'
import type { AppLang } from '@/lib/languageStore'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface AutoLinkToastProps {
  /** IDs of EntityLink documents to remove on undo. */
  linkIds: string[]
  /** Calendar event ID to delete on undo (if one was auto-created). */
  calendarEventId: string | null
  lang: AppLang
  /** Called when the toast closes (auto-dismiss or manual X). */
  onClose: () => void
  /** Optional: opens the linked-items detail view when user clicks "View links". */
  onViewLinks?: () => void
}

// ── Strings ────────────────────────────────────────────────────────────────────

function label(count: number, lang: AppLang): string {
  if (lang === 'en') {
    return count === 1
      ? '1 related item linked automatically'
      : `${count} related items linked automatically`
  }
  return count === 1
    ? '1 seotud element lisati automaatselt'
    : `${count} seotud elementi lisati automaatselt`
}

// ── Component ──────────────────────────────────────────────────────────────────

const DISMISS_MS = 8000

export default function AutoLinkToast({
  linkIds,
  calendarEventId,
  lang,
  onClose,
  onViewLinks,
}: AutoLinkToastProps) {
  const [undone, setUndone] = useState(false)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Animate in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, DISMISS_MS)
    return () => {
      cancelAnimationFrame(frame)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(onClose, 300)
  }

  async function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current)
    // Remove all auto-created links
    for (const id of linkIds) {
      try { removeLink(id) } catch { /* ignore */ }
    }
    // Delete auto-created calendar event if any
    if (calendarEventId) {
      try { await deleteCalendarEvent(calendarEventId) } catch { /* ignore */ }
    }
    setUndone(true)
    setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 900)
  }

  const et = lang !== 'en'

  // Effective link count: subtract 1 if a calendar event was auto-created
  // (that link is internal) — show the "content" links count to the user.
  // Actually, show total because calendar event IS a useful link to show.
  const displayCount = linkIds.length

  return (
    <div
      className={`fixed bottom-5 right-5 z-[70] transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-white border border-[#E2E8F0] shadow-xl rounded-2xl w-80 overflow-hidden">
        {/* Progress bar */}
        {!undone && (
          <div
            className="h-0.5 bg-[#6F5AE8] origin-left"
            style={{
              animation: `shrink ${DISMISS_MS}ms linear forwards`,
            }}
          />
        )}

        <div className="px-4 py-3">
          {undone ? (
            /* Undo confirmation */
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                <Undo2 size={13} className="text-[#16A34A]" strokeWidth={2.5} />
              </div>
              <p className="text-xs font-medium text-[#1A1F36]">
                {et ? 'Seosed eemaldatud' : 'Links removed'}
              </p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={13} className="text-[#6F5AE8]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1A1F36] leading-snug">
                    {label(displayCount, lang)}
                  </p>
                  {calendarEventId && (
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">
                      {et ? 'Sh. uus kalendrisündmus' : 'Incl. new calendar event'}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="p-1 rounded-lg text-[#CBD5E1] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors flex-shrink-0 -mt-0.5"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-2.5 pl-9">
                {onViewLinks && (
                  <button
                    onClick={() => { onViewLinks(); handleClose() }}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                  >
                    <ExternalLink size={11} strokeWidth={2.5} />
                    {et ? 'Vaata seoseid' : 'View links'}
                  </button>
                )}
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#64748B] hover:text-[#1A1F36] transition-colors ml-auto"
                >
                  <Undo2 size={11} strokeWidth={2.5} />
                  {et ? 'Tühista' : 'Undo'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Keyframe for the progress bar shrink */}
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}

// ── Helper export: bare Link2 icon for places that need it ────────────────────
export { Link2 }
