/**
 * Live bug: asking the AI to delete an existing Plan (e.g. a 1-week workout
 * plan) correctly identified it, correctly asked for confirmation, but
 * replying "jah" produced "Sellise pealkirjaga eesmärki ei leitud." (goal
 * not found) instead of actually deleting the plan.
 *
 * Root cause: the Plans module (plansStore.ts) had a CREATE action
 * (preview_plan_creation) but no DELETE action anywhere in the AI's action
 * vocabulary — neither in buildChatMessages.ts's documented action list nor
 * in aiActions.ts's AIAction union/executeAction switch (plansStore was
 * never even imported there). Plans data IS included in the AI's context
 * (aiContextBuilder.ts's buildPlansSection), so the model could correctly
 * IDENTIFY the plan and ask to confirm in free text — but once the user
 * confirmed, the model's system prompt (buildChatMessages.ts's
 * DELETIONS/KUSTUTAMINE section) requires it to ALWAYS emit a delete_*
 * action, and lacking a delete_plan option, it fell back to the closest
 * known type, delete_goal, with the plan's own title — which
 * executeDestructiveAction then correctly failed to find in getAllGoals().
 *
 * Fix: delete_plan added to the same five-type architecture (buildChatMessages.ts's
 * action list + DELETIONS/KUSTUTAMINE section, aiActions.ts's AIAction/
 * DestructiveActionType unions and a new `case 'delete_plan'`), reusing the
 * exact same executeDestructiveAction confirm-before-execute helper and the
 * existing getAllPlans/deletePlan (plansStore.ts) — no new architecture, no
 * changes to any other delete_* case.
 *
 * This file proves the reported live flow end to end, using the same
 * mocked-Firestore + real-store harness as aiDestructiveActionConfirmation.test.ts:
 *   1. the plan is findable (getAllPlans has it — the "AI identifies it" step);
 *   2. the first delete_plan proposal only asks for confirmation, deletes nothing;
 *   3. a short "jah" reply resolves entirely client-side via
 *      resolveShortConfirmationReply and executes the SAME delete_plan action
 *      (the exact mechanism the live bug's "jah" went through);
 *   4. the plan is actually removed (deleteDoc called for its own doc path,
 *      and it round-trips out of getAllPlans() once the delete is echoed
 *      back through onSnapshot);
 *   5. the old wrong-type symptom (a "goal not found" message) can no longer
 *      happen for this flow — the not-found message now correctly says
 *      "plaani", not "eesmärki".
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiDeletePlanFlow.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Plan } from '@/lib/plansStore'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-a' } }, storage: {} }))

// ── Fake Firestore (same shape as aiDestructiveActionConfirmation.test.ts) ─

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const updateDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const runTransactionMock = vi.fn()
const deleteFieldMock = vi.fn(() => ({ __deleteField: true }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  deleteField: (...args: unknown[]) => deleteFieldMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import { initPlansStore, getAllPlans } from '@/lib/plansStore'
import {
  executeActionsAsync,
  resolveShortConfirmationReply,
  shouldHandleAsShortConfirmationReply,
  __resetDestructiveActionGateForTests,
} from '@/lib/aiActions'

const UID = 'user-a'

// initPlansStore -> the only store initialized in this file -> onSnapshot call index 0.
function seedPlans(plans: Plan[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: plans.map((p) => ({ data: () => p })) })
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    type: 'workout',
    title: '1-nädalane treeningkava',
    color: '#6F5AE8',
    items: [
      { id: 'item-1', label: 'Esmaspäev — jalad', done: false },
      { id: 'item-2', label: 'Kolmapäev — ülakeha', done: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  initPlansStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  deleteDocMock.mockImplementation(() => Promise.resolve())
  runTransactionMock.mockClear()
  deleteFieldMock.mockClear()

  initPlansStore(UID) // onSnapshot call index 0
  seedPlans([])

  __resetDestructiveActionGateForTests()
})

// ── 1. AI identification step: the plan is findable ────────────────────────

describe('1. the 1-week training plan is identifiable (the store the AI reads from actually has it)', () => {
  it('getAllPlans returns the seeded plan', () => {
    const plan = makePlan()
    seedPlans([plan])

    expect(getAllPlans()).toEqual([plan])
  })
})

// ── 2. First delete_plan proposal only asks — deletes nothing ─────────────

describe('2. the first delete_plan proposal asks for confirmation and deletes nothing', () => {
  it('needsConfirmation is true, no store write happens, the plan is untouched', async () => {
    const plan = makePlan()
    seedPlans([plan])

    const [result] = await executeActionsAsync([
      { type: 'delete_plan', data: { title: plan.title } },
    ])

    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.message).not.toMatch(/kustutatud/i)
    expect(result.message).toMatch(/Kas soovid kindlasti kustutada/)
    expect(result.message).toContain(plan.title)
    expect(deleteDocMock).not.toHaveBeenCalled()
    expect(getAllPlans()).toEqual([plan])
  })
})

// ── 3. A short "jah" reply resolves client-side and deletes the SAME plan ──

describe('3. replying "jah" to the pending confirmation executes the correct delete_plan action', () => {
  it('shouldHandleAsShortConfirmationReply is true once a delete_plan confirmation is pending', async () => {
    const plan = makePlan()
    seedPlans([plan])
    await executeActionsAsync([{ type: 'delete_plan', data: { title: plan.title } }])

    expect(shouldHandleAsShortConfirmationReply('jah')).toBe(true)
  })

  it('resolveShortConfirmationReply("jah") deletes the plan — the exact live-bug flow, now fixed', async () => {
    const plan = makePlan()
    seedPlans([plan])

    const [proposal] = await executeActionsAsync([{ type: 'delete_plan', data: { title: plan.title } }])
    expect(proposal.needsConfirmation).toBe(true)

    const results = await resolveShortConfirmationReply('jah')

    expect(results).not.toBeNull()
    const [result] = results!
    expect(result.success).toBe(true)
    expect(result.message).toBe(`Plaan "${plan.title}" kustutatud.`)
    // The OLD bug's exact wrong message must never appear here.
    expect(result.message).not.toMatch(/eesmärki/i)

    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    const deletedPath = (deleteDocMock.mock.calls[0][0] as { path: string }).path
    expect(deletedPath).toBe(`users/${UID}/plans/${plan.id}`)

    // Simulate the real onSnapshot echo of the delete that just happened —
    // the plan is gone from the Plans module's own store.
    seedPlans([])
    expect(getAllPlans()).toEqual([])
  })
})

// ── 4. Same two-call pattern as every other delete_* type (no special-casing) ─

describe('4. delete_plan follows the exact same confirm-then-execute pattern as delete_task/delete_note/delete_habit/delete_goal/delete_calendar_event', () => {
  it('first call only asks, second call (a fresh executeActionsAsync round-trip) deletes', async () => {
    const plan = makePlan()
    seedPlans([plan])

    const [first] = await executeActionsAsync([{ type: 'delete_plan', data: { title: plan.title } }])
    expect(first.needsConfirmation).toBe(true)
    expect(getAllPlans()).toEqual([plan])

    const [second] = await executeActionsAsync([{ type: 'delete_plan', data: { title: plan.title } }])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Plaan "${plan.title}" kustutatud.`)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })
})

// ── 5. The not-found message is now correctly plan-specific ───────────────

describe('5. a plan that does not exist reports a plan-specific not-found message — never the old goal wording', () => {
  it('missing title -> "Sellise pealkirjaga plaani ei leitud.", not "eesmärki"', async () => {
    seedPlans([])

    const [result] = await executeActionsAsync([
      { type: 'delete_plan', data: { title: 'Olematu plaan' } },
    ])

    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBeUndefined()
    expect(result.message).toBe('Sellise pealkirjaga plaani ei leitud.')
    expect(result.message).not.toMatch(/eesmärki/i)
  })
})
