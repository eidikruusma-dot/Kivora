import TimeGrid from './TimeGrid'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { TimeFormat } from '@/types'

interface DayColumnProps {
  date: Date
  events: MockCalendarEvent[]
  timeFormat: TimeFormat
  onEventClick?: (id: string) => void
  onSlotClick?: (date: Date) => void
}

export default function DayColumn({
  date,
  events,
  timeFormat,
  onEventClick,
  onSlotClick,
}: DayColumnProps) {
  return (
    <div className="h-full">
      <TimeGrid
        date={date}
        events={events}
        timeFormat={timeFormat}
        onEventClick={onEventClick}
        onSlotClick={onSlotClick}
      />
    </div>
  )
}
