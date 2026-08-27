/**
 * Regression tests for a live safety bug: clicking "Kustuta" (Delete) in the
 * calendar event detail modal deleted the event immediately, with no
 * confirmation.
 *
 * Fix: EventDetailsModal.tsx now reuses the same inline confirmation-dialog
 * pattern already established by TasksPage.tsx/HabitsPage.tsx/NotesPage.tsx
 * (a `deleteRequested` flag opened by the Trash button, a `deleting`
 * re-entrancy guard, its own overlay dialog with role="dialog" +
 * aria-modal) — not window.confirm, not a second dialog system. Because
 * EventDetailsModal is the single shared component used by both
 * CalendarPage.tsx and the dashboard's CalendarWidget.tsx, both call sites
 * get the confirmation for free without duplicating the dialog.
 *
 * The onDelete prop itself (CalendarPage.tsx's handleDeleteEvent) already
 * only called removeLinksForEntity('calendar', id) + deleteCalendarEvent(id)
 * — verified below, from the actual store implementations, that this never
 * touches the tasks collection, so a linked task is never deleted, only the
 * event and the EntityLink rows referencing it. Deleting a *task* still
 * cascades to its own auto-created calendar event via tasksStore.ts's
 * deleteTask, which this fix does not touch (see taskDeleteCascade.test.ts).
 *
 * handleDeleteEvent was also made async, awaiting deleteCalendarEvent and
 * reusing the app's existing generic error-toast pattern (sonner's `toast`,
 * the same one TasksPage/HabitsPage/SchoolPage already use) on failure.
 *
 * The store half (event + link removal, task safety, failure propagation)
 * is verified functionally against a mocked Firestore, same harness shape
 * as taskDeleteCascade.test.ts / taskCalendarAllDayLinking.test.ts. The
 * component wiring has no React rendering harness in this repo, so it's
 * verified structurally against component source, consistent with every
 * other regression test here (see taskDeleteConfirmation.test.ts for the
 * exact precedent this mirrors).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/calendarEventDeleteConfirmation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntityLink } from '@/types/entityLinks'

// ── Store half: fake Firestore, same shape as taskDeleteCascade.test.ts ────

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError?: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const batchDeleteMock = vi.fn()
let batchCommitImpl: () => Promise<void> = () => Promise.resolve()
const batchCommitMock = vi.fn(() => batchCommitImpl())
const writeBatchMock = vi.fn(() => ({ delete: batchDeleteMock, commit: batchCommitMock }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

const { initTasksStore, getAllTasks } = await import('@/lib/tasksStore')
const { initEntityLinksStore, removeLinksForEntity } = await import('@/lib/entityLinksStore')
const { initCalendarStore, deleteCalendarEvent } = await import('@/lib/calendarStore')

const UID = 'user-a'

// initTasksStore -> onSnapshot call 0, initEntityLinksStore -> call 1,
// initCalendarStore -> call 2 (fixed order set in beforeEach below).
function seedTasks(tasks: { id: string; title: string; priority: 'low' | 'medium' | 'high'; completed: boolean }[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedLinks(links: EntityLink[]) {
  const onNext = onSnapshotMock.mock.calls[1][1]
  onNext({ docs: links.map((l) => ({ data: () => l })) })
}

function makeLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: `link-${Math.random().toString(36).slice(2, 8)}`,
    fromType: 'task',
    fromId: 'task-1',
    toType: 'calendar',
    toId: 'evt-1',
    relationType: 'scheduled',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  initTasksStore(null)
  initEntityLinksStore(null)
  initCalendarStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  batchDeleteMock.mockClear()
  batchCommitMock.mockClear()
  writeBatchMock.mockClear()
  batchCommitImpl = () => Promise.resolve()

  initTasksStore(UID)       // onSnapshot call index 0
  initEntityLinksStore(UID) // onSnapshot call index 1
  initCalendarStore(UID)    // onSnapshot call index 2
  seedLinks([])
})

describe('deleting a calendar event removes only the event and its relevant EntityLinks', () => {
  it('removeLinksForEntity + deleteCalendarEvent together delete the event doc and only the links that reference it', async () => {
    const ownLink = makeLink({ id: 'link-own', toId: 'evt-1' })
    const otherLink = makeLink({ id: 'link-other', fromId: 'task-2', toId: 'evt-2' })
    seedLinks([ownLink, otherLink])

    removeLinksForEntity('calendar', 'evt-1')
    await deleteCalendarEvent('evt-1')

    const deletedLinkPaths = batchDeleteMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect(deletedLinkPaths).toContain(`users/${UID}/entityLinks/link-own`)
    expect(deletedLinkPaths).not.toContain(`users/${UID}/entityLinks/link-other`)

    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    expect((deleteDocMock.mock.calls[0][0] as { path: string }).path).toBe(`users/${UID}/calendarEvents/evt-1`)
  })

  it('a task linked to the deleted event is never touched — no write ever targets the tasks collection', async () => {
    const link = makeLink({ id: 'link-1', fromType: 'task', fromId: 'task-1', toType: 'calendar', toId: 'evt-1' })
    seedLinks([link])
    seedTasks([{ id: 'task-1', title: 'Osta lilled', priority: 'medium', completed: false }])
    expect(getAllTasks()).toEqual([{ id: 'task-1', title: 'Osta lilled', priority: 'medium', completed: false }])

    removeLinksForEntity('calendar', 'evt-1')
    await deleteCalendarEvent('evt-1')

    // The task is still exactly as it was — nothing in this flow mutated tasksStore.
    expect(getAllTasks()).toEqual([{ id: 'task-1', title: 'Osta lilled', priority: 'medium', completed: false }])

    const batchPaths = batchDeleteMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    const deleteDocPaths = deleteDocMock.mock.calls.map((c) => (c[0] as { path: string }).path)
    expect([...batchPaths, ...deleteDocPaths].some((p) => p.includes('/tasks/'))).toBe(false)
  })

  it('deleting the event does not remove links belonging to other entities', async () => {
    const unrelated = makeLink({ id: 'link-unrelated', fromType: 'habit', fromId: 'habit-1', toType: 'calendar', toId: 'evt-9' })
    seedLinks([unrelated])

    removeLinksForEntity('calendar', 'evt-1') // no links reference evt-1
    await deleteCalendarEvent('evt-1')

    expect(batchDeleteMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })
})

describe('failure propagates safely — deleteCalendarEvent rejects instead of silently succeeding', () => {
  it('a Firestore failure on the event delete rejects the promise, so the caller\'s catch/toast actually fires', async () => {
    deleteDocMock.mockImplementationOnce(() => Promise.reject(new Error('simulated Firestore failure')))
    await expect(deleteCalendarEvent('evt-1')).rejects.toThrow('simulated Firestore failure')
  })

  it('a failed link cleanup reverts its own optimistic local state rather than throwing (matches addLink\'s convention)', async () => {
    const link = makeLink({ id: 'link-1', toId: 'evt-1' })
    seedLinks([link])
    batchCommitImpl = () => Promise.reject(new Error('simulated batch failure'))

    // removeLinksForEntity is fire-and-forget by design (like addLink) — it
    // must not throw synchronously even when its own write later rejects.
    expect(() => removeLinksForEntity('calendar', 'evt-1')).not.toThrow()
  })
})

// ── Component wiring: verified structurally (no React rendering harness) ──

const EVENT_DETAILS_MODAL_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/EventDetailsModal.tsx'),
  'utf8',
)
const CALENDAR_PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/CalendarPage.tsx'),
  'utf8',
)
const CALENDAR_WIDGET_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/CalendarWidget.tsx'),
  'utf8',
)
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

describe('clicking "Kustuta" only opens the confirmation — it does not delete', () => {
  it('the Trash button now calls handleRequestDelete, not onDelete, directly', () => {
    const trashButton = EVENT_DETAILS_MODAL_SRC.match(/onClick=\{handleRequestDelete\}[\s\S]{0,300}/)?.[0] ?? ''
    expect(trashButton).not.toBe('')
    expect(trashButton).toMatch(/cal\.action\.delete/)
  })

  it('handleRequestDelete only sets deleteRequested — it never calls onDelete', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleRequestDelete = \(\) => [^\n]*/)?.[0] ?? ''
    expect(fn).toMatch(/setDeleteRequested\(true\)/)
    expect(fn).not.toMatch(/onDelete/)
  })

  it('no call site invokes onDelete directly from the Trash button anymore', () => {
    expect(EVENT_DETAILS_MODAL_SRC).not.toMatch(/onClick=\{handleDelete\}/)
  })
})

