import { CalendarDays, Plus, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { eventOccursOnDate, type MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface DayPreviewProps {
  selectedDate: Date
  events: MockCalendarEvent[]
  onOpenDay: () => void
  onCreateEvent: () => void
}

const MONTHS_ET_LOWER = [
  'jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni',
  'juuli', 'august', 'september', 'oktoober', 'november', 'detsember',
]
const MONTHS_EN_LOWER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDayLabel(d: Date, lang: AppLang): string {
  if (lang === 'en') return `${MONTHS_EN_LOWER[d.getMonth()]} ${d.getDate()}`
  return `${d.getDate()}. ${MONTHS_ET_LOWER[d.getMonth()]}`
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// All-day events carry no meaningful startTime (never a fake 00:00–23:59
// block) — sort them first, ahead of every timed event, instead of feeding
// an empty string into toMinutes().
function sortMinutes(evt: MockCalendarEvent): number {
  return evt.allDay ? -1 : toMinutes(evt.startTime)
}

export default function DayPreview({
  selectedDate,
  events,
  onOpenDay,
  onCreateEvent,
}: DayPreviewProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const dayEvents = [...events]
    .filter((evt) => eventOccursOnDate(evt, dateKey(selectedDate)))
    .sort((a, b) => sortMinutes(a) - sortMinutes(b))

  return (
    <div className="mt-4 p-3 rounded-lg border border-[#ECECF2] bg-[#FAFAFB]">
      {/* Date header */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <CalendarDays size={14} style={{ color: '#6F5AE8' }} />
        <span className="text-sm font-semibold text-[#1A1F36]">
          {formatDayLabel(selectedDate, lang)}
        </span>
      </div>

      {dayEvents.length > 0 ? (
        <>
          {/* Event list */}
          <div className="flex flex-col gap-1.5 mb-3">
            {dayEvents.map((evt) => (
              <div key={evt.id} className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: evt.color }}
                />
                <span className="text-[11px] text-[#64748B] font-medium tabular-nums w-10 flex-shrink-0">
                  {evt.allDay ? t('cal.allDay', lang) : evt.startTime}
                </span>
                <span className="text-[12px] text-[#1A1F36] font-medium truncate">
                  {evt.title}
                </span>
              </div>
            ))}
          </div>

          {/* Open day button */}
          <button
            onClick={onOpenDay}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[12px] font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4BD1] transition-colors"
          >
            {t('cal.openDay', lang)}
            <ChevronRight size={13} />
          </button>
        </>
      ) : (
        <>
          <p className="text-[12px] text-[#94A3B8] mb-3">
            {t('cal.noEventsDay', lang)}
          </p>

          <button
            onClick={onCreateEvent}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[12px] font-medium text-[#6F5AE8] bg-white border border-[#ECECF2] hover:bg-[#F8F7F4] transition-colors"
          >
            <Plus size={13} />
            {t('cal.newEvent', lang)}
          </button>
        </>
      )}
    </div>
  )
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
