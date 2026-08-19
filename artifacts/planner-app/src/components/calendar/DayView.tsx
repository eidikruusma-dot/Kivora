import DayColumn from './DayColumn'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { UserPreferences } from '@/types'
import { getEventsForDate } from '@/lib/calendar/eventLayout'
import { WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL, formatEventTime } from '@/lib/calendar/dateUtils'
import { useState, useEffect } from 'react'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'

interface DayViewProps {
  date: Date
  events: MockCalendarEvent[]
  preferences: UserPreferences
  onEventClick?: (id: string) => void
  onSlotClick?: (date: Date) => void
}

const START_HOUR = 0
const END_HOUR = 22
const HOUR_HEIGHT = 48
const TIME_GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

const LABELED_HOURS = [0, 6, 8, 10, 12, 14, 16, 18, 20, 22]

export default function DayView({
  date,
  events,
  preferences,
  onEventClick,
  onSlotClick,
}: DayViewProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const dayEvents = getEventsForDate(events, date)
  const allDayEvents = dayEvents.filter(e => e.allDay)
  const totalRange = END_HOUR - START_HOUR

  function urgencyLabel(dateStr: string): string | null {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(dateStr + 'T00:00:00')
    const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
    if (diff < 0)   return lang === 'et' ? 'Tähtaeg möödas' : 'Overdue'
    if (diff === 0) return lang === 'et' ? 'Täna' : 'Due today'
    if (diff === 1) return lang === 'et' ? 'Homme' : 'Due tomorrow'
    return null
  }
  const weekday = (lang === 'en' ? WEEKDAYS_EN_FULL : WEEKDAYS_ET_FULL)[(date.getDay() + 6) % 7]
  const dateLabel = `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="flex flex-col">
      {/* Day header */}
      <div
        className="grid flex-shrink-0 border-b border-[#EBEBEB]"
        style={{
          height: '48px',
          gridTemplateColumns: '56px minmax(0, 1fr)',
        }}
      >
        <div />
        <div className="flex flex-col items-start justify-center gap-0.5">
          <span className="text-[11px] font-medium text-[#374151] leading-none">{weekday}</span>
          <span className="text-sm font-bold leading-none text-[#1A1F36]">{dateLabel}</span>
        </div>
      </div>

      {/* All-day / date-only event row */}
      {allDayEvents.length > 0 && (
        <div
          className="grid flex-shrink-0 border-b border-[#EBEBEB] bg-white"
          style={{ gridTemplateColumns: '56px minmax(0, 1fr)' }}
        >
          <div className="flex items-start justify-end pr-2 pt-1.5">
            <span className="text-[9px] font-medium text-[#94A3B8] uppercase tracking-wide leading-none">
              {lang === 'et' ? 'kogu päev' : 'all‑day'}
            </span>
          </div>
          <div className="py-1 px-1 flex flex-col gap-0.5">
            {allDayEvents.map(evt => {
              const urgency = urgencyLabel(evt.date)
              return (
                <button
                  key={evt.id}
                  onClick={() => onEventClick?.(evt.id)}
                  className="w-full text-left rounded-md px-1.5 py-0.5 flex flex-col gap-0 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: evt.color + '22', borderLeft: `3px solid ${evt.color}` }}
                >
                  <span
                    className="text-[12px] font-semibold leading-tight truncate"
                    style={{ color: evt.color }}
                  >
                    {evt.title}
                  </span>
                  {urgency && (
                    <span className="text-[10px] leading-tight" style={{ color: evt.color + 'BB' }}>
                      {urgency}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div>
        <div
          className="flex"
          style={{ height: `${TIME_GRID_HEIGHT}px`, minHeight: `${TIME_GRID_HEIGHT}px` }}
        >
          <div className="w-14 flex-shrink-0 h-full relative bg-white">
            {LABELED_HOURS.map((hour) => (
              <div
                key={hour}
                className={`absolute right-2 text-[10px] text-[#94A3B8] font-medium ${
                  hour === START_HOUR
                    ? ''
                    : hour === END_HOUR
                      ? '-translate-y-full'
                      : '-translate-y-1/2'
                }`}
                style={{ top: `${((hour - START_HOUR) / totalRange) * 100}%` }}
              >
                {formatEventTime(`${String(hour).padStart(2, '0')}:00`, preferences.timeFormat)}
              </div>
            ))}
          </div>

          <div className="flex flex-1 h-full">
            <div className="flex-1 min-w-0 h-full">
              <DayColumn
                date={date}
                events={dayEvents}
                timeFormat={preferences.timeFormat}
                onEventClick={onEventClick}
                onSlotClick={onSlotClick}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
