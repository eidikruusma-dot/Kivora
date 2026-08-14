/**
 * Bank statement types — shared between AI chat and Money module import.
 * Keep in sync with BankTransaction / BankMeta in
 * api-server/src/routes/aiUpload.ts.
 */

export interface BankTransaction {
  // ── Canonical identity
  id?: string;
  page?: number;
  rowIndex?: number;
  // ── Core fields
  date: string;
  description: string;
  debit?: number | null;
  credit?: number | null;
  balance?: number | null;
  amount: number; // always positive
  currency: string;
  direction: "income" | "expense";
  needsReview?: boolean;
  reviewReason?: string;
  /** True when the transaction was found inside a pending/reservations section.
   *  Must NOT be written to Firestore as a normal posted transaction. */
  pending?: boolean;
}

export interface BankMeta {
  // ── Identity
  statementId?: string;
  bank?: string;
  accountNumber?: string;
  period?: { from: string; to: string };
  // ── Balances
  openingBalance?: number;
  closingBalance?: number;
  // ── Printed summary totals
  summaryIncome?: number;
  summaryExpenses?: number;
  // ── Page coverage
  pagesTotal?: number;
  pagesProcessed?: number;
  // ── Computed totals (canonical — never from LLM)
  incomeCount?: number;
  expenseCount?: number;
  calculatedIncomeTotal?: number;
  calculatedExpenseTotal?: number;
  // ── Validation outcome
  /**
   * Three-state status from the direct-extraction pipeline.
   *   verified        — structurally valid + at least one control check passes
   *   unverified      — structurally valid but no control totals/balances present
   *   review_required — ambiguous rows OR control total mismatch
   */
  validationStatus?: "verified" | "unverified" | "review_required";
  importAllowed?: boolean; // true for verified + unverified; false for review_required
  validationErrors?: string[]; // human-readable blocking reasons
  // ── Legacy fields (kept for backward compat with old pipeline responses)
  reconciliationOk?: boolean;
  reconciliationNote?: string;
  extractionComplete?: boolean;
  // ── Legacy aliases
  totalIncome?: number;
  totalExpenses?: number;
  needsReviewCount?: number;
  firstPassCount?: number;
  secondPassRecovered?: number;
}
