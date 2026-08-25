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
import type { NoteFolder } from '@/data/notesData'
import type { HabitCategory } from '@/data/habitsData'
import { sanitizePlanDraft, type PlanDraft } from '@/lib/planDraftValidation'

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

// ── Core action executor (async) ──────────────────────────────────────────────

export async function executeAction(action: AIAction, ctx?: ActionContext): Promise<AIActionResult> {
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
          priority: inferPriority(title),
          time: action.data.time ? String(action.data.time) : undefined,
          completed: false,
          category: inferCategory(title),
        }
        await addTask(task)
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
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Ülesande pealkiri või ID puudub.' }
        const tasks = getAllTasks()
        const target = id ? tasks.find((t) => t.id === id) : tasks.find((t) => t.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga ülesannet ei leitud.' }
        await deleteTask(target.id)
        return { success: true, message: `Ülesanne "${target.title}" kustutatud.` }
      }

      case 'delete_note': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Märke pealkiri või ID puudub.' }
        const notes = getAllNotes()
        const target = id ? notes.find((n) => n.id === id) : notes.find((n) => n.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga märget ei leitud.' }
        await deleteNote(target.id)
        return { success: true, message: `Märge "${target.title}" kustutatud.` }
      }

      case 'delete_habit': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Harjumuse pealkiri või ID puudub.' }
        const habits = getAllHabits()
        const target = id ? habits.find((h) => h.id === id) : habits.find((h) => h.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga harjumust ei leitud.' }
        await deleteHabit(target.id)
        return { success: true, message: `Harjumus "${target.title}" kustutatud.` }
      }

      case 'delete_goal': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Eesmärgi pealkiri või ID puudub.' }
        const goals = getAllGoals()
        const target = id ? goals.find((g) => g.id === id) : goals.find((g) => g.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga eesmärki ei leitud.' }
        await deleteGoal(target.id)
        return { success: true, message: `Eesmärk "${target.title}" kustutatud.` }
      }

      case 'delete_calendar_event': {
        const title = String(action.data.title || '').trim().toLowerCase()
        const id = String(action.data.id || '').trim()
        if (!title && !id) return { success: false, message: 'Sündmuse pealkiri või ID puudub.' }
        const events = getAllEvents()
        const target = id ? events.find((e) => e.id === id) : events.find((e) => e.title.toLowerCase() === title)
        if (!target) return { success: false, message: 'Sellise pealkirjaga sündmust ei leitud.' }
        await deleteCalendarEvent(target.id)
        return { success: true, message: `Sündmus "${target.title}" kustutatud.` }
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
        return { success: true, message: '' }
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
        return { success: true, message: '' }
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
  actions: AIAction[],
  ctx?: ActionContext,
): Promise<AIActionResult[]> {
  const results: AIActionResult[] = []

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

  // At most ONE preview_plan_creation action may ever execute (so
  // setPendingPlanDraft/the preview UI is invoked at most once per AI
  // response), even if the model returned several. Pre-scan for the FIRST
  // one whose data sanitizes to a usable draft — an earlier invalid one
  // does not block a later valid one, but only that first valid one ever
  // runs; every other preview_plan_creation action (before or after it,
  // valid or invalid) is discarded without executing.
  const firstValidPlanPreviewIndex = hasPlanPreview
    ? actions.findIndex((a) => a.type === 'preview_plan_creation' && sanitizePlanDraft(a.data) !== null)
    : -1

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (hasPlanPreview) {
      if (action.type === 'preview_plan_creation') {
        if (i !== firstValidPlanPreviewIndex) continue // discard every other plan preview, valid or not
      } else {
        continue // preview_plan_creation isolation — nothing else in this batch may execute
      }
    }
    if (hasBankPreview && MONEY_WRITE_TYPES.has(action.type)) {
      // Drop silently — the review card handles confirmed writes
      continue
    }
    results.push(await executeAction(action, ctx))
  }
  return results
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
