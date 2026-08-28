import { db, auth } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { addTask, deleteTask, getAllTasks } from '@/lib/tasksStore'
import { addNote, deleteNote, getAllNotes } from '@/lib/quickNotesStore'
import { addHabit, deleteHabit, getAllHabits } from '@/lib/habitsStore'
import { addGoal, deleteGoal, getAllGoals } from '@/lib/goalsStore'
import { addCalendarEvent, deleteCalendarEvent, getAllEvents } from '@/lib/calendarStore'
import { addTransaction, getAllTransactions } from '@/lib/moneyStore'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import type { Transaction, TransactionCategory } from '@/types/money'
import { getAllSchoolSubjects } from '@/lib/schoolStore'
import {
  uploadAndSaveDocument,
  moveDocument as moveDocumentStore,
  renameDocument as renameDocumentStore,
  getAllDocuments,
  getDocumentById,
  findDuplicate,
  type DocumentModule,
  type DocumentDestination,
} from '@/lib/documentsStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Task, Priority, TaskCategory } from '@/types'
import { TASK_CATEGORIES } from '@/lib/taskCategories'
import type { NoteFolder } from '@/data/notesData'
import type { HabitCategory } from '@/data/habitsData'
import { sanitizePlanDraft, normalizeSingleValidPlanPreview, type PlanDraft } from '@/lib/planDraftValidation'

export interface AIAction {
  type: 'create_task' | 'create_note' | 'create_habit' | 'create_goal' | 'create_calendar_event'
    | 'delete_task' | 'delete_note' | 'delete_habit' | 'delete_goal' | 'delete_calendar_event'
    | 'save_document' | 'move_document' | 'rename_document' | 'batch_save_documents'
    | 'create_money_income' | 'create_money_expense' | 'batch_create_money_transactions'
    | 'preview_bank_import' | 'preview_plan_creation'
  data: Record<string, unknown>
}

export interface AIActionResult {
  success: boolean
  message: string
  /**
   * True when this result is a destructive-action CONFIRMATION REQUEST —
   * nothing was executed, `message` is a question asking the user to
   * confirm, and `success` is false. See the destructive-action
   * confirmation gate below. Callers (AIAssistantPage.tsx) use this to
   * make sure the model's own free-text reply never gets appended after a
   * confirmation question — the exact bug this gate fixes.
   */
  needsConfirmation?: boolean
  /**
   * True ONLY for the two actions (preview_plan_creation, preview_bank_import)
   * that intentionally return an empty `message` on success because a
   * dedicated UI card (the plan draft / bank import review) renders
   * instead of chat text. composeFinalReply uses this to tell "nothing to
   * show because a card is showing it" apart from "nothing to show because
   * something unexpected happened" — only the latter gets a fallback
   * message, so the chat bubble can never end up silently blank.
   */
  silent?: boolean
}

// ── Action context — carries runtime dependencies for document actions ─────────

export interface PendingFileRef {
  id: string
  name: string
  mimeType: string
  file?: File
  size: number
}

// ── Canonical bank transaction type ──────────────────────────────────────────
// IMPORTANT: This type MUST stay synchronized with BankTransaction in
// artifacts/api-server/src/routes/aiUpload.ts. Any field added to
// BankTransaction there must be mirrored here to avoid silent narrowing at
// the import boundary.
export interface CanonicalBankTransaction {
  id?: string            // unique per transaction — used for import dedup
  page?: number          // 1-based page number where this row was found
  rowIndex?: number      // 0-based position within page
  date: string           // ISO: "YYYY-MM-DD"
  description: string    // exact text from statement
  debit?: number | null   // raw debit column value; null/undefined if column empty
  credit?: number | null  // raw credit column value; null/undefined if column empty
  balance?: number | null // running account balance; never used for direction
  amount: number         // always positive
  currency: string
  direction: 'income' | 'expense'
  needsReview?: boolean
  reviewReason?: string
}

export interface ActionContext {
  uid: string
  getFile: (fileId: string) => PendingFileRef | null
  getAllDocuments: typeof getAllDocuments
  /**
   * Returns the server-validated canonical transaction array from the current
   * attached bank statement file. When present, preview_bank_import uses this
   * instead of the AI-generated list so direction is always deterministic.
   */
  getCanonicalBankTransactions?: () => CanonicalBankTransaction[] | null
  /** Called by preview_bank_import — shows MoneyImportReviewCard in the UI */
  setPendingMoneyImport?: (txns: CanonicalBankTransaction[]) => void
  /**
   * Called by preview_plan_creation with an already-sanitized PlanDraft —
   * shows AIPlanGeneratorModal's editable preview. Nothing is written to
   * Firestore here; the draft is only saved once the user explicitly
   * confirms via addPlan().
   */
  setPendingPlanDraft?: (draft: PlanDraft) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function todayDateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return todayDateStr()
  // If already YYYY-MM-DD, return as-is (avoids UTC-midnight timezone shift from new Date("YYYY-MM-DD"))
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  // For other representations, parse and reformat in local time
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return todayDateStr()
}

// ── Post-write verification ───────────────────────────────────────────────────

async function verifyDoc(collection: string, id: string): Promise<boolean> {
  try {
    const uid = auth.currentUser?.uid
    if (!uid) return false
    const snap = await getDoc(doc(db, 'users', uid, collection, id))
    return snap.exists()
  } catch {
    return false
  }
}

function inferCategory(text: string): TaskCategory {
  const lower = text.toLowerCase()
  if (lower.match(/töö|koosolek|projekt|raport|meeskond/)) return 'Töö'
  if (lower.match(/kool|õpi|eksam|kodutöö|ülikool/)) return 'Kool'
  if (lower.match(/pere|perega|lapsed/)) return 'Pere'
  if (lower.match(/treen|jooks|jõusaal|tervis|arst/)) return 'Tervis'
  if (lower.match(/ost|pood|ostunimekiri/)) return 'Ostud'
  return 'Isiklik'
}

