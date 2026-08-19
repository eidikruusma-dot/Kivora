/**
 * LinkedItemsPanel.tsx
 *
 * "Linked items" section — drop into any detail view.
 * Each row shows: entity-type icon · title · date chip · relation badge
 * plus an "Open →" button (navigates to the module) and a remove × button.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Link2, X, Plus, CheckSquare, Calendar, FileText, Zap,
  Target, BookOpen, Sparkles, ArrowUpRight,
} from 'lucide-react'
import { useLinksForEntity, removeLink } from '@/lib/entityLinksStore'
import { resolveEntity } from '@/lib/entityResolver'
import type { EntityType } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import LinkPickerModal from './LinkPickerModal'
import SuggestedLinksPanel from './SuggestedLinksPanel'

// ── Entity-type icon map ──────────────────────────────────────────────────────

const TYPE_ICONS: Record<EntityType, React.ElementType> = {
  task:     CheckSquare,
  calendar: Calendar,
  note:     FileText,
  habit:    Zap,
  goal:     Target,
  school:   BookOpen,
  ai:       Sparkles,
}

// ── Navigate path per type ────────────────────────────────────────────────────

const TYPE_PATH: Record<EntityType, string> = {
  task:     '/app/tasks',
  calendar: '/app/calendar',
  note:     '/app/notes',
  habit:    '/app/habits',
  goal:     '/app/goals',
  school:   '/app/school',
  ai:       '/app/ai',
}

// ── Date formatting ───────────────────────────────────────────────────────────

const ET_MONTHS_SHORT = [
  'jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni',
  'juuli', 'aug', 'sept', 'okt', 'nov', 'dets',
]
const EN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatDate(iso: string, lang: AppLang): string {
  // iso is either YYYY-MM-DD or a display string like "15.08.2026"
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split('-').map(Number)
    const months = lang === 'en' ? EN_MONTHS_SHORT : ET_MONTHS_SHORT
    return lang === 'en' ? `${months[m - 1]} ${d}` : `${d}. ${months[m - 1]}`
  }
  return iso
}

// ── Relation badge ────────────────────────────────────────────────────────────

const RELATION_COLORS: Record<string, { bg: string; text: string }> = {
  related:     { bg: '#F1F5F9', text: '#64748B' },
  scheduled:   { bg: '#DCFCE7', text: '#16A34A' },
  supports:    { bg: '#E0F2FE', text: '#0284C7' },
  createdFrom: { bg: '#F3E8FF', text: '#9333EA' },
  belongsTo:   { bg: '#FEF9C3', text: '#CA8A04' },
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  type: EntityType
  entityId: string
  lang: AppLang
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LinkedItemsPanel({ type, entityId, lang, className = '' }: Props) {
  const navigate  = useNavigate()
  const links     = useLinksForEntity(type, entityId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removing, setRemoving]     = useState<string | null>(null)

  function handleRemove(id: string) {
    setRemoving(id)
    setTimeout(() => { removeLink(id); setRemoving(null) }, 180)
  }

  function handleOpen(targetType: EntityType, targetId: string) {
    navigate(TYPE_PATH[targetType], { state: { openId: targetId } })
  }

  return (
    <div className={`${className}`}>
      {/* ── Suggested links ── */}
      <SuggestedLinksPanel
        type={type}
        entityId={entityId}
        lang={lang}
        className="mb-3"
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Link2 size={12} strokeWidth={2} className="text-[#94A3B8]" />
          <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
            {t('links.section.title', lang)}
          </span>
          {links.length > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-[10px] font-bold leading-none">
              {links.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-[#6F5AE8] hover:text-[#5B4AD5] transition-colors"
        >
          <Plus size={11} strokeWidth={2.5} />
          {t('links.add', lang)}
        </button>
      </div>

      {/* ── Empty state ── */}
      {links.length === 0 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#E2E8F0] text-[#94A3B8] text-xs hover:border-[#6F5AE8] hover:text-[#6F5AE8] transition-colors group"
        >
          <Plus size={11} strokeWidth={2.5} />
          {t('links.empty', lang)}
        </button>
      )}

      {/* ── Link rows ── */}
      {links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {links.map((link) => {
            const isFrom    = link.fromType === type && link.fromId === entityId
            const otherType = isFrom ? link.toType   : link.fromType
            const otherId   = isFrom ? link.toId     : link.fromId
            const display   = resolveEntity(otherType, otherId)

            const Icon = TYPE_ICONS[otherType] ?? Link2
            const rc   = RELATION_COLORS[link.relationType] ?? RELATION_COLORS.related
            const isRemoving = removing === link.id

            return (
              <div
                key={link.id}
                className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl border bg-white transition-all ${
                  isRemoving
                    ? 'opacity-40 border-[#F0F0F0]'
                    : 'border-[#F0F0F0] hover:border-[#D4CFF7] hover:shadow-sm'
                }`}
              >
                {/* Icon chip */}
                <span
                  className="mt-0.5 w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                  style={{
                    background: display?.bg ?? '#F1F5F9',
                    color: display?.color ?? '#64748B',
                  }}
                >
                  <Icon size={13} strokeWidth={2} />
                </span>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <p className="text-xs font-semibold text-[#1A1F36] leading-snug truncate pr-1">
                    {display?.title ?? `${otherType}:${otherId}`}
                  </p>

                  {/* Date + time row */}
                  {(display?.date || display?.timeRange) && (
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {display.date && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#64748B]">
                          <Calendar size={9} strokeWidth={2.5} className="text-[#94A3B8]" />
                          {formatDate(display.date, lang)}
                        </span>
                      )}
                      {display.timeRange && (
                        <span className="text-[10px] text-[#94A3B8]">
                          {display.date ? '·' : ''} {display.timeRange}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Context label + relation */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {display?.contextLabel && (
                      <span className="text-[10px] text-[#94A3B8] truncate max-w-[100px]">
                        {display.contextLabel}
                      </span>
                    )}
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                      style={{ background: rc.bg, color: rc.text }}
                    >
                      {t(`links.relation.${link.relationType}` as Parameters<typeof t>[0], lang)}
                    </span>
                  </div>
                </div>

                {/* Actions — always visible */}
                <div className="flex-shrink-0 flex items-center gap-0.5 mt-0.5">
                  {/* Open → */}
                  <button
                    onClick={() => handleOpen(otherType, otherId)}
                    title={lang === 'en' ? 'Open' : 'Ava'}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#94A3B8] hover:text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors"
                  >
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                  </button>

                  {/* Remove × — always visible */}
                  <button
                    onClick={() => handleRemove(link.id)}
                    title={t('links.remove', lang)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#CBD5E1] hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Picker modal ── */}
      {pickerOpen && (
        <LinkPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          fromType={type}
          fromId={entityId}
          lang={lang}
        />
      )}
    </div>
  )
}
