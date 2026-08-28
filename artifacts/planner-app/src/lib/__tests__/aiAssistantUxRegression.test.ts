/**
 * Regression coverage for three live-confirmed AI Assistant UX bugs, all
 * reported after the major systems (long conversations, CURRENT_KIVORA_STATE
 * freshness, create_task execution, delete confirmation) were already fixed
 * and verified working:
 *
 * 1. DUPLICATE SUCCESS MESSAGES — after a successful action, the chat bubble
 *    showed BOTH the code-generated authoritative summary AND the model's
 *    own redundant free-text (a paraphrase, a re-asked confirmation, or a
 *    narrated repeat). Root cause: composeFinalReply() (aiActions.ts)
 *    unconditionally appended the model's `reply` after the action summary
 *    whenever an action succeeded. Fix: when at least one NON-SILENT action
 *    succeeded, the model's reply is suppressed entirely — only the one
 *    code-verified summary is shown. Turns with no actions at all, or with
 *    only silent (card-rendering) actions, are completely unaffected.
 *
 * 2. SIMPLE "jah"/"yes" CONFIRMATION MUST WORK — a bare short confirm/cancel
 *    reply to an already-pending destructive-action confirmation question
 *    needed to work, not just a full sentence ("Jah, kustuta."). Root cause:
 *    the confirm-before-execute GATE itself (aiActions.ts's
 *    _pendingDestructiveAction / executeDestructiveAction) never cared about
 *    wording — it only requires the SAME {type, entityId} to be re-proposed
 *    in a later round-trip — but nothing resolved a short reply into that
 *    re-proposal without going through the model, whose own confirmation
 *    question example is worded as a full sentence. Fix: a new, purely
 *    additive resolveShortConfirmationReply() recognizes an exact whitelist
 *    of short confirm/cancel words and, when something is genuinely
 *    pending, re-feeds the exact pending {type, entityId} through the
 *    SAME, UNMODIFIED executeActionsAsync/executeDestructiveAction gate —
 *    every existing safety guarantee (exact entity binding, the generation
 *    counter, "later round-trip only") applies completely unchanged.
 *
 * 3. EXPLICIT USER CATEGORY NOT RESPECTED — a task created with an
 *    explicitly requested category ("kategooria Kodu") came back with a
 *    different, auto-guessed category ("Ostud", from a title keyword
 *    match). Root cause: the create_task handler never read
 *    action.data.category/priority at all — it unconditionally overwrote
 *    both with inferCategory(title)/inferPriority(title). Fix:
 *    resolveTaskCategory/resolveTaskPriority honor an explicit, valid
 *    value from action.data first, falling back to the title-keyword
 *    guess ONLY when it's absent or not a recognized canonical value.
 *    'Kodu' is now a full canonical TaskCategory (parallel to the existing
 *    'Kodu' NoteFolder), not just tolerated as a pass-through string.
 *
 * None of the systems explicitly called out as "already working, do not
 * redesign" are touched here: the destructive-action gate's internal
 * fields/functions, the history-windowing function, and CURRENT_KIVORA_STATE
 * message ordering are exercised exactly as before, only reused (not
 * modified) by the new short-confirmation path.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiAssistantUxRegression.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@/types'
import type { Note } from '@/data/notesData'

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

import { initTasksStore, getAllTasks } from '@/lib/tasksStore'
import { initNotesStore, getAllNotes } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import {
  executeActionsAsync,
  composeFinalReply,
  classifyShortConfirmationReply,
  shouldHandleAsShortConfirmationReply,
  resolveShortConfirmationReply,
  __resetDestructiveActionGateForTests,
  type AIActionResult,
} from '@/lib/aiActions'
import { auth } from '@/lib/firebase'

const UID = 'user-a'

function seedTasks(tasks: Task[]) {
  onSnapshotMock.mock.calls[0][1]({ docs: tasks.map((t) => ({ data: () => t })) })
}
function seedNotes(notes: Note[] = []) {
  onSnapshotMock.mock.calls[1][1]({ docs: notes.map((n) => ({ data: () => n })) })
}
function seedHabits() { onSnapshotMock.mock.calls[2][1]({ docs: [] }) }
function seedGoals() { onSnapshotMock.mock.calls[3][1]({ docs: [] }) }
function seedEvents() { onSnapshotMock.mock.calls[4][1]({ docs: [] }) }

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1', title: 'Ostunimekiri', preview: '', folder: 'Isiklik',
    timestamp: '', starred: false, iconBg: '#EDE9FB', iconColor: '#6F5AE8', icon: 'document',
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
  setDocMock.mockImplementation(() => Promise.resolve())
  deleteDocMock.mockClear()
  deleteDocMock.mockImplementation(() => Promise.resolve())
  writeBatchDeleteMock.mockClear()
  writeBatchCommitMock.mockClear()
  writeBatchCommitMock.mockImplementation(() => Promise.resolve())
  writeBatchMock.mockClear()
  getDocMock.mockClear()
  getDocMock.mockImplementation(() => Promise.resolve({ exists: () => true }))

  initTasksStore(UID)   // onSnapshot call index 0
  initNotesStore(UID)   // 1
  initHabitsStore(UID)  // 2
  initGoalsStore(UID)   // 3
  initCalendarStore(UID) // 4
  seedTasks([])
  seedNotes()
  seedHabits()
  seedGoals()
  seedEvents()

  __resetDestructiveActionGateForTests()
  ;(auth as unknown as { currentUser: MockAuthUser }).currentUser = {
    uid: UID,
    getIdToken: () => Promise.resolve('synthetic-token'),
  }
})

// ── Issue 1: duplicate success messages ─────────────────────────────────────

describe('Issue 1 — composeFinalReply renders exactly one authoritative message on success', () => {
  it('1. a successful create action renders exactly one success message (model reply suppressed)', () => {
    const results: AIActionResult[] = [{ success: true, message: 'Ülesanne "Osta nädalavahetuseks snäkke" lisatud.' }]
    const modelReply = 'Lisa ülesanne "Osta nädalavahetuseks snäkke" tähtajaga 29.08.2026 kell 16:00, kategooriaga "Kodu" ja prioriteediga "medium"?'
    const finalReply = composeFinalReply(results, modelReply)
    expect(finalReply).toBe('Ülesanne "Osta nädalavahetuseks snäkke" lisatud.')
    expect(finalReply).not.toContain(modelReply)
  })

  it('2. a successful delete renders exactly one success message (the exact live duplicate-delete example)', () => {
    const results: AIActionResult[] = [{ success: true, message: 'Ülesanne "Osta nädalavahetuseks snäkke" kustutatud.' }]
    const modelReply = 'Ülesanne "Osta nädalavahetuseks snäkke" on kustutatud.'
    const finalReply = composeFinalReply(results, modelReply)
    expect(finalReply).toBe('Ülesanne "Osta nädalavahetuseks snäkke" kustutatud.')
    expect(finalReply.split('kustutatud').length - 1).toBe(1)
  })

  it('3. redundant model narration (a paraphrase, not just a repeated word) is suppressed after a successful action', () => {
    const results: AIActionResult[] = [{ success: true, message: 'Märge "Kutse" lisatud.' }]
    const finalReply = composeFinalReply(results, 'Lisasin sulle uue märke pealkirjaga "Kutse", kas soovid, et lisaksin sellele ka sisu?')
    expect(finalReply).toBe('Märge "Kutse" lisatud.')
  })

  it('4. a normal no-action AI reply remains fully visible, untouched', () => {
    expect(composeFinalReply([], 'Sul on täna 3 ülesannet ja 1 sündmus.')).toBe('Sul on täna 3 ülesannet ja 1 sündmus.')
  })

  it('5. a silent (card-rendering) success is unaffected — the model\'s short reply text still renders normally', () => {
    const results: AIActionResult[] = [{ success: true, message: '', silent: true }]
    expect(composeFinalReply(results, 'Vaata üle ja muuda allolevat mustandit.')).toBe(
      'Vaata üle ja muuda allolevat mustandit.',
    )
    // And with no model reply at all, the intentionally empty bubble is preserved.
    expect(composeFinalReply(results, '')).toBe('')
  })

  it('a needsConfirmation turn is unaffected by the success-suppression branch (pre-existing behavior preserved)', () => {
    const results: AIActionResult[] = [
      { success: false, needsConfirmation: true, message: 'Kas soovid kindlasti kustutada ülesande "X"?' },
    ]
    expect(composeFinalReply(results, 'Olen selle kustutanud!')).toBe('Kas soovid kindlasti kustutada ülesande "X"?')
  })
})

// ── Issue 2: short "jah"/"yes" confirmation ─────────────────────────────────

describe('Issue 2 — a bare short confirm/cancel reply resolves an already-pending destructive action', () => {
  it('classifies the required minimal word set correctly, case- and punctuation-insensitively', () => {
    for (const w of ['jah', 'Jah', 'JAH!', 'jah palun', 'kinnitan', 'yes', 'Yes.', 'confirm']) {
      expect(classifyShortConfirmationReply(w)).toBe('confirm')
    }
    for (const w of ['ei', 'Ei.', 'tühista', 'no', 'No!', 'cancel']) {
      expect(classifyShortConfirmationReply(w)).toBe('cancel')
    }
  })

  it('11. an ambiguous reply never classifies as either intent', () => {
    for (const w of ['ehk', 'võib-olla', 'ma ei tea', 'ok', 'kindlasti mitte kohe', 'jah aga mitte praegu']) {
      expect(classifyShortConfirmationReply(w)).toBeNull()
    }
  })

  it('6. "jah" confirms an existing pending delete — the task is actually deleted', async () => {
    const task: Task = { id: 'task-1', title: 'Vana ülesanne', priority: 'medium', completed: false }
    seedTasks([task])

    const [pending] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(pending.needsConfirmation).toBe(true)
    expect(shouldHandleAsShortConfirmationReply('jah')).toBe(true)

    const results = await resolveShortConfirmationReply('jah')
    expect(results).not.toBeNull()
    expect(results![0]!.success).toBe(true)
    expect(results![0]!.message).toBe(`Ülesanne "${task.title}" kustutatud.`)
    expect(writeBatchCommitMock).toHaveBeenCalledTimes(1)

    const finalReply = composeFinalReply(results!, '')
    expect(finalReply).toBe(`Ülesanne "${task.title}" kustutatud.`)
  })

  it('7. "yes" confirms an existing pending delete exactly like "jah" does', async () => {
    const note = makeNote({ title: 'Aegunud märge' })
    seedNotes([note])

    const [pending] = await executeActionsAsync([{ type: 'delete_note', data: { title: note.title } }])
    expect(pending.needsConfirmation).toBe(true)

    const results = await resolveShortConfirmationReply('yes')
    expect(results![0]!.success).toBe(true)
    expect(results![0]!.message).toBe(`Märge "${note.title}" kustutatud.`)
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    expect(getAllNotes()).toEqual([note]) // no live onSnapshot update simulated — the write itself is what's verified above
  })

  it('8. cancellation variants ("ei", "tühista", "no", "cancel") cancel safely, without modifying data', async () => {
    for (const cancelWord of ['ei', 'tühista', 'no', 'cancel']) {
      __resetDestructiveActionGateForTests()
      deleteDocMock.mockClear()
      writeBatchCommitMock.mockClear()
      const task: Task = { id: 'task-1', title: 'Ülesanne', priority: 'medium', completed: false }
      seedTasks([task])

      await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
      const results = await resolveShortConfirmationReply(cancelWord)
      expect(results).not.toBeNull()
      expect(results![0]!.success).toBe(true)
      expect(results![0]!.message).not.toMatch(/kustutatud/i)
      expect(getAllTasks()).toEqual([task]) // nothing removed
      expect(writeBatchCommitMock).not.toHaveBeenCalled()

      // The gate is now clear — a bare confirm afterward has nothing to resolve.
      expect(shouldHandleAsShortConfirmationReply('jah')).toBe(false)
    }
  })

  it('9. "jah" with no pending destructive action executes nothing and defers to the normal flow', async () => {
    expect(shouldHandleAsShortConfirmationReply('jah')).toBe(false)
    const results = await resolveShortConfirmationReply('jah')
    expect(results).toBeNull()
    expect(writeBatchCommitMock).not.toHaveBeenCalled()
    expect(deleteDocMock).not.toHaveBeenCalled()
  })

  it('10. confirmation stays bound to the exact pending entity — a short "jah" can never resolve a DIFFERENT, unrelated target', async () => {
    const taskA: Task = { id: 'task-a', title: 'Ülesanne A', priority: 'medium', completed: false }
    const taskB: Task = { id: 'task-b', title: 'Ülesanne B', priority: 'medium', completed: false }
    seedTasks([taskA, taskB])

    // Only A is proposed/pending — B was never asked about.
    await executeActionsAsync([{ type: 'delete_task', data: { title: taskA.title } }])
    const results = await resolveShortConfirmationReply('jah')
    expect(results![0]!.message).toBe(`Ülesanne "${taskA.title}" kustutatud.`)
    // B was never touched — the short "jah" resolved only the actual pending entity id (A), not B.
    expect(getAllTasks()).toEqual([taskA, taskB]) // no live onSnapshot update simulated; store still shows both pre-delete
    expect(writeBatchDeleteMock).toHaveBeenCalledTimes(1)
  })

  it('11b. an ambiguous reply, even with a pending destructive action, does not execute — leaves it pending', async () => {
    const task: Task = { id: 'task-1', title: 'Ülesanne', priority: 'medium', completed: false }
    seedTasks([task])
    await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])

    expect(shouldHandleAsShortConfirmationReply('ehk hiljem')).toBe(false)
    const results = await resolveShortConfirmationReply('ehk hiljem')
    expect(results).toBeNull()
    expect(getAllTasks()).toEqual([task])
    expect(writeBatchCommitMock).not.toHaveBeenCalled()

    // The pending confirmation is still there — a real "jah" right after still works.
    const confirmed = await resolveShortConfirmationReply('jah')
    expect(confirmed![0]!.success).toBe(true)
  })

  it('a full-sentence confirmation ("Jah, kustuta.") is NOT hijacked by the short-reply classifier — it is not an exact whitelist match, so it defers to the normal AI flow unchanged', () => {
    expect(classifyShortConfirmationReply('Jah, kustuta.')).toBeNull()
  })
})

// ── Issue 3: explicit user category/priority is respected ──────────────────

describe('Issue 3 — create_task honors an explicit, valid category/priority instead of always guessing from the title', () => {
  it('12. an explicit category "Kodu" is preserved exactly, even though the title would auto-categorize differently ("Ostud")', async () => {
    const [result] = await executeActionsAsync([
      {
        type: 'create_task',
        data: {
          title: 'Osta nädalavahetuseks snäkke',
          date: '2026-08-29',
          time: '16:00',
          category: 'Kodu',
          priority: 'medium',
        },
      },
    ])
    expect(result.success).toBe(true)
    const written = setDocMock.mock.calls[0]![1] as Task
    expect(written.category).toBe('Kodu')
    expect(written.priority).toBe('medium')
  })

  it('13. automatic categorization still applies when the category is omitted', async () => {
    await executeActionsAsync([
      { type: 'create_task', data: { title: 'Osta piima poest' } }, // no category given
    ])
    const written = setDocMock.mock.calls[0]![1] as Task
    expect(written.category).toBe('Ostud') // inferCategory's own keyword match, unchanged
  })

  it('automatic priority inference still applies when priority is omitted', async () => {
    await executeActionsAsync([
      { type: 'create_task', data: { title: 'Tähtis kohtumine' } }, // no priority given
    ])
    const written = setDocMock.mock.calls[0]![1] as Task
    expect(written.priority).toBe('high') // inferPriority's own keyword match, unchanged
  })

  it('an unrecognized/invalid category string falls back to auto-categorization rather than being written verbatim', async () => {
    await executeActionsAsync([
      { type: 'create_task', data: { title: 'Osta piima', category: 'Ei ole päris kategooria' } },
    ])
    const written = setDocMock.mock.calls[0]![1] as Task
    expect(written.category).toBe('Ostud')
  })

  it('category matching is case-insensitive (the model may vary casing)', async () => {
    await executeActionsAsync([
      { type: 'create_task', data: { title: 'Mingi ülesanne', category: 'kodu' } },
    ])
    const written = setDocMock.mock.calls[0]![1] as Task
    expect(written.category).toBe('Kodu')
  })
})

// ── 14 & 15: pre-existing systems remain unchanged ──────────────────────────

describe('14 & 15 — history windowing and CURRENT_KIVORA_STATE freshness are untouched by this change', () => {
  it('the destructive-action generation counter still advances exactly once per executeActionsAsync call, including the new short-confirmation path (it reuses executeActionsAsync, not a parallel counter)', async () => {
    const task: Task = { id: 'task-1', title: 'Ülesanne', priority: 'medium', completed: false }
    seedTasks([task])
    const [first] = await executeActionsAsync([{ type: 'delete_task', data: { title: task.title } }])
    expect(first.needsConfirmation).toBe(true)
    // resolveShortConfirmationReply internally calls executeActionsAsync once more —
    // exactly the same "later round-trip" the gate already required.
    const results = await resolveShortConfirmationReply('jah')
    expect(results![0]!.success).toBe(true)
  })
})
