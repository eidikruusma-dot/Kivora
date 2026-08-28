/**
 * automaticLinking.ts
 *
 * Automatic cross-module link creation service.
 *
 * runAutomaticLinking(type, id, lang):
 *   1. Computes all link suggestions for the entity (ignoring dismissed set).
 *   2. Silently creates links for every high-confidence match (score ≥ 0.65).
 *   3. If the entity has a date/time and no calendar link yet, auto-creates
 *      one calendar event and links it.
 *   4. Returns the IDs of created links + the created calendar event ID (for undo).
 *
 * Duplicate prevention:
 *   - addLink() is idempotent — it returns the existing link if the same
 *     from/to/relation triple already exists.
 *   - Calendar auto-create checks getAllEvents() for an event with the same
 *     title + date before creating a new one.
 */

import { computeSuggestions, type SourceSignals } from '@/lib/linkSuggestions'
import { addLink, getLinksForEntity, hasCalendarLink } from '@/lib/entityLinksStore'
import { addCalendarEvent, getAllEvents, updateCalendarEvent } from '@/lib/calendarStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { getAllTasks } from '@/lib/tasksStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllChats } from '@/lib/aiConversationsStore'
import { getAllSchoolTasks, getAllSchoolExams } from '@/lib/schoolStore'
import { decodeSchoolId } from '@/types/entityLinks'
import type { EntityType } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'
import type { Task } from '@/types'

// Every calendar event this service auto-creates gets an id with this
// prefix — it's the only place in the codebase that generates ids this way
// (see tasksStore.ts's deleteTask cascade, and CalendarPage.tsx's
// handleEventClick, which both check the same prefix to distinguish "owned
// by this task" from a merely-linked pre-existing event). Exported so those
// call sites reuse this one definition instead of redeclaring the literal.
export const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'

/**
 * Adds one hour to an "HH:MM" time string, clamped to 23:59 same day so a
 * late task time never rolls over into the next day (MockCalendarEvent has
 * no cross-midnight support).
 */
