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
 * Every write runAutomaticLinking() makes — any new EntityLink, the one
 * auto-created CalendarEvent, and the AiAction log entry/entries describing
 * them (Kivora 2.0, Etapp 2.2's action-history system, see aiActionsStore.ts)
 * — lands in ONE Firestore transaction, never the store's own public
 * addLink()/addCalendarEvent() (those keep their existing, independent,
 * random-ID write behavior for every OTHER caller, e.g. manual linking via
 * SuggestedLinksPanel).
 *
 * Duplicate prevention:
 *   - Candidate links/calendar event are written under a DETERMINISTIC id
 *     (see deterministicLinkId()/deterministicCalendarEventId() below), and
 *     the transaction's tx.get() on that exact id is the server-
 *     authoritative existence check — this is what makes two near-
 *     simultaneous runAutomaticLinking() calls for the same entity converge
 *     on exactly one document instead of two, which a local in-memory check
 *     or a plain writeBatch (no reads) cannot guarantee on its own.
 *   - Calendar auto-create also still checks getAllEvents() for an event
 *     with the same title + date first, as a fast local pre-filter before
 *     ever starting a transaction (same as before this change).
 */

import { runTransaction } from 'firebase/firestore'
import { computeSuggestions, type SourceSignals } from '@/lib/linkSuggestions'
import { getLinksForEntity, hasCalendarLink, removeLink, linkDoc } from '@/lib/entityLinksStore'
import { addCalendarEvent, getAllEvents, updateCalendarEvent, deleteCalendarEvent, eventDoc } from '@/lib/calendarStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import { getAllTasks } from '@/lib/tasksStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllChats } from '@/lib/aiConversationsStore'
import { getAllSchoolTasks, getAllSchoolExams, getAllSchoolSubjects } from '@/lib/schoolStore'
import { decodeSchoolId, encodeSchoolId, type SchoolEntityKind, type RelationType, type EntityLink } from '@/types/entityLinks'
import type { EntityType } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'
import type { Task } from '@/types'
import { db, auth } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import { actionDoc, generateAiActionRetryKey, type AiAction, type AiActionChange } from '@/lib/aiActionsStore'

// Every calendar event this service auto-creates gets an id with this
// prefix — it's the only place in the codebase that generates ids this way
// (see tasksStore.ts's deleteTask cascade, and CalendarPage.tsx's
// handleEventClick, which both check the same prefix to distinguish "owned
// by this task" from a merely-linked pre-existing event). Exported so those
// call sites reuse this one definition instead of redeclaring the literal.
export const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'

/**
 * Finds the calendar event id this service itself auto-created for the
 * given entity (if any) — the same "owned scheduled link" lookup
 * syncTaskCalendarEvent()/tasksStore.ts's deleteTask cascade already use
 * internally, pulled out here as its own small, read-only helper so other
 * code (e.g. dailyObservations.ts) can check "does this task already have
 * its own mirror calendar event" without re-deriving the same filter a
 * fourth time, and without risking a double-count: a task and the single
 * calendar event this service created to represent it are the SAME
 * commitment shown in two places, never two separate ones.
 */
export function findOwnedCalendarEventId(fromType: EntityType, fromId: string): string | undefined {
  return getLinksForEntity(fromType, fromId).find(
    (l) =>
      l.relationType === 'scheduled' &&
      l.fromType === fromType &&
      l.fromId === fromId &&
      l.toType === 'calendar' &&
      l.toId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX),
  )?.toId
}

// ── Deterministic IDs for the automatic write path (Kivora 2.0, Etapp 2.2) ──
//
// addLink()'s own public API (used by manual flows, e.g. SuggestedLinksPanel)
// keeps its existing random-ID scheme untouched — these deterministic IDs
// are used ONLY by runAutomaticLinking()'s own internal transactional write
// path below, specifically to let a Firestore transaction check "does this
// exact link/event already exist" by a direct document read (tx.get()),
// rather than relying solely on the local in-memory cache (entityLinksStore's
// existing addLink() dedup check), which cannot by itself prevent two
// near-simultaneous runAutomaticLinking() calls from both creating the same
// semantic link/event. The encoded tuple is used directly (not hashed) to
// make the id self-describing and to avoid any hash-collision risk; none of
// fromId/toId ever contain '/' (Task ids are UUIDs, School ids are
// "kind:rawId", calendar event ids are "cal-auto-..."), so this is a safe
// Firestore document id in every real case.