function inferPriority(text: string): Priority {
  const lower = text.toLowerCase()
  if (lower.match(/tähtis|kiire|otsene|kohe|oluline|prioriteet/)) return 'high'
  if (lower.match(/võib oodata|mitte kiire|ainult kui/)) return 'low'
  return 'medium'
}

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low']

/**
 * Honors an explicit category the model passed through in action.data.category
 * (itself carrying the user's own stated wish, e.g. "kategooria Kodu") when it
 * exactly matches one of Kivora's canonical TaskCategory values — case- and
 * whitespace-insensitively, since the model may vary casing. Falls back to
 * inferCategory(title) ONLY when no category was given, or the given one
 * doesn't match any canonical value. This is the fix for a live bug where an
 * explicitly requested category was silently discarded in favor of a
 * title-keyword guess (e.g. "Kodu" → "Ostud") because this field was never
 * read at all.
 */
function resolveTaskCategory(rawCategory: unknown, title: string): TaskCategory {
  if (typeof rawCategory === 'string') {
    const trimmed = rawCategory.trim().toLowerCase()
    const match = TASK_CATEGORIES.find((c) => c.toLowerCase() === trimmed)
    if (match) return match
  }
  return inferCategory(title)
}

/** Same rule as resolveTaskCategory, for action.data.priority. */
function resolveTaskPriority(rawPriority: unknown, title: string): Priority {
  if (typeof rawPriority === 'string') {
    const trimmed = rawPriority.trim().toLowerCase()
    const match = VALID_PRIORITIES.find((p) => p === trimmed)
    if (match) return match
  }
  return inferPriority(title)
}

// ── Money helpers ─────────────────────────────────────────────────────────────

const VALID_INCOME_CATS: TransactionCategory[] = [
  'salary', 'benefits', 'side-income', 'refund', 'gift', 'sale', 'other-income',
]
const VALID_EXPENSE_CATS: TransactionCategory[] = [
  'food', 'transport', 'housing', 'children-family', 'health', 'education',
  'shopping', 'entertainment', 'subscriptions', 'debt', 'insurance-tx', 'pets',
  'travel', 'other-expense',
]

export function resolveIncomeCategory(raw: string | undefined, description: string): TransactionCategory {
  if (raw && VALID_INCOME_CATS.includes(raw as TransactionCategory)) return raw as TransactionCategory
  const d = description.toLowerCase()
  if (d.match(/palk|salary|töötasu|wages/)) return 'salary'
  if (d.match(/tagastus|refund|hüvit/)) return 'refund'
  if (d.match(/kingitus|gift/)) return 'gift'
  if (d.match(/müük|sale|sold/)) return 'sale'
  if (d.match(/pension|toetus|benefits|sotsiaal/)) return 'benefits'
  if (d.match(/lisatöö|freelance|kõrvaltöö/)) return 'side-income'
  return 'other-income'
}

export function resolveExpenseCategory(raw: string | undefined, description: string): TransactionCategory {
  if (raw && VALID_EXPENSE_CATS.includes(raw as TransactionCategory)) return raw as TransactionCategory
  const d = description.toLowerCase()
  if (d.match(/selver|maxima|rimi|prisma|coop|spar|lidl|aldi|toidupood|food|market|kauplus/)) return 'food'
  if (d.match(/kütus|fuel|neste|olerex|circle k|terminal|buss|tramm|rong|transport|taxi|bolt|uber|parkla/)) return 'transport'
  if (d.match(/netflix|spotify|apple|google|amazon|digi|streaming|subscription|tellimu/)) return 'subscriptions'
  if (d.match(/küte|vesi|elekter|gaas|eesti energia|telia|elisa|tele2|üür|rent|korteriüür/)) return 'housing'
  if (d.match(/apteek|pharmacy|arst|haigla|tervis|hospital|health/)) return 'health'
  if (d.match(/kool|ülikool|university|course|õppemaks|raamat/)) return 'education'
  if (d.match(/reisimine|travel|airbnb|hotel|booking|lennujaam|airport|majutus/)) return 'travel'
  if (d.match(/laen|loan|järelmaks|credit|liising/)) return 'debt'
  if (d.match(/kindlustus|insurance/)) return 'insurance-tx'
  if (d.match(/lemmikloom|pet|veterinaaria|vet/)) return 'pets'
  if (d.match(/riided|mango|h&m|zara|vero|clothing|fashion|mood/)) return 'shopping'
  if (d.match(/kino|teater|kontsert|entertainment|lõbu|casino|restoran|kohvik|cafe/)) return 'entertainment'
  if (d.match(/laps|laste|kindergarten|lasteaed|huviringi|hobikas/)) return 'children-family'
  return 'other-expense'
}

/**
 * Duplicate check: same date + same absolute amount + title prefix matches (exported for use in UI).
 * Uses an exact date + amount match plus a case-insensitive first-30-char
 * title comparison (lenient enough to catch re-imports, strict enough to
 * avoid false positives on same-day same-amount different transactions).
 */
export function findMoneyDuplicate(
  date: string,
  amount: number,
  title: string,
  type: 'income' | 'expense',
): Transaction | undefined {
  const shortTitle = title.toLowerCase().slice(0, 30).trim()
  return getAllTransactions().find(t =>
    t.type === type &&
    t.date === date &&
    Math.abs(t.amount - amount) < 0.005 &&     // float tolerance
    t.title.toLowerCase().slice(0, 30).trim() === shortTitle,
  )
}

// ── Destination label (for success messages) ──────────────────────────────────

function destLabel(module: DocumentModule, folder?: string, subjectName?: string): string {
  if (module === 'notes')  return `Märkmed / ${folder || 'Isiklik'}`
  if (module === 'school') return `Kool / ${subjectName || 'Üldine'}`
  return 'Isiklik / Dokumendid'
}

