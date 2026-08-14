import CalendarGrid from './CalendarGrid'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { UserPreferences } from '@/types'
import { getWeekDays } from '@/lib/calendar/dateUtils'
import { getEventsForDate } from '@/lib/calendar/eventLayout'

interface WeekViewProps {
  weekStart: Date
  events: MockCalendarEvent[]
  preferences: UserPreferences
  selectedDate?: Date
  onEventClick?: (id: string) => void
  onSlotClick?: (date: Date) => void
  onDayClick?: (date: Date) => void
}

export default function WeekView({
  weekStart,
  events,
  preferences,
  selectedDate,
  onEventClick,
  onSlotClick,
  onDayClick,
}: WeekViewProps) {
  const days = getWeekDays(weekStart)
  const eventsByDay = days.map((day) => getEventsForDate(events, day))

  return (
    <CalendarGrid
      days={days}
      eventsByDay={eventsByDay}
      timeFormat={preferences.timeFormat}
      selectedDate={selectedDate}
      onEventClick={onEventClick}
      onSlotClick={onSlotClick}
      onDayClick={onDayClick}
    />
  )
}