function deterministicLinkId(
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  relationType: RelationType,
): string {
  return `autolink__${fromType}__${fromId}__${relationType}__${toType}__${toId}`
}

function deterministicCalendarEventId(type: EntityType, id: string): string {
  return `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}${type}__${id}`
}

// The color every auto-created calendar event has always defaulted to
// (Tasks, Notes, Goals, Habits, AI chats, and — until now — School items
// alike). Kept as the fallback for School items whose subject color can't
// be resolved (see resolveSchoolItemColor below) — never a new color.
const DEFAULT_AUTO_EVENT_COLOR = '#6F5AE8'

/**
 * Resolves the Calendar color for a School-derived event to the SAME color
 * School itself already shows for that item — never a second,
 * Calendar-specific color mapping.
 *
 * Prefers a live lookup of the item's subjectId against the current
 * School subjects list (getAllSchoolSubjects) — the source of truth for a
 * subject's color — so a subject's color change is reflected even for
 * items created before the change. Falls back to the item's own
 * last-stored subjectColor/iconColor snapshot when subjectId is missing or
 * no longer resolves to an existing subject (legacy items, or a since-
 * deleted subject), and finally to the same generic default every other
 * auto-created calendar event already uses.
 */
/**
 * Resolves a School subject the same way SchoolPage.tsx itself already
 * does when assigning a task/exam to a subject (its `matchedSubject`
 * lookups, e.g. `subjects.find((s) => s.name === subject.trim())`): by
 * subjectId first, falling back to an exact trimmed-name match for legacy
 * items that predate the subjectId field — never a new matching rule
 * invented for Calendar.
 */
function findSchoolSubject(subjectId: string | undefined, subjectName: string) {
  const subjects = getAllSchoolSubjects()
  return (
    (subjectId ? subjects.find((s) => s.id === subjectId) : undefined) ??
    subjects.find((s) => s.name === subjectName.trim())
  )
}

function resolveSchoolItemColor(schoolId: string): string {
  const decoded = decodeSchoolId(schoolId)
  if (!decoded) return DEFAULT_AUTO_EVENT_COLOR

  if (decoded.kind === 'task') {
    const task = getAllSchoolTasks().find((x) => String(x.id) === decoded.rawId)
    if (!task) return DEFAULT_AUTO_EVENT_COLOR
    const subject = findSchoolSubject(task.subjectId, task.subject)
    return subject?.color ?? task.subjectColor ?? DEFAULT_AUTO_EVENT_COLOR
  }

  if (decoded.kind === 'exam') {
    const exam = getAllSchoolExams().find((x) => String(x.id) === decoded.rawId)
    if (!exam) return DEFAULT_AUTO_EVENT_COLOR
    const subject = findSchoolSubject(exam.subjectId, exam.subject)
    return subject?.color ?? exam.iconColor ?? DEFAULT_AUTO_EVENT_COLOR
  }

  return DEFAULT_AUTO_EVENT_COLOR
}

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
interface LinkCandidate {
  fromType: EntityType
  fromId: string
  toType: EntityType
  toId: string
  relationType: RelationType
  id: string
}

function buildLinkCandidate(
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  relationType: RelationType,
): LinkCandidate {
  return {
    fromType,
    fromId,
    toType,
    toId,
    relationType,
    id: deterministicLinkId(fromType, fromId, toType, toId, relationType),
  }
}