// ── Destructive-action confirmation gate ────────────────────────────────────
//
// Root-cause fix for a critical data-safety bug: delete_* actions used to
// execute the instant the model emitted them, relying entirely on the
// model's own prompt-following to "ask first" first — which is not
// trustworthy (a single model reply could emit the delete tool call AND a
// confirmation question in the same turn, deleting the item before the
// user ever saw the question).
//
// This gate enforces confirm-before-execute in code, independent of the
// model's prompt-following or wording:
//   - A delete_* action's FIRST proposal for a given target (its type +
//     exact resolved entity id, resolved from the live store, never the
//     model's raw title string) is NEVER executed. It's recorded as the
//     one pending destructive action and a confirmation question is
//     returned instead — no store write happens.
//   - That same delete_* action only executes once it is proposed again in
//     a LATER round-trip (a later call to executeActionsAsync) for the
//     exact same type + entity id. "Later round-trip" is tracked by a
//     generation counter bumped once per executeActionsAsync call — NOT
//     once per action — so two occurrences of the same delete inside one
//     actions[] batch (a duplicate the model emits in a single reply)
//     cannot satisfy each other and bypass confirmation.
//   - Confirmation is bound to the exact pending {type, entityId}: a
//     different target, a different action type, or a later unrelated
//     "yes" that doesn't resolve to that same pending target, can never
//     execute anything — it only starts (or restarts) a new, separate
//     confirmation request.
//   - Only one destructive action can be pending at a time; proposing a
//     new target overwrites (invalidates) whatever was pending before, so
//     a stale confirmation can never be redirected at a different entity.
type DestructiveActionType =
  | 'delete_task' | 'delete_note' | 'delete_habit' | 'delete_goal' | 'delete_calendar_event'

interface PendingDestructiveAction {
  type: DestructiveActionType
  entityId: string
  requestedInGeneration: number
}

let _actionGeneration = 0
let _pendingDestructiveAction: PendingDestructiveAction | null = null

/** Test-only: resets the confirmation gate to its initial (nothing pending) state. */
export function __resetDestructiveActionGateForTests(): void {
  _actionGeneration = 0
  _pendingDestructiveAction = null
}

function isPendingConfirmed(type: DestructiveActionType, entityId: string): boolean {
  return (
    _pendingDestructiveAction !== null &&
    _pendingDestructiveAction.type === type &&
    _pendingDestructiveAction.entityId === entityId &&
    _pendingDestructiveAction.requestedInGeneration < _actionGeneration
  )
}

function requestConfirmation(type: DestructiveActionType, entityId: string): void {
  _pendingDestructiveAction = { type, entityId, requestedInGeneration: _actionGeneration }
}

function clearPendingDestructiveAction(): void {
  _pendingDestructiveAction = null
}

// ── Short confirm/cancel replies ("jah" / "yes" / "ei" / "cancel") ─────────
//
// Live bug: a full-sentence confirmation ("Jah, kustuta.") worked, but a
// bare "jah"/"yes" reply to the SAME confirm question apparently did not —
// the model's own confirm-question example text uses a full sentence,
// biasing it toward expecting one back. The confirm-before-execute GATE
// itself (above) was never the problem: it only cares whether the SAME
// {type, entityId} is re-proposed in a later round-trip, completely
// independent of the user's wording.
//
// Fix: recognize a short, unambiguous confirm/cancel reply here, in code,
// and resolve it WITHOUT a round-trip to the model at all — by re-feeding
// the exact pending {type, entityId} through the existing, unmodified
// executeActionsAsync → executeDestructiveAction gate (a synthetic action
// built from the pending state, resolved by id — never by title). This
// reuses every existing safety guarantee unchanged: the confirmation stays
// bound to the exact pending type + entity id, and a later "later round-trip"
// requirement is still enforced by the same generation counter.
//
// A deliberately small, exact whitelist (not a fuzzy regex over arbitrary
// sentences) — matching only the minimal required words/phrases plus
// trivial punctuation/case variation — so an ambiguous reply is never
// mistaken for confirmation.
const SHORT_CONFIRM_REPLIES = new Set(['jah', 'jah palun', 'kinnitan', 'yes', 'confirm', 'confirmed'])
const SHORT_CANCEL_REPLIES = new Set(['ei', 'tühista', 'no', 'cancel', 'cancelled', 'canceled'])

function normalizeShortReply(message: string): string {
  return message.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ')
}

export type ShortConfirmationIntent = 'confirm' | 'cancel'

/** Pure classifier — exact whitelist match only, so an ambiguous reply never resolves to either intent. */
export function classifyShortConfirmationReply(message: string): ShortConfirmationIntent | null {
  const normalized = normalizeShortReply(message)
  if (SHORT_CONFIRM_REPLIES.has(normalized)) return 'confirm'
  if (SHORT_CANCEL_REPLIES.has(normalized)) return 'cancel'
  return null
}

/**
 * Synchronous pre-check a caller can use BEFORE sending a message to the AI
 * backend at all, to decide whether to take the local short-circuit path
 * instead of the normal chat round-trip. True only when the message is a
 * recognized short confirm/cancel word AND a destructive action is actually
 * pending — a generic "jah"/"yes" with nothing pending is never handled
 * here (it safely falls through to the normal AI flow, which executes
 * nothing on its own).
 */
export function shouldHandleAsShortConfirmationReply(message: string): boolean {
  return classifyShortConfirmationReply(message) !== null && _pendingDestructiveAction !== null
}

/**
 * Resolves a short confirm/cancel reply locally. Returns null when it does
 * not apply (ambiguous message, or nothing pending) — callers fall through
 * to the normal AI chat flow in that case, completely unaffected.
 */
export async function resolveShortConfirmationReply(
  message: string,
  ctx?: ActionContext,
): Promise<AIActionResult[] | null> {
  const intent = classifyShortConfirmationReply(message)
  if (!intent || !_pendingDestructiveAction) return null

  if (intent === 'cancel') {
    clearPendingDestructiveAction()
    return [{ success: true, message: 'Toiming tühistatud. Midagi ei muudetud.' }]
  }

  // 'confirm' — re-propose the exact pending {type, entityId} through the
  // unmodified executeActionsAsync/executeDestructiveAction gate. Since
  // this is a genuinely later call to executeActionsAsync, the generation
  // counter advances past requestedInGeneration and the pending action is
  // recognized as confirmed and actually executed.
  const { type, entityId } = _pendingDestructiveAction
  return executeActionsAsync([{ type, data: { id: entityId } }], ctx)
}

