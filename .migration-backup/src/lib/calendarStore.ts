import { useState, useEffect } from 'react'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { mockCalendarEvents } from '@/data/calendarMockData'

type Listener = (events: MockCalendarEvent[]) => void

let events: MockCalendarEvent[] = [...mockCalendarEvents]
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(events)
}

export function getAllEvents(): MockCalendarEvent[] {
  return events
}

export function addCalendarEvent(event: MockCalendarEvent): MockCalendarEvent {
  events = [...events, event]
  emit()
  return event
}

export function deleteCalendarEvent(id: string): void {
  events = events.filter((e) => e.id !== id)
  emit()
}

export function useCalendarEvents(): MockCalendarEvent[] {
  const [state, setState] = useState<MockCalendarEvent[]>(events)
  useEffect(() => {
    const l: Listener = (e) => setState(e)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}
