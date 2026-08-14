/**
 * entityResolver.ts
 *
 * Resolves a (EntityType, id) pair into display-ready metadata
 * by reading the current singleton state of each Kivora store.
 *
 * All getters are synchronous — call freely inside render.
 */

import { getAllTasks } from '@/lib/tasksStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllEvents } from '@/lib/calendarStore'
import { getAllChats } from '@/lib/aiConversationsStore'
import {
  getAllSchoolTasks,
  getAllSchoolExams,
  getAllSchoolSubjects,
} from '@/lib/schoolStore'
import type { EntityType } from '@/types/entityLinks'
import { decodeSchoolId } from '@/types/entityLinks'

// ── Display shape ─────────────────────────────────────────────────────────────

export interface EntityDisplay {
  id: string
  type: EntityType
  title: string
  /** Raw ISO date string (YYYY-MM-DD) — panel formats it for display */
  date?: string
  /** Time range string, e.g. "09:00–10:00" or "Terve päev" */
  timeRange?: string
  /** Secondary context label: category / folder / subject */
  contextLabel?: string
  /** Hex bg for icon chip */
  bg: string
  /** Hex foreground for icon chip */
  color: string
  typeKey: EntityType
}

// ── Color defaults by entity type ────────────────────────────────────────────

const TYPE_COLORS: Record<EntityType, { bg: string; color: string }> = {
  task:     { bg: '#EDE9FB', color: '#6F5AE8' },
  calendar: { bg: '#DCFCE7', color: '#16A34A' },
  note:     { bg: '#FEF9C3', color: '#CA8A04' },
  habit:    { bg: '#FEE2E2', color: '#DC2626' },
  goal:     { bg: '#E0F2FE', color: '#0284C7' },
  school:   { bg: '#FEF3C7', color: '#D97706' },
  ai:       { bg: '#F3E8FF', color: '#9333EA' },
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveEntity(type: EntityType, id: string): EntityDisplay | null {
  const colors = TYPE_COLORS[type]

  switch (type) {
    case 'task': {
      const task = getAllTasks().find((t) => t.id === id)
      if (!task) return null
      return {
        id, type,
        title: task.title,
        date: task.date ?? undefined,
        timeRange: task.time ?? undefined,
        contextLabel: task.category ?? undefined,
        ...colors,
        typeKey: 'task',
      }
    }

    case 'note': {
      const note = getAllNotes().find((n) => n.id === id)
      if (!note) return null
      return {
        id, type,
        title: note.title,
        contextLabel: note.folder,
        ...colors,
        typeKey: 'note',
      }
    }

    case 'goal': {
      const goal = getAllGoals().find((g) => g.id === id)
      if (!goal) return null
      return {
        id, type,
        title: goal.title,
        contextLabel: goal.status,
        ...colors,
        typeKey: 'goal',
      }
    }

    case 'habit': {
      const habit = getAllHabits().find((h) => h.id === id)
      if (!habit) return null
      return {
        id, type,
        title: habit.title,
        contextLabel: habit.category,
        ...colors,
        typeKey: 'habit',
      }
    }

    case 'calendar': {
      const event = getAllEvents().find((e) => e.id === id)
      if (!event) return null
      const timeRange = event.allDay
        ? null
        : event.startTime && event.endTime
          ? `${event.startTime}–${event.endTime}`
          : event.startTime ?? undefined
      return {
        id, type,
        title: event.title,
        date: event.date,
        timeRange: timeRange ?? undefined,
        contextLabel: undefined,
        bg: event.color ?? colors.bg,
        color: '#FFFFFF',
        typeKey: 'calendar',
      }
    }

    case 'school': {
      const decoded = decodeSchoolId(id)
      if (!decoded) return null
      const { kind, rawId } = decoded

      if (kind === 'task') {
        const item = getAllSchoolTasks().find((t) => String(t.id) === rawId)
        if (!item) return null
        return {
          id, type,
          title: item.title,
          date: item.deadline,
          contextLabel: item.subject,
          ...colors,
          typeKey: 'school',
        }
      }
      if (kind === 'exam') {
        const item = getAllSchoolExams().find((e) => String(e.id) === rawId)
        if (!item) return null
        return {
          id, type,
          title: item.title,
          date: item.date,
          contextLabel: item.subject,
          ...colors,
          typeKey: 'school',
        }
      }
      if (kind === 'subject') {
        const item = getAllSchoolSubjects().find((s) => s.id === rawId)
        if (!item) return null
        return {
          id, type,
          title: item.name,
          contextLabel: item.teacher,
          bg: item.bg ?? colors.bg,
          color: item.color ?? colors.color,
          typeKey: 'school',
        }
      }
      return null
    }

    case 'ai': {
      const chat = getAllChats().find((c) => c.id === id)
      return {
        id, type,
        title: chat?.title ?? `AI #${id.slice(-6)}`,
        ...colors,
        typeKey: 'ai',
      }
    }

    default:
      return null
  }
}