interface DestructiveActionConfig<T> {
  type: DestructiveActionType
  find: (id: string, title: string) => T | undefined
  getId: (target: T) => string
  getTitle: (target: T) => string
  missingIdentifierMessage: string
  notFoundMessage: string
  confirmQuestion: (title: string) => string
  execute: (id: string) => Promise<void>
  successMessage: (title: string) => string
}

/**
 * Shared confirm-before-execute flow for every destructive AI action — the
 * single place this rule is implemented, reused by every delete_* case
 * below instead of being duplicated (and risking drift) per entity type.
 *
 * On a failed `execute` (e.g. a Firestore write rejects), the thrown error
 * propagates to executeAction's own try/catch, which returns
 * `{ success: false, message: err.message }` WITHOUT clearing the pending
 * confirmation — so a transient failure never produces a success message,
 * and the user doesn't have to re-confirm just to retry.
 */
async function executeDestructiveAction<T>(
  action: AIAction,
  cfg: DestructiveActionConfig<T>,
): Promise<AIActionResult> {
  const title = String(action.data.title || '').trim().toLowerCase()
  const id = String(action.data.id || '').trim()
  if (!title && !id) return { success: false, message: cfg.missingIdentifierMessage }

  const target = cfg.find(id, title)
  if (!target) return { success: false, message: cfg.notFoundMessage }

  const targetId = cfg.getId(target)
  const targetTitle = cfg.getTitle(target)

  if (!isPendingConfirmed(cfg.type, targetId)) {
    requestConfirmation(cfg.type, targetId)
    return { success: false, needsConfirmation: true, message: cfg.confirmQuestion(targetTitle) }
  }

  await cfg.execute(targetId)
  clearPendingDestructiveAction()
  return { success: true, message: cfg.successMessage(targetTitle) }
}

// ── Core action executor (async) ──────────────────────────────────────────────

/**
 * Canonicalizes a single action to `preview_plan_creation` when its outer
 * type is a plan-category value (e.g. "workout") instead of the canonical
 * literal — the production defect where a model placed the PlanDraft's own
 * `type` into the outer action type. Delegates to
 * normalizeSingleValidPlanPreview (treating the single action as a
 * one-element batch); an unrelated action, or a category-typed action that
 * cannot be strictly reconstructed, is returned unchanged. This runs ahead
 * of the switch below so any direct caller of executeAction — not just
 * executeActionsAsync, which also canonicalizes its whole batch upfront —
 * benefits, independent of whether the backend has already been redeployed
 * with the equivalent server-side fix.
 */
function canonicalizeSinglePlanPreviewAction(action: AIAction): AIAction {
  const [normalized] = normalizeSingleValidPlanPreview([action]) as AIAction[]
  return normalized ?? action
}