function buildLinkDocData(c: LinkCandidate, now: number): EntityLink {
  return {
    id: c.id,
    fromType: c.fromType,
    fromId: c.fromId,
    toType: c.toType,
    toId: c.toId,
    relationType: c.relationType,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Run automatic linking for a freshly-saved entity.
 *
 * Kivora 2.0, Etapp 2.2 — every write this function makes (any new
 * EntityLink, the one auto-created CalendarEvent, and the AiAction log
 * entry/entries describing them) lands in ONE Firestore transaction: it all
 * commits together or nothing does, so a logging failure can never leave an
 * un-logged automatic change, and a data-write failure can never leave a
 * dangling, unlogged link/event either.
 *
 * Duplicate prevention across concurrent calls: each candidate link/event
 * is written under a DETERMINISTIC id (see deterministicLinkId() /
 * deterministicCalendarEventId() above), and the transaction's tx.get() on
 * that exact id is the server-authoritative existence check — never the
 * local in-memory cache alone. Two near-simultaneous calls that would
 * otherwise both decide "this doesn't exist yet" are resolved by Firestore
 * itself: whichever transaction commits first wins, and the other's tx.get()
 * (on retry) sees the now-existing document and skips writing it again.
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
  const uid = auth.currentUser?.uid
  if (!uid) return { linkIds: [], calendarEventId: null }

  // Build a SourceSignals override from the caller-supplied hint so that
  // computeSuggestions does not need to look the entity up from the store.
  const sourceOverride: SourceSignals | undefined = hint
    ? { title: hint.title, date: hint.date, description: hint.description, category: hint.category }
    : undefined

  // ── Step 1 candidates: high-confidence suggested links ────────────────────
  const suggestions = computeSuggestions(type, id, lang, new Set(), sourceOverride)
  const highConf = suggestions.filter((s) => s.isHighConfidence)
  const linkCandidates = highConf.map((s) => buildLinkCandidate(type, id, s.type, s.id, s.suggestedRelation))

  // ── Step 2 candidate: one auto-created calendar event + its scheduled link
  // Skip if: entity is calendar itself, already has a calendar link,
  // the date string is not ISO YYYY-MM-DD, or a duplicate event already exists.
  // (These are the same fast, local pre-checks as before — they decide
  // WHETHER to attempt the candidate at all; the transaction below decides,
  // server-authoritatively, whether to actually write it.)
  let calendarCandidate: { event: MockCalendarEvent; link: LinkCandidate } | null = null
  if (type !== 'calendar') {
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
      const eventId = deterministicCalendarEventId(type, id)
      const hasTime = Boolean(info.time)
      const event: MockCalendarEvent = {
        id: eventId,
        title: info.title,
        date,
        // A date with no explicit time is an all-day event — never a fake
        // 00:00–23:59 block, and never defaulted to a made-up time slot.
        allDay: !hasTime,
        startTime: hasTime ? info.time! : '',
        endTime: hasTime ? addOneHourClamped(info.time!) : '',
        color: info.isSchool ? resolveSchoolItemColor(id) : DEFAULT_AUTO_EVENT_COLOR,
        calendarId: info.isSchool ? 'school' : 'mine',
      }
      const link = buildLinkCandidate(type, id, 'calendar', eventId, 'scheduled')
      calendarCandidate = { event, link }
    }
  }

  // Nothing to do — zero Firestore calls, exactly like before this change.
  if (linkCandidates.length === 0 && !calendarCandidate) {
    return { linkIds: [], calendarEventId: null }
  }

  try {
    return await runTransaction(db, async (tx) => {
      const linkIds: string[] = []
      let calendarEventId: string | null = null

      // All reads before any writes (a Firestore transaction requirement).
      const linkSnaps = await Promise.all(linkCandidates.map((c) => tx.get(linkDoc(uid, c.id))))
      const calLinkSnap = calendarCandidate ? await tx.get(linkDoc(uid, calendarCandidate.link.id)) : null
      const calEventSnap = calendarCandidate ? await tx.get(eventDoc(uid, calendarCandidate.event.id)) : null

      const now = Date.now()
      const nowIso = new Date(now).toISOString()

      // ── Step 1: write every link that doesn't already exist ────────────
      const createLinkChanges: AiActionChange[] = []
      linkCandidates.forEach((c, i) => {
        linkIds.push(c.id)
        if (linkSnaps[i].exists()) return // already created — this or a concurrent call won the race
        tx.set(linkDoc(uid, c.id), sanitizeForFirestore(buildLinkDocData(c, now)))
        createLinkChanges.push({
          module: c.toType,
          entityId: c.id,
          field: 'link',
          oldValue: { present: false },
          newValue: { present: true, value: c.id },
        })
      })

      if (createLinkChanges.length > 0) {
        const retryKey = generateAiActionRetryKey()
        const action: AiAction = {
          id: retryKey,
          type: 'createLink',
          module: type,
          entityId: id,
          relatedChanges: createLinkChanges,
          reason: 'Automatic cross-module link creation (runAutomaticLinking)',
          createdAt: nowIso,
          revertible: true,
          revertStatus: 'none',
          snapshotUpdatedAt: Object.fromEntries(createLinkChanges.map((c) => [c.entityId, String(now)])),
        }
        tx.set(actionDoc(uid, retryKey), sanitizeForFirestore(action))
      }

      // ── Step 2: write the calendar event and/or its link if new ────────
      if (calendarCandidate && calLinkSnap && calEventSnap) {
        const eventExists = calEventSnap.exists()
        const linkExists = calLinkSnap.exists()

        if (!eventExists || !linkExists) {
          const relatedChanges: AiActionChange[] = []

          if (!eventExists) {
            const eventData: MockCalendarEvent = { ...calendarCandidate.event, updatedAt: nowIso }
            tx.set(eventDoc(uid, calendarCandidate.event.id), sanitizeForFirestore(eventData))
            relatedChanges.push({
              module: 'calendar',
              entityId: calendarCandidate.event.id,
              field: 'event',
              oldValue: { present: false },
              newValue: { present: true, value: calendarCandidate.event.id },
            })
            calendarEventId = calendarCandidate.event.id
          }

          if (!linkExists) {
            tx.set(
              linkDoc(uid, calendarCandidate.link.id),
              sanitizeForFirestore(buildLinkDocData(calendarCandidate.link, now)),
            )
            relatedChanges.push({
              module: 'calendar',
              entityId: calendarCandidate.link.id,
              field: 'link',
              oldValue: { present: false },
              newValue: { present: true, value: calendarCandidate.link.id },
            })
          }
          linkIds.push(calendarCandidate.link.id)

          const retryKey = generateAiActionRetryKey()
          const action: AiAction = {
            id: retryKey,
            type: 'createCalendarEvent',
            module: type,
            entityId: id,
            relatedChanges,
            reason: 'Automatic calendar event creation (runAutomaticLinking)',
            createdAt: nowIso,
            revertible: true,
            revertStatus: 'none',
            snapshotUpdatedAt: Object.fromEntries(
              relatedChanges.map((c) => [c.entityId, c.field === 'event' ? nowIso : String(now)]),
            ),
          }
          tx.set(actionDoc(uid, retryKey), sanitizeForFirestore(action))
        }
      }

      return { linkIds, calendarEventId }
    })
  } catch {
    // Transaction failed (offline, permission, etc.) — never surfaced as an
    // error to the caller, matching this file's existing best-effort
    // behavior. Because it's a single transaction, nothing partial was
    // committed: no dangling link/event without its log entry, and no log
    // entry without the data it describes.
    return { linkIds: [], calendarEventId: null }
  }
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
 * No-op if the task has no calendar event this service created for it (an
 * event the task is merely linked to, but didn't create, is left untouched
 * — this never creates a new link/event on its own).
 *
 * If the task's date was removed, its owned event can no longer represent
 * it on any day — it is deleted (along with the one link that pointed to
 * it) rather than left behind on its old date. Only the task's OWN owned
 * event/link are touched: never other entities' links, never a calendar
 * event the task didn't create (see AUTO_CREATED_CALENDAR_EVENT_PREFIX),
 * and never any field on the Task document itself (this function never
 * writes to the task — see tasksStore.ts for that).
 */
export async function syncTaskCalendarEvent(task: Task): Promise<void> {
  const ownedLink = getLinksForEntity('task', task.id).find(
    (l) =>
      l.relationType === 'scheduled' &&
      l.fromType === 'task' &&
      l.fromId === task.id &&
      l.toType === 'calendar' &&
      l.toId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX),
  )
  if (!ownedLink) return

  if (!task.date) {
    try {
      // deleteDoc() on an already-gone event is a safe no-op, so a retry
      // (next edit) after a prior partial failure never throws here.
      await deleteCalendarEvent(ownedLink.toId)
    } catch (err) {
      // Logged (not silently swallowed, per review) but not re-thrown: a
      // calendar-cleanup failure must never block the task save itself.
      // The link is deliberately left in place — same "owned event still
      // exists" state as before this call — so the next edit retries the
      // same cleanup instead of detaching the link from an event that
      // never actually got deleted.
      console.error('[automaticLinking] syncTaskCalendarEvent: failed to delete owned calendar event after task date was removed', err)
      return
    }
    // removeLink() is fire-and-forget by design (entityLinksStore.ts): it
    // updates local state optimistically and, if its own Firestore write
    // fails, reverts the link back into local state on its own. That
    // revert is exactly what makes this self-healing — if this specific
    // write fails, the link simply reappears and the next edit's call to
    // this function finds the same ownedLink again and retries (the event
    // is already gone by then, so only the link removal is retried).
    removeLink(ownedLink.id)
    return
  }

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

// ── School item edit → linked calendar event sync ────────────────────────────

/**
 * Finds the `scheduled` EntityLink from a School item to a calendar event
 * THIS SERVICE created for it (never one it's merely linked to — see the
 * AUTO_CREATED_CALENDAR_EVENT_PREFIX check, the same "owned vs. merely
 * linked" distinction syncTaskCalendarEvent relies on for Tasks). Shared by
 * syncSchoolCalendarEvent and deleteSchoolCalendarEvent below so the exact
 * "which event does this item own" rule is defined in exactly one place.
 */
function findOwnedSchoolCalendarLink(schoolId: string) {
  return getLinksForEntity('school', schoolId).find(
    (l) =>
      l.relationType === 'scheduled' &&
      l.fromType === 'school' &&
      l.fromId === schoolId &&
      l.toType === 'calendar' &&
      l.toId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX),
  )
}

