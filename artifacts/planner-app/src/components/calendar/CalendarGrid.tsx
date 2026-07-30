import DayColumn from './DayColumn'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { TimeFormat } from '@/types'
import { isToday, isSameDay, WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL } from '@/lib/calendar/dateUtils'
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

interface AllDaySpan {
  title: string
  color: string
  firstCol: number
  lastCol: number
}

function computeAllDaySpans(
  days: Date[],
  eventsByDay: MockCalendarEvent[][],
): AllDaySpan[] {
  const map: Record<string, AllDaySpan> = {}

  days.forEach((_, col) => {
    const dayAllDay = (eventsByDay[col] || []).filter((event) => event.allDay)

    dayAllDay.forEach((event) => {
      if (map[event.title]) {
        map[event.title].lastCol = col
      } else {
        map[event.title] = {
          title: event.title,
          color: event.color,
          firstCol: col,
          lastCol: col,
        }
      }
    })
  })

  return Object.values(map)
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
  const allDaySpans = computeAllDaySpans(days, eventsByDay)
  const hasAllDay = allDaySpans.length > 0

  return (
    <div className="flex flex-col">
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

      {/* All-day row */}
      {hasAllDay && (
        <div
          className="grid flex-shrink-0 bg-white border-b border-[#EBEBEB]"
          style={{
            height: '44px',
            gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))',
            gridTemplateRows: '1fr',
          }}
        >
          <div style={{ gridColumn: 1, gridRow: 1 }} />

          {days.map((day, index) => (
            <div
              key={`all-day-column-${day.toISOString()}`}
              className={index < 6 ? 'border-r border-[#F0F0F0]' : ''}
              style={{
                gridColumn: index + 2,
                gridRow: 1,
              }}
            />
          ))}

          {allDaySpans.map((span) => (
            <div
              key={span.title}
              className="rounded-md flex items-center px-2"
              style={{
                gridColumn: `${span.firstCol + 2} / ${span.lastCol + 3}`,
                gridRow: 1,
                height: '22px',
                alignSelf: 'center',
                backgroundColor: span.color,
              }}
            >
              <span className="text-[11px] font-medium text-[#0F766E] truncate">
                {span.title}
              </span>
            </div>
          ))}
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
                {`${String(hour).padStart(2, '0')}:00`}
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