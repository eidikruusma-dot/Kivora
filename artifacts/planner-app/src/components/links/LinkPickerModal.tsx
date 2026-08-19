/**
 * LinkPickerModal.tsx
 *
 * Modal for picking an item to link to and choosing a relation type.
 * Handles the special Calendar flow:
 *   • "Create event & link" — creates a calendar event then adds a link
 *   • "Link to existing event" — picks from existing calendar events
 *
 * Duplicate prevention: if a `scheduled` link to any calendar event
 * already exists for this entity, a warning is shown instead of the
 * create option.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  X, Search, CheckCircle2, CalendarPlus, Calendar, Link2, AlertCircle,
} from 'lucide-react'
import { useTasks, getAllTasks } from '@/lib/tasksStore'
import { useNotes, getAllNotes } from '@/lib/quickNotesStore'
import { useGoals, getAllGoals } from '@/lib/goalsStore'
import { useHabits, getAllHabits } from '@/lib/habitsStore'
import { useCalendarEvents } from '@/lib/calendarStore'
import { useSchoolTasks, useSchoolExams } from '@/lib/schoolStore'
import { addLink, hasCalendarLink } from '@/lib/entityLinksStore'
import { addCalendarEvent } from '@/lib/calendarStore'
import {
  useChats,
  getAllChats,
} from '@/lib/aiConversationsStore'
import type { EntityType, RelationType } from '@/types/entityLinks'
import { encodeSchoolId } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ── Allowed targets per source type ──────────────────────────────────────────

const ALLOWED_TARGETS: Record<EntityType, EntityType[]> = {
  task:     ['calendar', 'note', 'goal', 'habit', 'school', 'ai'],
  note:     ['task', 'calendar', 'goal', 'habit', 'school', 'ai'],
  habit:    ['goal', 'calendar', 'note', 'task', 'school', 'ai'],
  goal:     ['task', 'habit', 'note', 'calendar', 'school', 'ai'],
  school:   ['calendar', 'note', 'task', 'goal', 'habit', 'ai'],
  calendar: ['task', 'note', 'habit', 'goal', 'school', 'ai'],
  ai:       ['task', 'note', 'goal', 'habit', 'calendar', 'school'],
}

// Default relation type per target
const DEFAULT_RELATION: Partial<Record<EntityType, RelationType>> = {
  calendar: 'scheduled',
  goal:     'supports',
  habit:    'supports',
}

// ── Relation options ──────────────────────────────────────────────────────────

const RELATIONS: RelationType[] = ['related', 'scheduled', 'supports', 'createdFrom', 'belongsTo']

// ── Pickable item shape ───────────────────────────────────────────────────────

interface PickItem {
  id: string
  title: string
  subtitle?: string
  bg: string
  color: string
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  fromType: EntityType
  fromId: string
  lang: AppLang
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
        active
          ? 'bg-[#6F5AE8] text-white'
          : 'text-[#64748B] hover:bg-[#F1F5F9]'
      }`}
    >
      {label}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LinkPickerModal({ open, onClose, fromType, fromId, lang }: Props) {
  const tasks         = useTasks()
  const notes         = useNotes()
  const goals         = useGoals()
  const habits        = useHabits()
  const aiChats       = useChats()
  const calEvents     = useCalendarEvents()
  const schoolTasks   = useSchoolTasks()
  const schoolExams   = useSchoolExams()

  const allowedTargets = ALLOWED_TARGETS[fromType] ?? []
  const [activeTarget, setActiveTarget] = useState<EntityType>(allowedTargets[0] ?? 'task')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<PickItem | null>(null)
  const [relation, setRelation] = useState<RelationType>(
    DEFAULT_RELATION[allowedTargets[0] ?? 'task'] ?? 'related',
  )
  const [done, setDone]   = useState(false)
  const [creating, setCreating] = useState(false)

  const alreadyHasCalendarLink = hasCalendarLink(fromType, fromId)

  // Reset when target tab changes
  useEffect(() => {
    setSelected(null)
    setSearch('')
    setRelation(DEFAULT_RELATION[activeTarget] ?? 'related')
  }, [activeTarget])

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setDone(false)
      setSelected(null)
      setSearch('')
      setActiveTarget(allowedTargets[0] ?? 'task')
      setRelation(DEFAULT_RELATION[allowedTargets[0] ?? 'task'] ?? 'related')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const TYPE_COLORS: Record<EntityType, { bg: string; color: string }> = {
    task:     { bg: '#EDE9FB', color: '#6F5AE8' },
    calendar: { bg: '#DCFCE7', color: '#16A34A' },
    note:     { bg: '#FEF9C3', color: '#CA8A04' },
    habit:    { bg: '#FEE2E2', color: '#DC2626' },
    goal:     { bg: '#E0F2FE', color: '#0284C7' },
    school:   { bg: '#FEF3C7', color: '#D97706' },
    ai:       { bg: '#F3E8FF', color: '#9333EA' },
  }

  // Build the list of items for the active tab
  const items: PickItem[] = useMemo(() => {
    const q = search.toLowerCase()
    const colors = TYPE_COLORS[activeTarget]

    switch (activeTarget) {
      case 'task':
        return tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .map((t) => ({ id: t.id, title: t.title, subtitle: t.category, ...colors }))

      case 'note':
        return notes
          .filter((n) => n.title.toLowerCase().includes(q))
          .map((n) => ({ id: n.id, title: n.title, subtitle: n.folder, ...colors }))

      case 'goal':
        return goals
          .filter((g) => g.title.toLowerCase().includes(q))
          .map((g) => ({ id: g.id, title: g.title, subtitle: g.status, ...colors }))

      case 'calendar':
        return calEvents
          .filter((e) => e.title.toLowerCase().includes(q))
          .map((e) => ({ id: e.id, title: e.title, subtitle: e.date, ...colors }))

      case 'school': {
        const st = schoolTasks
          .filter((i) => i.title.toLowerCase().includes(q))
          .map((i) => ({
            id: encodeSchoolId('task', i.id),
            title: i.title,
            subtitle: i.subject,
            ...colors,
          }))
        const se = schoolExams
          .filter((i) => i.title.toLowerCase().includes(q))
          .map((i) => ({
            id: encodeSchoolId('exam', i.id),
            title: i.title,
            subtitle: i.subject,
            ...colors,
          }))
        return [...st, ...se]
      }

      case 'habit':
        return habits
          .filter((h) => h.title.toLowerCase().includes(q))
          .map((h) => ({ id: h.id, title: h.title, subtitle: h.category, ...colors }))

      case 'ai':
        return aiChats
          .filter((c) => c.title.toLowerCase().includes(q))
          .map((c) => ({ id: c.id, title: c.title, subtitle: undefined, ...colors }))

      default:
        return []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget, search, tasks, notes, goals, habits, aiChats, calEvents, schoolTasks, schoolExams])

  // ── Confirm link ────────────────────────────────────────────────────────────

  function confirm() {
    if (!selected) return
    addLink({
      fromType,
      fromId,
      toType: activeTarget,
      toId: selected.id,
      relationType: relation,
    })
    setDone(true)
    setTimeout(onClose, 800)
  }

  // ── Create calendar event & link ────────────────────────────────────────────

  async function createCalendarEventAndLink() {
    setCreating(true)
    try {
      // Resolve title, date, and time from the source entity
      let title = `${t('links.type.' + fromType as Parameters<typeof t>[0], lang)}`
      let eventDate = new Date().toISOString().slice(0, 10)
      let startTime = '09:00'
      let endTime = '10:00'

      if (fromType === 'task') {
        const src = getAllTasks().find((x) => x.id === fromId)
        if (src) {
          title = src.title
          if (src.date) eventDate = src.date
          if (src.time) {
            startTime = src.time
            const [h, m] = src.time.split(':').map(Number)
            const endH = (h + 1) % 24
            endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          }
        }
      } else if (fromType === 'note') {
        const src = getAllNotes().find((x) => x.id === fromId)
        if (src) title = src.title
      } else if (fromType === 'habit') {
        const src = getAllHabits().find((x) => x.id === fromId)
        if (src) title = src.title
      } else if (fromType === 'goal') {
        const src = getAllGoals().find((x) => x.id === fromId)
        if (src) title = src.title
      } else if (fromType === 'ai') {
        const src = getAllChats().find((x) => x.id === fromId)
        if (src) title = src.title
      }

      const eventId = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      await addCalendarEvent({
        id: eventId,
        title,
        date: eventDate,
        startTime,
        endTime,
        color: '#6F5AE8',
        calendarId: 'mine',
      })

      addLink({
        fromType,
        fromId,
        toType: 'calendar',
        toId: eventId,
        relationType: 'scheduled',
      })

      setDone(true)
      setTimeout(onClose, 800)
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-[#6F5AE8]" strokeWidth={2} />
            <span className="text-sm font-semibold text-[#1A1F36]">
              {t('links.picker.title', lang)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Done state */}
        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <CheckCircle2 size={40} className="text-green-500" strokeWidth={1.5} />
            <p className="text-sm font-medium text-[#1A1F36]">
              {t('links.alreadyLinked', lang)}
            </p>
          </div>
        ) : (
          <>
            {/* Target type tabs */}
            <div className="flex gap-1.5 px-5 py-3 border-b border-[#F0F0F0] overflow-x-auto">
              {allowedTargets.map((target) => (
                <TabButton
                  key={target}
                  active={activeTarget === target}
                  onClick={() => setActiveTarget(target)}
                  label={t(`links.type.${target}` as Parameters<typeof t>[0], lang)}
                />
              ))}
            </div>

            {/* Calendar special actions */}
            {activeTarget === 'calendar' && (
              <div className="px-5 pt-3 flex gap-2">
                {alreadyHasCalendarLink ? (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 w-full">
                    <AlertCircle size={13} strokeWidth={2} />
                    {t('links.calendarDuplicate', lang)}
                  </div>
                ) : (
                  <button
                    onClick={createCalendarEventAndLink}
                    disabled={creating}
                    className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors px-3 py-2 rounded-xl disabled:opacity-50"
                  >
                    <CalendarPlus size={13} strokeWidth={2} />
                    {creating ? '…' : t('links.createAndLink', lang)}
                  </button>
                )}
                <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                  <Calendar size={12} strokeWidth={2} />
                  {t('links.linkToEvent', lang)}:
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-5 pt-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('links.picker.search', lang)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#6F5AE8] bg-[#FAFAFA]"
                />
              </div>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
              {items.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-6">
                  {t('links.picker.empty', lang)}
                </p>
              ) : (
                items.map((item) => {
                  const isSelected = selected?.id === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelected(isSelected ? null : item)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-[#6F5AE8] bg-[#F4F2FF]'
                          : 'border-[#F0F0F0] bg-white hover:border-[#D1D5DB] hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-lg flex-shrink-0"
                        style={{ background: item.bg }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isSelected ? 'text-[#6F5AE8]' : 'text-[#1A1F36]'}`}>
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-[10px] text-[#94A3B8] truncate">{item.subtitle}</p>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle2 size={14} className="text-[#6F5AE8] flex-shrink-0" strokeWidth={2} />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Relation selector + confirm */}
            {selected && (
              <div className="px-5 py-4 border-t border-[#F0F0F0] space-y-3">
                <div>
                  <p className="text-[11px] font-medium text-[#64748B] mb-2">
                    {t('links.picker.selectRelation', lang)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {RELATIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setRelation(r)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                          relation === r
                            ? 'border-[#6F5AE8] bg-[#EDE9FB] text-[#6F5AE8]'
                            : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                        }`}
                      >
                        {t(`links.relation.${r}` as Parameters<typeof t>[0], lang)}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={confirm}
                  className="w-full h-10 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors"
                >
                  {t('links.picker.confirm', lang)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