describe('the existing confirmation-dialog pattern is reused, not window.confirm or a new system', () => {
  it('uses the same hand-rolled dialog structure as TasksPage/HabitsPage/NotesPage (deleteRequested flag + inline modal)', () => {
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/const \[deleteRequested, setDeleteRequested\] = useState\(false\)/)
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/const \[deleting, setDeleting\] = useState\(false\)/)
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/\{deleteRequested && \(/)
    expect(EVENT_DETAILS_MODAL_SRC.match(/role="dialog"/g)?.length).toBe(2) // detail dialog + confirm dialog
  })

  it('does not use window.confirm anywhere', () => {
    expect(EVENT_DETAILS_MODAL_SRC).not.toMatch(/window\.confirm/)
  })

  it('does not introduce a separate/duplicate modal primitive for this', () => {
    expect(EVENT_DETAILS_MODAL_SRC).not.toMatch(/from '@\/components\/ui\/(dialog|alert-dialog)'/)
  })

  it('CalendarWidget (the dashboard\'s event list) reuses the same shared EventDetailsModal without adding its own confirmation dialog', () => {
    expect(CALENDAR_WIDGET_SRC).toMatch(/<EventDetailsModal/)
    expect(CALENDAR_WIDGET_SRC).not.toMatch(/deleteRequested|role="dialog"/)
  })
})

