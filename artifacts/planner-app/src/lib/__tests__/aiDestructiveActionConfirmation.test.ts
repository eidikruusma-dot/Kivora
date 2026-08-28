/**
 * Regression tests for a critical data-safety bug: the AI Assistant
 * executed destructive actions (delete_task, delete_note, delete_habit,
 * delete_goal, delete_calendar_event) the instant the model emitted them,
 * relying entirely on the model's own prompt-following to "ask first" —
 * which is not reliable. Live bug: the model both deleted the task AND
 * asked "are you sure?" in the same reply, so the confirmation question
 * appeared AFTER the item was already gone.
 *
 * Fix (aiActions.ts): a code-level confirmation gate, independent of
 * prompt wording —
 *   - A delete_* action's FIRST proposal for a given target (type + exact
 *     resolved entity id) is NEVER executed. It's recorded as the one
 *     pending destructive action and a confirmation question is returned
 *     instead — no store write happens.
 *   - The SAME delete_* action only executes once it's proposed again in a
 *     LATER round-trip (a later call to executeActionsAsync) for the exact
 *     same type + entity id. "Round-trip" is a generation counter bumped
 *     once per executeActionsAsync call (not once per action), so two
 *     occurrences of the same delete inside a single actions[] batch (a
 *     duplicate the model emits in one reply) cannot satisfy each other.
 *   - Confirmation is bound to the exact pending {type, entityId}: a
 *     different target, or an unrelated later "yes" that resolves to a
 *     different entity, can never execute anything.
 *   - Only success ("... kustutatud.") is ever said after a real,
 *     successful execution; a failed execution returns an error message,
 *     never a success message, and never clears the pending confirmation
 *     (so a retry doesn't need to re-ask).
 * Centralized in one helper (executeDestructiveAction) reused by all five
 * delete_* cases — not duplicated per entity type.
 *
 * AIAssistantPage.tsx also stops appending the model's own free-text reply
 * whenever any action result has `needsConfirmation: true` — the second
 * half of the original bug (the model's own text could independently claim
 * success). That wiring is verified structurally below (no React rendering
 * harness in this repo).
 *
 * Uses the same fake-Firestore harness as taskCalendarAllDayLinking.test.ts
 * / taskDeleteCascade.test.ts: real store modules running against mocked
 * firebase/firestore, with onSnapshot callbacks captured by call order and
 * fired manually to seed in-memory state.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiDestructiveActionConfirmation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Task } from '@/types'
import type { Note } from '@/data/notesData'
import type { Habit } from '@/data/habitsData'
import type { Goal } from '@/data/goalsData'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-a' } }, storage: {} }))

// ── Fake Firestore (same shape as taskCalendarAllDayLinking.test.ts) ───────

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
const writeBatchDeleteMock = vi.fn()
const writeBatchCommitMock = vi.fn(() => Promise.resolve())
const writeBatchMock = vi.fn(() => ({ delete: writeBatchDeleteMock, commit: writeBatchCommitMock }))
const getDocMock = vi.fn(() => Promise.resolve({ exists: () => true }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import { initTasksStore, getAllTasks } from '@/lib/tasksStore'
import { initNotesStore, getAllNotes } from '@/lib/quickNotesStore'
import { initHabitsStore, getAllHabits } from '@/lib/habitsStore'
import { initGoalsStore, getAllGoals } from '@/lib/goalsStore'
import { initCalendarStore, getAllEvents } from '@/lib/calendarStore'
import {
  executeActionsAsync,
  executeAction,
  composeFinalReply,
  __resetDestructiveActionGateForTests,
  type AIAction,
  type AIActionResult,
} from '@/lib/aiActions'

const UID = 'user-a'

// initTasksStore -> call 0, initNotesStore -> call 1, initHabitsStore -> call 2,
// initGoalsStore -> call 3, initCalendarStore -> call 4 (fixed order, set below).
function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes(notes: Note[]) {
  onSnapshotMock.mock.calls[1][1]({ docs: notes.map((n) => ({ data: () => n })) })
}
function seedHabits(habits: Habit[]) {
  onSnapshotMock.mock.calls[2][1]({ docs: habits.map((h) => ({ data: () => h })) })
}
function seedGoals(goals: Goal[]) {
  onSnapshotMock.mock.calls[3][1]({ docs: goals.map((g) => ({ data: () => g })) })
}
function seedEvents(events: MockCalendarEvent[]) {
  onSnapshotMock.mock.calls[4][1]({ docs: events.map((e) => ({ data: () => e })) })
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Pane Matiase kooliasjad valmis',
    priority: 'medium',
    completed: false,
    ...overrides,
  }
}
function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1', title: 'Ostunimekiri', preview: '', folder: 'Isiklik',
    timestamp: '', starred: false, iconBg: '#EDE9FB', iconColor: '#6F5AE8', icon: 'document',
    ...overrides,
  }
}
function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1', title: 'Joo vett', description: '', iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    icon: 'droplet', streak: 0, status: 'active', category: 'Isiklik',
    weekDays: [true, true, true, true, true, true, true], completions: {}, createdDate: '2026-01-01',
    ...overrides,
  }
}
function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1', title: 'Jooksuvorm', description: '', iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    icon: 'other', status: 'active', progressType: 'fraction', progressValue: 0, progressMax: 1,
    deadline: '', deadlineShort: '', barColor: '#6F5AE8', steps: [],
    ...overrides,
  }
}
function makeEvent(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return {
    id: 'evt-1', title: 'Hambaarst', startTime: '10:00', endTime: '11:00', color: '#6F5AE8',
    date: '2026-09-01', calendarId: 'mine',
    ...overrides,
  }
}

beforeEach(() => {
  initTasksStore(null)
  initNotesStore(null)
  initHabitsStore(null)
  initGoalsStore(null)
  initCalendarStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  deleteDocMock.mockImplementation(() => Promise.resolve())
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()
  getDocMock.mockClear()

  initTasksStore(UID)    // onSnapshot call index 0
  initNotesStore(UID)    // 1
  initHabitsStore(UID)   // 2
  initGoalsStore(UID)    // 3
  initCalendarStore(UID) // 4
  seedTasks([])
  seedNotes([])
  seedHabits([])
  seedGoals([])
  seedEvents([])

  __resetDestructiveActionGateForTests()
})

describe('1-3. initial delete_task request: no deletion, a confirmation question, no "deleted" wording', () => {
  it('does not delete the task, and does not claim success', async () => {
    const task = makeTask()
    seedTasks([task])

    const [result] = await executeActionsAsync([
      { type: 'delete_task', data: { title: task.title } },
    ])

    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.message).not.toMatch(/kustutatud/i)
    expect(result.message).toMatch(/Kas soovid kindlasti kustutada/)
    expect(result.message).toContain(task.title)

    // Nothing was actually deleted.
    expect(getAllTasks()).toEqual([task])
    expect(writeBatchDeleteMock).not.toHaveBeenCalled()
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
  })
})

describe('4-5. explicit confirmation (a later round-trip) executes exactly the pending deletion', () => {
  it('the second executeActionsAsync call for the same task actually deletes it, and only now says "kustutatud"', async () => {
    const task = makeTask()
    seedTasks([task])

    const [first] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(first.needsConfirmation).toBe(true)

    const [second] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(second.success).toBe(true)
    expect(second.needsConfirmation).toBeUndefined()
    expect(second.message).toBe(`Ülesanne "${task.title}" kustutatud.`)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)
  })
})

describe('6. cancellation (never confirming) leaves the task completely unchanged', () => {
  it('the task is still there after only the initial (unconfirmed) request', async () => {
    const task = makeTask()
    seedTasks([task])

    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])

    expect(getAllTasks()).toEqual([task])
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
  })
})

describe('7-8. confirmation binds to the exact entity — a stale/different confirmation cannot delete another entity', () => {
  it('proposing a delete for task B invalidates a still-pending confirmation for task A; A is never deleted by B\'s confirmation', async () => {
    const taskA = makeTask({ id: 'task-a', title: 'Ülesanne A' })
    const taskB = makeTask({ id: 'task-b', title: 'Ülesanne B' })
    seedTasks([taskA, taskB])

    // Round 1: propose deleting A — pending is now A.
    const r1 = await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    expect(r1[0].needsConfirmation).toBe(true)

    // Round 2: propose deleting B instead — overwrites the pending target with B.
    const r2 = await executeActionsAsync([{ type: 'delete_task', data: { title: taskB.title } }])
    expect(r2[0].needsConfirmation).toBe(true)

    // Round 3: "confirm" A again — pending is B, not A, so this is treated
    // as a brand-new proposal for A, NOT a confirmation. A must not be deleted.
    const r3 = await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    expect(r3[0].needsConfirmation).toBe(true)
    expect(getAllTasks()).toEqual([taskA, taskB])

    // Round 4: NOW confirming A (round 3 made A the pending target again).
    const r4 = await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    expect(r4[0].success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1) // A's delete — the only write that ever happened

    // The in-memory store only reflects a real onSnapshot update — simulate
    // the server accepting exactly A's delete (never B's, which was never
    // confirmed after round 2 overwrote it with A's pending confirmation).
    seedTasks([taskB])
    expect(getAllTasks()).toEqual([taskB])
  })
})

describe('9. a generic later message with no matching pending destructive action does nothing destructive', () => {
  it('an actions batch with no delete_task at all never touches the task, even with a pending confirmation from before', async () => {
    const task = makeTask()
    seedTasks([task])

    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(getAllTasks()).toEqual([task]) // still pending, unconfirmed

    // The user's "jah" round-trip produced no actions (e.g. small talk, or
    // the model chose not to re-propose it) — nothing destructive happens.
    const results = await executeActionsAsync([])
    expect(results).toEqual([])
    expect(getAllTasks()).toEqual([task])
  })
})

describe('10. a failed deletion never produces a success message, and does not consume the confirmation', () => {
  it('a rejected Firestore write on the confirming call returns an error, leaves the note in place, and a later retry still works', async () => {
    const note = makeNote()
    seedNotes([note])

    await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])

    deleteDocMock.mockImplementationOnce(() => Promise.reject(new Error('simulated Firestore failure')))
    const [failed] = await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])
    expect(failed.success).toBe(false)
    expect(failed.message).not.toMatch(/kustutatud/i)
    expect(getAllNotes()).toEqual([note])

    // Retrying (a later round-trip) succeeds without needing to re-ask,
    // since the failed attempt did not clear the pending confirmation.
    const [retried] = await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])
    expect(retried.success).toBe(true)
    expect(retried.message).toBe(`Märge "${note.title}" kustutatud.`)
  })
})

describe('11. repeated confirmation never executes the deletion twice', () => {
  it('a third call for an already-deleted task reports "not found", not another success, and no second write happens', async () => {
    const task = makeTask()
    seedTasks([task])

    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    const [second] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(second.success).toBe(true)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)

    // The store never actually removes the task without a real onSnapshot
    // update, so simulate the real world: re-seed the store without it.
    seedTasks([])

    const [third] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(third.success).toBe(false)
    expect(third.message).not.toMatch(/kustutatud/i)
    expect(third.message).toBe('Sellise pealkirjaga ülesannet ei leitud.')
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1) // still only once, ever
  })
})

describe('a duplicate delete_task proposed twice within ONE round-trip cannot self-confirm (race-condition guard)', () => {
  it('two occurrences of the same delete in a single actions[] batch never delete anything', async () => {
    const task = makeTask()
    seedTasks([task])

    const results = await executeActionsAsync([
      { type: 'delete_task', data: { title: task.title } },
      { type: 'delete_task', data: { title: task.title } },
    ])

    expect(results[0].needsConfirmation).toBe(true)
    expect(results[1].needsConfirmation).toBe(true)
    expect(getAllTasks()).toEqual([task])
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
  })
})

describe('12. every other destructive AI action follows the identical confirm-before-execute guard', () => {
  it('delete_habit: first call only asks, second call deletes', async () => {
    const habit = makeHabit()
    seedHabits([habit])

    const [first] = await executeActionsAsync([{ type: 'delete_habit', data: { title: habit.title } }])
    expect(first.needsConfirmation).toBe(true)
    expect(first.message).not.toMatch(/kustutatud/i)
    expect(getAllHabits()).toEqual([habit])

    const [second] = await executeActionsAsync([{ type: 'delete_habit', data: { title: habit.title } }])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Harjumus "${habit.title}" kustutatud.`)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  it('delete_goal: first call only asks, second call deletes', async () => {
    const goal = makeGoal()
    seedGoals([goal])

    const [first] = await executeActionsAsync([{ type: 'delete_goal', data: { title: goal.title } }])
    expect(first.needsConfirmation).toBe(true)
    expect(first.message).not.toMatch(/kustutatud/i)
    expect(getAllGoals()).toEqual([goal])

    const [second] = await executeActionsAsync([{ type: 'delete_goal', data: { title: goal.title } }])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Eesmärk "${goal.title}" kustutatud.`)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  it('delete_calendar_event: first call only asks, second call deletes', async () => {
    const event = makeEvent()
    seedEvents([event])

    const [first] = await executeActionsAsync([{ type: 'delete_calendar_event', data: { title: event.title } }])
    expect(first.needsConfirmation).toBe(true)
    expect(first.message).not.toMatch(/kustutatud/i)
    expect(getAllEvents()).toEqual([event])

    const [second] = await executeActionsAsync([{ type: 'delete_calendar_event', data: { title: event.title } }])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Sündmus "${event.title}" kustutatud.`)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  it('delete_note: first call only asks, second call deletes (already exercised above in the failure test, verified clean here too)', async () => {
    const note = makeNote()
    seedNotes([note])

    const [first] = await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])
    expect(first.needsConfirmation).toBe(true)

    const [second] = await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])
    expect(second.success).toBe(true)
    expect(second.message).toBe(`Märge "${note.title}" kustutatud.`)
  })
})

describe('13. existing non-destructive AI actions are unchanged — no confirmation gate applies to them', () => {
  it('create_task still executes immediately on the very first call', async () => {
    const [result] = await executeActionsAsync([
      { type: 'create_task', data: { title: 'Osta piima' } },
    ])
    expect(result.success).toBe(true)
    expect(result.needsConfirmation).toBeUndefined()
    expect(result.message).toBe('Ülesanne "Osta piima" lisatud.')
    // The in-memory store only reflects a later onSnapshot update — confirm
    // the write itself actually happened instead.
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('a delete_task confirmation pending in one test never leaks into (or is required by) unrelated create actions', async () => {
    const task = makeTask()
    seedTasks([task])
    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }]) // leaves a pending confirmation

    const [result] = await executeActionsAsync([
      { type: 'create_note', data: { title: 'Uus märge' } },
    ])
    expect(result.success).toBe(true)
    expect(result.needsConfirmation).toBeUndefined()
  })
})

describe('edge cases: missing identifier and unresolvable target never execute or claim success', () => {
  it('delete_task with neither title nor id fails cleanly, without setting a pending confirmation for anything', async () => {
    const [result] = await executeActionsAsync([{ type: 'delete_task', data: {} }])
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBeUndefined()
    expect(result.message).toBe('Ülesande pealkiri või ID puudub.')
  })

  it('delete_task for a title that does not exist fails cleanly, without asking to confirm a nonexistent target', async () => {
    seedTasks([])
    const [result] = await executeActionsAsync([{ type: 'delete_task', data: { title: 'Ei ole olemas' } }])
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBeUndefined()
    expect(result.message).toBe('Sellise pealkirjaga ülesannet ei leitud.')
  })
})

describe('executeAction called directly for a delete_* type (bypassing executeActionsAsync) still asks first', () => {
  it('a bare executeAction call for a fresh target never deletes on the first call', async () => {
    const task = makeTask()
    seedTasks([task])
    const action: AIAction = { type: 'delete_task', data: { title: task.title } }
    const result = await executeAction(action)
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(getAllTasks()).toEqual([task])
  })
})

// ── Component wiring: verified structurally (no React rendering harness) ──

const AI_ACTIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/aiActions.ts'), 'utf8')
const AI_ASSISTANT_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/AIAssistantPage.tsx'), 'utf8')

describe('every delete_* case is centralized through the one executeDestructiveAction helper — no duplicated/diverging logic', () => {
  it('all five delete_* cases call executeDestructiveAction, not their own inline deletion logic', () => {
    const deleteCases = ['delete_task', 'delete_note', 'delete_habit', 'delete_goal', 'delete_calendar_event']
    for (const type of deleteCases) {
      const caseBlock = AI_ACTIONS_SRC.match(new RegExp(`case '${type}': \\{[\\s\\S]*?\\n {6}\\}`))?.[0] ?? ''
      expect(caseBlock, `expected a case block for ${type}`).not.toBe('')
      expect(caseBlock).toMatch(/return await executeDestructiveAction\(action, \{/)
    }
    // Exactly one implementation of the shared gate.
    expect((AI_ACTIONS_SRC.match(/async function executeDestructiveAction/g) ?? []).length).toBe(1)
  })

  it('the generation counter is bumped exactly once per executeActionsAsync call, not once per action', () => {
    const fn = AI_ACTIONS_SRC.match(/export async function executeActionsAsync\(\s*\n[\s\S]*?\n\{/)
    expect(AI_ACTIONS_SRC).toMatch(/_actionGeneration \+= 1/)
    expect((AI_ACTIONS_SRC.match(/_actionGeneration \+= 1/g) ?? []).length).toBe(1)
    void fn
  })
})

describe('AIAssistantPage.tsx: the model\'s free-text reply is suppressed whenever a confirmation is pending', () => {
  // Both call sites used to inline this exact gate; it is now centralized in
  // aiActions.ts's composeFinalReply (see the dedicated coverage below) and
  // reused here, so the component itself can never drift from — or
  // duplicate a stale copy of — the confirmation/failure-suppression rule.
  it('both executeActionsAsync call sites delegate to the shared composeFinalReply helper', () => {
    const occurrences = AI_ASSISTANT_PAGE_SRC.match(/const finalReply = composeFinalReply\(results, res\.reply\);/g) ?? []
    expect(occurrences.length).toBe(2)
    // Neither call site re-implements its own needsConfirmation/actionSummary branch.
    expect(AI_ASSISTANT_PAGE_SRC).not.toMatch(/const needsConfirmation = results\.some/)
  })
})

describe('composeFinalReply: the model\'s free-text reply is untrusted about action outcomes', () => {
  it('shows only the code-generated summary when a destructive action is awaiting confirmation', () => {
    const results: AIActionResult[] = [
      { success: false, needsConfirmation: true, message: 'Kas soovid kindlasti kustutada ülesande "X"?' },
    ]
    expect(composeFinalReply(results, 'Olen selle kustutanud!')).toBe(
      'Kas soovid kindlasti kustutada ülesande "X"?',
    )
  })

  it('shows only the code-generated summary when an action outright fails — the model cannot mask a failed write with a confident reply', () => {
    const results: AIActionResult[] = [
      { success: false, message: 'POST_WRITE_VERIFICATION_FAILED: ülesanne "X" ei ilmunud ülesannete andmekihis.' },
    ]
    expect(composeFinalReply(results, 'Valmis! Lisasin ülesande "X".')).toBe(
      'POST_WRITE_VERIFICATION_FAILED: ülesanne "X" ei ilmunud ülesannete andmekihis.',
    )
  })

  it('appends the model\'s reply after the action summary when every action genuinely succeeded', () => {
    const results: AIActionResult[] = [{ success: true, message: 'Ülesanne "X" lisatud.' }]
    expect(composeFinalReply(results, 'Anna teada, kui vajad veel midagi.')).toBe(
      'Ülesanne "X" lisatud.\n\nAnna teada, kui vajad veel midagi.',
    )
  })

  it('returns just the model\'s reply when no actions were attempted (a plain question turn)', () => {
    expect(composeFinalReply([], 'Sul on 3 ülesannet täna.')).toBe('Sul on 3 ülesannet täna.')
  })
})
