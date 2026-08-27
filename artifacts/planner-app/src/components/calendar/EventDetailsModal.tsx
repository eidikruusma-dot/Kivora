import { X, Calendar, Clock, MapPin, AlignLeft, Pencil, Trash2 } from 'lucide-react'
import LinkedItemsPanel from '@/components/links/LinkedItemsPanel'
import { Fragment, useEffect, useState } from 'react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { t } from '@/lib/translations'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import type { TimeFormat } from '@/types'
import { formatTimeRange } from '@/lib/calendar/dateUtils'

interface Props {
  event: MockCalendarEvent | null
  onClose: () => void
  onEdit: () => void
  onDelete: (id: string) => void | Promise<void>
  calendars: { id: string; label: string; color: string }[]
  timeFormat?: TimeFormat
}

const ET_MONTHS = [
  'jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni',
  'juuli', 'august', 'september', 'oktoober', 'november', 'detsember',
]

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(dateStr: string, lang: AppLang): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (lang === 'en') {
    return `${EN_MONTHS[m - 1]} ${d}, ${y}`
  }
  return `${d}. ${ET_MONTHS[m - 1]} ${y}`
}

export default function EventDetailsModal({ event, onClose, onEdit, onDelete, calendars, timeFormat = '24h' }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Delete confirmation — reuses the same inline pattern as TasksPage/
  // HabitsPage/NotesPage (a `deleteRequested` flag opened by the Trash
  // button, a `deleting` re-entrancy guard, its own overlay dialog). Reset
  // whenever the displayed event changes so a stale confirmation from a
  // previous event can never carry over.
  const [deleteRequested, setDeleteRequested] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    setDeleteRequested(false)
    setDeleting(false)
  }, [event?.id])

  if (!event) return null

  const cal = calendars.find((c) => c.id === event.calendarId)

  // The Trash button only opens the confirmation — it never deletes.
  const handleRequestDelete = () => setDeleteRequested(true)

  const handleCancelDelete = () => {
    if (deleting) return
    setDeleteRequested(false)
  }

  // Sole caller of onDelete, guarded against a second click while the first
  // delete is still in flight.
  const handleConfirmDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await onDelete(event.id)
    } finally {
      setDeleting(false)
      setDeleteRequested(false)
      onClose()
    }
  }

  const timeLabel = event.allDay
    ? t('cal.allDay', lang)
    : formatTimeRange(event.startTime, event.endTime, timeFormat)

  return (
    <Fragment>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
          className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[90dvh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Colour bar + header */}
          <div
            className="flex items-start justify-between px-5 pt-5 pb-4 flex-shrink-0"
            style={{ borderBottom: `3px solid ${event.color ?? '#6F5AE8'}` }}
          >
            <div className="flex-1 min-w-0 pr-3">
              <p id="event-detail-title" className="text-base font-semibold text-[#1A1F36] leading-snug">{event.title}</p>
              {cal && (
                <span
                  className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ background: cal.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  {cal.label}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Detail rows */}
          <div className="px-5 py-4 flex flex-col gap-3 flex-1 overflow-y-auto">
            {/* Date */}
            <div className="flex items-start gap-3">
              <Calendar size={15} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
              <span className="text-sm text-[#1A1F36]">{formatDate(event.date, lang)}</span>
            </div>

            {/* Time */}
            <div className="flex items-start gap-3">
              <Clock size={15} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
              <span className="text-sm text-[#1A1F36]">{timeLabel}</span>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
                <span className="text-sm text-[#1A1F36]">{event.location}</span>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="flex items-start gap-3">
                <AlignLeft size={15} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-[#64748B] leading-relaxed">{event.description}</p>
              </div>
            )}
          </div>

          {/* Linked items */}
          <LinkedItemsPanel type="calendar" entityId={event.id} lang={lang} className="px-5 pb-2" />

          {/* Actions */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-[#EBEBEB]">
            <button
              onClick={handleRequestDelete}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              {t('cal.action.delete', lang)}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {t('cal.action.close', lang)}
              </button>
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors"
              >
                <Pencil size={13} />
                {t('cal.action.edit', lang)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation — reuses the same inline pattern as TasksPage/HabitsPage/NotesPage */}
      {deleteRequested && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={handleCancelDelete}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-event-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-3">
                <Trash2 size={20} className="text-[#E11D48]" />
              </div>
              <h3 id="delete-event-title" className="text-base font-semibold text-[#1A1F36] mb-1">
                {t('cal.deleteConfirm.title', lang)}
              </h3>
              <p className="text-sm text-[#64748B]">
                {t('cal.deleteConfirm.body', lang)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={handleCancelDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('cal.deleteConfirm.cancel', lang)}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm disabled:opacity-50"
              >
                {t('cal.deleteConfirm.confirm', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  )
}