/**
 * Keeps a School task's or exam's auto-created calendar event (if any) on
 * the same date — and the same subject color — as the item after an edit.
 * The date part is the School equivalent of syncTaskCalendarEvent above,
 * reusing the exact same "owned scheduled link" lookup and
 * updateCalendarEvent() write, so the update lands on the SAME event id
 * and never creates a second event. The color part reuses
 * resolveSchoolItemColor (the same resolution runAutomaticLinking and
 * syncSchoolCalendarEventCompletion already use) so a subject recolor is
 * picked up the next time this — already existing — sync path runs, e.g.
 * on the item's next date-carrying save, without a dedicated "resync all
 * events for this subject" mechanism.
 *
 * No-op if:
 *   - the item has no date, or
 *   - it has no calendar event this service created for it (an item with
 *     no existing auto-created event never gains one here — only
 *     runAutomaticLinking creates new events), or
 *   - the event is already on that date AND already has the item's
 *     current color (avoids a pointless write).
 *
 * Scoped to date and color only — the event's own title/time/allDay are
 * left exactly as they were (created once, by runAutomaticLinking, on the
 * item's first save).
 */
export async function syncSchoolCalendarEvent(
  kind: SchoolEntityKind,
  rawId: string | number,
  date: string | undefined,
): Promise<void> {
  if (!date) return
  const schoolId = encodeSchoolId(kind, rawId)

  const ownedLink = findOwnedSchoolCalendarLink(schoolId)
  if (!ownedLink) return

  const existing = getAllEvents().find((e) => e.id === ownedLink.toId)
  if (!existing) return

  const color = resolveSchoolItemColor(schoolId)
  if (existing.date === date && existing.color === color) return

  try {
    await updateCalendarEvent({ ...existing, date, color })
  } catch {
    // Calendar write failed — don't surface as error to the school-save flow
  }
}

