import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { UserPreferences } from '@/types'
import {
  getMonthMatrix,
  isToday,
  isSameMonth,
  WEEKDAYS_ET,
  WEEKDAYS_ET_FULL,
} from '@/lib/calendar/dateUtils'

interface MonthViewProps {
  currentMonth: Date
  events: MockCalendarEvent[]
  preferences: UserPreferences
  onEventClick?: (id: string) => void
  onDayClick?: (date: Date) => void
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MonthView({
  currentMonth,
  events,
  preferences,
  onEventClick,
  onDayClick,
}: MonthViewProps) {
  const weeks = getMonthMatrix(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    preferences.startOfWeek,
  )

  const eventsByDate = new Map<string, MockCalendarEvent[]>()
  for (const evt of events) {
    const list = eventsByDate.get(evt.date) ?? []
    list.push(evt)
    eventsByDate.set(evt.date, list)
  }

  return (
    <div className="flex flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[#EBEBEB]" style={{ height: '40px' }}>
        {WEEKDAYS_ET_FULL.map((wd, i) => (
          <div
            key={wd}
            className={`flex items-center justify-center text-[11px] font-medium text-[#374151] ${
              i < 6 ? 'border-r border-[#F0F0F0]' : ''
            }`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-rows-6" style={{ minHeight: '420px' }}>
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7" style={{ minHeight: '70px' }}>
            {week.map((day, dayIdx) => {
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              const dayEvents = (eventsByDate.get(dateKey(day)) ?? []).slice(0, 3)

              return (
                <div
                  key={dayIdx}
                  className={`flex flex-col gap-1 px-1.5 py-1 cursor-pointer ${
                    dayIdx < 6 ? 'border-r border-[#F0F0F0]' : ''
                  } ${weekIdx < 5 ? 'border-b border-[#F0F0F0]' : ''} ${
                    inMonth ? 'bg-white' : 'bg-[#FAFAFB]'
                  } hover:bg-[#F8F7F4] transition-colors`}
                  onClick={() => onDayClick?.(day)}
                >
                  <div className="flex items-center justify-end">
                    <span
                      className={`text-xs font-medium flex items-center justify-center w-6 h-6 rounded-full ${
                        today
                          ? 'bg-[#6F5AE8] text-white font-bold'
                          : inMonth
                            ? 'text-[#1A1F36]'
                            : 'text-[#C4C9D4]'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.map((evt) => (
                      <div
                        key={evt.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(evt.id)
                        }}
                        className="rounded px-1 py-0.5 text-[10px] font-medium text-[#1A1F36] truncate"
                        style={{ backgroundColor: evt.color }}
                      >
                        {evt.allDay ? evt.title : `${evt.startTime} ${evt.title}`}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export { WEEKDAYS_ET }
