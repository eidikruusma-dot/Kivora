import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/AppCard'
import { useCalendarEvents, updateCalendarEvent, deleteCalendarEvent } from '@/lib/calendarStore'
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

  return (
    <>
      <Card className="h-full flex flex-col">
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.calendar.title', lang)}</h2>
          <button
            onClick={() => navigate('/app/calendar')}
            className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline"
          >
            {t('dash.viewCalendar', lang)} <ArrowRight size={11} />
          </button>
        </div>

        <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
          {todayEvents.length === 0 ? (
            <p className="text-xs text-[#94A3B8] py-4 text-center">{t('dash.calendar.empty', lang)}</p>
          ) : (
            todayEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                className="flex items-center gap-3 py-2 rounded-lg px-1 -mx-1 cursor-pointer hover:bg-[#F8F7F4] transition-colors"
              >
                <div
                  className="w-0.5 h-8 rounded-full flex-shrink-0"
                  style={{ background: event.color ?? '#6F5AE8' }}
                />
                <div className="flex-shrink-0 w-12">
                  <span className="text-sm font-bold text-[#1A1F36]">{event.startTime}</span>
                </div>
                <span className="text-sm text-[#1A1F36] truncate">{event.title}</span>
              </div>
            ))
          )}
        </div>
      </Card>

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
    </>
  )
}
