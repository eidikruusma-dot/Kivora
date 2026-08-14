/**
 * moneyStore.ts
 *
 * Kivora Money ecosystem — unified Firestore store.
 * Follows the exact singleton onSnapshot + pub/sub + React hook pattern
 * used by every other Kivora store (tasksStore, goalsStore, calendarStore, …).
 *
 * Three collections, one init call:
 *   users/{uid}/transactions/{txId}
 *   users/{uid}/bills/{billId}
 *   users/{uid}/monthlyBudgets/{budgetId}
 *
 * AuthContext.tsx calls initMoneyStore(uid) inside onAuthStateChanged.
 */

import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import type {
  Transaction,
  Bill,
  BillStatus,
  MonthlyBudget,
  MonthSummary,
} from '@/types/money'
import {
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getAllEvents,
} from '@/lib/calendarStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

/** Build a calendar event that represents this bill's next due date. */
function billToCalEvent(bill: Bill): MockCalendarEvent {
  return {
    id: `bill-cal-${bill.id}`,
    title: `💸 ${bill.title} · ${bill.amount} €`,
    date: bill.nextDueDate,
    startTime: '00:00', // placeholder — allDay events bypass the timed layout engine
    endTime:   '00:00',
    color: '#F97316',
    allDay: true,
    calendarId: 'mine',
    description: `${bill.amount} €`,
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now()
}

/** Return YYYY-MM-DD from a Date using LOCAL year/month/day — never UTC. */
function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a YYYY-MM-DD string into a local-midnight Date (not UTC midnight). */
function parseLocalDate(dateStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d)
}

function todayISO(): string {
  return localDateISO(new Date())
}

/**
 * Given a bill's dueDay and optional recurringInterval, compute the next
 * due date as a YYYY-MM-DD string starting from today.
 */
export function computeNextDueDate(dueDay: number, from?: string): string {
  // Always work in local time — parseLocalDate avoids UTC-midnight shift from new Date(string)
  const base = from ? parseLocalDate(from) : new Date()
  const year = base.getFullYear()
  const month = base.getMonth() // 0-based
  const today = base.getDate()

  // Clamp dueDay to the number of days in the current month
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate()
  const effectiveDay = Math.min(dueDay, daysInCurrentMonth)

  if (effectiveDay >= today) {
    // Still due this month
    return localDateISO(new Date(year, month, effectiveDay))
  }

  // Already passed — move to next month
  const nextMonth = month + 1
  const nextYear = nextMonth > 11 ? year + 1 : year
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth
  const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate()
  const clampedDay = Math.min(dueDay, daysInNextMonth)
  return localDateISO(new Date(nextYear, normalizedMonth, clampedDay))
}

// ── Module-level singleton state ──────────────────────────────────────────────

let _transactions: Transaction[] = []
let _bills: Bill[] = []
let _budgets: MonthlyBudget[] = []

let _transLoading = false
let _billsLoading = false
let _budgetsLoading = false

let _currentUid: string | null = null
let _unsubTx: Unsubscribe | null = null
let _unsubBills: Unsubscribe | null = null
let _unsubBudgets: Unsubscribe | null = null

// ── Listener sets (one per collection) ───────────────────────────────────────

type TxListener = (items: Transaction[]) => void
type BillListener = (items: Bill[]) => void
type BudgetListener = (items: MonthlyBudget[]) => void
type LoadingListener = (v: boolean) => void

const _txListeners = new Set<TxListener>()
const _billListeners = new Set<BillListener>()
const _budgetListeners = new Set<BudgetListener>()
const _txLoadingListeners = new Set<LoadingListener>()
const _billsLoadingListeners = new Set<LoadingListener>()
const _budgetsLoadingListeners = new Set<LoadingListener>()

function emitTx() { for (const l of _txListeners) l(_transactions) }
function emitBills() { for (const l of _billListeners) l(_bills) }
function emitBudgets() { for (const l of _budgetListeners) l(_budgets) }
function setTxLoading(v: boolean) { _transLoading = v; for (const l of _txLoadingListeners) l(v) }
function setBillsLoading(v: boolean) { _billsLoading = v; for (const l of _billsLoadingListeners) l(v) }
function setBudgetsLoading(v: boolean) { _budgetsLoading = v; for (const l of _budgetsLoadingListeners) l(v) }

// ── Firestore paths ───────────────────────────────────────────────────────────

function txCol(uid: string) { return collection(db, 'users', uid, 'transactions') }
function txDoc(uid: string, id: string) { return doc(db, 'users', uid, 'transactions', id) }

function billsCol(uid: string) { return collection(db, 'users', uid, 'bills') }
function billDoc(uid: string, id: string) { return doc(db, 'users', uid, 'bills', id) }

