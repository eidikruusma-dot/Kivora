/**
 * PostSaveLinkSuggestionsDialog.tsx
 *
 * Modal shown once after saving a new entity when relevant link
 * suggestions exist. If no suggestions pass the threshold this
 * component calls onClose() immediately and renders nothing.
 *
 * Flow:
 *   1. Parent saves the entity and sets postSave state.
 *   2. This dialog mounts, computes suggestions, and either
 *      closes immediately (no suggestions) or shows the modal.
 *   3. User picks rows, clicks "Link selected" / "Link all" / "Skip".
 *   4. Dismissed keys are persisted to localStorage so the detail-view
 *      SuggestedLinksPanel won't re-show the same rows.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  X, Link2, CalendarPlus, Calendar, AlertCircle,
  Sparkles, CheckSquare, FileText, Zap, Target, BookOpen,
  CheckCircle2,
} from 'lucide-react'
import {
  computeSuggestions,
  loadDismissed,
  saveDismissed,
  type LinkSuggestion,
} from '@/lib/linkSuggestions'
import { addLink, hasCalendarLink } from '@/lib/entityLinksStore'
import { addCalendarEvent } from '@/lib/calendarStore'
import { resolveEntity } from '@/lib/entityResolver'
import { getAllTasks } from '@/lib/tasksStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllChats } from '@/lib/aiConversationsStore'
import { getAllSchoolTasks, getAllSchoolExams } from '@/lib/schoolStore'
import { decodeSchoolId } from '@/types/entityLinks'
import type { EntityType } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'

// ── Icon / color maps ─────────────────────────────────────────────────────────

const TYPE_ICONS: Record<EntityType, React.ElementType> = {
  task: CheckSquare, calendar: Calendar, note: FileText,
  habit: Zap, goal: Target, school: BookOpen, ai: Sparkles,
}

const TYPE_COLORS: Record<EntityType, { bg: string; color: string }> = {
  task:     { bg: '#EDE9FB', color: '#6F5AE8' },
  calendar: { bg: '#DCFCE7', color: '#16A34A' },
  note:     { bg: '#FEF9C3', color: '#CA8A04' },
  habit:    { bg: '#FEE2E2', color: '#DC2626' },
  goal:     { bg: '#E0F2FE', color: '#0284C7' },
  school:   { bg: '#FEF3C7', color: '#D97706' },
  ai:       { bg: '#F3E8FF', color: '#9333EA' },
}

const TYPE_LABEL: Record<EntityType, { et: string; en: string }> = {
  task:     { et: 'Ülesanne', en: 'Task' },
  calendar: { et: 'Sündmus',  en: 'Event' },
  note:     { et: 'Märkus',   en: 'Note' },
  habit:    { et: 'Harjumus', en: 'Habit' },
  goal:     { et: 'Eesmärk',  en: 'Goal' },
  school:   { et: 'Kool',     en: 'School' },
  ai:       { et: 'AI',       en: 'AI' },
}

// ── Date formatting ───────────────────────────────────────────────────────────

const ET_M = ['jaan','veebr','märts','apr','mai','juuni','juuli','aug','sept','okt','nov','dets']
const EN_M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string | undefined, lang: AppLang): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [, m, d] = iso.split('-').map(Number)
  const months = lang === 'en' ? EN_M : ET_M
  return lang === 'en' ? `${months[m - 1]} ${d}` : `${d}. ${months[m - 1]}`
}

// ── Helpers to read source entity date/title ──────────────────────────────────

function getEntityDate(type: EntityType, id: string): string | undefined {
  switch (type) {
    case 'task': return getAllTasks().find((t) => t.id === id)?.date
    case 'calendar': return undefined // calendar itself IS the event
    case 'note': return undefined
    case 'habit': return undefined
    case 'goal': return undefined
    case 'ai': return undefined
    case 'school': {
      const d = decodeSchoolId(id)
      if (!d) return undefined
      if (d.kind === 'task') return getAllSchoolTasks().find((t) => String(t.id) === d.rawId)?.deadline
      if (d.kind === 'exam') return getAllSchoolExams().find((e) => String(e.id) === d.rawId)?.date
      return undefined
    }
    default: return undefined
  }
}

function getEntityTitle(type: EntityType, id: string): string {
  switch (type) {
    case 'task': return getAllTasks().find((t) => t.id === id)?.title ?? ''
    case 'note': return getAllNotes().find((n) => n.id === id)?.title ?? ''
    case 'goal': return getAllGoals().find((g) => g.id === id)?.title ?? ''
    case 'habit': return getAllHabits().find((h) => h.id === id)?.title ?? ''
    case 'ai': return getAllChats().find((c) => c.id === id)?.title ?? ''
    case 'school': {
      const d = decodeSchoolId(id)
      if (!d) return ''
      if (d.kind === 'task') return getAllSchoolTasks().find((t) => String(t.id) === d.rawId)?.title ?? ''
      if (d.kind === 'exam') return getAllSchoolExams().find((e) => String(e.id) === d.rawId)?.title ?? ''
      return ''
    }
    default: return ''
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PostSaveLinkSuggestionsDialogProps {
  type: EntityType
  entityId: string
  lang: AppLang
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PostSaveLinkSuggestionsDialog({
  type, entityId, lang, onClose,
}: PostSaveLinkSuggestionsDialogProps) {

  // Dismissed set — persist to same LS key as SuggestedLinksPanel so detail view doesn't re-show
  const [dismissed] = useState<Set<string>>(() => loadDismissed(type, entityId))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [done, setDone] = useState(false)
  const [calCreating, setCalCreating] = useState(false)
  const [calDone, setCalDone] = useState(false)

  const suggestions: LinkSuggestion[] = useMemo(
    () => computeSuggestions(type, entityId, lang, dismissed),
    [type, entityId, lang, dismissed],
  )

  const highConf = suggestions.filter((s) => s.isHighConfidence)

  // Calendar section conditions
  const entityDate = getEntityDate(type, entityId)
  const alreadyHasCal = hasCalendarLink(type, entityId)
  const showCalSection = !!entityDate && !alreadyHasCal && type !== 'calendar'

  // Auto-close immediately if nothing to show
  useEffect(() => {
    if (suggestions.length === 0 && !showCalSection) {
      onClose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (suggestions.length === 0 && !showCalSection) return null

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function doLinkSelected() {
    for (const s of suggestions) {
      if (selected.has(`${s.type}:${s.id}`)) {
        addLink({ fromType: type, fromId: entityId, toType: s.type, toId: s.id, relationType: s.suggestedRelation })
        // Persist dismiss so detail view doesn't re-suggest
        dismissed.add(`${s.type}:${s.id}`)
      }
    }
    saveDismissed(type, entityId, dismissed)
    setDone(true)
    setTimeout(onClose, 700)
  }

  function doLinkAll() {
    for (const s of highConf) {
      addLink({ fromType: type, fromId: entityId, toType: s.type, toId: s.id, relationType: s.suggestedRelation })
      dismissed.add(`${s.type}:${s.id}`)
    }
    saveDismissed(type, entityId, dismissed)
    setDone(true)
    setTimeout(onClose, 700)
  }

  async function doCreateCalendarEvent() {
    setCalCreating(true)
    try {
      const title = getEntityTitle(type, entityId)
      const eventId = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      await addCalendarEvent({
        id: eventId,
        title: title || lang === 'en' ? `Event` : `Sündmus`,
        date: entityDate!,
        startTime: '09:00',
        endTime: '10:00',
        color: '#6F5AE8',
        calendarId: 'mine',
      })
      addLink({ fromType: type, fromId: entityId, toType: 'calendar', toId: eventId, relationType: 'scheduled' })
      setCalDone(true)
    } finally {
      setCalCreating(false)
    }
  }

  // ── Strings ──────────────────────────────────────────────────────────────────

  const et = lang !== 'en'
  const title  = et ? 'Leidsin võimalikud seosed' : 'Possible links found'
  const sub    = et
    ? `Uus ${TYPE_LABEL[type].et.toLowerCase()} sobitub ${suggestions.length > 1 ? 'mõne' : 'ühe'} olemasoleva elemendiga.`
    : `Your new ${TYPE_LABEL[type].en.toLowerCase()} matches ${suggestions.length > 1 ? 'some' : 'one'} existing item${suggestions.length > 1 ? 's' : ''}.`
  const skipLbl          = et ? 'Jäta vahele' : 'Skip'
  const linkSelLbl       = et ? 'Seo valitud' : 'Link selected'
  const linkAllLbl       = et ? `Seo kõik kindlad (${highConf.length})` : `Link all confident (${highConf.length})`
  const calAddLbl        = et ? 'Lisa kalendrisse' : 'Add to calendar'
  const calDoneLbl       = et ? 'Lisatud ✓' : 'Added ✓'
  const calCreatingLbl   = et ? 'Loon…' : 'Creating…'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles size={15} className="text-[#6F5AE8]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1F36] leading-snug">{title}</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-snug">{sub}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors flex-shrink-0"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── Done state ── */}
        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <CheckCircle2 size={36} className="text-green-500" strokeWidth={1.5} />
            <p className="text-sm font-medium text-[#1A1F36]">
              {et ? 'Seosed loodud ✓' : 'Links created ✓'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Suggestion rows ── */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
              {suggestions.map((s) => {
                const key = `${s.type}:${s.id}`
                const isSelected = selected.has(key)
                const Icon = TYPE_ICONS[s.type] ?? Link2
                const colors = TYPE_COLORS[s.type]
                const dateStr = fmtDate(s.date, lang)
                const typeLabel = lang === 'en' ? TYPE_LABEL[s.type].en : TYPE_LABEL[s.type].et

                return (
                  <button
                    key={key}
                    onClick={() => toggleSelect(key)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[#6F5AE8] bg-[#F4F2FF]'
                        : 'border-[#F0F0F0] bg-white hover:border-[#D4CFF7] hover:bg-[#FDFCFF]'
                    }`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                        isSelected
                          ? 'border-[#6F5AE8] bg-[#6F5AE8]'
                          : 'border-[#CBD5E1] bg-white'
                      }`}
                    >
                      {isSelected && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>

                    {/* Type icon chip */}
                    <span
                      className="mt-0.5 w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-semibold truncate leading-snug ${
                          isSelected ? 'text-[#6F5AE8]' : 'text-[#1A1F36]'
                        }`}>
                          {s.title}
                        </p>
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{ background: colors.bg, color: colors.color }}
                        >
                          {typeLabel}
                        </span>
                      </div>

                      {/* Date + context */}
                      {(dateStr || s.contextLabel) && (
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {s.contextLabel && (
                            <span className="text-[10px] text-[#94A3B8] truncate max-w-[90px]">
                              {s.contextLabel}
                            </span>
                          )}
                          {dateStr && (
                            <span className="text-[10px] text-[#94A3B8]">
                              {s.contextLabel ? '·' : ''} {dateStr}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Reason chip */}
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide ${
                          s.isHighConfidence
                            ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                            : 'bg-[#F1F5F9] text-[#64748B]'
                        }`}>
                          {s.reason}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── Calendar section ── */}
            {showCalSection && (
              <div className="px-5 pb-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
                  <Calendar size={14} className="text-[#16A34A] flex-shrink-0" strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#166534]">
                      {et
                        ? `Kuupäev: ${fmtDate(entityDate, lang) ?? entityDate}`
                        : `Date: ${fmtDate(entityDate, lang) ?? entityDate}`}
                    </p>
                    <p className="text-[10px] text-[#16A34A]">
                      {et ? 'Loo automaatne kalendrisündmus' : 'Create a calendar event automatically'}
                    </p>
                  </div>
                  {calDone ? (
                    <span className="text-xs font-medium text-[#16A34A] flex-shrink-0">{calDoneLbl}</span>
                  ) : (
                    <button
                      onClick={doCreateCalendarEvent}
                      disabled={calCreating}
                      className="flex items-center gap-1 text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors px-2.5 py-1.5 rounded-lg disabled:opacity-50 flex-shrink-0"
                    >
                      <CalendarPlus size={12} strokeWidth={2} />
                      {calCreating ? calCreatingLbl : calAddLbl}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="px-5 py-4 border-t border-[#F0F0F0] flex flex-col gap-2">
              {/* Duplicate-prevention note when nothing selected */}
              {suggestions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {highConf.length >= 1 && (
                    <button
                      onClick={doLinkAll}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#6F5AE8] text-white text-xs font-semibold hover:bg-[#5B4AD5] transition-colors"
                    >
                      <CheckCircle2 size={13} strokeWidth={2.5} />
                      {linkAllLbl}
                    </button>
                  )}
                  <button
                    onClick={doLinkSelected}
                    disabled={selected.size === 0}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#6F5AE8] text-[#6F5AE8] text-xs font-semibold hover:bg-[#EDE9FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Link2 size={12} strokeWidth={2.5} />
                    {linkSelLbl}
                    {selected.size > 0 && ` (${selected.size})`}
                  </button>
                  <button
                    onClick={onClose}
                    className="ml-auto h-9 px-3 rounded-xl text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
                  >
                    {skipLbl}
                  </button>
                </div>
              )}
              {suggestions.length === 0 && showCalSection && (
                <button
                  onClick={onClose}
                  className="w-full h-9 rounded-xl text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] transition-colors border border-[#E2E8F0]"
                >
                  {skipLbl}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