describe('ET/EN copy for the confirmation dialog', () => {
  it('ET strings match exactly', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.title":\s*"Kustuta sündmus\?"/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.body":\s*"Seda toimingut ei saa tagasi võtta\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.cancel":\s*"Tühista"/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.confirm":\s*"Kustuta"/)
  })

  it('EN equivalents exist for every key', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.title":\s*"Delete event\?"/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.body":\s*"This action cannot be undone\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.cancel":\s*"Cancel"/)
    expect(TRANSLATIONS_SRC).toMatch(/"cal\.deleteConfirm\.confirm":\s*"Delete"/)
  })

  it('all four keys are declared in the TranslationKey union', () => {
    for (const key of ['title', 'body', 'confirm', 'cancel']) {
      expect(TRANSLATIONS_SRC).toMatch(new RegExp(`\\| "cal\\.deleteConfirm\\.${key}"`))
    }
  })
})

describe('Cancel closes the confirmation and leaves the event untouched', () => {
  it('handleCancelDelete only clears deleteRequested — it never calls onDelete', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleCancelDelete = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/setDeleteRequested\(false\)/)
    expect(fn).not.toMatch(/onDelete/)
  })

  it('the Cancel button and the backdrop both use handleCancelDelete', () => {
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/onClick=\{handleCancelDelete\}\s*\n\s*disabled=\{deleting\}[\s\S]{0,400}cal\.deleteConfirm\.cancel/)
    const backdrop = EVENT_DETAILS_MODAL_SRC.match(/rgba\(15, 23, 42, 0\.4\)[\s\S]{0,60}/)?.[0] ?? ''
    expect(backdrop).toMatch(/onClick=\{handleCancelDelete\}/)
  })

  it('a cancel while a delete is in flight is a no-op (guarded by the deleting flag)', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleCancelDelete = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/if \(deleting\) return/)
  })
})