export async function executeAction(rawAction: AIAction, ctx?: ActionContext): Promise<AIActionResult> {
  const action = canonicalizeSinglePlanPreviewAction(rawAction)
  try {
    switch (action.type) {

      // ── Existing actions (unchanged) ─────────────────────────────────────
      case 'create_task': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Ülesande pealkiri puudub.' }
        const task: Task = {
          id: uid('task'),
          title,
          description: action.data.description ? String(action.data.description) : undefined,
          date: action.data.date ? parseDate(String(action.data.date)) : todayDateStr(),
          priority: resolveTaskPriority(action.data.priority, title),
          time: action.data.time ? String(action.data.time) : undefined,
          completed: false,
          category: resolveTaskCategory(action.data.category, title),
        }
        await addTask(task)
        const taskOk = await verifyDoc('tasks', task.id)
        if (!taskOk) return { success: false, message: `POST_WRITE_VERIFICATION_FAILED: ülesanne "${title}" ei ilmunud ülesannete andmekihis.` }
        return { success: true, message: `Ülesanne "${title}" lisatud.` }
      }

      case 'create_note': {
        const title = String(action.data.title || '')
        const content = String(action.data.content || title)
        if (!title) return { success: false, message: 'Märke pealkiri puudub.' }
        const folder = (action.data.folder as NoteFolder) || 'Isiklik'
        const createdNote = await addNote(title, content, folder, false)
        const noteOk = await verifyDoc('notes', createdNote.id)
        if (!noteOk) return { success: false, message: `POST_WRITE_VERIFICATION_FAILED: märge "${title}" ei ilmunud märkmete andmekihis.` }
        return { success: true, message: `Märge "${title}" lisatud.` }
      }

      case 'create_habit': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Harjumuse pealkiri puudub.' }
        const description = String(action.data.description || '')
        const category = (action.data.category as HabitCategory) || 'Isiklik'
        const recurrence = (action.data.recurrence as 'daily' | 'weekdays' | 'custom') || 'daily'
        await addHabit({
          title,
          description,
          category,
          icon: 'book',
          iconColor: '#6F5AE8',
          iconBg: '#EDE9FB',
          recurrence,
        })
        return { success: true, message: `Harjumus "${title}" lisatud.` }
      }

      case 'create_goal': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Eesmärgi pealkiri puudub.' }
        const description = String(action.data.description || '')
        const steps = Array.isArray(action.data.steps) ? action.data.steps as string[] : []
        const goal = {
          id: uid('goal'),
          title,
          description,
          iconBg: '#EDE9FB',
          iconColor: '#6F5AE8',
          icon: 'personal' as const,
          status: 'active' as const,
          progressType: 'fraction' as const,
          progressValue: 0,
          progressMax: Math.max(steps.length, 1),
          deadline: String(action.data.deadline || ''),
          deadlineShort: String(action.data.deadline || ''),
          barColor: '#6F5AE8',
          steps: steps.map((s, i) => ({ id: `step-${Date.now()}-${i}`, title: s, done: false })),
        }
        await addGoal(goal)
        return { success: true, message: `Eesmärk "${title}" lisatud.` }
      }

      case 'create_calendar_event': {
        const title = String(action.data.title || '')
        if (!title) return { success: false, message: 'Sündmuse pealkiri puudub.' }
        const event: MockCalendarEvent = {
          id: uid('evt'),
          title,
          startTime: String(action.data.startTime || '09:00'),
          endTime: String(action.data.endTime || '10:00'),
          color: '#6F5AE8',
          date: action.data.date ? parseDate(String(action.data.date)) : todayDateStr(),
          calendarId: 'mine',
          description: action.data.description ? String(action.data.description) : undefined,
          location: action.data.location ? String(action.data.location) : undefined,
        }
        await addCalendarEvent(event)
        const eventOk = await verifyDoc('calendarEvents', event.id)
        if (!eventOk) return { success: false, message: `POST_WRITE_VERIFICATION_FAILED: sündmus "${title}" ei ilmunud kalendri andmekihis.` }
        return { success: true, message: `Sündmus "${title}" lisatud kalendrisse (${event.date}, ${event.startTime}–${event.endTime}).` }
      }

      case 'delete_task': {
        return await executeDestructiveAction(action, {
          type: 'delete_task',
          find: (id, title) => {
            const tasks = getAllTasks()
            return id ? tasks.find((t) => t.id === id) : tasks.find((t) => t.title.toLowerCase() === title)
          },
          getId: (t) => t.id,
          getTitle: (t) => t.title,
          missingIdentifierMessage: 'Ülesande pealkiri või ID puudub.',
          notFoundMessage: 'Sellise pealkirjaga ülesannet ei leitud.',
          confirmQuestion: (title) => `Kas soovid kindlasti kustutada ülesande "${title}"? Seda toimingut ei saa tagasi võtta.`,
          execute: (id) => deleteTask(id),
          successMessage: (title) => `Ülesanne "${title}" kustutatud.`,
        })
      }

      case 'delete_note': {
        return await executeDestructiveAction(action, {
          type: 'delete_note',
          find: (id, title) => {
            const notes = getAllNotes()
            return id ? notes.find((n) => n.id === id) : notes.find((n) => n.title.toLowerCase() === title)
          },
          getId: (n) => n.id,
          getTitle: (n) => n.title,
          missingIdentifierMessage: 'Märke pealkiri või ID puudub.',
          notFoundMessage: 'Sellise pealkirjaga märget ei leitud.',
          confirmQuestion: (title) => `Kas soovid kindlasti kustutada märke "${title}"? Seda toimingut ei saa tagasi võtta.`,
          execute: (id) => deleteNote(id),
          successMessage: (title) => `Märge "${title}" kustutatud.`,
        })
      }

      case 'delete_habit': {
        return await executeDestructiveAction(action, {
          type: 'delete_habit',
          find: (id, title) => {
            const habits = getAllHabits()
            return id ? habits.find((h) => h.id === id) : habits.find((h) => h.title.toLowerCase() === title)
          },
          getId: (h) => h.id,
          getTitle: (h) => h.title,
          missingIdentifierMessage: 'Harjumuse pealkiri või ID puudub.',
          notFoundMessage: 'Sellise pealkirjaga harjumust ei leitud.',
          confirmQuestion: (title) => `Kas soovid kindlasti kustutada harjumuse "${title}"? Seda toimingut ei saa tagasi võtta.`,
          execute: (id) => deleteHabit(id),
          successMessage: (title) => `Harjumus "${title}" kustutatud.`,
        })
      }

      case 'delete_goal': {
        return await executeDestructiveAction(action, {
          type: 'delete_goal',
          find: (id, title) => {
            const goals = getAllGoals()
            return id ? goals.find((g) => g.id === id) : goals.find((g) => g.title.toLowerCase() === title)
          },
          getId: (g) => g.id,
          getTitle: (g) => g.title,
          missingIdentifierMessage: 'Eesmärgi pealkiri või ID puudub.',
          notFoundMessage: 'Sellise pealkirjaga eesmärki ei leitud.',
          confirmQuestion: (title) => `Kas soovid kindlasti kustutada eesmärgi "${title}"? Seda toimingut ei saa tagasi võtta.`,
          execute: (id) => deleteGoal(id),
          successMessage: (title) => `Eesmärk "${title}" kustutatud.`,
        })
      }

      case 'delete_calendar_event': {
        return await executeDestructiveAction(action, {
          type: 'delete_calendar_event',
          find: (id, title) => {
            const events = getAllEvents()
            return id ? events.find((e) => e.id === id) : events.find((e) => e.title.toLowerCase() === title)
          },
          getId: (e) => e.id,
          getTitle: (e) => e.title,
          missingIdentifierMessage: 'Sündmuse pealkiri või ID puudub.',
          notFoundMessage: 'Sellise pealkirjaga sündmust ei leitud.',
          confirmQuestion: (title) => `Kas soovid kindlasti kustutada sündmuse "${title}"? Seda toimingut ei saa tagasi võtta.`,
          execute: (id) => deleteCalendarEvent(id),
          successMessage: (title) => `Sündmus "${title}" kustutatud.`,
        })
      }

      // ── Document actions ──────────────────────────────────────────────────

      case 'save_document': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const fileId    = String(action.data.fileId || '')
        const pending   = ctx.getFile(fileId)
        if (!pending?.file) return { success: false, message: `Faili ID "${fileId}" ei leitud. Fail ei pruugi olla enam kättesaadav.` }

        const module: DocumentModule = (['notes', 'school', 'personal'].includes(String(action.data.module))
          ? String(action.data.module)
          : 'personal') as DocumentModule
        const folder      = action.data.folder as NoteFolder | undefined
        const subjectName = action.data.subjectName ? String(action.data.subjectName) : undefined
        const overrideName = action.data.name ? String(action.data.name) : undefined
        const finalName   = overrideName || pending.name

        // Resolve school subject ID from name
        const destination: DocumentDestination = { module, folder, subjectName }
        if (module === 'school' && subjectName) {
          const subjects = getAllSchoolSubjects()
          const match = subjects.find(s => s.name.toLowerCase() === subjectName.toLowerCase())
          if (match) destination.subjectId = match.id
          else return { success: false, message: `Õppeainet "${subjectName}" ei leitud. Kontrolli nime.` }
        }

        // Duplicate check
        const dup = findDuplicate(finalName, destination)
        if (dup) {
          return {
            success: false,
            message: `"${finalName}" on juba selles kohas olemas (salvestati: ${new Date(dup.createdAt).toLocaleDateString('et-EE')}). Kasutan olemasolevat.`,
          }
        }

        const record = await uploadAndSaveDocument(ctx.uid, pending.file, destination, overrideName)
        return { success: true, message: `✓ "${record.name}" salvestatud → ${destLabel(module, folder, subjectName)}` }
      }

      case 'move_document': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const docId     = String(action.data.documentId || '')
        const existing  = getDocumentById(docId)
        if (!existing) return { success: false, message: `Dokumenti ID "${docId}" ei leitud.` }

        const module: DocumentModule = (['notes', 'school', 'personal'].includes(String(action.data.module))
          ? String(action.data.module)
          : 'personal') as DocumentModule
        const folder      = action.data.folder as NoteFolder | undefined
        const subjectName = action.data.subjectName ? String(action.data.subjectName) : undefined

        const destination: DocumentDestination = { module, folder, subjectName }
        if (module === 'school' && subjectName) {
          const subjects = getAllSchoolSubjects()
          const match = subjects.find(s => s.name.toLowerCase() === subjectName.toLowerCase())
          if (match) destination.subjectId = match.id
          else return { success: false, message: `Õppeainet "${subjectName}" ei leitud. Kontrolli nime.` }
        }

        await moveDocumentStore(ctx.uid, docId, destination)
        return { success: true, message: `✓ "${existing.name}" viidud → ${destLabel(module, folder, subjectName)}` }
      }

      case 'rename_document': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const docId   = String(action.data.documentId || '')
        const newName = String(action.data.newName || '').trim()
        if (!newName) return { success: false, message: 'Uus nimi on tühi.' }
        const existing = getDocumentById(docId)
        if (!existing) return { success: false, message: `Dokumenti ID "${docId}" ei leitud.` }
        await renameDocumentStore(ctx.uid, docId, newName)
        return { success: true, message: `✓ "${existing.name}" ümber nimetatud → "${newName}"` }
      }

      case 'batch_save_documents': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const items = Array.isArray(action.data.items) ? action.data.items as Record<string, unknown>[] : []
        if (items.length === 0) return { success: false, message: 'Pakett-salvestus: üksused puuduvad.' }

        const successes: string[] = []
        const failures: string[] = []

        for (const item of items) {
          const subResult = await executeAction(
            { type: 'save_document', data: item },
            ctx,
          )
          if (subResult.success) successes.push(subResult.message)
          else failures.push(subResult.message)
        }

        const parts: string[] = []
        if (successes.length > 0) parts.push(successes.join('\n'))
        if (failures.length > 0)  parts.push(`⚠️ Probleemid:\n${failures.join('\n')}`)
        return {
          success: successes.length > 0,
          message: parts.join('\n\n'),
        }
      }

      // ── Bank statement preview — client handles the actual writes ─────────

      case 'preview_bank_import': {
        if (!MONEY_MODULE_ENABLED) {
          return {
            success: false,
            message: 'See funktsioon pole hetkel saadaval.',
          }
        }

        // ── Canonical-first strategy ───────────────────────────────────────────
        // The AI's transaction list in action.data is UNTRUSTED: the model may
        // re-classify directions or alter amounts when re-emitting the hidden
        // context JSON.  Always prefer the server-validated canonical array from
        // the attached file; fall back to the AI list only for manual (non-OCR)
        // flows where no attached file exists.
        const canonical = ctx?.getCanonicalBankTransactions?.()

        let txns: CanonicalBankTransaction[]

        if (canonical && canonical.length > 0) {
          // Server-validated canonical array — the ONLY permitted source.
          // Direction is already determined from debit/credit columns by the pipeline.
          txns = canonical
        } else {
          // No canonical array: the bank statement attachment is not in session state.
          // The LLM transaction list in action.data is NOT used — it may contain
          // re-classified directions, altered amounts, or fabricated rows.
          // Require the user to re-upload the statement to get a fresh canonical extraction.
          return {
            success: false,
            message: 'Pangaväljavõtte andmed ei ole enam sessioonis. Laadi fail uuesti üles, et import käivitada.',
          }
        }

        if (txns.length === 0) return { success: false, message: 'Kõik summad on null — midagi ei imporditud.' }

        ctx?.setPendingMoneyImport?.(txns)
        // Silent success — MoneyImportReviewCard displays the data; no duplicate text
        return { success: true, message: '', silent: true }
      }

      // ── Plan creation preview — client handles the actual write ───────────
      // Mirrors preview_bank_import: nothing is written to Firestore here.
      // action.data is untrusted model output — sanitizePlanDraft() is the
      // frontend's own independent validation pass (the backend already ran
      // an equivalent pass before this action ever reached the client, but
      // that server-side check is not trusted as the only line of defence).
      case 'preview_plan_creation': {
        const draft = sanitizePlanDraft(action.data)
        if (!draft) {
          return { success: false, message: 'Genereeritud plaan oli tühi või kehtetu.' }
        }
        ctx?.setPendingPlanDraft?.(draft)
        // Silent success — AIPlanGeneratorModal displays the draft; no duplicate text
        return { success: true, message: '', silent: true }
      }

      // ── Money actions ──────────────────────────────────────────────────────

      case 'create_money_income': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const amount = Math.abs(Number(action.data.amount))
        if (!amount || isNaN(amount)) return { success: false, message: 'Kehtetu summa.' }
        const title    = String(action.data.title || action.data.description || 'Sissetulek').slice(0, 200)
        const date     = String(action.data.date || todayDateStr())
        const currency = String(action.data.currency || 'EUR')
        const note     = action.data.note ? String(action.data.note) : undefined
        const rawCat   = action.data.category ? String(action.data.category) : undefined
        const category = resolveIncomeCategory(rawCat, title)

        const dup = findMoneyDuplicate(date, amount, title, 'income')
        if (dup) return { success: false, message: `Duplikaat: "${title}" (${date}, ${amount} ${currency}) on juba olemas.` }

        const tx: Transaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'income', amount, currency, title, category, date,
          createdAt: Date.now(), updatedAt: Date.now(),
          ...(note && { note }),
        }
        await addTransaction(tx)
        const incomeOk = await verifyDoc('transactions', tx.id)
        if (!incomeOk) return { success: false, message: `POST_WRITE_VERIFICATION_FAILED: sissetulek "${title}" ei ilmunud Raha mooduli andmekihis.` }
        return { success: true, message: `✓ Sissetulek "${title}" ${amount} ${currency} (${date}) lisatud.` }
      }

      case 'create_money_expense': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const amount = Math.abs(Number(action.data.amount))
        if (!amount || isNaN(amount)) return { success: false, message: 'Kehtetu summa.' }
        const title    = String(action.data.title || action.data.description || 'Kulu').slice(0, 200)
        const date     = String(action.data.date || todayDateStr())
        const currency = String(action.data.currency || 'EUR')
        const note     = action.data.note ? String(action.data.note) : undefined
        const rawCat   = action.data.category ? String(action.data.category) : undefined
        const category = resolveExpenseCategory(rawCat, title)

        const dup = findMoneyDuplicate(date, amount, title, 'expense')
        if (dup) return { success: false, message: `Duplikaat: "${title}" (${date}, ${amount} ${currency}) on juba olemas.` }

        const tx: Transaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'expense', amount, currency, title, category, date,
          createdAt: Date.now(), updatedAt: Date.now(),
          ...(note && { note }),
        }
        await addTransaction(tx)
        const expenseOk = await verifyDoc('transactions', tx.id)
        if (!expenseOk) return { success: false, message: `POST_WRITE_VERIFICATION_FAILED: kulu "${title}" ei ilmunud Raha mooduli andmekihis.` }
        return { success: true, message: `✓ Kulu "${title}" ${amount} ${currency} (${date}) lisatud.` }
      }

      case 'batch_create_money_transactions': {
        if (!ctx?.uid) return { success: false, message: 'Kasutaja pole sisse logitud.' }
        const items = Array.isArray(action.data.transactions)
          ? action.data.transactions as Record<string, unknown>[]
          : []
        if (items.length === 0) return { success: false, message: 'Tehingute loend on tühi.' }

        let incomeAdded = 0, expenseAdded = 0, skipped = 0, failed = 0
        const failMessages: string[] = []

        for (const item of items) {
          // Require explicit direction — never infer transaction type from amount sign (Fix J)
          const directionRaw = (item.direction ?? item.type)
          if (directionRaw !== 'income' && directionRaw !== 'expense') {
            failed++
            failMessages.push(`Tehing ilma kehtiva suunata (direction: "${directionRaw}"): ${String(item.description ?? '').slice(0, 60)}`)
            continue
          }
          const type = directionRaw as 'income' | 'expense'
          const rawAmount = Number(item.amount ?? 0)
          const subAction: AIAction = {
            type: type === 'income' ? 'create_money_income' : 'create_money_expense',
            data: { ...item, amount: Math.abs(rawAmount) },
          }
          const result = await executeAction(subAction, ctx)
          if (result.success) {
            if (type === 'income') incomeAdded++
            else expenseAdded++
          } else if (result.message.startsWith('Duplikaat:')) {
            skipped++
          } else {
            failed++
            failMessages.push(result.message)
          }
          // Small delay to avoid Firestore rate-limit on large batches
          if ((incomeAdded + expenseAdded) % 10 === 0 && incomeAdded + expenseAdded > 0) {
            await new Promise(r => setTimeout(r, 50))
          }
        }

        const lines: string[] = [
          `Valmis. Lisasin Raha moodulisse:`,
          `${incomeAdded} sissetulekut`,
          `${expenseAdded} väljaminekut`,
          ...(skipped > 0 ? [`${skipped} vahele jäetud (duplikaat)`] : []),
          ...(failed > 0  ? [`${failed} ebaõnnestus`, ...failMessages.slice(0, 3)] : []),
        ]
        return {
          success: incomeAdded + expenseAdded > 0 || (skipped > 0 && failed === 0),
          message: lines.join('\n'),
        }
      }

      default:
        return { success: false, message: 'Tundmatu toiming.' }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Toimingu käivitamine ebaõnnestus.'
    return { success: false, message: msg }
  }
}