/**
 * Hides or restores a School task's auto-created calendar event based on
 * its completion state — a completed School deadline's derived Calendar
 * entry must disappear immediately, and reappear if the item is marked
 * incomplete again, while the School item's own record is never touched
 * (only the derived calendar event is created/deleted here).
 *
 * Reuses the exact same "owned scheduled link" lookup as
 * syncSchoolCalendarEvent/deleteSchoolCalendarEvent above — never a
 * second completion-tracking mechanism. The caller (SchoolPage.tsx) is
 * expected to pass the School task's own progress-derived done state
 * (see schoolStore.tsx's markSchoolTaskDone/Undone) — this function does
 * not read or store completion itself.
 *
 * completed: true  → deletes the owned event, if any. No-op if there is
 *                     none, or it's already gone.
 * completed: false → recreates it under the SAME event id (from the owned
 *                     scheduled link), using the item's CURRENT title/date
 *                     — so an edit made while the item was completed is
 *                     reflected once it reappears. No-op if the event is
 *                     already present (avoids a duplicate), or the item no
 *                     longer has a valid date/title to recreate from.
 *
 * No-op entirely if the item never had an auto-created calendar event to
 * begin with (e.g. no due date was ever set) — this never creates a link
 * that didn't already exist, and never touches an event this service
 * didn't create (a manually-created or merely-linked event is untouched).
 */