function budgetsCol(uid: string) { return collection(db, 'users', uid, 'monthlyBudgets') }
function budgetDoc(uid: string, id: string) { return doc(db, 'users', uid, 'monthlyBudgets', id) }

// ── Initialisation ────────────────────────────────────────────────────────────

export function initMoneyStore(uid: string | null): void {
  if (uid === _currentUid) return

  // Tear down existing listeners
  if (_unsubTx) { _unsubTx(); _unsubTx = null }
  if (_unsubBills) { _unsubBills(); _unsubBills = null }
  if (_unsubBudgets) { _unsubBudgets(); _unsubBudgets = null }

  _currentUid = uid
  _transactions = []
  _bills = []
  _budgets = []
  emitTx()
  emitBills()
  emitBudgets()

  if (!uid) {
    setTxLoading(false)
    setBillsLoading(false)
    setBudgetsLoading(false)
    return
  }

  setTxLoading(true)
  setBillsLoading(true)
  setBudgetsLoading(true)

  _unsubTx = onSnapshot(
    txCol(uid),
    (snap) => {
      _transactions = snap.docs.map((d) => d.data() as Transaction)
      emitTx()
      setTxLoading(false)
    },
    () => { setTxLoading(false) },
  )

  _unsubBills = onSnapshot(
    billsCol(uid),
    (snap) => {
      _bills = snap.docs.map((d) => d.data() as Bill)
      emitBills()
      setBillsLoading(false)
    },
    () => { setBillsLoading(false) },
  )

  _unsubBudgets = onSnapshot(
    budgetsCol(uid),
    (snap) => {
      _budgets = snap.docs.map((d) => d.data() as MonthlyBudget)
      emitBudgets()
      setBudgetsLoading(false)
    },
    () => { setBudgetsLoading(false) },
  )
}

// ── Transactions CRUD ─────────────────────────────────────────────────────────

export async function addTransaction(tx: Transaction): Promise<void> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: money store has no authenticated user')
  await setDoc(txDoc(_currentUid, tx.id), sanitizeForFirestore(tx))
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  if (!_currentUid) return
  const existing = _transactions.find((t) => t.id === id)
  if (!existing) return
  const updated: Transaction = { ...existing, ...patch, updatedAt: nowMs() }
  await setDoc(txDoc(_currentUid, id), sanitizeForFirestore(updated))
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(txDoc(_currentUid, id))
}

// ── Bills CRUD ────────────────────────────────────────────────────────────────

export async function addBill(bill: Bill): Promise<void> {
  if (!_currentUid) return
  const calId = `bill-cal-${bill.id}`
  const billWithCal: Bill = { ...bill, calendarEventId: calId }
  await setDoc(billDoc(_currentUid, bill.id), sanitizeForFirestore(billWithCal))
  try { await addCalendarEvent(billToCalEvent(billWithCal)) } catch {}
}

export async function updateBill(id: string, patch: Partial<Bill>): Promise<void> {
  if (!_currentUid) return
  const existing = _bills.find((b) => b.id === id)
  if (!existing) return
  const updated: Bill = { ...existing, ...patch, updatedAt: nowMs() }
  await setDoc(billDoc(_currentUid, id), sanitizeForFirestore(updated))
  // Sync calendar event when title, amount, or due date change
  if (
    updated.calendarEventId &&
    (patch.nextDueDate !== undefined || patch.title !== undefined || patch.amount !== undefined)
  ) {
    try {
      const existing = getAllEvents().find(e => e.id === updated.calendarEventId)
      if (existing) {
        await updateCalendarEvent({ ...existing, ...billToCalEvent(updated), id: updated.calendarEventId })
      }
    } catch {}
  }
}

export async function deleteBill(id: string): Promise<void> {
  if (!_currentUid) return
  const bill = _bills.find((b) => b.id === id)
  await deleteDoc(billDoc(_currentUid, id))
  if (bill?.calendarEventId) {
    try { await deleteCalendarEvent(bill.calendarEventId) } catch {}
  }
}

/**
 * Mark a bill as paid:
 * 1. Creates a transaction record (expense, linked to this bill).
 * 2. Updates bill status to 'paid'.
 * 3. If recurring, advances nextDueDate to the next cycle and resets status to 'upcoming'.
 * Returns the created transaction id so the caller can run auto-linking in Phase 3.
 */
