import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { UserPreferences } from '@/types'
import { MONTHS_ET, WEEKDAYS_ET_FULL } from '@/lib/calendar/dateUtils'

interface AgendaViewProps {
  events: MockCalendarEvent[]
  preferences: UserPreferences
  startDate?: Date
  onEventClick?: (id: string) => void
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function formatDateHeader(d: Date): string {
  const weekday = WEEKDAYS_ET_FULL[(d.getDay() + 6) % 7]
  const day = d.getDate()
  const month = MONTHS_ET[d.getMonth()].toLowerCase()
  const year = d.getFullYear()
  return `${weekday}, ${day}. ${month} ${year}`
}

function formatTimeLabel(startTime: string, endTime: string, allDay: boolean): string {
  if (allDay) return 'Kogu päev'
  return `${startTime} – ${endTime}`
}

export default function AgendaView({ events, startDate, onEventClick }: AgendaViewProps) {
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
        <div className="px-5 py-10 text-center text-sm text-[#94A3B8]">
          Sündmusi ei leitud.
        </div>
      )}
      {entries.map(([date, dayEvents]) => {
        const [y, m, d] = date.split('-').map(Number)
        const dateObj = new Date(y, m - 1, d)

        return (
          <div key={date} className="border-b border-[#F0F0F0] last:border-b-0">
            <div className="px-5 py-2.5 bg-[#FAFAFB] sticky top-0 z-10">
              <span className="text-xs font-semibold text-[#374151]">
                {formatDateHeader(dateObj)}
              </span>
            </div>
            <div className="flex flex-col">
              {dayEvents.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => onEventClick?.(evt.id)}
                  className="flex items-stretch gap-3 px-5 py-2.5 text-left hover:bg-[#F8F7F4] transition-colors"
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
                      {formatTimeLabel(evt.startTime, evt.endTime, !!evt.allDay)}
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
