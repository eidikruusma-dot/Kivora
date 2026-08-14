/**
 * SuggestedLinksPanel.tsx
 *
 * Compact "Suggested links" section shown above LinkedItemsPanel.
 * Renders when ≥1 suggestion passes the 0.20 score threshold.
 *
 * Each suggestion shows:
 *   icon · title · context/date · reason chip
 *   → "Link" button (creates the link immediately)
 *   → "×" dismiss button (hides forever via localStorage)
 *
 * A "Link all confident" button appears when ≥2 high-confidence
 * suggestions are present.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Sparkles, CheckSquare, Calendar, FileText, Zap, Target,
  BookOpen, Link2, X, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  computeSuggestions,
  loadDismissed,
  saveDismissed,
  type LinkSuggestion,
} from '@/lib/linkSuggestions'
import { addLink, useLinksForEntity } from '@/lib/entityLinksStore'
import type { EntityType } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'

// ── Icon map ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<EntityType, React.ElementType> = {
  task:     CheckSquare,
  calendar: Calendar,
  note:     FileText,
  habit:    Zap,
  goal:     Target,
  school:   BookOpen,
  ai:       Sparkles,
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

// ── Date formatting (copied from LinkedItemsPanel) ────────────────────────────

const ET_MONTHS = ['jaan','veebr','märts','apr','mai','juuni','juuli','aug','sept','okt','nov','dets']
const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(iso: string | undefined, lang: AppLang): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [, m, d] = iso.split('-').map(Number)
  const months = lang === 'en' ? EN_MONTHS : ET_MONTHS
  return lang === 'en' ? `${months[m - 1]} ${d}` : `${d}. ${months[m - 1]}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  type: EntityType
  entityId: string
  lang: AppLang
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuggestedLinksPanel({ type, entityId, lang, className = '' }: Props) {
  // Re-render when links change so we exclude freshly added items
  const existingLinks = useLinksForEntity(type, entityId)

  // Dismissed set — persisted to localStorage per entity
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => loadDismissed(type, entityId),
  )

  // Track locally confirmed (linked) items for immediate feedback
  const [linked, setLinked] = useState<Set<string>>(new Set())

  // Collapse when too many suggestions (show 3 by default)
  const [expanded, setExpanded] = useState(false)

  // Compute suggestions — re-runs when links or dismissals change
  const suggestions: LinkSuggestion[] = useMemo(
    () => computeSuggestions(type, entityId, lang, dismissed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, entityId, lang, dismissed, existingLinks],
  )

  const visible = suggestions.filter((s) => !linked.has(`${s.type}:${s.id}`))
  const highConf = visible.filter((s) => s.isHighConfidence)
  const shown = expanded ? visible : visible.slice(0, 3)

  const dismiss = useCallback((s: LinkSuggestion) => {
    const key = `${s.type}:${s.id}`
    const next = new Set(dismissed).add(key)
    setDismissed(next)
    saveDismissed(type, entityId, next)
  }, [dismissed, type, entityId])

  const link = useCallback((s: LinkSuggestion) => {
    const key = `${s.type}:${s.id}`
    setLinked((prev) => new Set(prev).add(key))
    addLink({
      fromType: type,
      fromId: entityId,
      toType: s.type,
      toId: s.id,
      relationType: s.suggestedRelation,
    })
  }, [type, entityId])

  const linkAll = useCallback(() => {
    highConf.forEach(link)
  }, [highConf, link])

  if (visible.length === 0) return null

  const sectionLabel = lang === 'en' ? 'Suggested' : 'Soovitused'
  const linkLabel = lang === 'en' ? 'Link' : 'Seo'
  const linkAllLabel = lang === 'en'
    ? `Link all (${highConf.length})`
    : `Seo kõik (${highConf.length})`

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} strokeWidth={2} className="text-[#B48EF5]" />
          <span className="text-[11px] font-semibold text-[#B48EF5] uppercase tracking-wider">
            {sectionLabel}
          </span>
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#F3E8FF] text-[#9333EA] text-[10px] font-bold leading-none">
            {visible.length}
          </span>
        </div>
        {highConf.length >= 2 && (
          <button
            onClick={linkAll}
            className="flex items-center gap-1 text-[11px] font-medium text-[#6F5AE8] hover:text-[#5B4AD5] transition-colors"
          >
            <CheckCircle2 size={11} strokeWidth={2.5} />
            {linkAllLabel}
          </button>
        )}
      </div>

      {/* Suggestion rows */}
      <div className="flex flex-col gap-1">
        {shown.map((s) => {
          const Icon = TYPE_ICONS[s.type] ?? Link2
          const colors = TYPE_COLORS[s.type]
          const dateStr = formatDate(s.date, lang)

          return (
            <div
              key={`${s.type}:${s.id}`}
              className="flex items-start gap-2 px-2.5 py-2 rounded-xl border border-[#F0ECF9] bg-[#FDFCFF] hover:border-[#D4CFF7] transition-colors"
            >
              {/* Type icon chip */}
              <span
                className="mt-0.5 w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center"
                style={{ background: colors.bg, color: colors.color }}
              >
                <Icon size={11} strokeWidth={2} />
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#1A1F36] truncate leading-snug">
                  {s.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {s.contextLabel && (
                    <span className="text-[10px] text-[#94A3B8] truncate max-w-[80px]">
                      {s.contextLabel}
                    </span>
                  )}
                  {dateStr && (
                    <span className="text-[10px] text-[#94A3B8]">
                      {s.contextLabel ? '·' : ''} {dateStr}
                    </span>
                  )}
                  {/* Reason chip */}
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide ${
                      s.isHighConfidence
                        ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                        : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    {s.reason}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-0.5 mt-0.5">
                <button
                  onClick={() => link(s)}
                  title={linkLabel}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[10px] font-semibold text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors"
                >
                  <Link2 size={9} strokeWidth={2.5} />
                  {linkLabel}
                </button>
                <button
                  onClick={() => dismiss(s)}
                  title={lang === 'en' ? 'Dismiss' : 'Ignoreeri'}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-[#CBD5E1] hover:text-red-400 hover:bg-red-50 transition-colors"
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Expand / collapse toggle */}
      {visible.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 w-full flex items-center justify-center gap-1 text-[10px] text-[#94A3B8] hover:text-[#6F5AE8] transition-colors py-0.5"
        >
          {expanded
            ? <><ChevronUp size={10} /> {lang === 'en' ? 'Show less' : 'Näita vähem'}</>
            : <><ChevronDown size={10} /> {lang === 'en' ? `Show ${visible.length - 3} more` : `Näita ${visible.length - 3} rohkem`}</>
          }
        </button>
      )}
    </div>
  )
}
