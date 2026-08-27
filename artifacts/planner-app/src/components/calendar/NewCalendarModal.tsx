import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { t } from '@/lib/translations'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import type { UserCalendar } from '@/lib/userCalendarsStore'

interface NewCalendarModalProps {
  open: boolean
  onClose: () => void
  onSave: (calendar: UserCalendar) => void
}

// Same supported swatch palette already used by the habit-creation color
// picker (HabitsPage.tsx's COLOR_OPTIONS) — reused here rather than
// inventing a second palette.
const CALENDAR_COLOR_OPTIONS = [
  '#6F5AE8',
  '#16A34A',
  '#2563EB',
  '#CA8A04',
  '#0D9488',
  '#DC2626',
  '#F97316',
  '#64748B',
]

export default function NewCalendarModal({ open, onClose, onSave }: NewCalendarModalProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [name, setName] = useState('')
  const [color, setColor] = useState(CALENDAR_COLOR_OPTIONS[0])
  const [error, setError] = useState('')

  // Reset whenever the modal opens.
  useEffect(() => {
    if (open) {
      setName('')
      setColor(CALENDAR_COLOR_OPTIONS[0])
      setError('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    if (!name.trim()) { setError(t('cal.calendarModal.error.name', lang)); return }
    const calendar: UserCalendar = {
      id: `cal-${Date.now()}`,
      label: name.trim(),
      color,
    }
    onSave(calendar)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-calendar-modal-title"
        className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB] flex-shrink-0">
          <h2 id="new-calendar-modal-title" className="text-lg font-semibold text-[#1A1F36]">
            {t('cal.calendarModal.addTitle', lang)}
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('cal.calendarModal.name', lang)} <span className="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('cal.calendarModal.namePlaceholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('cal.calendarModal.color', lang)}
            </label>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-offset-2 ring-[#1A1F36] scale-110' : 'hover:scale-110'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
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