/** Execute a list of actions asynchronously. Requires ActionContext for document actions. */
export async function executeActionsAsync(
  rawActions: AIAction[],
  ctx?: ActionContext,
): Promise<AIActionResult[]> {
  const results: AIActionResult[] = []

  // Bump the destructive-action confirmation generation exactly ONCE per
  // call — i.e. once per model round-trip, not once per action. Every
  // action in THIS batch shares this same generation, so a delete_*
  // proposed and then "re-proposed" within a single actions[] array (a
  // duplicate the model emits in one reply) can never satisfy its own
  // pending confirmation — only a delete_* proposed in a genuinely later
  // call to this function (the next model round-trip) can. See the
  // destructive-action confirmation gate above executeAction.
  _actionGeneration += 1

  // Canonicalize plan-preview actions FIRST, before any isolation-guard
  // detection — so a model that placed the plan category (e.g. "workout")
  // into the outer action.type instead of "preview_plan_creation" is
  // recognized as a plan preview here too, independently of whether the
  // backend has already been redeployed with the equivalent server-side fix
  // (rolling-deploy order must not be able to recreate "Tundmatu toiming.").
  // Narrow and deterministic — only the canonical literal type or one of
  // the six known PlanDraftType values is ever considered; no aliases.
  // After this call, at most one action can have type 'preview_plan_creation',
  // and it is already guaranteed to have sanitized successfully.
  const actions = normalizeSingleValidPlanPreview(rawActions) as AIAction[]

  // ── Hard guard: bank-import preview ─────────────────────────────────────────
  // When preview_bank_import is present in the batch, money write actions MUST NOT
  // execute.  The user has not confirmed anything yet — writes happen only after
  // they press "Kinnita import" on the MoneyImportReviewCard.
  // This guard is a second line of defence behind the system-prompt prohibition;
  // it prevents a misbehaving model response from bypassing the confirmation step.
  const MONEY_WRITE_TYPES = new Set([
    'create_money_income',
    'create_money_expense',
    'batch_create_money_transactions',
  ])
  const hasBankPreview = actions.some((a) => a.type === 'preview_bank_import')

  // ── Hard guard: plan-creation preview isolation ─────────────────────────────
  // When preview_plan_creation is present, it must be the ONLY action that
  // executes from this batch — no task/note/calendar/habit/goal/school/money/
  // document write may run alongside it, even if the model ignored the
  // system-prompt isolation instruction and returned other actions too.
  // Mirrors the preview_bank_import guard above; code-level, not prompt-only.
  const hasPlanPreview = actions.some((a) => a.type === 'preview_plan_creation')

  for (const action of actions) {
    if (hasPlanPreview && action.type !== 'preview_plan_creation') {
      // Drop silently — only the (already-unique, already-valid) plan preview may execute from this batch
      continue
    }
    if (hasBankPreview && MONEY_WRITE_TYPES.has(action.type)) {
      // Drop silently — the review card handles confirmed writes
      continue
    }
    results.push(await executeAction(action, ctx))
  }
  return results
}

