import EventCard from './EventCard'
import { layoutEvents } from '@/lib/calendar/eventLayout'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { TimeFormat } from '@/types'

interface TimeGridProps {
  date: Date
  events: MockCalendarEvent[]
  timeFormat: TimeFormat
  onEventClick?: (id: string) => void
  onSlotClick?: (date: Date) => void
}

const START_HOUR = 0
const END_HOUR = 22
// Mirrors the identical constant already duplicated in DayView.tsx and
// CalendarGrid.tsx — this is the fixed pixel height their TimeGrid is
// rendered at, needed here only to convert our %-based layout into an
// actual pixel height for EventCard's compact/stacked decision.
const HOUR_HEIGHT = 48
const TIME_GRID_HEIGHT_PX = (END_HOUR - START_HOUR) * HOUR_HEIGHT

export default function TimeGrid({
  date,
  events,
  timeFormat,
  onEventClick,
  onSlotClick,
}: TimeGridProps) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR)
  const positioned = layoutEvents(events, START_HOUR, END_HOUR)
  const showCurrentLine = isToday(date)

  const totalRange = END_HOUR - START_HOUR

  return (
    <div
      className="relative h-full"
      onClick={(e) => {
        if (e.target === e.currentTarget && onSlotClick) {
          const rect = e.currentTarget.getBoundingClientRect()
          const fraction = (e.clientY - rect.top) / rect.height
          const minutes = fraction * totalRange * 60 + START_HOUR * 60
          const clickedDate = new Date(date)
          clickedDate.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0)
          onSlotClick(clickedDate)
        }
      }}
    >
      {/* Hour grid lines */}
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-[#F0F0F0] hour-grid-line"
          style={{ top: `${((hour - START_HOUR) / totalRange) * 100}%` }}
        />
      ))}

      {/* Events */}
      {positioned.map(({ event, topFraction, heightFraction, leftPercent, widthPercent }) => (
        <div
          key={event.id}
          className="absolute overflow-hidden"
          style={{
            top: `${topFraction * 100}%`,
            height: `${heightFraction * 100}%`,
            minHeight: '14px',
            left: `calc(${leftPercent}% + 1px)`,
            width: `calc(${widthPercent}% - 2px)`,
          }}
        >
          <EventCard
            event={event}
            onClick={onEventClick}
            timeFormat={timeFormat}
            heightPx={heightFraction * TIME_GRID_HEIGHT_PX}
          />
        </div>
      ))}

      {/* Current time indicator */}
      {showCurrentLine && <CurrentTimeLine startHour={START_HOUR} totalRange={totalRange} />}
    </div>
  )
}

function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function CurrentTimeLine({
  startHour,
  totalRange,
}: {
  startHour: number
  totalRange: number
}) {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const fraction = Math.max(0, Math.min(1, (minutes - startHour * 60) / (totalRange * 60)))

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top: `${fraction * 100}%` }}
    >
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-[#6F5AE8] flex-shrink-0 -ml-1" />
        <div className="flex-1 h-px bg-[#6F5AE8]" />
      </div>
    </div>
  )
}