export async function markBillPaid(
  billId: string,
  paidDate: string = todayISO(),
): Promise<string | null> {
  if (!_currentUid) return null
  const bill = _bills.find((b) => b.id === billId)
  if (!bill) return null

  const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const tx: Transaction = {
    id: txId,
    type: 'expense',
    amount: bill.amount,
    currency: bill.currency,
    title: bill.title,
    category: 'utilities', // sensible default; caller can override by updating after
    date: paidDate,
    linkedBillId: billId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  }
  await addTransaction(tx)

  if (bill.isRecurring && bill.recurringInterval) {
    const next = advanceDueDate(bill.nextDueDate, bill.recurringInterval)
    const updatedBill: Bill = {
      ...bill,
      status: 'upcoming' as BillStatus,
      nextDueDate: next,
      updatedAt: nowMs(),
    }
    await setDoc(billDoc(_currentUid, billId), sanitizeForFirestore(updatedBill))
    // Advance the calendar event to the new due date
    if (updatedBill.calendarEventId) {
      try {
        const existing = getAllEvents().find(e => e.id === updatedBill.calendarEventId)
        if (existing) {
          await updateCalendarEvent({ ...existing, ...billToCalEvent(updatedBill), id: updatedBill.calendarEventId })
        }
      } catch {}
    }
  } else {
    // Non-recurring: mark calendar event as paid (keep for history, change color to gray)
    if (bill.calendarEventId) {
      try {
        const existing = getAllEvents().find(e => e.id === bill.calendarEventId)
        if (existing) {
          await updateCalendarEvent({ ...existing, title: `✓ ${bill.title}`, color: '#94A3B8' })
        }
      } catch {}
    }
    await updateBill(billId, { status: 'paid' })
  }

  return txId
}

/** Advance a YYYY-MM-DD date by one recurring interval. */
function advanceDueDate(date: string, interval: Bill['recurringInterval']): string {
  // parseLocalDate prevents new Date("YYYY-MM-DD") from being treated as UTC midnight
  const d = parseLocalDate(date)
  if (interval === 'monthly') {
    d.setMonth(d.getMonth() + 1)
  } else if (interval === 'quarterly') {
    d.setMonth(d.getMonth() + 3)
  } else if (interval === 'yearly') {
    d.setFullYear(d.getFullYear() + 1)
  }
  return localDateISO(d)
}

// ── Monthly Budgets CRUD ──────────────────────────────────────────────────────

export async function addMonthlyBudget(budget: MonthlyBudget): Promise<void> {
  if (!_currentUid) return
  await setDoc(budgetDoc(_currentUid, budget.id), sanitizeForFirestore(budget))
}

export async function updateMonthlyBudget(
  id: string,
  patch: Partial<MonthlyBudget>,
): Promise<void> {
  if (!_currentUid) return
  const existing = _budgets.find((b) => b.id === id)
  if (!existing) return
  const updated: MonthlyBudget = { ...existing, ...patch, updatedAt: nowMs() }
  await setDoc(budgetDoc(_currentUid, id), sanitizeForFirestore(updated))
}

export async function deleteMonthlyBudget(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(budgetDoc(_currentUid, id))
}

// ── Computed summary ──────────────────────────────────────────────────────────

/**
 * Compute a live summary for a given month (YYYY-MM) from real transaction data.
 * Never stored in Firestore — derived on demand.
 */
export function getMonthSummary(month: string): MonthSummary {
  const monthTx = _transactions.filter((t) => t.date.startsWith(month))

  const totalIncome = monthTx
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0)

  const totalExpenses = monthTx
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)

  const totalSavings = monthTx
    .filter((t) => t.type === 'savings')
    .reduce((s, t) => s + t.amount, 0)

  const upcomingBillsTotal = _bills
    .filter((b) => b.status === 'upcoming' && b.nextDueDate.startsWith(month))
    .reduce((s, b) => s + b.amount, 0)

  const monthlyNetCashFlow = totalIncome - totalExpenses

  // Current account balance: newest posted transaction that has a bank balance field.
  // Pending rows are never written by the import loop, but we guard defensively.
  // Posted expenses and savings already reduce the balance — must NOT subtract again.
  const currentAccountBalance = deriveCurrentAccountBalance(_transactions)

  // Planned savings not yet transferred:
  //   monthlyBudget.plannedSavings − alreadyPostedSavingsThisMonth
  // Only the REMAINING portion (not yet deducted from the bank account) is reserved.
  // If all planned savings have already been transferred, this is 0.
  const budget = _budgets.find((b) => b.id === month)
  const monthlyPlannedSavings = budget?.plannedSavings ?? 0
  const plannedSavingsNotYetTransferred = Math.max(0, monthlyPlannedSavings - totalSavings)

  const availableMoney =
    currentAccountBalance !== null
      ? currentAccountBalance - upcomingBillsTotal - plannedSavingsNotYetTransferred
      : null

  return {
    month,
    totalIncome,
    totalExpenses,
    totalSavings,
    upcomingBillsTotal,
    monthlyNetCashFlow,
    currentAccountBalance,
    availableMoney,
  }
}

