/**
 * Regression coverage for a live production incident that surfaced right
 * after the short "jah"/"yes" confirmation fix (see
 * aiAssistantUxRegression.test.ts) shipped: a real two-turn delete flow —
 * "Kustuta ülesanne „X”." → AI asks to confirm → user replies just "Jah" —
 * still made the AI repeat the exact same confirmation question, and the
 * task was never deleted.
 *
 * ROOT CAUSE — traced across the full pending-destructive-action lifecycle:
 *
 * 1. Where the pending action is created: exclusively inside
 *    executeDestructiveAction() (aiActions.ts), which only runs when the
 *    MODEL actually emits a delete_* action for executeActionsAsync to
 *    process. It is never created from the model's free-text reply alone.
 *
 * 2. Where/how it's stored: a module-level singleton,
 *    _pendingDestructiveAction, in aiActions.ts. It survives fine across
 *    separate sendMessage() calls in the real app (same JS module instance,
 *    no React/component lifecycle involved) — this was NOT the bug.
 *
 * 3. The actual bug: the OLD system prompt (buildChatMessages.ts,
 *    DELETIONS section) explicitly told the model NOT to emit the delete_*
 *    action on the first request — "ESIMESE kustutamispalve peale ÄRA veel
 *    seda delete_* toimingut emiteeri" — and to ask a confirmation
 *    question in its own free-text reply instead. When the model correctly
 *    followed that instruction (as it did in the live incident — the
 *    confirmation text the user saw, with „…” typographic quotes, matches
 *    the PROMPT's own example verbatim, not aiActions.ts's confirmQuestion
 *    template, which uses plain "..." quotes), executeActionsAsync on turn
 *    1 received actions: [] — so executeDestructiveAction() never ran, and
 *    _pendingDestructiveAction was NEVER SET.
 *
 * 4. What resolveShortConfirmationReply("Jah") receives on turn 2: exactly
 *    what it's supposed to — but _pendingDestructiveAction is null, so
 *    (correctly, safely) it returns null and defers to the normal AI
 *    round-trip, per its own "never execute without a genuinely pending
 *    action" contract. This part of the round-9 fix was never the problem.
 *
 * 5. What actually produced the repeated question: falling through to the
 *    model on turn 2, the model (now free to emit the action, having
 *    logged the user's confirmation) emits delete_task for the FIRST time
 *    from the code gate's point of view. executeDestructiveAction() sees
 *    nothing pending, so — completely correctly, by design — it treats
 *    this as a brand NEW first proposal: it asks the user to confirm AGAIN
 *    instead of deleting. From the user's perspective this reads as "the
 *    AI repeated the exact same question and never deleted anything."
 *
 * 6. Nothing about React/component lifecycle, module re-instantiation, or
 *    the store layer was involved — the singleton itself is reliable. The
 *    entire bug was that the prompt's own two-step wording (model decides
 *    whether to withhold the action) fought against the code gate's design
 *    (code decides whether to execute, based on whether the action was
 *    already proposed once before) — the code gate can only ever engage
 *    once the model actually emits the action.
 *
 * FIX (prompt-only, buildChatMessages.ts's DELETIONS section — the
 * destructive-action gate in aiActions.ts is completely untouched): the
 * model is now told to ALWAYS emit the exact delete_* action every time a
 * deletion is requested, including the very first time — the app itself
 * (not the model) decides whether that execute or asks for confirmation.
 * This guarantees _pendingDestructiveAction is reliably populated as soon
 * as a deletion is first requested, which is exactly what
 * resolveShortConfirmationReply needs to resolve a short "jah"/"yes"/"ei"
 * locally on the very next turn, without ever sending it through the model.
 *
 * This file drives the REAL two-turn call chain end to end, exactly as
 * AIAssistantPage.tsx's sendMessage() does it: real fetchAIReply (network
 * mocked) for turn 1 → real executeActionsAsync → real composeFinalReply;
 * then, for turn 2, the SAME real shouldHandleAsShortConfirmationReply /
 * resolveShortConfirmationReply / composeFinalReply the component calls,
 * with NO further network call — proving the short-reply path is resolved
 * entirely client-side once the pending action actually exists.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiDeleteTwoTurnConfirmationFlow.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'

type MockAuthUser = { uid: string; getIdToken: () => Promise<string> } | null
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null as MockAuthUser },
  storage: {},
}))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))
const getDocMock = vi.fn(() => Promise.resolve({ exists: () => true }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/moneyStore', () => ({
  getAllTransactions: vi.fn(() => []),
  getAllBills: vi.fn(() => []),
  getMonthSummary: vi.fn(() => ({
    totalIncome: 0, totalExpenses: 0, totalSavings: 0,
    currentAccountBalance: null, monthlyNetCashFlow: 0,
    availableMoney: null, upcomingBillsTotal: 0,
  })),
}))
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolTasks: vi.fn(() => []),
  getAllSchoolExams: vi.fn(() => []),
  getAllSchoolSubjects: vi.fn(() => []),
}))
vi.mock('@/lib/notificationItemsStore', () => ({ getAll: vi.fn(() => []) }))
vi.mock('@/lib/modulesStore', () => ({
  getModuleSettings: vi.fn(() => ({
    calendar: true, tasks: true, notes: true, habits: true, goals: true,
    plans: true, finance: true, school: true, assistant: true, onboardingComplete: true,
  })),
}))

import { initTasksStore, getAllTasks } from '@/lib/tasksStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initPlansStore } from '@/lib/plansStore'
import { fetchAIReply } from '@/lib/aiClient'
import {
  executeActionsAsync,
  composeFinalReply,
  shouldHandleAsShortConfirmationReply,
  resolveShortConfirmationReply,
  __resetDestructiveActionGateForTests,
} from '@/lib/aiActions'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes() { onSnapshotMock.mock.calls[1][1]({ docs: [] }) }
function seedHabits() { onSnapshotMock.mock.calls[2][1]({ docs: [] }) }
function seedGoals() { onSnapshotMock.mock.calls[3][1]({ docs: [] }) }
function seedEvents() { onSnapshotMock.mock.calls[4][1]({ docs: [] }) }
function seedPlans() { onSnapshotMock.mock.calls[5][1]({ docs: [] }) }

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function mockApiReply(body: { reply: string; actions: unknown[] }) {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  )
}

beforeEach(() => {
  initTasksStore(null)
  initNotesStore(null)
  initHabitsStore(null)
  initGoalsStore(null)
  initCalendarStore(null)
  initPlansStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  setDocMock.mockImplementation(() => Promise.resolve())
  deleteDocMock.mockClear()
  deleteDocMock.mockImplementation(() => Promise.resolve())
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()
  getDocMock.mockClear()
  getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true }))

  initTasksStore(UID)    // onSnapshot call index 0
  initNotesStore(UID)    // 1
  initHabitsStore(UID)   // 2
  initGoalsStore(UID)    // 3
  initCalendarStore(UID) // 4
  initPlansStore(UID)    // 5
  seedTasks([])
  seedNotes()
  seedHabits()
  seedGoals()
  seedEvents()
  seedPlans()

  __resetDestructiveActionGateForTests()

  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: UID,
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

const TASK_TITLE = 'Osta nädalavahetuseks snäkke'

describe('the real two-turn "Kustuta X." → "Jah" UI flow (exact live-incident reproduction)', () => {
  it('turn 1: the AI proposing a delete_task action results in a confirmation question, no deletion, and populates the pending gate', async () => {
    const task: Task = { id: 'task-1', title: TASK_TITLE, priority: 'medium', completed: false }
    seedTasks([task])

    // Turn 1 — matches the corrected prompt: the model ALWAYS emits the
    // delete_* action, even on the first ask (the app itself decides
    // whether to execute or confirm — see buildChatMessages.ts DELETIONS).
    mockApiReply({
      reply: 'Kas soovid kindlasti kustutada selle ülesande?',
      actions: [{ type: 'delete_task', data: { title: TASK_TITLE } }],
    })
    const res = await fetchAIReply([{ role: 'user', content: `Kustuta ülesanne „${TASK_TITLE}”.` }], 'et')
    expect(res.actions).toHaveLength(1)

    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const results = await executeActionsAsync(res.actions, actionCtx)
    expect(results[0]!.needsConfirmation).toBe(true)
    expect(results[0]!.success).toBe(false)

    // Exactly one message — the code-generated confirmation question, not
    // the model's own (suppressed) free text — and NOTHING was deleted.
    const finalReply = composeFinalReply(results, res.reply)
    expect(finalReply).toBe(`Kas soovid kindlasti kustutada ülesande "${TASK_TITLE}"? Seda toimingut ei saa tagasi võtta.`)
    expect(getAllTasks()).toEqual([task])
    expect(writeBatchCommitMock).not.toHaveBeenCalled()

    // The pending gate now genuinely holds this exact target — the
    // precondition the short-reply path on turn 2 depends on.
    expect(shouldHandleAsShortConfirmationReply('Jah')).toBe(true)
  })

  it('turn 2: a bare "Jah" resolves the SAME pending action locally (no second network call) — the task is actually deleted, pending clears, exactly one success message renders', async () => {
    const task: Task = { id: 'task-1', title: TASK_TITLE, priority: 'medium', completed: false }
    seedTasks([task])

    // ── Turn 1 — identical to AIAssistantPage.tsx's sendMessage() flow ──
    mockApiReply({
      reply: 'Kas soovid kindlasti kustutada selle ülesande?',
      actions: [{ type: 'delete_task', data: { title: TASK_TITLE } }],
    })
    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const turn1 = await fetchAIReply([{ role: 'user', content: `Kustuta ülesanne „${TASK_TITLE}”.` }], 'et')
    const turn1Results = await executeActionsAsync(turn1.actions, actionCtx)
    expect(turn1Results[0]!.needsConfirmation).toBe(true)

    // ── Turn 2 — exactly what sendMessage() does: check the short-reply
    // pre-condition BEFORE ever calling fetchAIReply, and when true,
    // resolve it locally instead of hitting the network at all. ──
    expect(shouldHandleAsShortConfirmationReply('Jah')).toBe(true)
    fetchMock.mockClear() // prove no further network call happens below

    const turn2Results = await resolveShortConfirmationReply('Jah', actionCtx)
    expect(turn2Results).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    expect(turn2Results![0]!.success).toBe(true)
    expect(turn2Results![0]!.message).toBe(`Ülesanne "${TASK_TITLE}" kustutatud.`)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1) // the actual delete write happened

    // Exactly one deletion success message renders — no duplicate/repeated
    // confirmation question, no model narration.
    const finalReply = composeFinalReply(turn2Results!, '')
    expect(finalReply).toBe(`Ülesanne "${TASK_TITLE}" kustutatud.`)
    expect(finalReply.split('kustutatud').length - 1).toBe(1)

    // The pending gate is now clear — a further "jah" has nothing to resolve.
    expect(shouldHandleAsShortConfirmationReply('Jah')).toBe(false)
    const afterClear = await resolveShortConfirmationReply('Jah', actionCtx)
    expect(afterClear).toBeNull()
  })

  it('turn 2 with "Ei" cancels the same two-turn flow safely — no deletion, pending clears, exactly one cancellation message', async () => {
    const task: Task = { id: 'task-1', title: TASK_TITLE, priority: 'medium', completed: false }
    seedTasks([task])

    mockApiReply({
      reply: 'Kas soovid kindlasti kustutada selle ülesande?',
      actions: [{ type: 'delete_task', data: { title: TASK_TITLE } }],
    })
    const actionCtx = { uid: UID, getFile: () => null, getAllDocuments: vi.fn(() => []) as never }
    const turn1 = await fetchAIReply([{ role: 'user', content: `Kustuta ülesanne „${TASK_TITLE}”.` }], 'et')
    await executeActionsAsync(turn1.actions, actionCtx)

    expect(shouldHandleAsShortConfirmationReply('Ei')).toBe(true)
    fetchMock.mockClear()

    const cancelResults = await resolveShortConfirmationReply('Ei', actionCtx)
    expect(cancelResults).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cancelResults![0]!.success).toBe(true)
    expect(cancelResults![0]!.message).not.toMatch(/kustutatud/i)

    // Nothing was deleted.
    expect(getAllTasks()).toEqual([task])
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
    expect(deleteDocMock).not.toHaveBeenCalled()

    // Exactly one cancellation message.
    const finalReply = composeFinalReply(cancelResults!, '')
    expect(finalReply).toBe(cancelResults![0]!.message)

    // Pending is now clear.
    expect(shouldHandleAsShortConfirmationReply('Jah')).toBe(false)
  })
})
