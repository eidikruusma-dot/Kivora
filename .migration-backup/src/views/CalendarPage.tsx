import { useState, useCallback, useMemo } from 'react'
import CalendarHeader from '@/components/calendar/CalendarHeader'
import WeekView from '@/components/calendar/WeekView'
import MonthView from '@/components/calendar/MonthView'
import DayView from '@/components/calendar/DayView'
import AgendaView from '@/components/calendar/AgendaView'
import RightSidebar from '@/components/calendar/RightSidebar'
import MiniCalendar from '@/components/calendar/MiniCalendar'
import MyCalendars from '@/components/calendar/MyCalendars'
import DayPreview from '@/components/calendar/DayPreview'
import NewEventModal from '@/components/calendar/NewEventModal'
import { startOfWeek, addWeeks, addDays, addMonths } from '@/lib/calendar/dateUtils'
import { useCalendarEvents, addCalendarEvent } from '@/lib/calendarStore'
import type { CalendarViewType, UserPreferences } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

const DEFAULT_PREFERENCES: UserPreferences = {
  startOfWeek: 'monday',
  timeFormat: '24h',
  dateFormat: 'DD.MM.YYYY',
}

const CALENDARS = [
  { id: 'mine', label: 'Minu kalender', color: '#6F5AE8' },
  { id: 'school', label: 'Kool', color: '#3B82F6' },
  { id: 'work', label: 'Töö', color: '#F59E0B' },
  { id: 'family', label: 'Perekond', color: '#10B981' },
  { id: 'training', label: 'Treening', color: '#EC4899' },
]

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [viewType, setViewType] = useState<CalendarViewType>('week')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const events = useCalendarEvents()
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CALENDARS.map((c) => [c.id, true])),
  )
  const preferences = DEFAULT_PREFERENCES

  const weekStart = startOfWeek(currentDate, preferences.startOfWeek)

  const visibleEvents = useMemo(
    () => events.filter((evt) => evt.calendarId && visibleCalendars[evt.calendarId]),
    [events, visibleCalendars],
  )

  const handlePrev = useCallback(() => {
    setCurrentDate((prev) => {
      if (viewType === 'week') return addWeeks(prev, -1)
      if (viewType === 'month') return addMonths(prev, -1)
      return addDays(prev, -1)
    })
  }, [viewType])

  const handleNext = useCallback(() => {
    setCurrentDate((prev) => {
      if (viewType === 'week') return addWeeks(prev, 1)
      if (viewType === 'month') return addMonths(prev, 1)
      return addDays(prev, 1)
    })
  }, [viewType])

  const handleToday = useCallback(() => {
    const now = new Date()
    setCurrentDate(now)
    setSelectedDate(now)
  }, [])

  const handleNewEvent = useCallback(() => {
    setEventModalOpen(true)
  }, [])

  const handleNewCalendar = useCallback(() => {
    // Future feature: open calendar creation modal
  }, [])

  const handleSaveEvent = useCallback((event: MockCalendarEvent) => {
    addCalendarEvent(event)
  }, [])

  const handleEventClick = useCallback((_id: string) => {}, [])

  const handleSlotClick = useCallback((_date: Date) => {}, [])

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date)
  }, [])

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date)
    setCurrentDate(date)
    setViewType('day')
  }, [])

  const handleOpenDay = useCallback(() => {
    setCurrentDate(selectedDate)
    setViewType('day')
  }, [selectedDate])

  const handleToggleCalendar = useCallback((id: string) => {
    setVisibleCalendars((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return (
    <div className="flex flex-col min-h-full overflow-visible">
      <div
        className="grid"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }}
      >
        {/* Left column: toolbar + calendar */}
        <div className="flex flex-col bg-white">
          <CalendarHeader
            currentDate={currentDate}
            viewType={viewType}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
            onViewChange={setViewType}
            onNewEvent={handleNewEvent}
            onNewCalendar={handleNewCalendar}
          />

          <div>
            {viewType === 'week' && (
              <WeekView
                weekStart={weekStart}
                events={visibleEvents}
                preferences={preferences}
                selectedDate={selectedDate}
                onEventClick={handleEventClick}
                onSlotClick={handleSlotClick}
                onDayClick={handleDayClick}
              />
            )}
            {viewType === 'month' && (
              <MonthView
                currentMonth={currentDate}
                events={visibleEvents}
                preferences={preferences}
                onEventClick={handleEventClick}
                onDayClick={handleDayClick}
              />
            )}
            {viewType === 'day' && (
              <DayView
                date={currentDate}
                events={visibleEvents}
                preferences={preferences}
                onEventClick={handleEventClick}
                onSlotClick={handleSlotClick}
              />
            )}
            {viewType === 'agenda' && (
              <AgendaView
                events={visibleEvents}
                preferences={preferences}
                startDate={selectedDate}
                onEventClick={handleEventClick}
              />
            )}
          </div>
        </div>

        {/* Right column: sidebar */}
        <RightSidebar>
          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            startOfWeek={preferences.startOfWeek}
          />
          <DayPreview
            selectedDate={selectedDate}
            events={visibleEvents}
            onOpenDay={handleOpenDay}
            onCreateEvent={handleNewEvent}
          />
          <div className="h-px bg-[#EBEBEB] my-5" />
          <MyCalendars visible={visibleCalendars} onToggle={handleToggleCalendar} />
        </RightSidebar>
      </div>

      <NewEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSave={handleSaveEvent}
        defaultDate={selectedDate}
        calendars={CALENDARS}
      />
    </div>
  )
}