/**
 * Composes the chat bubble text shown to the user after a batch of AI
 * actions has executed.
 *
 * The model writes its free-text `reply` BEFORE any action result is known
 * — it cannot truthfully report whether a write actually succeeded. Showing
 * it unconditionally lets a silently failed create/delete/update (a
 * rejected Firestore write, a security-rule denial, a missing field) be
 * masked by the model's own confident "done!" narration, while the store
 * never actually changed — the single place stale-looking data can enter
 * downstream of a perfectly fresh read.
 *
 * The model's reply is therefore suppressed (only the code-verified
 * `actionSummary`, built from each action's own result.message, is shown)
 * whenever:
 *   - any action is awaiting destructive-action confirmation
 *     (needsConfirmation) — the original confirm-before-execute fix, or
 *   - any action outright failed (success: false, not a confirmation
 *     request) — closes the write-failure-masking gap above.
 *
 * Never returns an empty/blank string. AIAssistantPage always renders a
 * chat bubble for a completed (non-pending) assistant turn regardless of
 * its content, so an empty result here is a genuinely blank bubble the
 * user sees as "no response at all" — e.g. if every result's message
 * happens to be empty (a `silent` preview_plan_creation/preview_bank_import
 * success — a rendered card is expected instead of chat text — combined
 * with a non-silent action's message being empty, or the model's own
 * reply also coming back empty). `silent` results are the ONE case an
 * empty compose is intentional (a UI card renders in their place); any
 * other empty outcome falls back to a generic acknowledgement so the user
 * is never left staring at nothing.
 *
 * When at least one non-silent action executed successfully, the model's
 * own free-text reply is suppressed ENTIRELY (not appended) — only the
 * code-verified actionSummary is shown. The model writes `reply` before
 * any action result is known, so on a successful action it typically
 * either re-narrates the same outcome the actionSummary already states
 * ("Ülesanne „X” lisatud." followed by the model's own "Lisasin ülesande
 * X...") or re-asks a question that has already been answered by the
 * action executing — both read as duplicated/confusing text in the same
 * bubble. This does NOT affect turns where no action executed at all
 * (results is empty) or where every action was silent (a card renders) —
 * those still show the model's reply exactly as before.
 */
