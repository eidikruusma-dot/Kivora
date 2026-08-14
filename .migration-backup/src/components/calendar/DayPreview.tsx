import { CalendarDays, Plus, ChevronRight } from 'lucide-react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

interface DayPreviewProps {
  selectedDate: Date
  events: MockCalendarEvent[]
  onOpenDay: () => void
  onCreateEvent: () => void
}

const MONTHS_ET = [
  'jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni',
  'juuli', 'august', 'september', 'oktoober', 'november', 'detsember',
]

function formatDayLabel(d: Date): string {
  return `${d.getDate()}. ${MONTHS_ET[d.getMonth()]}`
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export default function DayPreview({
  selectedDate,
  events,
  onOpenDay,
  onCreateEvent,
}: DayPreviewProps) {
  const dayEvents = [...events]
    .filter((evt) => evt.date === dateKey(selectedDate))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))

  return (
    <div className="mt-4 p-3 rounded-lg border border-[#ECECF2] bg-[#FAFAFB]">
      {/* Date header */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <CalendarDays size={14} style={{ color: '#6F5AE8' }} />
        <span className="text-sm font-semibold text-[#1A1F36]">
          {formatDayLabel(selectedDate)}
        </span>
      </div>

      {dayEvents.length > 0 ? (
        <>
          {/* Event list */}
          <div className="flex flex-col gap-1.5 mb-3">
            {dayEvents.map((evt) => (
              <div key={evt.id} className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: evt.color }}
                />
                <span className="text-[11px] text-[#64748B] font-medium tabular-nums w-10 flex-shrink-0">
                  {evt.allDay ? 'terve päev' : evt.startTime}
                </span>
                <span className="text-[12px] text-[#1A1F36] font-medium truncate">
                  {evt.title}
                </span>
              </div>
            ))}
          </div>

          {/* Open day button */}
          <button
            onClick={onOpenDay}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[12px] font-medium text-white bg-[#6F5AE8] hover:bg-[#5B4BD1] transition-colors"
          >
            Ava päev
            <ChevronRight size={13} />
          </button>
        </>
      ) : (
        <>
          <p className="text-[12px] text-[#94A3B8] mb-3">
            Sellel päeval sündmusi ei ole.
          </p>

          <button
            onClick={onCreateEvent}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[12px] font-medium text-[#6F5AE8] bg-white border border-[#ECECF2] hover:bg-[#F8F7F4] transition-colors"
          >
            <Plus size={13} />
            Loo uus sündmus
          </button>
        </>
      )}
    </div>
  )
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
