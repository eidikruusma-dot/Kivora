import { addTask, deleteTask, getAllTasks } from '@/lib/tasksStore'
import { addNote, deleteNote, getAllNotes } from '@/lib/quickNotesStore'
import { addHabit, deleteHabit, getAllHabits } from '@/lib/habitsStore'
import { addGoal, deleteGoal, getAllGoals } from '@/lib/goalsStore'
import { addCalendarEvent, deleteCalendarEvent, getAllEvents } from '@/lib/calendarStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Task, Priority, TaskCategory } from '@/types'
import type { NoteFolder } from '@/data/notesData'
import type { HabitCategory } from '@/data/habitsData'

export interface AIAction {
  type: 'create_task' | 'create_note' | 'create_habit' | 'create_goal' | 'create_calendar_event'
    | 'delete_task' | 'delete_note' | 'delete_habit' | 'delete_goal' | 'delete_calendar_event'
  data: Record<string, unknown>
}

export interface AIActionResult {
  success: boolean
  message: string
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function todayDateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return todayDateStr()
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return todayDateStr()
}

function inferCategory(text: string): TaskCategory {
  const lower = text.toLowerCase()
  if (lower.match(/töö|koosolek|projekt|raport|meeskond/)) return 'Töö'
  if (lower.match(/kool|õpi|eksam|kodutöö|ülikool/)) return 'Kool'
  if (lower.match(/pere|perega|lapsed/)) return 'Pere'
  if (lower.match(/treen|jooks|jõusaal|tervis|arst/)) return 'Tervis'
  if (lower.match(/ost|pood|ostunimekiri/)) return 'Ostud'
  return 'Isiklik'
}

function inferPriority(text: string): Priority {
  const lower = text.toLowerCase()
  if (lower.match(/tähtis|kiire|otsene|kohe|oluline|prioriteet/)) return 'high'
  if (lower.match(/võib oodata|mitte kiire|ainult kui/)) return 'low'
  return 'medium'
}

export function executeAction(action: AIAction): AIActionResult {
  try {
    switch (action.type) {
      case 'create_task': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Ülesande pealkiri puudub.' }
        const task: Task = {
          id: uid('task'),
          title,
          description: action.data.description ? String(action.data.description) : undefined,
          date: action.data.date ? parseDate(String(action.data.date)) : todayDateStr(),
          priority: inferPriority(title),
          time: action.data.time ? String(action.data.time) : undefined,
          completed: false,
          category: inferCategory(title),
        }
        addTask(task)
        return { success: true, message: `Ülesanne "${title}" lisatud.` }
      }

      case 'create_note': {
        const title = String(action.data.title || '')
        const content = String(action.data.content || title)
        if (!title) return { success: false, message: 'Märke pealkiri puudub.' }
        const folder = (action.data.folder as NoteFolder) || 'Isiklik'
        addNote(title, content, folder, false)
        return { success: true, message: `Märge "${title}" lisatud.` }
      }

      case 'create_habit': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Harjumuse pealkiri puudub.' }
        const description = String(action.data.description || '')
        const category = (action.data.category as HabitCategory) || 'Isiklik'
        const recurrence = (action.data.recurrence as 'daily' | 'weekdays' | 'custom') || 'daily'
        addHabit({
          title,
          description,
          category,
          icon: 'book',
          iconColor: '#6F5AE8',
          iconBg: '#EDE9FB',
          recurrence,
        })
        return { success: true, message: `Harjumus "${title}" lisatud.` }
      }

      case 'create_goal': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Eesmärgi pealkiri puudub.' }
        const description = String(action.data.description || '')
        const steps = Array.isArray(action.data.steps) ? action.data.steps as string[] : []
        const goal = {
          id: uid('goal'),
          title,
          description,
          iconBg: '#EDE9FB',
          iconColor: '#6F5AE8',
          icon: 'personal' as const,
          status: 'active' as const,
          progressType: 'fraction' as const,
          progressValue: 0,
          progressMax: Math.max(steps.length, 1),
          deadline: String(action.data.deadline || ''),
          deadlineShort: String(action.data.deadline || ''),
          barColor: '#6F5AE8',
          steps: steps.map((s, i) => ({ id: `step-${Date.now()}-${i}`, title: s, done: false })),
        }
        addGoal(goal)
        return { success: true, message: `Eesmärk "${title}" lisatud.` }
      }

      case 'create_calendar_event': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Sündmuse pealkiri puudub.' }
        const event: MockCalendarEvent = {
          id: uid('evt'),
          title,
          startTime: String(action.data.startTime || '09:00'),
          endTime: String(action.data.endTime || '10:00'),
          color: String(action.data.color || '#EDE9FB'),
          date: action.data.date ? parseDate(String(action.data.date)) : todayDateStr(),
          calendarId: String(action.data.calendarId || 'mine'),
          description: action.data.description ? String(action.data.description) : undefined,
          location: action.data.location ? String(action.data.location) : undefined,
        }
        addCalendarEvent(event)
        return { success: true, message: `Sündmus "${title}" lisatud kalendrisse.` }
      }

      case 'delete_task': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Ülesande pealkiri või ID puudub.' }
        const tasks = getAllTasks()
        const target = id ? tasks.find((t) => t.id === id) : tasks.find((t) => t.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga ülesannet ei leitud.' }
        deleteTask(target.id)
        return { success: true, message: `Ülesanne "${target.title}" kustutatud.` }
      }

      case 'delete_note': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Märke pealkiri või ID puudub.' }
        const notes = getAllNotes()
        const target = id ? notes.find((n) => n.id === id) : notes.find((n) => n.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga märget ei leitud.' }
        deleteNote(target.id)
        return { success: true, message: `Märge "${target.title}" kustutatud.` }
      }

      case 'delete_habit': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Harjumuse pealkiri või ID puudub.' }
        const habits = getAllHabits()
        const target = id ? habits.find((h) => h.id === id) : habits.find((h) => h.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga harjumust ei leitud.' }
        deleteHabit(target.id)
        return { success: true, message: `Harjumus "${target.title}" kustutatud.` }
      }

      case 'delete_goal': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Eesmärgi pealkiri või ID puudub.' }
        const goals = getAllGoals()
        const target = id ? goals.find((g) => g.id === id) : goals.find((g) => g.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga eesmärki ei leitud.' }
        deleteGoal(target.id)
        return { success: true, message: `Eesmärk "${target.title}" kustutatud.` }
      }

      case 'delete_calendar_event': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Sündmuse pealkiri või ID puudub.' }
        const events = getAllEvents()
        const target = id ? events.find((e) => e.id === id) : events.find((e) => e.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga sündmust ei leitud.' }
        deleteCalendarEvent(target.id)
        return { success: true, message: `Sündmus "${target.title}" kustutatud.` }
      }

      default:
        return { success: false, message: 'Tundmatu toiming.' }
    }
  } catch {
    return { success: false, message: 'Toimingu käivitamine ebaõnnestus.' }
  }
}

export function executeActions(actions: AIAction[]): AIActionResult[] {
  return actions.map(executeAction)
}