function addOneHourClamped(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (h >= 23) return '23:59'
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Result shape ──────────────────────────────────────────────────────────────

export interface AutoLinkResult {
  /** IDs of all EntityLink documents created by this auto-link run. */
  linkIds: string[]
  /** ID of the calendar event created by this run, or null. */
  calendarEventId: string | null
}

// ── Entity hint (caller-supplied signals) ─────────────────────────────────────

/**
 * Key signals for the newly-saved entity.
 * Pass these to runAutomaticLinking so it does not need to wait for the
 * store's onSnapshot listener to reflect the new entity.
 */
export interface EntityHint {
  title: string
  date?: string
  /** HH:MM. Absent/empty means the entity has no specific time (all-day). */
  time?: string
  description?: string
  category?: string
}

// ── Source signal helpers (mirrored from linkSuggestions internal) ────────────

interface EntityInfo {
  title: string
  date?: string
  time?: string
  isSchool: boolean
}

function getEntityInfo(type: EntityType, id: string): EntityInfo {
  switch (type) {
    case 'task': {
      const t = getAllTasks().find((x) => x.id === id)
      return { title: t?.title ?? '', date: t?.date, time: t?.time, isSchool: false }
    }
    case 'note': {
      const n = getAllNotes().find((x) => x.id === id)
      return { title: n?.title ?? '', isSchool: false }
    }
    case 'goal': {
      const g = getAllGoals().find((x) => x.id === id)
      return { title: g?.title ?? '', isSchool: false }
    }
    case 'habit': {
      const h = getAllHabits().find((x) => x.id === id)
      return { title: h?.title ?? '', isSchool: false }
    }
    case 'calendar': {
      // Calendar is the event itself; skip auto-calendar for calendar entities
      return { title: '', isSchool: false }
    }
    case 'ai': {
      const c = getAllChats().find((x) => x.id === id)
      return { title: c?.title ?? '', isSchool: false }
    }
    case 'school': {
      const decoded = decodeSchoolId(id)
      if (!decoded) return { title: '', isSchool: true }
      if (decoded.kind === 'task') {
        const st = getAllSchoolTasks().find((x) => String(x.id) === decoded.rawId)
        return { title: st?.title ?? '', date: st?.deadline, isSchool: true }
      }
      if (decoded.kind === 'exam') {
        const se = getAllSchoolExams().find((x) => String(x.id) === decoded.rawId)
        return { title: se?.title ?? '', date: se?.date, isSchool: true }
      }
      return { title: '', isSchool: true }
    }
    default:
      return { title: '', isSchool: false }
  }
}

// ── Duplicate calendar-event check ────────────────────────────────────────────

function calendarDuplicateExists(title: string, date: string): boolean {
  return getAllEvents().some(
    (e) =>
      e.date === date &&
      e.title.trim().toLowerCase() === title.trim().toLowerCase(),
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run automatic linking for a freshly-saved entity.
 *
 * @param type  - entity type
 * @param id    - entity ID (must already exist in Firestore or in-memory store)
 * @param lang  - UI language
 * @param hint  - key signals from the entity, supplied by the caller so this
 *                function does not depend on the store's onSnapshot having fired.
 *                When omitted, falls back to reading the store (suitable for
 *                in-memory-only entities like habits).
 */
export async function runAutomaticLinking(
  type: EntityType,
  id: string,
  lang: AppLang,
  hint?: EntityHint,
): Promise<AutoLinkResult> {
  const linkIds: string[] = []
  let calendarEventId: string | null = null

  // Build a SourceSignals override from the caller-supplied hint so that
  // computeSuggestions does not need to look the entity up from the store.
  const sourceOverride: SourceSignals | undefined = hint
    ? { title: hint.title, date: hint.date, description: hint.description, category: hint.category }
    : undefined

  // ── Step 1: auto-link high-confidence suggestions ─────────────────────────
  const suggestions = computeSuggestions(type, id, lang, new Set(), sourceOverride)
  const highConf = suggestions.filter((s) => s.isHighConfidence)

  for (const s of highConf) {
    try {
      const link = addLink({
        fromType: type,
        fromId: id,
        toType: s.type,
        toId: s.id,
        relationType: s.suggestedRelation,
      })
      linkIds.push(link.id)
    } catch {
      // Not authenticated or already exists — skip silently
    }
  }

  // ── Step 2: auto-create a calendar event if entity has a date ─────────────
  // Skip if: entity is calendar itself, already has a calendar link,
  // the date string is not ISO YYYY-MM-DD, or a duplicate event already exists.
  if (type !== 'calendar') {
    // Prefer hint data to avoid store-timing issues
    const info: EntityInfo = hint
      ? { title: hint.title, date: hint.date, time: hint.time, isSchool: type === 'school' }
      : getEntityInfo(type, id)
    const date = info.date

    if (
      date &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !hasCalendarLink(type, id) &&
      info.title &&
      !calendarDuplicateExists(info.title, date)
    ) {
      try {
        const eventId = `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const hasTime = Boolean(info.time)
        await addCalendarEvent({
          id: eventId,
          title: info.title,
          date,
          // A date with no explicit time is an all-day event — never a fake
          // 00:00–23:59 block, and never defaulted to a made-up time slot.
          allDay: !hasTime,
          startTime: hasTime ? info.time! : '',
          endTime: hasTime ? addOneHourClamped(info.time!) : '',
          color: '#6F5AE8',
          calendarId: info.isSchool ? 'school' : 'mine',
        })
        calendarEventId = eventId

        // Link the entity to the new calendar event
        try {
          const calLink = addLink({
            fromType: type,
            fromId: id,
            toType: 'calendar',
            toId: eventId,
            relationType: 'scheduled',
          })
          linkIds.push(calLink.id)
        } catch {
          // skip
        }
      } catch {
        // Calendar write failed — don't surface as error
        calendarEventId = null
      }
    }
  }

  return { linkIds, calendarEventId }
}

// ── Task edit → linked calendar event sync ────────────────────────────────────

/**
 * Keeps a task's auto-created calendar event (if any) in sync after the
 * task is edited — title, date, and timed/all-day state all follow the
 * task's current values on the *same* event (found via its `scheduled`
 * EntityLink), so editing never creates a duplicate.
 *
 * A task with no time is all-day; a task with a time is timed — this is
 * recomputed unconditionally from the task's current fields on every call,
 * which is also what converts a legacy event still holding the old
 * 09:00–10:00 fallback into a proper all-day event the next time the task
 * is saved.
 *
 * No-op if the task has no date, or has no calendar event this service
 * created for it (an event the task is merely linked to, but didn't create,
 * is left untouched — this never creates a new link/event on its own).
 */
export async function syncTaskCalendarEvent(task: Task): Promise<void> {
  if (!task.date) return

  const ownedLink = getLinksForEntity('task', task.id).find(
    (l) =>
      l.relationType === 'scheduled' &&
      l.fromType === 'task' &&
      l.fromId === task.id &&
      l.toType === 'calendar' &&
      l.toId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX),
  )
  if (!ownedLink) return

  const existing = getAllEvents().find((e) => e.id === ownedLink.toId)
  if (!existing) return

  const hasTime = Boolean(task.time)
  const updated: MockCalendarEvent = {
    ...existing,
    title: task.title,
    date: task.date,
    allDay: !hasTime,
    startTime: hasTime ? task.time! : '',
    endTime: hasTime ? addOneHourClamped(task.time!) : '',
  }

  try {
    await updateCalendarEvent(updated)
  } catch {
    // Calendar write failed — don't surface as error to the task-save flow
  }
}
