import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { t } from '@/lib/translations'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'

interface NewEventModalProps {
  open: boolean
  onClose: () => void
  onSave: (event: MockCalendarEvent) => void
  defaultDate?: Date
  calendars: { id: string; label: string; color: string }[]
  /** When provided the modal opens in edit mode pre-filled with this event */
  initialEvent?: MockCalendarEvent
}

type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

function toDateInput(d?: Date): string {
  const date = d ?? new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function NewEventModal({
  open, onClose, onSave, defaultDate, calendars, initialEvent,
}: NewEventModalProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const isEdit = Boolean(initialEvent)

  const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
    { value: 'none',    label: t('cal.recur.none',    lang) },
    { value: 'daily',   label: t('cal.recur.daily',   lang) },
    { value: 'weekly',  label: t('cal.recur.weekly',  lang) },
    { value: 'monthly', label: t('cal.recur.monthly', lang) },
    { value: 'yearly',  label: t('cal.recur.yearly',  lang) },
  ]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(toDateInput(defaultDate))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [error, setError] = useState('')

  // Reset / pre-fill whenever the modal opens or the target event changes
  useEffect(() => {
    if (open) {
      setTitle(initialEvent?.title ?? '')
      setDescription(initialEvent?.description ?? '')
      setLocation(initialEvent?.location ?? '')
      setDate(initialEvent?.date ?? toDateInput(defaultDate))
      setStartTime(initialEvent?.startTime ?? '09:00')
      setEndTime(initialEvent?.endTime ?? '10:00')
      setAllDay(initialEvent?.allDay ?? false)
      setCalendarId(initialEvent?.calendarId ?? calendars[0]?.id ?? '')
      setRecurrence('none')
      setError('')
    }
  }, [open, initialEvent, defaultDate, calendars])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    if (!title.trim()) { setError(t('cal.event.error.title', lang)); return }
    if (!date) { setError(t('cal.event.error.date', lang)); return }
    const cal = calendars.find((c) => c.id === calendarId) ?? calendars[0]
    const event: MockCalendarEvent = {
      id: initialEvent?.id ?? `evt-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      date,
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? '23:59' : endTime,
      color: cal?.color ?? '#EDE9FB',
      calendarId: cal?.id ?? calendarId,
      allDay,
    }
    onSave(event)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB] flex-shrink-0">
          <h2 id="event-modal-title" className="text-lg font-semibold text-[#1A1F36]">
            {isEdit ? t('cal.event.editTitle', lang) : t('cal.event.addTitle', lang)}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.title', lang)} <span className="text-[#EF4444]">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('cal.event.titlePlaceholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.desc', lang)}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('cal.event.descPlaceholder', lang)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.location', lang)}</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('cal.event.locationPlaceholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.date', lang)} <span className="text-[#EF4444]">*</span></label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded accent-[#6F5AE8]"
            />
            <span className="text-sm text-[#1A1F36]">{t('cal.event.allDay', lang)}</span>
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.startTime', lang)}</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.endTime', lang)}</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.calendar', lang)}</label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('cal.event.recurrence', lang)}</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#EBEBEB] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {t('cal.action.cancel', lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors"
          >
            {t('cal.event.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