describe('the confirm button deletes exactly once, and repeated clicks cannot double-delete', () => {
  it('handleConfirmDelete calls onDelete (the existing action) exactly once', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    const calls = (fn.match(/onDelete\(/g) ?? []).length
    expect(calls).toBe(1)
    expect(fn).toMatch(/await onDelete\(event\.id\)/)
  })

  it('handleConfirmDelete guards re-entrancy with the deleting flag before doing anything else', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/if \(deleting\) return/)
    expect(fn).toMatch(/setDeleting\(true\)/)
  })

  it('both dialog buttons are disabled while a delete is in flight, preventing a second click', () => {
    const confirmButton = EVENT_DETAILS_MODAL_SRC.match(/onClick=\{handleConfirmDelete\}[\s\S]{0,150}/)?.[0] ?? ''
    expect(confirmButton).toMatch(/disabled=\{deleting\}/)
    const cancelButton = EVENT_DETAILS_MODAL_SRC.match(/onClick=\{handleCancelDelete\}\s*\n\s*disabled=\{deleting\}/)?.[0] ?? ''
    expect(cancelButton).not.toBe('')
  })

  it('the confirmation and detail modal both close (deleteId/deleteRequested cleared, onClose called) only after the delete settles, in a finally block', () => {
    const fn = EVENT_DETAILS_MODAL_SRC.match(/const handleConfirmDelete = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/finally \{[\s\S]*?setDeleting\(false\)[\s\S]*?setDeleteRequested\(false\)[\s\S]*?onClose\(\)[\s\S]*?\}/)
  })

  it('the confirmation state resets whenever the displayed event changes, so a stale confirmation can never leak onto a different event', () => {
    const effect = EVENT_DETAILS_MODAL_SRC.match(/useEffect\(\(\) => \{\s*\n\s*setDeleteRequested\(false\)\s*\n\s*setDeleting\(false\)\s*\n\s*\}, \[event\?\.id\]\)/)?.[0] ?? ''
    expect(effect).not.toBe('')
  })
})

describe('failure behavior remains safe end to end (CalendarPage.tsx wiring)', () => {
  it('handleDeleteEvent is async, awaits deleteCalendarEvent, and reuses the existing generic error toast on failure', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleDeleteEvent = useCallback\(async \(id: string\) => \{[\s\S]*?\n  \}, \[lang\]\)/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/await deleteCalendarEvent\(id\)/)
    expect(fn).toMatch(/catch \{/)
    expect(fn).toMatch(/toast\.error\(lang === 'et' \? '[^']+' : '[^']+'\)/)
  })

  it('handleDeleteEvent still removes the event\'s EntityLinks via the existing store action', () => {
    const fn = CALENDAR_PAGE_SRC.match(/const handleDeleteEvent = useCallback\(async \(id: string\) => \{[\s\S]*?\n  \}, \[lang\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/removeLinksForEntity\('calendar', id\)/)
  })

  it('EventDetailsModal in CalendarPage is still wired to handleDeleteEvent via the onDelete prop', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/<EventDetailsModal[\s\S]{0,200}onDelete=\{handleDeleteEvent\}/)
  })
})

describe('unrelated calendar behavior is untouched by this fix', () => {
  it('editing and closing still call onEdit/onClose exactly as before', () => {
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/onClick=\{onEdit\}/)
    expect(EVENT_DETAILS_MODAL_SRC.match(/onClick=\{onClose\}/g)?.length).toBeGreaterThanOrEqual(2) // header close + footer close
  })

  it('all-day vs timed time-label rendering is unchanged', () => {
    expect(EVENT_DETAILS_MODAL_SRC).toMatch(/event\.allDay\s*\n\s*\? t\('cal\.allDay', lang\)\s*\n\s*: formatTimeRange\(event\.startTime, event\.endTime, timeFormat\)/)
  })

  it('CalendarPage still opens the edit modal, saves new events, and creates calendars exactly as before', () => {
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleUpdateEvent = useCallback\(\(event: MockCalendarEvent\) => \{/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleSaveEvent = useCallback\(\(event: MockCalendarEvent\) => \{/)
    expect(CALENDAR_PAGE_SRC).toMatch(/const handleSaveCalendar = useCallback\(\(calendar: UserCalendar\) => \{/)
  })
})