export async function syncSchoolCalendarEventCompletion(
  kind: SchoolEntityKind,
  rawId: string | number,
  completed: boolean,
): Promise<void> {
  const schoolId = encodeSchoolId(kind, rawId)
  const ownedLink = findOwnedSchoolCalendarLink(schoolId)
  if (!ownedLink) return

  if (completed) {
    try {
      await deleteCalendarEvent(ownedLink.toId)
    } catch {
      // Calendar write failed — don't surface as error to the school-save flow
    }
    return
  }

  // Un-completing: only recreate if it isn't already visible (idempotent —
  // e.g. a second "mark incomplete" while it's already showing is a no-op).
  if (getAllEvents().some((e) => e.id === ownedLink.toId)) return

  const info = getEntityInfo('school', schoolId)
  if (!info.date || !/^\d{4}-\d{2}-\d{2}$/.test(info.date) || !info.title) return

  try {
    await addCalendarEvent({
      id: ownedLink.toId,
      title: info.title,
      date: info.date,
      // School tasks carry no time field — always recreated as an all-day
      // event, matching how runAutomaticLinking originally created it.
      allDay: true,
      startTime: '',
      endTime: '',
      color: resolveSchoolItemColor(schoolId),
      calendarId: 'school',
    })
  } catch {
    // Calendar write failed — don't surface as error to the school-save flow
  }
}

// ── School item delete → owned calendar event cleanup ────────────────────────

/**
 * Deletes a School task's or exam's auto-created calendar event (if any) —
 * call this BEFORE removeLinksForEntity('school', schoolId) so the owned
 * `scheduled` link (and thus the event id) can still be resolved; the link
 * row itself is cleaned up separately by removeLinksForEntity as before,
 * this only removes the calendarEvents document it pointed to.
 *
 * Identifies the owned event exclusively through the `scheduled` EntityLink
 * + `cal-auto-` prefix (the same rule syncSchoolCalendarEvent and Tasks'
 * own deleteTask cascade use) — never by matching title/date, so a
 * manually created event, or one the item is merely linked to (not one
 * this service created for it), is never touched.
 *
 * No-op (deletion of the School item itself continues normally either way)
 * if there is no owned calendar event to begin with.
 */
export async function deleteSchoolCalendarEvent(
  kind: SchoolEntityKind,
  rawId: string | number,
): Promise<void> {
  const schoolId = encodeSchoolId(kind, rawId)
  const ownedLink = findOwnedSchoolCalendarLink(schoolId)
  if (!ownedLink) return

  try {
    await deleteCalendarEvent(ownedLink.toId)
  } catch {
    // Calendar delete failed — don't block the rest of the school-item deletion
  }
}