export function composeFinalReply(results: AIActionResult[], modelReply: string): string {
  const actionSummary = results.map((r) => r.message).filter(Boolean).join(' ')
  const needsConfirmation = results.some((r) => r.needsConfirmation)
  const hasFailure = results.some((r) => !r.success && !r.needsConfirmation)
  const allSilent = results.length > 0 && results.every((r) => r.silent)
  const hasVisibleSuccess = results.some((r) => r.success && !r.silent)

  if (needsConfirmation || hasFailure) {
    return actionSummary || 'Toimingu tulemust ei õnnestunud kuvada. Palun proovi uuesti.'
  }
  if (hasVisibleSuccess) {
    return actionSummary || 'Toiming käivitatud.'
  }
  const combined = [actionSummary, modelReply].filter(Boolean).join('\n\n')
  if (combined) return combined
  return allSilent ? '' : 'Toiming käivitatud.'
}

/** Legacy sync shim — only works for non-document, non-money actions. */
export function executeActions(actions: AIAction[]): AIActionResult[] {
  const ASYNC_TYPES = [
    'save_document', 'move_document', 'rename_document', 'batch_save_documents',
    'create_money_income', 'create_money_expense', 'batch_create_money_transactions',
    'preview_bank_import', 'preview_plan_creation',
  ]
  return actions
    .filter(a => !ASYNC_TYPES.includes(a.type))
    .map(a => {
      // Run sync-safe actions only (document actions skipped)
      const result: AIActionResult = { success: false, message: 'Dokumenditoimingud vajavad async konteksti.' }
      void executeAction(a).then(r => { result.success = r.success; result.message = r.message })
      return result
    })
}
