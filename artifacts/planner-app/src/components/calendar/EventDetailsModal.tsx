import { X, Calendar, Clock, MapPin, AlignLeft, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { t } from '@/lib/translations'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'

interface Props {
  event: MockCalendarEvent | null
  onClose: () => void
  onEdit: () => void
  onDelete: (id: string) => void
  calendars: { id: string; label: string; color: string }[]
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

export default function EventDetailsModal({ event, onClose, onEdit, onDelete, calendars }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  if (!event) return null

  const cal = calendars.find((c) => c.id === event.calendarId)

  const handleDelete = () => {
    onDelete(event.id)
    onClose()
  }

  const timeLabel = event.allDay
    ? t('cal.allDay', lang)
    : `${event.startTime} – ${event.endTime}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colour bar + header */}
        <div
          className="flex items-start justify-between px-5 pt-5 pb-4"
          style={{ borderBottom: `3px solid ${event.color ?? '#6F5AE8'}` }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-base font-semibold text-[#1A1F36] leading-snug">{event.title}</p>
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
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Detail rows */}
        <div className="px-5 py-4 flex flex-col gap-3">
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

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#EBEBEB]">
          <button
            onClick={handleDelete}
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
  )
}
