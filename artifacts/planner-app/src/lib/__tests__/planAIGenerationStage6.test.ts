/**
 * Plaanid (Plans) module: AI-assisted plan creation (preview_plan_creation).
 *
 * Nothing is written to Firestore during generation or preview —
 * sanitizePlanDraft() and executeAction('preview_plan_creation') are pure
 * (aside from calling the ctx.setPendingPlanDraft callback). The only
 * Firestore write in this whole flow is addPlan(), called exactly once,
 * from buildPlanFromDraft()'s trusted output, on the user's explicit
 * "Save plan" confirmation — mirroring how planCopyStage5.test.ts proves
 * the same thing for "Copy plan".
 *
 * All data below is synthetic (invented menus/workouts/study/cleaning
 * content). None of it is a real recipe, program, or user data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const setDocMock = vi.fn(() => Promise.resolve())
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: vi.fn(() => vi.fn()),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDoc: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

// aiActions.ts pulls in every module's store — none of these code paths are
// exercised by the preview_plan_creation case, but the module import graph
// still needs safe stand-ins so importing executeAction never touches real
// Firestore.
vi.mock('@/lib/tasksStore', () => ({
  addTask: vi.fn(), deleteTask: vi.fn(), getAllTasks: vi.fn(() => []),
}))
vi.mock('@/lib/quickNotesStore', () => ({
  addNote: vi.fn(), deleteNote: vi.fn(), getAllNotes: vi.fn(() => []),
}))
vi.mock('@/lib/habitsStore', () => ({
  addHabit: vi.fn(), deleteHabit: vi.fn(), getAllHabits: vi.fn(() => []),
}))
vi.mock('@/lib/goalsStore', () => ({
  addGoal: vi.fn(), deleteGoal: vi.fn(), getAllGoals: vi.fn(() => []),
}))
vi.mock('@/lib/calendarStore', () => ({
  addCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), getAllEvents: vi.fn(() => []),
}))
vi.mock('@/lib/moneyStore', () => ({
  addTransaction: vi.fn(), getAllTransactions: vi.fn(() => []),
}))
vi.mock('@/lib/schoolStore', () => ({
  getAllSchoolSubjects: vi.fn(() => []),
}))
vi.mock('@/lib/documentsStore', () => ({
  uploadAndSaveDocument: vi.fn(),
  moveDocument: vi.fn(),
  renameDocument: vi.fn(),
  getAllDocuments: vi.fn(() => []),
  getDocumentById: vi.fn(),
  findDuplicate: vi.fn(),
}))
// aiClient.ts imports buildAIContext for its default context, which pulls in
// a much larger store graph (notifications, modules, etc.) irrelevant to the
// plan-generation path tested here — buildPlanGenerationMessages never calls
// it (the generator always passes contextOverride: ''), so a trivial mock
// keeps this file's import graph limited to what's actually exercised.
vi.mock('@/lib/aiContextBuilder', () => ({
  buildAIContext: vi.fn(() => ''),
}))

import { executeAction, executeActionsAsync, type AIAction, type ActionContext } from '@/lib/aiActions'
import { sanitizePlanDraft, isPlanDraftUsable, PLAN_DRAFT_LIMITS, type PlanDraft } from '@/lib/planDraftValidation'
import { initPlansStore, addPlan, buildPlanFromDraft, type Plan } from '@/lib/plansStore'
import { buildPlanGenerationMessages } from '@/lib/aiClient'
import { addTask } from '@/lib/tasksStore'
import { addCalendarEvent } from '@/lib/calendarStore'
import { addNote } from '@/lib/quickNotesStore'
import { addHabit } from '@/lib/habitsStore'
import { addGoal } from '@/lib/goalsStore'

function baseCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    uid: 'synthetic-uid',
    getFile: () => null,
    getAllDocuments: vi.fn(() => []) as unknown as ActionContext['getAllDocuments'],
    ...overrides,
  }
}

beforeEach(() => {
  initPlansStore(null)
  setDocMock.mockClear()
  vi.mocked(addTask).mockClear()
  vi.mocked(addCalendarEvent).mockClear()
  vi.mocked(addNote).mockClear()
  vi.mocked(addHabit).mockClear()
  vi.mocked(addGoal).mockClear()
  initPlansStore('user-a')
})

// ── sanitizePlanDraft ──────────────────────────────────────────────────────

describe('sanitizePlanDraft: valid menu generation', () => {
  it('produces multiple checkable meal items, not one item for the whole plan, with notes always stripped', () => {
    const draft = sanitizePlanDraft({
      title: 'Nädala menüü',
      type: 'menu',
      items: [
        { label: 'Esmaspäev – kanapasta', note: 'Koostisosad:\n- 500 g kana\n- 400 g pastat\n- 200 ml koort\n\nValmistamine:\n1. Keeda pasta.\n2. Prae kana.\n3. Lisa koor ja sega.' },
        { label: 'Teisipäev – köögiviljasupp', note: 'Haki köögiviljad ja hauta 20 minutit.' },
        { label: 'Kolmapäev – lõhe ja riis' },
      ],
    })
    expect(draft).not.toBeNull()
    expect(draft!.items.length).toBe(3)
    expect(draft!.items[0].label).toBe('Esmaspäev – kanapasta')
    expect(draft!.items[0].note).toBeUndefined() // model-supplied recipe/ingredient note is stripped — no Recipes feature
    expect(draft!.items[1].note).toBeUndefined()
  })

  it('never lets recipe/ingredient/preparation text supplied by the model survive sanitization for a menu item', () => {
    const draft = sanitizePlanDraft({
      title: 'Menu',
      type: 'menu',
      items: [{ label: 'Chicken and rice', note: 'Ingredients: 500g chicken, 300g rice. Preparation: boil rice, fry chicken, combine.' }],
    })
    const serialized = JSON.stringify(draft)
    expect(serialized).not.toContain('Ingredients')
    expect(serialized).not.toContain('Preparation')
  })

  it('accepts flexible, non-weekday, multi-day meal labels (the default style)', () => {
    const draft = sanitizePlanDraft({
      title: 'Paindlik menüü',
      type: 'menu',
      items: [{ label: 'Kana-riisiroog – umbes 2 päevaks' }, { label: 'Chicken and rice – approximately 2 days' }],
    })
    expect(draft!.items[0].label).toBe('Kana-riisiroog – umbes 2 päevaks')
    expect(draft!.items[1].label).toBe('Chicken and rice – approximately 2 days')
  })

  it('still accepts weekday-style labels when the user explicitly asked for a weekly menu', () => {
    const draft = sanitizePlanDraft({
      title: 'Nädala menüü',
      type: 'menu',
      items: [{ label: 'Esmaspäev – kanapasta' }, { label: 'Monday – chicken pasta' }],
    })
    expect(draft!.items[0].label).toBe('Esmaspäev – kanapasta')
    expect(draft!.items[1].label).toBe('Monday – chicken pasta')
  })
})

describe('sanitizePlanDraft: valid workout generation', () => {
  it('produces separate exercises, each with its own instruction note', () => {
    const draft = sanitizePlanDraft({
      title: 'Jalgade trenn',
      type: 'workout',
      items: [
        { label: 'Kükid – 3 × 12', note: 'Hoia selg sirge ja põlved varvastega samas suunas.\nPuhka seeriate vahel 60 sekundit.' },
        { label: 'Väljaastes – 3 × 10', note: 'Astu ette ja lange, kuni mõlemad põlved on 90°.' },
        { label: 'Sääremarjatõsted – 3 × 15' },
      ],
    })
    expect(draft!.items.length).toBe(3)
    for (const item of draft!.items) {
      expect(item.label.toLowerCase()).not.toContain('jalgade trenn') // no item bundles the whole plan
    }
  })
})

describe('sanitizePlanDraft: multiline notes survive sanitization', () => {
  it('preserves internal newlines exactly', () => {
    const note = 'Loe peatükk 3\n\nKirjuta välja viis olulisemat mõistet.\n- Esimene\n- Teine'
    const draft = sanitizePlanDraft({ title: 'Õppeplaan', type: 'study', items: [{ label: 'Loe peatükk 3', note }] })
    expect(draft!.items[0].note).toBe(note)
  })
})

describe('sanitizePlanDraft: model-provided identity/state fields never propagate', () => {
  it('discards id, uid, done, createdAt, updatedAt from both the draft and its items', () => {
    const raw = {
      id: 'plan-hacked',
      uid: 'not-the-real-uid',
      title: 'Koristusplaan',
      type: 'cleaning',
      createdAt: 111,
      updatedAt: 222,
      items: [
        { id: 'item-hacked', done: true, label: 'Puhasta köögi tööpinnad', note: 'Tõsta esemed eest, pühi pinnad ja kuivata.' },
      ],
    }
    const draft = sanitizePlanDraft(raw) as unknown as Record<string, unknown>
    expect(draft.id).toBeUndefined()
    expect(draft.uid).toBeUndefined()
    expect(draft.createdAt).toBeUndefined()
    expect(draft.updatedAt).toBeUndefined()
    const item = (draft.items as Record<string, unknown>[])[0]
    expect(item.id).toBeUndefined()
    expect(item.done).toBeUndefined()
    expect(item.label).toBe('Puhasta köögi tööpinnad')
  })
})

describe('sanitizePlanDraft: invalid type/color/dates are handled safely', () => {
  it('falls back an unrecognised type to blank instead of rejecting the draft', () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'not-a-type', items: [{ label: 'Tee midagi' }] })
    expect(draft!.type).toBe('blank')
  })

  it('falls back an unrecognised color to the first swatch', () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'study', color: '#123456', items: [{ label: 'Loe' }] })
    expect(draft!.color).toBe('#6F5AE8')
  })

  it('drops malformed dates rather than passing them through', () => {
    const draft = sanitizePlanDraft({
      title: 'Plaan', type: 'study', startDate: 'eile', endDate: '2026-99-99', items: [{ label: 'Loe' }],
    })
    expect(draft!.startDate).toBeUndefined()
    expect(draft!.endDate).toBeUndefined()
  })

  it('drops an inverted date range safely rather than rejecting the draft', () => {
    const draft = sanitizePlanDraft({
      title: 'Plaan', type: 'study', startDate: '2026-09-10', endDate: '2026-09-01', items: [{ label: 'Loe' }],
    })
    expect(draft).not.toBeNull()
    expect(draft!.startDate).toBeUndefined()
    expect(draft!.endDate).toBeUndefined()
  })
})

describe('sanitizePlanDraft: empty title is rejected', () => {
  it('rejects an empty or whitespace-only title', () => {
    expect(sanitizePlanDraft({ title: '', type: 'study', items: [{ label: 'Loe' }] })).toBeNull()
    expect(sanitizePlanDraft({ title: '   ', type: 'study', items: [{ label: 'Loe' }] })).toBeNull()
  })
})

describe('sanitizePlanDraft: empty items are filtered', () => {
  it('keeps only items with a non-empty label', () => {
    const draft = sanitizePlanDraft({
      title: 'Plaan', type: 'study', items: [{ label: '' }, { label: '   ' }, { label: 'Loe peatükk 3' }],
    })
    expect(draft!.items.length).toBe(1)
    expect(draft!.items[0].label).toBe('Loe peatükk 3')
  })

  it('never silently accepts a completely empty generated plan as a successful result', () => {
    expect(sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [] })).toBeNull()
    expect(sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [{ label: '' }] })).toBeNull()
  })
})

describe('sanitizePlanDraft: excessive lengths and item counts are blocked', () => {
  it('clamps an oversized title, label, and note instead of rejecting the draft', () => {
    const draft = sanitizePlanDraft({
      title: 'T'.repeat(1000),
      type: 'study',
      items: [{ label: 'L'.repeat(1000), note: 'N'.repeat(10000) }],
    })
    expect(draft!.title.length).toBe(PLAN_DRAFT_LIMITS.maxTitleLength)
    expect(draft!.items[0].label.length).toBe(PLAN_DRAFT_LIMITS.maxLabelLength)
    expect(draft!.items[0].note!.length).toBe(PLAN_DRAFT_LIMITS.maxNoteLength)
  })

  it('caps item count at maxItems even when the model sends far more', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ label: `Üksus ${i}` }))
    const draft = sanitizePlanDraft({ title: 'Suur plaan', type: 'study', items })
    expect(draft!.items.length).toBe(PLAN_DRAFT_LIMITS.maxItems)
  })
})

describe('sanitizePlanDraft: Estonian and English content both work', () => {
  it('sanitizes an Estonian draft', () => {
    const draft = sanitizePlanDraft({ title: 'Õppeplaan', type: 'study', items: [{ label: 'Loe peatükk 3', note: 'Kirjuta välja viis olulisemat mõistet.' }] })
    expect(isPlanDraftUsable(draft)).toBe(true)
    expect(draft!.items[0].note).toContain('mõistet')
  })

  it('sanitizes an English draft', () => {
    const draft = sanitizePlanDraft({ title: 'Study plan', type: 'study', items: [{ label: 'Read chapter 3', note: 'Write down the five most important concepts.' }] })
    expect(isPlanDraftUsable(draft)).toBe(true)
    expect(draft!.items[0].note).toContain('concepts')
  })
})

// ── executeAction('preview_plan_creation') ──────────────────────────────────

describe('executeAction: preview_plan_creation', () => {
  it('sanitizes action.data independently and hands the draft to setPendingPlanDraft, writing nothing to Firestore', async () => {
    const setPendingPlanDraft = vi.fn()
    const action: AIAction = {
      type: 'preview_plan_creation',
      data: {
        title: 'Õppeplaan',
        type: 'study',
        items: [{ label: 'Loe peatükk 3', note: 'Kirjuta välja viis olulisemat mõistet.' }],
      },
    }
    const result = await executeAction(action, baseCtx({ setPendingPlanDraft }))

    expect(result.success).toBe(true)
    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    const draft = setPendingPlanDraft.mock.calls[0][0] as PlanDraft
    expect(draft.title).toBe('Õppeplaan')
    expect(draft.items).toHaveLength(1)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('rejects an empty/invalid generated plan without calling setPendingPlanDraft', async () => {
    const setPendingPlanDraft = vi.fn()
    const action: AIAction = { type: 'preview_plan_creation', data: { title: 'Plaan', type: 'study', items: [] } }
    const result = await executeAction(action, baseCtx({ setPendingPlanDraft }))

    expect(result.success).toBe(false)
    expect(setPendingPlanDraft).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('never writes to Firestore even without a setPendingPlanDraft callback wired up', async () => {
    const action: AIAction = {
      type: 'preview_plan_creation',
      data: { title: 'Plaan', type: 'menu', items: [{ label: 'Esmaspäev – supp' }] },
    }
    await executeAction(action, baseCtx())
    expect(setDocMock).not.toHaveBeenCalled()
  })
})

// ── buildPlanFromDraft + addPlan (the trusted save path) ───────────────────

describe('buildPlanFromDraft: trusted save assigns identity, never trusts the model', () => {
  const draft: PlanDraft = {
    title: 'Nädala menüü',
    type: 'menu',
    color: '#16A34A',
    items: [
      { label: 'Esmaspäev – kanapasta', note: 'Koostisosad:\n- 500 g kana\n\nValmistamine:\n1. Keeda pasta.\n2. Prae kana.' },
      { label: 'Teisipäev – supp', note: 'Haki köögiviljad ja hauta 20 minutit.' },
    ],
  }

  it('gives every item a fresh, unique id and done: false', () => {
    const plan = buildPlanFromDraft(draft)
    expect(plan.items).toHaveLength(2)
    for (const item of plan.items) {
      expect(item.done).toBe(false)
      expect(typeof item.id).toBe('string')
      expect(item.id.length).toBeGreaterThan(0)
    }
    expect(new Set(plan.items.map((i) => i.id)).size).toBe(2) // unique among themselves
  })

  it('assigns a fresh plan id and fresh createdAt/updatedAt', () => {
    const plan = buildPlanFromDraft(draft)
    expect(typeof plan.id).toBe('string')
    expect(plan.id.length).toBeGreaterThan(0)
    expect(plan.createdAt).toBeGreaterThan(0)
    expect(plan.updatedAt).toBeGreaterThan(0)
  })

  it('preserves multiline notes through the draft → Plan conversion', () => {
    const plan = buildPlanFromDraft(draft)
    expect(plan.items[0].note).toBe('Koostisosad:\n- 500 g kana\n\nValmistamine:\n1. Keeda pasta.\n2. Prae kana.')
  })

  it('filters out items left empty by user edits before saving', () => {
    const draftWithBlank: PlanDraft = {
      ...draft,
      items: [...draft.items, { label: '   ' }],
    }
    const plan = buildPlanFromDraft(draftWithBlank)
    expect(plan.items).toHaveLength(2)
  })

  it('never reads or propagates an id/uid/done/createdAt/updatedAt even if present on the draft object', () => {
    const pollutedDraft = {
      ...draft,
      id: 'draft-should-be-ignored',
      uid: 'someone-else',
      done: true,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as PlanDraft
    const plan = buildPlanFromDraft(pollutedDraft)
    expect(plan.id).not.toBe('draft-should-be-ignored')
    expect(plan.createdAt).not.toBe(1)
    expect(plan.updatedAt).not.toBe(1)
  })
})

describe('no Firestore write happens before the user confirms', () => {
  it('sanitizing and building the plan (generation + preview) never calls setDoc', () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [{ label: 'Loe' }] })
    buildPlanFromDraft(draft!)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('cancelling (never calling addPlan) writes nothing', () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [{ label: 'Loe' }] })
    buildPlanFromDraft(draft!) // preview computed, as opening the modal would do
    // ... user clicks Cancel — no addPlan() call follows.
    expect(setDocMock).not.toHaveBeenCalled()
  })
})

describe('explicit confirmation calls addPlan exactly once; duplicate save cannot create two plans', () => {
  it('a single Save click writes exactly one document', async () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [{ label: 'Loe' }] })
    const plan = buildPlanFromDraft(draft!)
    await addPlan(plan)
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('two rapid submits of the identical built plan target the same document id, never two', async () => {
    const draft = sanitizePlanDraft({ title: 'Plaan', type: 'study', items: [{ label: 'Loe' }] })
    const plan = buildPlanFromDraft(draft!)
    await Promise.all([addPlan(plan), addPlan(plan)])
    const paths = setDocMock.mock.calls.map((call) => (call[0] as { path: string }).path)
    expect(new Set(paths).size).toBe(1)
  })
})

// ── executeActionsAsync: preview_plan_creation isolation (FIX 4) ───────────
// Code-level guard, not prompt-only — mirrors the existing preview_bank_import
// isolation guard directly above it in aiActions.ts's executeActionsAsync.

describe('executeActionsAsync: preview_plan_creation isolation', () => {
  it('preview_plan_creation + create_task executes only the plan preview', async () => {
    const setPendingPlanDraft = vi.fn()
    const actions: AIAction[] = [
      { type: 'preview_plan_creation', data: { title: 'Plaan', type: 'study', items: [{ label: 'Loe' }] } },
      { type: 'create_task', data: { title: 'Should not be created' } },
    ]
    await executeActionsAsync(actions, baseCtx({ setPendingPlanDraft }))

    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    expect(addTask).not.toHaveBeenCalled()
  })

  it('preview_plan_creation + calendar/note/habit/goal actions executes none of those writes', async () => {
    const setPendingPlanDraft = vi.fn()
    const actions: AIAction[] = [
      { type: 'create_calendar_event', data: { title: 'Should not be created', date: '2026-09-01' } },
      { type: 'create_note', data: { title: 'Should not be created' } },
      { type: 'preview_plan_creation', data: { title: 'Plaan', type: 'workout', items: [{ label: 'Kükid' }] } },
      { type: 'create_habit', data: { title: 'Should not be created' } },
      { type: 'create_goal', data: { title: 'Should not be created' } },
    ]
    await executeActionsAsync(actions, baseCtx({ setPendingPlanDraft }))

    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    expect(addCalendarEvent).not.toHaveBeenCalled()
    expect(addNote).not.toHaveBeenCalled()
    expect(addHabit).not.toHaveBeenCalled()
    expect(addGoal).not.toHaveBeenCalled()
  })

  it('a batch without preview_plan_creation is unaffected — other actions still run normally', async () => {
    const actions: AIAction[] = [{ type: 'create_task', data: { title: 'A perfectly normal task' } }]
    await executeActionsAsync(actions, baseCtx())
    expect(addTask).toHaveBeenCalledTimes(1)
  })

  it('existing preview_bank_import isolation is unchanged by the new guard', async () => {
    const setPendingMoneyImport = vi.fn()
    const actions: AIAction[] = [
      { type: 'preview_bank_import', data: {} },
      { type: 'create_money_income', data: { amount: 10, title: 'Should not be created', date: '2026-09-01' } },
    ]
    const result = await executeActionsAsync(
      actions,
      baseCtx({ getCanonicalBankTransactions: () => [], setPendingMoneyImport }),
    )
    // preview_bank_import itself reports failure with no canonical transactions (unrelated to this guard);
    // the point being proven is that the money-write action was still dropped from the batch, not executed.
    expect(result).toHaveLength(1)
  })

  // ── Only one plan preview may ever execute per AI response ───────────────

  it('two preview_plan_creation actions in one response produce exactly one preview', async () => {
    const setPendingPlanDraft = vi.fn()
    const actions: AIAction[] = [
      { type: 'preview_plan_creation', data: { title: 'First', type: 'study', items: [{ label: 'Loe' }] } },
      { type: 'preview_plan_creation', data: { title: 'Second', type: 'workout', items: [{ label: 'Kükid' }] } },
    ]
    await executeActionsAsync(actions, baseCtx({ setPendingPlanDraft }))

    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    expect(setPendingPlanDraft.mock.calls[0][0].title).toBe('First') // first valid one wins
  })

  it('two previews plus create_task produce one preview and zero task writes', async () => {
    const setPendingPlanDraft = vi.fn()
    const actions: AIAction[] = [
      { type: 'preview_plan_creation', data: { title: 'First', type: 'study', items: [{ label: 'Loe' }] } },
      { type: 'create_task', data: { title: 'Should not be created' } },
      { type: 'preview_plan_creation', data: { title: 'Second', type: 'workout', items: [{ label: 'Kükid' }] } },
    ]
    await executeActionsAsync(actions, baseCtx({ setPendingPlanDraft }))

    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    expect(addTask).not.toHaveBeenCalled()
  })

  it('an invalid first preview followed by a valid second preview results in exactly one valid preview (documented rule: first VALID one wins, scanned left to right)', async () => {
    const setPendingPlanDraft = vi.fn()
    const actions: AIAction[] = [
      { type: 'preview_plan_creation', data: { title: '', type: 'study', items: [{ label: 'Loe' }] } }, // invalid: empty title
      { type: 'preview_plan_creation', data: { title: 'Valid one', type: 'workout', items: [{ label: 'Kükid' }] } },
    ]
    const results = await executeActionsAsync(actions, baseCtx({ setPendingPlanDraft }))

    // The current lookup picks the first action whose data sanitizes successfully — the invalid
    // first entry is skipped entirely (not executed, no failure result added), and only the
    // valid second one runs and calls the callback.
    expect(setPendingPlanDraft).toHaveBeenCalledTimes(1)
    expect(setPendingPlanDraft.mock.calls[0][0].title).toBe('Valid one')
    expect(results).toHaveLength(1)
  })
})

describe('buildPlanGenerationMessages: no hidden prefix, length matches the raw description exactly', () => {
  it('sends the description verbatim as the sole message, with no wrapper sentence', () => {
    const description = 'Nädala menüü kahele inimesele, lihtsad road'
    const messages = buildPlanGenerationMessages(description)
    expect(messages).toEqual([{ role: 'user', content: description }])
  })

  it('a description at exactly maxPromptLength stays exactly that length after construction', () => {
    const description = 'x'.repeat(PLAN_DRAFT_LIMITS.maxPromptLength)
    const messages = buildPlanGenerationMessages(description)
    expect(messages[0].content.length).toBe(PLAN_DRAFT_LIMITS.maxPromptLength)
    expect(messages[0].content).toBe(description)
  })

  it('never adds characters on top of the raw description, regardless of content', () => {
    const tricky = 'Loo plaan järgmise kirjelduse põhjal: midagi muud täiesti'
    expect(buildPlanGenerationMessages(tricky)[0].content).toBe(tricky)
    expect(buildPlanGenerationMessages(tricky)[0].content.length).toBe(tricky.length)
  })
})
