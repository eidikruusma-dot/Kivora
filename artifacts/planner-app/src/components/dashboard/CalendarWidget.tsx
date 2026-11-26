import { useState, useEffect } from 'react'
import { ArrowRight, CalendarPlus, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from '@/components/dashboard/DashboardCard'
import { useCalendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/calendarStore'
import { getEventsForDate } from '@/lib/calendar/eventLayout'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import NewEventModal from '@/components/calendar/NewEventModal'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function CalendarWidget() {
  const navigate = useNavigate()
  const allEvents = useCalendarEvents()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Must match the CALENDARS definition in CalendarPage so colours/labels resolve correctly
  const CALENDARS = [
    { id: 'mine',     label: t('cal.calendar.mine',     lang), color: '#6F5AE8' },
    { id: 'school',   label: t('cal.calendar.school',   lang), color: '#3B82F6' },
    { id: 'work',     label: t('cal.calendar.work',     lang), color: '#F59E0B' },
    { id: 'family',   label: t('cal.calendar.family',   lang), color: '#10B981' },
    { id: 'training', label: t('cal.calendar.training', lang), color: '#EC4899' },
  ]

  const todayEvents = getEventsForDate(allEvents, new Date())
    .filter((e) => !e.allDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<MockCalendarEvent | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // Derive the live event from the store so edits are always fresh
  const selectedEvent = selectedEventId
    ? allEvents.find((e) => e.id === selectedEventId) ?? null
    : null

  const handleEdit = () => {
    setEditingEvent(selectedEvent)
    setSelectedEventId(null)
  }

  const handleDelete = (id: string) => {
    deleteCalendarEvent(id)
    setSelectedEventId(null)
  }

  const handleUpdateSave = (updated: MockCalendarEvent) => {
    updateCalendarEvent(updated)
    setEditingEvent(null)
  }

  const handleAddEvent = (event: MockCalendarEvent) => {
    addCalendarEvent(event)
    setAddOpen(false)
  }

  return (
    <>
      <DashboardCard className={todayEvents.length === 0 ? 'flex flex-col self-start' : 'h-full flex flex-col'}>
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">
            <Calendar size={17} className="text-[#6F5AE8] dark:text-[#A78BFA]" />
            {t('dash.calendar.title', lang)}
          </h2>
          <button
            onClick={() => navigate('/app/calendar')}
            className="text-[11px] text-[#6F5AE8] dark:text-[#A78BFA] font-medium flex items-center gap-0.5 hover:underline"
          >
            {t('dash.viewCalendar', lang)} <ArrowRight size={11} />
          </button>
        </div>

        <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
          {todayEvents.length === 0 ? (
            <div className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-[#EFF6FF] dark:bg-blue-400/15 flex items-center justify-center flex-shrink-0">
                <CalendarPlus size={16} className="text-[#3B82F6] dark:text-blue-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#94A3B8] dark:text-[#9C96C2] leading-snug">{t('dash.calendar.empty', lang)}</p>
                <button
                  onClick={() => setAddOpen(true)}
                  className="text-xs font-semibold text-[#3B82F6] dark:text-blue-300 hover:underline py-1"
                >
                  {t('dash.calendar.emptyCta', lang)}
                </button>
              </div>
            </div>
          ) : (
            todayEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                className="flex items-center gap-3 py-2 rounded-lg px-1 -mx-1 cursor-pointer hover:bg-[#F8F7F4] dark:hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-0.5 h-8 rounded-full flex-shrink-0"
                  style={{ background: event.color ?? '#6F5AE8' }}
                />
                <div className="flex-shrink-0 w-12">
                  <span className="text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">{event.startTime}</span>
                </div>
                <span className="text-sm text-[#1A1F36] dark:text-[#F1EFFB] truncate">{event.title}</span>
              </div>
            ))
          )}
        </div>
      </DashboardCard>

      {/* Event details */}
      <EventDetailsModal
        event={selectedEvent}
        onClose={() => setSelectedEventId(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        calendars={CALENDARS}
      />

      {/* Edit event */}
      <NewEventModal
        open={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        onSave={handleUpdateSave}
        calendars={CALENDARS}
        initialEvent={editingEvent ?? undefined}
      />

      {/* Add event (from empty state) */}
      <NewEventModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAddEvent}
        calendars={CALENDARS}
        defaultDate={new Date()}
      />
    </>
  )
}
