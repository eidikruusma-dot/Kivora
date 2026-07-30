import { mockTasks, mockEvents } from '@/data/mockData'
import { mockCalendarEvents } from '@/data/calendarMockData'
import { mockNotes } from '@/data/notesData'
import { mockHabits } from '@/data/habitsData'
import { mockGoals } from '@/data/goalsData'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

export type SearchSource =
  | 'tasks'
  | 'calendar'
  | 'notes'
  | 'habits'
  | 'goals'
  | 'assistant'
  | 'settings'
  | 'profile'
  | 'files'
  | 'notifications'

export interface SearchSourceMeta {
  id: SearchSource
  label: string
  route: string
}

export const SOURCE_META: Record<SearchSource, SearchSourceMeta> = {
  tasks:        { id: 'tasks',        label: 'Ülesanded',   route: '/app/tasks' },
  calendar:     { id: 'calendar',     label: 'Kalender',    route: '/app/calendar' },
  notes:        { id: 'notes',        label: 'Märkmed',     route: '/app/notes' },
  habits:       { id: 'habits',       label: 'Harjumused',  route: '/app/habits' },
  goals:        { id: 'goals',        label: 'Eesmärgid',   route: '/app/goals' },
  assistant:    { id: 'assistant',    label: 'AI assistent', route: '/app/assistant' },
  settings:     { id: 'settings',     label: 'Seaded',      route: '/app/settings' },
  profile:      { id: 'profile',      label: 'Profiil',     route: '/app/profile' },
  files:        { id: 'files',        label: 'Failid',      route: '/app/files' },
  notifications:{ id: 'notifications', label: 'Teavitused', route: '/app/notifications' },
}

/** Returns the localized display label for a search source. */
export function getSourceLabel(source: SearchSource, lang: AppLang): string {
  const keyMap: Record<SearchSource, Parameters<typeof t>[0]> = {
    tasks:         'search.src.tasks',
    calendar:      'search.src.calendar',
    notes:         'search.src.notes',
    habits:        'search.src.habits',
    goals:         'search.src.goals',
    assistant:     'search.src.assistant',
    settings:      'search.src.settings',
    profile:       'search.src.profile',
    files:         'search.src.files',
    notifications: 'search.src.notifications',
  }
  return t(keyMap[source], lang)
}

export interface SearchItem {
  id: string
  source: SearchSource
  title: string
  subtitle?: string
  route: string
}

export function buildSearchIndex(): SearchItem[] {
  const items: SearchItem[] = []

  for (const task of mockTasks) {
    items.push({
      id: `task-${task.id}`,
      source: 'tasks',
      title: task.title,
      subtitle: task.category ? `${task.category}${task.time ? ' · ' + task.time : ''}` : task.time,
      route: '/app/tasks',
    })
  }

  for (const e of mockCalendarEvents) {
    items.push({
      id: `event-${e.id}`,
      source: 'calendar',
      title: e.title,
      subtitle: e.allDay ? 'Kogu päev' : `${e.startTime}${e.endTime ? ' – ' + e.endTime : ''}`,
      route: '/app/calendar',
    })
  }
  for (const e of mockEvents) {
    items.push({
      id: `evt-${e.id}`,
      source: 'calendar',
      title: e.title,
      subtitle: `${e.time}${e.duration ? ' · ' + e.duration : ''}`,
      route: '/app/calendar',
    })
  }

  for (const n of mockNotes) {
    items.push({
      id: `note-${n.id}`,
      source: 'notes',
      title: n.title,
      subtitle: n.preview,
      route: '/app/notes',
    })
  }

  for (const h of mockHabits) {
    items.push({
      id: `habit-${h.id}`,
      source: 'habits',
      title: h.title,
      subtitle: h.description,
      route: '/app/habits',
    })
  }

  for (const g of mockGoals) {
    items.push({
      id: `goal-${g.id}`,
      source: 'goals',
      title: g.title,
      subtitle: g.description,
      route: '/app/goals',
    })
  }

  return items
}

export function searchItems(index: SearchItem[], query: string): SearchItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return index.filter((item) => {
    const title = item.title.toLowerCase()
    const sub = (item.subtitle ?? '').toLowerCase()
    const src = SOURCE_META[item.source].label.toLowerCase()
    return title.includes(q) || sub.includes(q) || src.includes(q)
  })
}
