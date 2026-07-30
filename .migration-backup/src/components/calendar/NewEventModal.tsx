import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

interface NewEventModalProps {
  open: boolean
  onClose: () => void
  onSave: (event: MockCalendarEvent) => void
  defaultDate?: Date
  calendars: { id: string; label: string; color: string }[]
}

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Ei kordu' },
  { value: 'daily', label: 'Iga päev' },
  { value: 'weekly', label: 'Iga nädal' },
  { value: 'monthly', label: 'Iga kuu' },
  { value: 'yearly', label: 'Iga aasta' },
] as const

type Recurrence = typeof RECURRENCE_OPTIONS[number]['value']

function toDateInput(d?: Date): string {
  const date = d ?? new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function NewEventModal({ open, onClose, onSave, defaultDate, calendars }: NewEventModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(toDateInput(defaultDate))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setDate(toDateInput(defaultDate))
      setStartTime('09:00')
      setEndTime('10:00')
      setAllDay(false)
      setCalendarId(calendars[0]?.id ?? '')
      setRecurrence('none')
      setError('')
    }
  }, [open, defaultDate, calendars])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    if (!title.trim()) {
      setError('Pealkiri on kohustuslik.')
      return
    }
    if (!date) {
      setError('Kuupäev on kohustuslik.')
      return
    }
    const cal = calendars.find((c) => c.id === calendarId) ?? calendars[0]
    const baseEvent: MockCalendarEvent = {
      id: `evt-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      date,
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? '23:59' : endTime,
      color: cal?.color ?? '#EDE9FB',
      allDay,
    }
    onSave(baseEvent)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB]">
          <h2 className="text-lg font-semibold text-[#1A1F36]">Uus sündmus</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Pealkiri <span className="text-[#EF4444]">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sündmuse pealkiri"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kirjeldus</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lisainfo (valikuline)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kuupäev <span className="text-[#EF4444]">*</span></label>
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
            <span className="text-sm text-[#1A1F36]">Terve päeva sündmus</span>
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Algusaeg</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Lõpuaeg</label>
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kalender</label>
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kordus</label>
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

          {error && (
            <p className="text-sm text-[#EF4444]">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#EBEBEB]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            Tühista
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors"
          >
            Salvesta
          </button>
        </div>
      </div>
    </div>
  )
}
