import { useState, useEffect } from 'react'
import { CalendarPlus } from 'lucide-react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { UserPreferences } from '@/types'
import { MONTHS_ET, MONTHS_EN, WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL, formatTimeRange } from '@/lib/calendar/dateUtils'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface AgendaViewProps {
  events: MockCalendarEvent[]
  preferences: UserPreferences
  startDate?: Date
  onEventClick?: (id: string) => void
  onCreateEvent?: () => void
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function formatDateHeader(d: Date, lang: AppLang): string {
  const weekday = (lang === 'en' ? WEEKDAYS_EN_FULL : WEEKDAYS_ET_FULL)[(d.getDay() + 6) % 7]
  const day = d.getDate()
  const year = d.getFullYear()
  if (lang === 'en') {
    const month = MONTHS_EN[d.getMonth()]
    return `${weekday}, ${month} ${day}, ${year}`
  }
  const month = MONTHS_ET[d.getMonth()].toLowerCase()
  return `${weekday}, ${day}. ${month} ${year}`
}

export default function AgendaView({ events, preferences, startDate, onEventClick, onCreateEvent }: AgendaViewProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const allDayText = t('cal.allDay', lang)
  const startKey = startDate
    ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
    : null

  const filtered = startKey ? events.filter((evt) => evt.date >= startKey) : events

  const sorted = [...filtered].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return toMinutes(a.startTime) - toMinutes(b.startTime)
  })

  const groups = new Map<string, MockCalendarEvent[]>()
  for (const evt of sorted) {
    const list = groups.get(evt.date) ?? []
    list.push(evt)
    groups.set(evt.date, list)
  }

  const entries = Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))

  return (
    <div className="flex flex-col">
      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center">
            <CalendarPlus size={20} className="text-[#94A3B8]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#1A1F36]">
              {lang === 'et' ? 'Ühtegi sündmust pole' : 'No upcoming events'}
            </p>
            <p className="text-xs text-[#94A3B8] mt-1">
              {lang === 'et' ? 'Sinu agenda on hetkel tühi.' : 'Your agenda is clear.'}
            </p>
          </div>
          {onCreateEvent && (
            <button
              onClick={onCreateEvent}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            >
              <CalendarPlus size={14} />
              {lang === 'et' ? 'Lisa sündmus' : 'Add event'}
            </button>
          )}
        </div>
      )}
      {entries.map(([date, dayEvents]) => {
        const [y, m, d] = date.split('-').map(Number)
        const dateObj = new Date(y, m - 1, d)

        return (
          <div key={date} className="border-b border-[#F0F0F0] last:border-b-0">
            <div className="px-5 py-2.5 bg-[#FAFAFB] sticky top-0 z-10 agenda-date-header">
              <span className="text-xs font-semibold text-[#374151]">
                {formatDateHeader(dateObj, lang)}
              </span>
            </div>
            <div className="flex flex-col">
              {dayEvents.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => onEventClick?.(evt.id)}
                  className="flex items-stretch gap-3 px-5 py-2.5 text-left hover:bg-[#F8F7F4] transition-colors agenda-event-row"
                >
                  <div
                    className="w-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: evt.color }}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#1A1F36] truncate">
                      {evt.title}
                    </span>
                    <span className="text-xs text-[#94A3B8]">
                      {evt.allDay ? allDayText : formatTimeRange(evt.startTime, evt.endTime, preferences.timeFormat)}
                    </span>
                    {evt.description && (
                      <span className="text-xs text-[#64748B] mt-0.5 truncate">
                        {evt.description}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
