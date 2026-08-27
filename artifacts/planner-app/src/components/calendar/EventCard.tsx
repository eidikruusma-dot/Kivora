import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { TimeFormat } from '@/types'
import { formatEventTime } from '@/lib/calendar/dateUtils'

interface EventCardProps {
  event: MockCalendarEvent
  onClick?: (id: string) => void
  timeFormat?: TimeFormat
  /** Actual rendered pixel height of this card, from TimeGrid's layout math. */
  heightPx?: number
}

// Below this height there isn't room for a time line + a wrapped title, so
// we collapse to a single truncated "HH:MM · Title" line instead of letting
// the stacked layout clip.
const COMPACT_HEIGHT_THRESHOLD_PX = 34

export function isCompactEventCard(heightPx: number): boolean {
  return heightPx < COMPACT_HEIGHT_THRESHOLD_PX
}

const DARK_TEXT = { time: '#4B5563', title: '#1A1F36' }
const LIGHT_TEXT = { time: '#E5E7EB', title: '#FFFFFF' }

/**
 * Picks readable text colors for an event card given its (arbitrary,
 * user-configured) background color, using perceived brightness (YIQ) so
 * both light and saturated/dark event colors stay legible.
 */
export function getEventCardTextColors(bgHex: string): { time: string; title: string } {
  const hex = bgHex.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return DARK_TEXT
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 140 ? DARK_TEXT : LIGHT_TEXT
}

export default function EventCard({ event, onClick, timeFormat = '24h', heightPx }: EventCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick?.(event.id)
  }

  const { time: timeColor, title: titleColor } = getEventCardTextColors(event.color)
  const compact = isCompactEventCard(heightPx ?? Infinity)
  const timeLabel = formatEventTime(event.startTime, timeFormat)

  return (
    <div
      onClick={handleClick}
      className="w-full h-full rounded-md cursor-pointer hover:brightness-95 transition-all overflow-hidden"
      style={{ backgroundColor: event.color }}
    >
      {compact ? (
        <div className="h-full flex items-center px-1.5 leading-none">
          <p className="text-[10px] font-medium truncate" style={{ color: titleColor }}>
            <span style={{ color: timeColor }}>{timeLabel}</span>
            {' · '}
            {event.title}
          </p>
        </div>
      ) : (
        <div className="h-full flex flex-col justify-start px-1.5 py-0.5">
          <p className="text-[10px] font-medium leading-none" style={{ color: timeColor }}>
            {timeLabel}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold leading-[1.15] line-clamp-2" style={{ color: titleColor }}>
            {event.title}
          </p>
        </div>
      )}
    </div>
  )
}
