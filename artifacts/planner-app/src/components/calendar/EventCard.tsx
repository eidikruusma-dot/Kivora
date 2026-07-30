import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

interface EventCardProps {
  event: MockCalendarEvent
  onClick?: (id: string) => void
}

export default function EventCard({ event, onClick }: EventCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick?.(event.id)
  }

  return (
    <div
      onClick={handleClick}
      className="w-full h-full rounded-md cursor-pointer hover:brightness-95 transition-all overflow-hidden"
      style={{ backgroundColor: event.color }}
    >
      <div className="h-full flex flex-col justify-start px-2 py-1">
        <p className="text-[10px] font-medium text-[#4B5563] leading-none">
          {event.startTime}
        </p>

        <p className="mt-0.5 text-[12px] font-semibold text-[#1A1F36] leading-[1.15] line-clamp-2">
          {event.title}
        </p>
      </div>
    </div>
  )
}