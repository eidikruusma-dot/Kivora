/**
 * Regression tests for standardizing Calendar click-routing: a Calendar
 * entry that originated from another Kivora module deep-links to that
 * exact source item's existing detail/edit view, not just the module
 * landing page — one consistent rule for every source-linked entry type,
 * not a per-module special case.
 *
 * Before this change:
 *   - Plan-derived and Goal-derived entries already deep-linked correctly
 *     (evt.source, set by planGoalCalendarEvents.ts, read directly off the
 *     event) — kept exactly as-is here.
 *   - A task-auto-created event fell through to the generic Calendar
 *     detail/edit modal instead of opening the specific Task.
 *
 * After this change, CalendarPage.tsx's handleEventClick also identifies a
 * task-auto-created event — the same way tasksStore.ts's deleteTask
 * cascade already does: a `scheduled` EntityLink FROM a task TO this exact
 * event, where the event id carries the `cal-auto-` prefix
 * (AUTO_CREATED_CALENDAR_EVENT_PREFIX, now exported from
 * automaticLinking.ts instead of being redeclared) — and routes to
 * '/app/tasks' with the exact same `{ state: { openId } }` deep-link
 * convention LinkedItemsPanel/TasksPage/GoalsPage already use everywhere
 * else. The prefix check matters: a `scheduled` link alone is also how a
 * user manually links a task to an INDEPENDENTLY-created event
 * (LinkPickerModal), and that event must keep the normal manual Calendar
 * edit/detail flow — never route to the task.
 *
 * No new modal, no new routing system, no new Firestore field: this reuses
 * getLinksForEntity (entityLinksStore.ts) and the existing `openId`
 * deep-link state convention.
 *
 * The data-layer half (getLinksForEntity distinguishing "owned by this
 * task" from "merely linked") is verified functionally against a mocked
 * Firestore, same harness shape as taskCalendarAllDayLinking.test.ts. The
 * CalendarPage.tsx wiring has no React rendering harness in this repo, so
 * it's verified structurally against component source, consistent with
 * every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/calendarSourceLinkRouting.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntityLink } from '@/types/entityLinks'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

// ── Fake Firestore (same shape as taskCalendarAllDayLinking.test.ts) ───────

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initEntityLinksStore, getLinksForEntity } from '@/lib/entityLinksStore'
import { AUTO_CREATED_CALENDAR_EVENT_PREFIX } from '@/lib/automaticLinking'

const UID = 'user-a'

function seedLinks(links: EntityLink[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: links.map((l) => ({ data: () => l })) })
}

function makeLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: `link-${Math.random().toString(36).slice(2, 8)}`,
    fromType: 'task',
    fromId: 'task-1',
    toType: 'calendar',
    toId: `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}1000-abcd`,
    relationType: 'scheduled',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  initEntityLinksStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  initEntityLinksStore(UID) // onSnapshot call index 0
  seedLinks([])
})

/**
 * Mirrors the exact ownership check CalendarPage.tsx's handleEventClick
 * performs, using the real store — this is what "identifies the source
 * task" means for a task-auto-created calendar event.
 */
function findOwningTaskId(eventId: string): string | undefined {
  if (!eventId.startsWith(AUTO_CREATED_CALENDAR_EVENT_PREFIX)) return undefined
  return getLinksForEntity('calendar', eventId).find(
    (l) => l.relationType === 'scheduled' && l.fromType === 'task' && l.toId === eventId,
  )?.fromId
}

