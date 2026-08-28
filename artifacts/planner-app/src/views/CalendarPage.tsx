import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import NewCalendarModal from '@/components/calendar/NewCalendarModal'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import { startOfWeek, addWeeks, addDays, addMonths } from '@/lib/calendar/dateUtils'
import { useCalendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/calendarStore'
import { useUserCalendars, addUserCalendar, type UserCalendar } from '@/lib/userCalendarsStore'
import { usePlans } from '@/lib/plansStore'
import { useGoals } from '@/lib/goalsStore'
import { getDerivedCalendarEvents } from '@/lib/planGoalCalendarEvents'
import { removeLinksForEntity } from '@/lib/entityLinksStore'
import PostSaveLinkSuggestionsDialog from '@/components/links/PostSaveLinkSuggestionsDialog'
import AutoLinkToast from '@/components/links/AutoLinkToast'
import { runAutomaticLinking, type AutoLinkResult } from '@/lib/automaticLinking'
import type { CalendarViewType, UserPreferences } from '@/types'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { useAuth } from '@/context/AuthContext'
import { getUserProfile, getEffectivePreferences, DEFAULT_PREFERENCES } from '@/lib/userProfile'

export default function CalendarPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Load user preferences from Firestore; fall back to DEFAULT_PREFERENCES
  // until the profile arrives so the calendar renders immediately.
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getUserProfile(user.uid)
      .then((profile) => {
        if (cancelled || !profile) return
        setPreferences(getEffectivePreferences(profile))
      })
      .catch(() => { /* keep defaults on error */ })
    return () => { cancelled = true }
  }, [user])

  const userCalendars = useUserCalendars()

  const CALENDARS = [
    { id: 'mine',     label: t('cal.mine',     lang), color: '#6F5AE8' },
    { id: 'school',   label: t('cal.school',   lang), color: '#3B82F6' },
    { id: 'work',     label: t('cal.work',     lang), color: '#F59E0B' },
    { id: 'family',   label: t('cal.family',   lang), color: '#10B981' },
    { id: 'training', label: t('cal.training', lang), color: '#EC4899' },
    ...userCalendars,
  ]

  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  // Default to Agenda on mobile (< 768 px) so phones avoid the horizontally-scrolling week grid
  const [viewType, setViewType] = useState<CalendarViewType>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'week'
  )
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const events = useCalendarEvents()
  const plans = usePlans()
  const goals = useGoals()
  // Dated Plans/Goals are never written into calendarEvents — they're
  // derived fresh from live Plan/Goal data on every render (see
  // planGoalCalendarEvents.ts) and merged in here, alongside every real,
  // manually-created or task-auto-created event.
  const derivedEvents = useMemo(
    () => getDerivedCalendarEvents(plans, goals),
    [plans, goals],
  )
  const allEvents = useMemo(() => [...events, ...derivedEvents], [events, derivedEvents])
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CALENDARS.map((c) => [c.id, true])),
  )

  // New calendars (loaded from Firestore on mount, or created via "Uus
  // kalender") default to visible, without resetting the toggle state of
  // calendars already known.
  useEffect(() => {
    setVisibleCalendars((prev) => {
      const missing = userCalendars.filter((c) => !(c.id in prev))
      if (missing.length === 0) return prev
      return { ...prev, ...Object.fromEntries(missing.map((c) => [c.id, true])) }
    })
  }, [userCalendars])

  // Detail + edit state
  const [detailEvent, setDetailEvent] = useState<MockCalendarEvent | null>(null)
  const [postSave, setPostSave] = useState<{ type: 'calendar'; id: string } | null>(null)
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null)
  const [editingEvent, setEditingEvent] = useState<MockCalendarEvent | null>(null)

  const location = useLocation()

  // Return to today's view whenever the user navigates to Calendar.
  // On mobile (< 768 px) default to Agenda; on wider screens use Week.
  useEffect(() => {
    const today = new Date()
    setCurrentDate(today)
    setViewType(window.innerWidth < 768 ? 'agenda' : 'week')
    setSelectedDate(today)
    setEventModalOpen(false)
    setDetailEvent(null)
    setEditingEvent(null)
  }, [location.key])

  // Deep-link: open specific event navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId
    if (!openId) return
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')
    const event = events.find(e => e.id === openId)
    if (event) setDetailEvent(event)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekStart = startOfWeek(currentDate, preferences.startOfWeek)

  const visibleEvents = useMemo(
    () => allEvents.filter((evt) => evt.calendarId && visibleCalendars[evt.calendarId]),
    [allEvents, visibleCalendars],
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
    setCalendarModalOpen(true)
  }, [])

  const handleSaveCalendar = useCallback((calendar: UserCalendar) => {
    addUserCalendar(calendar)
  }, [])

  // Add new event
  const handleSaveEvent = useCallback((event: MockCalendarEvent) => {
    addCalendarEvent(event)
    setPostSave({ type: 'calendar', id: event.id })
    runAutomaticLinking('calendar', event.id, lang, {
      title: event.title,
      date: event.date,
      description: event.description,
    }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) })
  }, [lang])

  // Update existing event (from edit modal)
  const handleUpdateEvent = useCallback((event: MockCalendarEvent) => {
    updateCalendarEvent(event)
    setEditingEvent(null)
  }, [])

  // Delete event (from detail modal, after its own confirmation dialog).
  // Only the event itself and its EntityLinks are removed — never a linked
  // task (removeLinksForEntity only deletes link rows, not the entities
  // they reference; see entityLinksStore.ts).
  const handleDeleteEvent = useCallback(async (id: string) => {
    try {
      // removeLinksForEntity is optimistic and reverts its own local state
      // on a failed write, so it doesn't need to be awaited/caught here.
      removeLinksForEntity('calendar', id)
      await deleteCalendarEvent(id)
    } catch {
      toast.error(lang === 'et' ? 'Sündmuse kustutamine ebaõnnestus' : 'Failed to delete event')
    }
  }, [lang])

  // Open detail modal when an event is clicked — unless it's a Plan/Goal-
  // derived entry, which isn't a real calendarEvents document and so isn't
  // independently editable/deletable from Calendar; route to the source
  // module instead (the exact same "openId" deep-link convention
  // LinkedItemsPanel already uses to open a specific entity), rather than
  // adding a second, conflicting edit/delete path for these entries.
  const handleEventClick = useCallback((id: string) => {
    const evt = allEvents.find((e) => e.id === id) ?? null
    if (evt?.source?.type === 'plan') {
      navigate(`/app/plans/${evt.source.id}`)
      return
    }
    if (evt?.source?.type === 'goal') {
      navigate('/app/goals', { state: { openId: evt.source.id } })
      return
    }
    setDetailEvent(evt)
  }, [allEvents, navigate])

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
      {/*
        Layout: stacked (flex-col) on mobile/tablet, side-by-side grid on desktop (lg+).
        The CalendarHeader sits inside the left column so it doesn't span across the sidebar.
      */}
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left column: toolbar + calendar views */}
        <div className="flex flex-col bg-white min-w-0">
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

          {/* Overflow-x-auto scopes horizontal scroll to the calendar grid only */}
          <div className="overflow-x-auto">
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
                onCreateEvent={handleNewEvent}
              />
            )}
          </div>
        </div>

        {/* Right sidebar: hidden on mobile, shown below calendar on tablet, right column on desktop */}
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

      {/* Create new calendar modal */}
      <NewCalendarModal
        open={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        onSave={handleSaveCalendar}
      />

      {/* Event details modal */}
      <EventDetailsModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteEvent}
        calendars={CALENDARS}
        timeFormat={preferences.timeFormat}
      />
      {postSave && (
        <PostSaveLinkSuggestionsDialog
          type={postSave.type}
          entityId={postSave.id}
          lang={lang}
          onClose={() => setPostSave(null)}
        />
      )}
      {autoLink && (
        <AutoLinkToast
          linkIds={autoLink.linkIds}
          calendarEventId={autoLink.calendarEventId}
          lang={lang}
          onClose={() => setAutoLink(null)}
        />
      )}
    </div>
  )
}
