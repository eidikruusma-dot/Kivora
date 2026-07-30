import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
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
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import { startOfWeek, addWeeks, addDays, addMonths } from '@/lib/calendar/dateUtils'
import { useCalendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/calendarStore'
import type { CalendarViewType, UserPreferences } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

const DEFAULT_PREFERENCES: UserPreferences = {
  startOfWeek: 'monday',
  timeFormat: '24h',
  dateFormat: 'DD.MM.YYYY',
}

export default function CalendarPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const CALENDARS = [
    { id: 'mine',     label: t('cal.mine',     lang), color: '#6F5AE8' },
    { id: 'school',   label: t('cal.school',   lang), color: '#3B82F6' },
    { id: 'work',     label: t('cal.work',     lang), color: '#F59E0B' },
    { id: 'family',   label: t('cal.family',   lang), color: '#10B981' },
    { id: 'training', label: t('cal.training', lang), color: '#EC4899' },
  ]

  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [viewType, setViewType] = useState<CalendarViewType>('week')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const events = useCalendarEvents()
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CALENDARS.map((c) => [c.id, true])),
  )
  const preferences = DEFAULT_PREFERENCES

  // Detail + edit state
  const [detailEvent, setDetailEvent] = useState<MockCalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<MockCalendarEvent | null>(null)

  const location = useLocation()

  // Return to today/week view whenever the user navigates to Calendar
  useEffect(() => {
    const today = new Date()
    setCurrentDate(today)
    setViewType('week')
    setSelectedDate(today)
    setEventModalOpen(false)
    setDetailEvent(null)
    setEditingEvent(null)
  }, [location.key])

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

  // Add new event
  const handleSaveEvent = useCallback((event: MockCalendarEvent) => {
    addCalendarEvent(event)
  }, [])

  // Update existing event (from edit modal)
  const handleUpdateEvent = useCallback((event: MockCalendarEvent) => {
    updateCalendarEvent(event)
    setEditingEvent(null)
  }, [])

  // Delete event (from detail modal)
  const handleDeleteEvent = useCallback((id: string) => {
    deleteCalendarEvent(id)
    setDetailEvent(null)
  }, [])

  // Open detail modal when an event is clicked
  const handleEventClick = useCallback((id: string) => {
    const evt = events.find((e) => e.id === id) ?? null
    setDetailEvent(evt)
  }, [events])

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

  // From detail modal → open edit modal pre-filled
  const handleOpenEdit = useCallback(() => {
    setEditingEvent(detailEvent)
    setDetailEvent(null)
  }, [detailEvent])

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
          <MyCalendars visible={visibleCalendars} onToggle={handleToggleCalendar} calendars={CALENDARS} lang={lang} />
        </RightSidebar>
      </div>

      {/* Create new event modal */}
      <NewEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSave={handleSaveEvent}
        defaultDate={selectedDate}
        calendars={CALENDARS}
      />

      {/* Edit existing event modal */}
      <NewEventModal
        open={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        onSave={handleUpdateEvent}
        calendars={CALENDARS}
        initialEvent={editingEvent ?? undefined}
      />

      {/* Event details modal */}
      <EventDetailsModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteEvent}
        calendars={CALENDARS}
      />
    </div>
  )
}
