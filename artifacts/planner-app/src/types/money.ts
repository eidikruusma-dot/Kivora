/**
 * money.ts
 *
 * Core types for the Kivora Money ecosystem.
 * These are the only two new data entities. Goals, Tasks and Calendar
 * remain in their own stores — Money reads and writes them, never duplicates them.
 *
 * Firestore paths:
 *   users/{uid}/transactions/{txId}
 *   users/{uid}/bills/{billId}
 *   users/{uid}/monthlyBudgets/{budgetId}
 */

// ── Transaction categories ────────────────────────────────────────────────────

export type TransactionCategory =
  // ── Legacy (kept so existing Firestore records remain valid) ─────────────────
  | 'income'
  | 'utilities'
  | 'clothing'
  | 'other'
  // ── Income ───────────────────────────────────────────────────────────────────
  | 'salary'
  | 'benefits'
  | 'side-income'
  | 'refund'
  | 'gift'
  | 'sale'
  | 'other-income'
  // ── Expense ──────────────────────────────────────────────────────────────────
  | 'food'
  | 'transport'
  | 'housing'
  | 'children-family'
  | 'health'
  | 'education'
  | 'shopping'
  | 'entertainment'
  | 'subscriptions'
  | 'debt'
  | 'insurance-tx'
  | 'pets'
  | 'travel'
  | 'other-expense'
  // ── Special ──────────────────────────────────────────────────────────────────
  | 'savings'

// ── Bill categories ───────────────────────────────────────────────────────────

export type BillCategory =
  // ── Legacy (kept so existing Firestore records remain valid) ─────────────────
  | 'utilities'
  | 'housing'
  | 'insurance'
  | 'subscription'
  | 'transport'
  | 'health'
  | 'education'
  | 'loan'
  | 'other'
  // ── Housing ──────────────────────────────────────────────────────────────────
  | 'electricity'
  | 'water'
  | 'heating'
  | 'rent'
  | 'home-loan'
  | 'waste'
  | 'home-insurance'
  // ── Communication ────────────────────────────────────────────────────────────
  | 'mobile'
  | 'internet'
  | 'tv'
  | 'internet-tv'
  // ── Transport ────────────────────────────────────────────────────────────────
  | 'car-lease'
  | 'car-insurance'
  | 'parking'
  | 'public-transport'
  // ── Subscriptions ────────────────────────────────────────────────────────────
  | 'streaming'
  | 'music-sub'
  | 'cloud-storage'
  | 'software-sub'
  | 'other-sub'
  // ── Family ───────────────────────────────────────────────────────────────────
  | 'kindergarten'
  | 'school-bill'
  | 'hobby'
  | 'childcare'
  // ── Finance ──────────────────────────────────────────────────────────────────
  | 'loan-payment'
  | 'credit-card'
  | 'tax'
  // ── Other ────────────────────────────────────────────────────────────────────
  | 'other-bill'

// ── Bill recurrence ───────────────────────────────────────────────────────────

export type RecurringInterval = 'monthly' | 'quarterly' | 'yearly'

// ── Bill status ───────────────────────────────────────────────────────────────

export type BillStatus = 'upcoming' | 'paid' | 'overdue'

// ── Transaction ───────────────────────────────────────────────────────────────

/**
 * A record that something happened financially.
 * Savings transactions carry a linkedGoalId — they call goalsStore directly,
 * never create a parallel goal tracking system.
 */
export interface Transaction {
  id: string
  type: 'income' | 'expense' | 'savings'
  amount: number
  currency: string       // 'EUR'
  title: string
  category: TransactionCategory
  date: string           // YYYY-MM-DD
  note?: string
  linkedBillId?: string  // set when this transaction pays a bill
  linkedGoalId?: string  // set when this is a savings contribution to a goal
  createdAt: number      // ms since epoch
  updatedAt: number
  /**
   * Running account balance after this transaction, from the bank statement.
   * Only set on transactions that were imported from a CSV/XLSX with a balance column.
   * Never fabricated — null when the source file had no balance column.
   */
  balance?: number | null
  /**
   * True when the transaction came from a pending/reserved section of the bank file.
   * The import loop always guards against writing pending rows, but this field is
   * preserved on the type so balance-derivation logic can filter them out defensively.
   */
  pending?: boolean
}

// ── Bill ──────────────────────────────────────────────────────────────────────

/**
 * A known future obligation.
 * The bill itself stores no calendar or task data — those live in their own
 * stores and are connected via entityLinksStore.
 */
export interface Bill {
  id: string
  title: string
  amount: number
  currency: string           // 'EUR'
  category: BillCategory
  dueDay: number             // day of month this bill recurs (1–31)
  nextDueDate: string        // YYYY-MM-DD — the next payment date
  status: BillStatus
  isRecurring: boolean
  recurringInterval?: RecurringInterval
  note?: string
  calendarEventId?: string   // ID of the linked MockCalendarEvent (one source of truth)
  createdAt: number
  updatedAt: number
}

// ── Monthly budget ────────────────────────────────────────────────────────────

export interface PlannedExpenseCategory {
  category: TransactionCategory
  amount: number
}

/**
 * The user's intentions for a given month.
 * ID is the month string, e.g. "2025-06".
 */
export interface MonthlyBudget {
  id: string                              // YYYY-MM
  month: string                           // YYYY-MM (same as id)
  plannedIncome: number
  plannedExpenses: PlannedExpenseCategory[]
  plannedSavings: number
  createdAt: number
  updatedAt: number
}

// ── Computed month summary ────────────────────────────────────────────────────

/**
 * Derived view of a month computed from real transaction data.
 * Returned by moneyStore.getMonthSummary(month) — never stored in Firestore.
 */
export interface MonthSummary {
  month: string               // YYYY-MM
  totalIncome: number
  totalExpenses: number
  totalSavings: number
  upcomingBillsTotal: number
  /**
   * Net cash flow this month: totalIncome − totalExpenses.
   * This is a cash-flow metric, NOT the user's current bank balance.
   */
  monthlyNetCashFlow: number
  /**
   * The actual running balance from the bank statement — taken from the newest
   * posted (non-pending) transaction that has a balance field set.
   * null when no imported transaction carries a balance column value.
   * Never fabricated from income/expense arithmetic.
   */
  currentAccountBalance: number | null
  /**
   * currentAccountBalance − upcomingBillsTotal − plannedSavingsReserved.
   * null when currentAccountBalance is null (never fabricated).
   * Posted expenses are already reflected in the balance; they are NOT
   * subtracted again here.
   */
  availableMoney: number | null
}
