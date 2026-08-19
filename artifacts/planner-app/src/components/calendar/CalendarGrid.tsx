import DayColumn from './DayColumn'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { TimeFormat } from '@/types'
import { isToday, isSameDay, WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL, formatEventTime } from '@/lib/calendar/dateUtils'
import { useState, useEffect } from 'react'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'

interface CalendarGridProps {
  days: Date[]
  eventsByDay: MockCalendarEvent[][]
  timeFormat: TimeFormat
  selectedDate?: Date
  onEventClick?: (id: string) => void
  onSlotClick?: (date: Date) => void
  onDayClick?: (date: Date) => void
}

const START_HOUR = 0
const END_HOUR = 22
const HOUR_HEIGHT = 48
const TIME_GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

const LABELED_HOURS = [0, 6, 8, 10, 12, 14, 16, 18, 20, 22]

/** Return "Due today" / "Overdue" etc. for an all-day event, or null if nothing urgent. */
function allDayUrgency(dateStr: string, lang: AppLang): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)  return lang === 'et' ? 'Tähtaeg möödas' : 'Overdue'
  if (diff === 0) return lang === 'et' ? 'Täna' : 'Due today'
  if (diff === 1) return lang === 'et' ? 'Homme' : 'Due tomorrow'
  return null
}

export default function CalendarGrid({
  days,
  eventsByDay,
  timeFormat,
  selectedDate,
  onEventClick,
  onSlotClick,
  onDayClick,
}: CalendarGridProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const totalRange = END_HOUR - START_HOUR
  const hasAllDay = eventsByDay.some(dayEvts => dayEvts.some(e => e.allDay))

  return (
    // min-w ensures the 7-column week grid is never crushed — the parent overflow-x-auto handles scroll
    <div className="flex flex-col min-w-[540px]">
      {/* Day headers */}
      <div
        className="grid flex-shrink-0 border-b border-[#EBEBEB]"
        style={{
          height: '48px',
          gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))',
        }}
      >
        <div />

        {days.map((day, index) => {
          const today = isToday(day)
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const weekday = (lang === 'en' ? WEEKDAYS_EN_FULL : WEEKDAYS_ET_FULL)[(day.getDay() + 6) % 7]
          const dateLabel = `${day.getDate()}.${String(day.getMonth() + 1).padStart(2, '0')}`

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick?.(day)}
              className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                index < 6 ? 'border-r border-[#F0F0F0]' : ''
              } hover:bg-[#F8F7F4]`}
            >
              <span className="text-[11px] font-medium text-[#374151] leading-none">
                {weekday}
              </span>

              <span
                className={`text-sm font-bold leading-none flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                  today
                    ? 'bg-[#6F5AE8] text-white'
                    : isSelected
                      ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                      : 'text-[#1A1F36]'
                }`}
              >
                {dateLabel}
              </span>
            </button>
          )
        })}
      </div>

      {/* All-day / date-only event row */}
      {hasAllDay && (
        <div
          className="grid flex-shrink-0 bg-white border-b border-[#EBEBEB]"
          style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}
        >
          {/* "all-day" label */}
          <div className="flex items-start justify-end pr-2 pt-1.5">
            <span className="text-[9px] font-medium text-[#94A3B8] uppercase tracking-wide leading-none">
              {lang === 'et' ? 'kogu päev' : 'all‑day'}
            </span>
          </div>

          {/* Per-day columns */}
          {days.map((day, index) => {
            const dayAllDay = (eventsByDay[index] || []).filter(e => e.allDay)
            return (
              <div
                key={`alld-${day.toISOString()}`}
                className={`py-1 px-1 flex flex-col gap-0.5 min-h-[28px] ${index < 6 ? 'border-r border-[#F0F0F0]' : ''}`}
              >
                {dayAllDay.map(evt => {
                  const urgency = allDayUrgency(evt.date, lang)
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEventClick?.(evt.id)}
                      className="w-full text-left rounded-md px-1.5 py-0.5 flex flex-col gap-0 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: evt.color + '22', borderLeft: `3px solid ${evt.color}` }}
                    >
                      <span
                        className="text-[11px] font-semibold leading-tight truncate"
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
            )
          })}
        </div>
      )}

      {/* Time grid */}
      <div>
        <div
          className="flex"
          style={{
            height: `${TIME_GRID_HEIGHT}px`,
            minHeight: `${TIME_GRID_HEIGHT}px`,
          }}
        >
          {/* Shared time-label column */}
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
                style={{
                  top: `${((hour - START_HOUR) / totalRange) * 100}%`,
                }}
              >
                {formatEventTime(`${String(hour).padStart(2, '0')}:00`, timeFormat)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex flex-1 h-full">
            {days.map((day, index) => (
              <div
                key={day.toISOString()}
                className={`flex-1 min-w-0 h-full ${
                  index < 6 ? 'border-r border-[#F0F0F0]' : ''
                }`}
              >
                <DayColumn
                  date={day}
                  events={eventsByDay[index] || []}
                  timeFormat={timeFormat}
                  onEventClick={onEventClick}
                  onSlotClick={onSlotClick}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}