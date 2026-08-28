import { timeToMinutes } from './dateUtils'

export interface MockCalendarEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  color: string
  location?: string
  description?: string
  date: string
  /**
   * Inclusive end date (YYYY-MM-DD) for a multi-day all-day event. Absent
   * on every single-day event (the entire existing calendar, manual or
   * task-linked). Only ever set on `allDay` events — a timed event never
   * spans multiple days in this model.
   */
  endDate?: string
  allDay?: boolean
  calendarId?: string
  /**
   * Provenance for an event derived from another module (Plans/Goals)
   * rather than a real calendarEvents document — see
   * planGoalCalendarEvents.ts. Absent on every manually-created or
   * task-auto-created event.
   */
  source?: { type: 'plan' | 'goal'; id: string }
}

export interface PositionedEvent {
  event: MockCalendarEvent
  topFraction: number
  heightFraction: number
  column: number
  totalColumns: number
  widthPercent: number
  leftPercent: number
}

const MIN_DURATION_FRACTION = 20 / (22 * 60)

export function layoutEvents(
  events: MockCalendarEvent[],
  startHour: number,
  endHour: number,
): PositionedEvent[] {
  const totalMinutes = (endHour - startHour) * 60

  const timedEvents = events.filter(
    (e) =>
      !e.allDay &&
      timeToMinutes(e.startTime) < endHour * 60 &&
      timeToMinutes(e.endTime) > startHour * 60,
  )

  if (timedEvents.length === 0) return []

  const sorted = [...timedEvents].sort((a, b) => {
    const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    if (diff !== 0) return diff
    return timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
  })

  const groups: MockCalendarEvent[][] = []
  let current: MockCalendarEvent[] = []
  let groupEnd = -1

  for (const evt of sorted) {
    const evtStart = timeToMinutes(evt.startTime)
    if (current.length === 0) {
      current = [evt]
      groupEnd = timeToMinutes(evt.endTime)
    } else if (evtStart < groupEnd) {
      current.push(evt)
      groupEnd = Math.max(groupEnd, timeToMinutes(evt.endTime))
    } else {
      groups.push([...current])
      current = [evt]
      groupEnd = timeToMinutes(evt.endTime)
    }
  }
  if (current.length > 0) groups.push(current)

  const result: PositionedEvent[] = []

  for (const group of groups) {
    const columns: MockCalendarEvent[][] = []

    for (const evt of group) {
      let placed = false
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1]
        if (timeToMinutes(last.endTime) <= timeToMinutes(evt.startTime)) {
          columns[c].push(evt)
          placed = true
          break
        }
      }
      if (!placed) columns.push([evt])
    }

    const totalColumns = columns.length

    for (let c = 0; c < totalColumns; c++) {
      for (const evt of columns[c]) {
        const startMin = Math.max(timeToMinutes(evt.startTime), startHour * 60)
        const endMin = Math.max(
          Math.min(timeToMinutes(evt.endTime), endHour * 60),
          startMin + 20,
        )

        const topFraction = (startMin - startHour * 60) / totalMinutes
        const heightFraction = Math.max(
          (endMin - startMin) / totalMinutes,
          MIN_DURATION_FRACTION,
        )
        const widthPercent = 100 / totalColumns
        const leftPercent = widthPercent * c

        result.push({
          event: evt,
          topFraction,
          heightFraction,
          column: c,
          totalColumns,
          widthPercent,
          leftPercent,
        })
      }
    }
  }

  return result
}

/**
 * True if `dateStr` (YYYY-MM-DD) falls within an event's occurrence — its
 * single date, or the inclusive [date, endDate] span of a multi-day all-day
 * event. Plain string comparison — YYYY-MM-DD strings sort correctly
 * lexicographically — so this can never be off by a day from timezone or
 * DST handling, unlike parsing either bound into a `Date`.
 */
export function eventOccursOnDate(event: MockCalendarEvent, dateStr: string): boolean {
  if (event.date === dateStr) return true
  return Boolean(event.allDay && event.endDate && dateStr > event.date && dateStr <= event.endDate)
}

function shiftISODateBy1(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * 60 * 1000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Every YYYY-MM-DD date string an event spans, inclusive — its single date,
 * or every day in [date, endDate] for a multi-day all-day event. UTC-based
 * day stepping (never a local-time `Date` increment), so DST transitions in
 * the host machine's timezone can never drop or duplicate a day.
 */
export function eventDateKeys(event: MockCalendarEvent): string[] {
  if (!event.allDay || !event.endDate || event.endDate <= event.date) return [event.date]
  const keys: string[] = []
  let cursor = event.date
  while (cursor <= event.endDate) {
    keys.push(cursor)
    cursor = shiftISODateBy1(cursor)
  }
  return keys
}

export function getEventsForDate(
  events: MockCalendarEvent[],
  date: Date,
): MockCalendarEvent[] {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return events.filter((e) => eventOccursOnDate(e, dateStr))
}