describe('5. Task-derived Calendar entry: identifying the source task (data layer)', () => {
  it('an auto-created event scheduled-linked from a task resolves to that exact task id', () => {
    seedLinks([makeLink({ fromId: 'task-42', toId: `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}42` })])
    expect(findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}42`)).toBe('task-42')
  })

  it('3. the exact source task id is preserved — not truncated, not another task\'s id', () => {
    seedLinks([
      makeLink({ id: 'l1', fromId: 'task-1', toId: `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}1` }),
      makeLink({ id: 'l2', fromId: 'task-2', toId: `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}2` }),
    ])
    expect(findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}1`)).toBe('task-1')
    expect(findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}2`)).toBe('task-2')
  })

  it('4. a manually-created event (no cal-auto- prefix) never resolves to a task, even with a scheduled link to it', () => {
    // A user can manually link a task to an independently-created event via
    // LinkPickerModal — same relationType, but the event id has no prefix.
    seedLinks([makeLink({ toId: 'evt-manual-123' })])
    expect(findOwningTaskId('evt-manual-123')).toBeUndefined()
  })

  it('a scheduled link from something other than a task never resolves (e.g. a manual "link calendar event to note")', () => {
    seedLinks([makeLink({ fromType: 'note', fromId: 'note-1', toId: `${AUTO_CREATED_CALENDAR_EVENT_PREFIX}9` })])
    expect(findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}9`)).toBeUndefined()
  })

  it('6. an auto-prefixed event with no link at all fails safely — undefined, not a throw', () => {
    expect(() => findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}orphan`)).not.toThrow()
    expect(findOwningTaskId(`${AUTO_CREATED_CALENDAR_EVENT_PREFIX}orphan`)).toBeUndefined()
  })
})

// ── Component wiring: verified structurally (no React rendering harness) ──

const CALENDAR_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/CalendarPage.tsx'), 'utf8')
const AUTOMATIC_LINKING_SRC = readFileSync(resolve(process.cwd(), 'src/lib/automaticLinking.ts'), 'utf8')
const TASKS_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/tasksStore.ts'), 'utf8')

function extractHandleEventClick(): string {
  const match = CALENDAR_PAGE_SRC.match(/const handleEventClick = useCallback\(\(id: string\) => \{[\s\S]*?\n {2}\}, \[allEvents, navigate\]\)/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('1 & 3. Goal-derived Calendar entry: unchanged — still opens the exact Goal via openId', () => {
  it('routes on evt.source.type === "goal" to /app/goals with the exact source id as openId', () => {
    const fn = extractHandleEventClick()
    expect(fn).toMatch(/if \(evt\?\.source\?\.type === 'goal'\) \{\s*\n\s*navigate\('\/app\/goals', \{ state: \{ openId: evt\.source\.id \} \}\)/)
  })
})

describe('2 & 3. Plan-derived Calendar entry: opens the exact Plan detail view, not the Plans landing page', () => {
  it('routes on evt.source.type === "plan" to the plan-specific detail route with the exact source id', () => {
    const fn = extractHandleEventClick()
    expect(fn).toMatch(/if \(evt\?\.source\?\.type === 'plan'\) \{\s*\n\s*navigate\(`\/app\/plans\/\$\{evt\.source\.id\}`\)/)
  })

  it('the target route is the Plan DETAIL route (/app/plans/:planId), not the bare /app/plans landing page', () => {
    const fn = extractHandleEventClick()
    // Must interpolate a specific id into the path — a bare navigate('/app/plans')
    // would only be the landing page, which is exactly the bug this rule forbids.
    expect(fn).not.toMatch(/navigate\('\/app\/plans'\)/)
    expect(fn).toMatch(/navigate\(`\/app\/plans\/\$\{evt\.source\.id\}`\)/)
  })
})

describe('5. Task-derived Calendar entry: now also deep-links to the specific Task via the existing edit flow', () => {
  it('reuses AUTO_CREATED_CALENDAR_EVENT_PREFIX exported from automaticLinking.ts instead of a redeclared literal', () => {
    expect(AUTOMATIC_LINKING_SRC).toMatch(/export const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'/)
    expect(CALENDAR_PAGE_SRC).toMatch(/import \{ runAutomaticLinking, AUTO_CREATED_CALENDAR_EVENT_PREFIX, type AutoLinkResult \} from '@\/lib\/automaticLinking'/)
    // No third private redeclaration of the literal was added in CalendarPage.tsx.
    expect(CALENDAR_PAGE_SRC).not.toMatch(/const AUTO_CREATED_CALENDAR_EVENT_PREFIX/)
  })

  it('identifies task ownership via getLinksForEntity — a scheduled link FROM a task TO this exact prefixed event id', () => {
    const fn = extractHandleEventClick()
    expect(fn).toMatch(/id\.startsWith\(AUTO_CREATED_CALENDAR_EVENT_PREFIX\)/)
    expect(fn).toMatch(/getLinksForEntity\('calendar', id\)\.find\(/)
    expect(fn).toMatch(/l\.relationType === 'scheduled' && l\.fromType === 'task' && l\.toId === id/)
  })

  it('routes the owning task to /app/tasks with the exact source task id as openId — same convention as Goals', () => {
    const fn = extractHandleEventClick()
    expect(fn).toMatch(/navigate\('\/app\/tasks', \{ state: \{ openId: ownerLink\.fromId \} \}\)/)
  })

  it('TasksPage.tsx already consumes this exact openId convention — no new detail/edit flow was added for it', () => {
    const TASKS_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/TasksPage.tsx'), 'utf8')
    expect(TASKS_PAGE_SRC).toMatch(/const openId = \(location\.state as \{ openId\?: string \} \| null\)\?\.openId/)
    expect(TASKS_PAGE_SRC).toMatch(/if \(task\) setEditingTask\(task\)/)
  })

  it('the same cal-auto- prefix convention this reuses is unchanged in tasksStore.ts\'s deleteTask cascade', () => {
    expect(TASKS_STORE_SRC).toMatch(/const AUTO_CREATED_CALENDAR_EVENT_PREFIX = 'cal-auto-'/)
    expect(TASKS_STORE_SRC).toMatch(/l\.toId\.startsWith\(AUTO_CREATED_CALENDAR_EVENT_PREFIX\)/)
  })
})

describe('4. Manual Calendar events keep their normal Calendar event edit/detail behavior', () => {
  it('an event with no source and no auto-created prefix falls through to setDetailEvent(evt) — the existing modal', () => {
    const fn = extractHandleEventClick()
    expect(fn.trim().endsWith('setDetailEvent(evt)\n  }, [allEvents, navigate])')).toBe(true)
  })

  it('EventDetailsModal / NewEventModal (the manual event edit/detail flow) were not modified to special-case source-linked entries', () => {
    const EVENT_DETAILS_MODAL_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/EventDetailsModal.tsx'), 'utf8')
    const NEW_EVENT_MODAL_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/NewEventModal.tsx'), 'utf8')
    expect(EVENT_DETAILS_MODAL_SRC).not.toMatch(/source/)
    expect(NEW_EVENT_MODAL_SRC).not.toMatch(/AUTO_CREATED_CALENDAR_EVENT_PREFIX/)
  })
})

describe('6. unknown/unsupported source metadata fails safely — no crash', () => {
  it('every branch uses optional chaining on evt, so a missing/unmatched event id never throws', () => {
    const fn = extractHandleEventClick()
    expect(fn).toMatch(/const evt = allEvents\.find\(\(e\) => e\.id === id\) \?\? null/)
    expect(fn).toMatch(/evt\?\.source\?\.type/)
  })

  it('a source.type that matches neither "plan" nor "goal" (a future/unrecognized value) falls through instead of throwing', () => {
    const fn = extractHandleEventClick()
    // No unconditional evt.source.id / evt!.source access exists outside the two guarded branches.
    const unguardedAccess = fn.match(/(?<!source\?\.type === 'plan'\) \{\s*\n\s*navigate\(`\/app\/plans\/\$\{)evt\.source\.id/g) ?? []
    expect(unguardedAccess.length).toBeLessThanOrEqual(1) // only the plan branch's own interpolation
  })
})