/**
 * Derive the current account balance from the newest posted transaction
 * that has a bank-statement balance value.
 * Returns null when no such transaction exists (balance column not imported).
 * Pure function — exported for testing.
 */
export function deriveCurrentAccountBalance(
  transactions: Array<{ date: string; balance?: number | null; pending?: boolean; createdAt?: number }>,
): number | null {
  const posted = transactions.filter(
    (t) => !t.pending && t.balance != null && typeof t.balance === 'number',
  )
  if (posted.length === 0) return null
  const sorted = [...posted].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
  return sorted[0].balance as number
}

// ── Sync getters ──────────────────────────────────────────────────────────────

export function getAllTransactions(): Transaction[] { return _transactions }
export function getAllBills(): Bill[] { return _bills }
export function getAllMonthlyBudgets(): MonthlyBudget[] { return _budgets }

export function getMonthlyBudget(month: string): MonthlyBudget | undefined {
  return _budgets.find((b) => b.id === month)
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useTransactions(): Transaction[] {
  const [state, setState] = useState<Transaction[]>(_transactions)
  useEffect(() => {
    setState(_transactions)
    const l: TxListener = (items) => setState(items)
    _txListeners.add(l)
    return () => { _txListeners.delete(l) }
  }, [])
  return state
}

export function useTransactionsLoading(): boolean {
  const [state, setState] = useState<boolean>(_transLoading)
  useEffect(() => {
    setState(_transLoading)
    const l: LoadingListener = (v) => setState(v)
    _txLoadingListeners.add(l)
    return () => { _txLoadingListeners.delete(l) }
  }, [])
  return state
}

export function useBills(): Bill[] {
  const [state, setState] = useState<Bill[]>(_bills)
  useEffect(() => {
    setState(_bills)
    const l: BillListener = (items) => setState(items)
    _billListeners.add(l)
    return () => { _billListeners.delete(l) }
  }, [])
  return state
}

export function useBillsLoading(): boolean {
  const [state, setState] = useState<boolean>(_billsLoading)
  useEffect(() => {
    setState(_billsLoading)
    const l: LoadingListener = (v) => setState(v)
    _billsLoadingListeners.add(l)
    return () => { _billsLoadingListeners.delete(l) }
  }, [])
  return state
}

export function useMonthlyBudgets(): MonthlyBudget[] {
  const [state, setState] = useState<MonthlyBudget[]>(_budgets)
  useEffect(() => {
    setState(_budgets)
    const l: BudgetListener = (items) => setState(items)
    _budgetListeners.add(l)
    return () => { _budgetListeners.delete(l) }
  }, [])
  return state
}

export function useMonthlyBudgetsLoading(): boolean {
  const [state, setState] = useState<boolean>(_budgetsLoading)
  useEffect(() => {
    setState(_budgetsLoading)
    const l: LoadingListener = (v) => setState(v)
    _budgetsLoadingListeners.add(l)
    return () => { _budgetsLoadingListeners.delete(l) }
  }, [])
  return state
}

/**
 * Reactive hook that returns the budget for a specific month,
 * or undefined if none has been set yet.
 */
export function useMonthlyBudget(month: string): MonthlyBudget | undefined {
  const budgets = useMonthlyBudgets()
  return budgets.find((b) => b.id === month)
}

/**
 * Reactive hook for a computed month summary.
 * Re-evaluates whenever the transactions or bills store changes.
 */
export function useMonthSummary(month: string): MonthSummary {
  const _tx = useTransactions()
  const _b = useBills()

  const monthTx = _tx.filter((t) => t.date.startsWith(month))
  const totalIncome = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalSavings = monthTx.filter((t) => t.type === 'savings').reduce((s, t) => s + t.amount, 0)
  const upcomingBillsTotal = _b
    .filter((b) => b.status === 'upcoming' && b.nextDueDate.startsWith(month))
    .reduce((s, b) => s + b.amount, 0)

  const monthlyNetCashFlow = totalIncome - totalExpenses
  const currentAccountBalance = deriveCurrentAccountBalance(_tx)
  const budget = _budgets.find((b) => b.id === month)
  const monthlyPlannedSavings = budget?.plannedSavings ?? 0
  const plannedSavingsNotYetTransferred = Math.max(0, monthlyPlannedSavings - totalSavings)
  const availableMoney =
    currentAccountBalance !== null
      ? currentAccountBalance - upcomingBillsTotal - plannedSavingsNotYetTransferred
      : null

  return {
    month,
    totalIncome,
    totalExpenses,
    totalSavings,
    upcomingBillsTotal,
    monthlyNetCashFlow,
    currentAccountBalance,
    availableMoney,
  }
}
