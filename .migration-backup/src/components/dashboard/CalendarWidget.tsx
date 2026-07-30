import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import { useCalendarEvents } from '@/lib/calendarStore'
import { getEventsForDate } from '@/lib/calendar/eventLayout'

export default function CalendarWidget() {
  const navigate = useNavigate()
  const allEvents = useCalendarEvents()
  const todayEvents = getEventsForDate(allEvents, new Date())
    .filter((e) => !e.allDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4)

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1F36]">Kalender</h2>
        <button onClick={() => navigate('/app/calendar')} className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline">
          Vaata kalendrit <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
        {todayEvents.length === 0 ? (
          <p className="text-xs text-[#94A3B8] py-4 text-center">Tänased sündmused puuduvad</p>
        ) : (
          todayEvents.map((event) => (
            <div key={event.id} className="flex items-center gap-3 py-2">
              <div className="w-0.5 h-8 rounded-full bg-[#6F5AE8] flex-shrink-0" />
              <div className="flex-shrink-0 w-12">
                <span className="text-sm font-bold text-[#1A1F36]">{event.startTime}</span>
              </div>
              <span className="text-sm text-[#1A1F36] truncate">{event.title}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
