/**
 * postProcessBankTransactions
 *
 * Canonical post-processing pipeline applied to normalized bank transactions
 * from BOTH extraction paths:
 *
 *   Track A (structural/positional) — RawTransactionRow[] → BankTransaction[]
 *                                      → postProcessBankTransactions()
 *   Track B (AI fallback)           — ModelTransaction[] → BankTransaction[]
 *                                      → postProcessBankTransactions()
 *
 * Steps:
 *   1. Sort chronologically: oldest → newest (handles newest-first statements).
 *   2. Run reconcileStructuralTransactions() — canonical tolerance, priority
 *      hierarchy, pending exclusion, mismatchedRows.
 *   3. Flag mismatched rows on individual transactions (needsReview).
 *   4. Compute posted totals excluding pending and review-flagged rows.
 *   5. Derive validationStatus / importAllowed from the reconciliation result.
 */

import {
  reconcileStructuralTransactions,
  type StructuralReconciliationControls,
  type StructuralReconciliationResult,
} from "./reconcileStructuralTransactions";
import type { RawTransactionRow } from "./classifyTransactionRows";

// ── Minimum shape required for post-processing ───────────────────────────────
// BankTransaction (from aiUpload.ts) satisfies this via structural typing.
// Keep it minimal so both extraction paths can use the same function without
// artificial coupling to the route-layer type.

export interface NormalizedTransaction {
  page: number;
  rowIndex: number;
  date: string; // ISO YYYY-MM-DD preferred; dd.mm.yyyy also accepted
  debit: number | null;
  credit: number | null;
  balance: number | null;
  amount: number; // always positive, derived by caller
  direction: "income" | "expense";
  currency: string;
  needsReview?: boolean;
  reviewReason?: string;
  pending?: boolean;
}

export interface BankPostProcessResult<T extends NormalizedTransaction> {
  /** Sorted (oldest → newest) array with mismatch flags applied. */
  transactions: T[];
  incomeCount: number;
  expenseCount: number;
  calculatedIncomeTotal: number;
  calculatedExpenseTotal: number;
  reviewCount: number;
  importAllowed: boolean;
  validationStatus: "verified" | "unverified" | "review_required";
  /** Human-readable blocking reasons from reconciliation + review rows. */
  validationErrors: string[];
  reconciliationOk: boolean;
  /** Full reconciliation result — available for callers that need details. */
  reconciliation: StructuralReconciliationResult;
}

// ── Chronological sort ───────────────────────────────────────────────────────

function parseDateForSort(dateStr: string): string {
  // Normalise dd.mm.yyyy / dd/mm/yyyy → YYYY-MM-DD for lexicographic comparison.
  const ddmm = dateStr.trim().match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
  return dateStr; // already ISO or unrecognised — leave as-is
}

/**
 * Sort transactions oldest → newest.
 *
 * Real bank statements are presented newest-first.  The AI model returns rows
 * in the order it reads the document — also newest-first.  Reversing before
 * the stable date sort converts the within-day sequence to oldest-first so the
 * running-balance chain validates correctly.
 */
function sortChronologically<T extends NormalizedTransaction>(txs: T[]): T[] {
  const reversed = [...txs].reverse();
  return reversed.sort((a, b) => {
    const da = parseDateForSort(a.date);
    const db = parseDateForSort(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}

// ── Main export ──────────────────────────────────────────────────────────────

export function postProcessBankTransactions<T extends NormalizedTransaction>(
  transactions: T[],
  controls: StructuralReconciliationControls,
): BankPostProcessResult<T> {
  // ── 1. Chronological sort ─────────────────────────────────────────────────
  const sorted = sortChronologically(transactions);

  // ── 2. Canonical reconciliation ───────────────────────────────────────────
  // Adapt to RawTransactionRow shape — reconciliation only uses the numeric
  // amount columns, balance, page/row identity, and pending flag.
  const adaptedForReconcile: RawTransactionRow[] = sorted.map((tx) => ({
    date: tx.date,
    description: "", // not used by reconcileStructuralTransactions
    debit: tx.debit,
    credit: tx.credit,
    balance: tx.balance,
    pageNumber: tx.page,
    rowIndex: tx.rowIndex,
    pending: tx.pending,
  }));

  const reconciliation = reconcileStructuralTransactions(
    adaptedForReconcile,
    controls,
  );

  // ── 3. Per-transaction mismatch flagging ──────────────────────────────────
  const mismatchKeySet = new Set(
    reconciliation.mismatchedRows.map((r) => `${r.pageNumber}:${r.rowIndex}`),
  );

  const BALANCE_MISMATCH_REASON =
    "Jooksev saldo ei klapi: eelmine saldo + tehing ≠ prinditud saldo";

  const flagged = sorted.map((tx): T => {
    const key = `${tx.page}:${tx.rowIndex}`;
    if (mismatchKeySet.has(key)) {
      const existing = tx.reviewReason;
      const newReason = existing
        ? `${existing}; ${BALANCE_MISMATCH_REASON}`
        : BALANCE_MISMATCH_REASON;
      // Safe cast: only overriding optional fields already declared in
      // NormalizedTransaction; all extra fields of T are spread through.
      return { ...tx, needsReview: true, reviewReason: newReason } as T;
    }
    return tx;
  });

  // ── 4. Posted totals (exclude pending + needsReview) ─────────────────────
  const confirmed = flagged.filter(
    (t) => !t.needsReview && t.amount > 0 && !t.pending,
  );
  const incomeRows = confirmed.filter((t) => t.direction === "income");
  const expenseRows = confirmed.filter((t) => t.direction === "expense");
  const incomeCount = incomeRows.length;
  const expenseCount = expenseRows.length;
  const calculatedIncomeTotal =
    Math.round(incomeRows.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const calculatedExpenseTotal =
    Math.round(expenseRows.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const reviewCount = flagged.filter((t) => t.needsReview).length;

  // ── 5. Import decision ────────────────────────────────────────────────────
  const importAllowed = reconciliation.ok && reviewCount === 0;

  const validationErrors = [...reconciliation.errors];
  if (reviewCount > 0) {
    validationErrors.push(
      `${reviewCount} tehingut vajab ülevaatust — import blokeeritud`,
    );
  }

  // verified   — at least one independent control check was available and passed
  // unverified — no control data was present; arithmetically neutral
  const hasControls =
    controls.openingBalance != null ||
    controls.closingBalance != null ||
    controls.printedIncomeTotal != null ||
    controls.printedExpenseTotal != null ||
    reconciliation.runningBalanceChecks > 0;

  const validationStatus: "verified" | "unverified" | "review_required" =
    !importAllowed ? "review_required" : hasControls ? "verified" : "unverified";

  return {
    transactions: flagged,
    incomeCount,
    expenseCount,
    calculatedIncomeTotal,
    calculatedExpenseTotal,
    reviewCount,
    importAllowed,
    validationStatus,
    validationErrors,
    reconciliationOk: reconciliation.ok,
    reconciliation,
  };
}