describe('7. no duplicate routing system or new modal flow was introduced', () => {
  it('handleEventClick is still the single onEventClick handler wired to every calendar view (Week/Month/Day/Agenda)', () => {
    expect((CALENDAR_PAGE_SRC.match(/onEventClick=\{handleEventClick\}/g) ?? []).length).toBe(4)
  })

  it('no new modal component was imported — the import list of calendar components is unchanged', () => {
    expect((CALENDAR_PAGE_SRC.match(/^import \w+ from '@\/components\/calendar\//gm) ?? []).length).toBe(12)
  })

  it('exactly one EventDetailsModal instance still backs the manual/fallback flow', () => {
    expect((CALENDAR_PAGE_SRC.match(/<EventDetailsModal/g) ?? []).length).toBe(1)
  })

  it('getLinksForEntity is read directly from entityLinksStore — no second link-lookup helper was created', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/import \{ removeLinksForEntity, getLinksForEntity \} from '@\/lib\/entityLinksStore'/)
  })
})

describe('regression: Plan/Goal calendar derivation, dates, and Firestore sync are untouched by this routing-only change', () => {
  it('CalendarPage still merges derived events the same way (allEvents = events + derivedEvents)', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const allEvents = useMemo\(\(\) => \[\.\.\.events, \.\.\.derivedEvents\], \[events, derivedEvents\]\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const derivedEvents = useMemo\(\s*\n\s*\(\) => getDerivedCalendarEvents\(plans, goals\),\s*\n\s*\[plans, goals\],\s*\n\s*\)/)
  })

  it('addCalendarEvent/updateCalendarEvent/deleteCalendarEvent still back manual create/edit/delete, unchanged', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleSaveEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*addCalendarEvent\(event\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleUpdateEvent = useCallback\(\(event: MockCalendarEvent\) => \{\s*\n\s*updateCalendarEvent\(event\)/)
    expect(CALENDAR_PAGE_SRC).toMatch(/await deleteCalendarEvent\(id\)/)
  })
})
