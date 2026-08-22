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
  roundMoney,
  differs,
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

// ── Same-day balance-chain reordering ──────────────────────────────────────────
//
// sortChronologically() orders by DATE correctly, but when several
// transactions share the same date, their relative (same-day) order comes
// straight from whatever order the extraction pipeline produced them in.
// For structural (position-based) extraction that's reliably correct — but
// for the AI/OCR fallback path, the model's row order for a same-day group
// is not always faithfully preserved between extraction attempts (confirmed
// in production: the identical PDF produced different same-day sequencing —
// and therefore different reconciliation results — on separate uploads).
// Because the running-balance chain is sequential, ONE swapped same-day pair
// early in the list makes every later transaction in the chain look wrong
// too, even though only that one pair was actually mis-ordered.
//
// Every transaction with a non-null balance already carries independent,
// printed ground truth for its own position in the sequence: the running
// balance after it. This step uses that evidence — never invented data,
// only the model's own reported balance values — to re-derive the correct
// order within each same-date group, whenever that evidence unambiguously
// supports a specific order. It is a no-op whenever the existing order
// already satisfies the balance chain (the structural path, in practice,
// never changes), so it is safe to run unconditionally on every path.
function solveGroupOrderByBalanceChain<T extends NormalizedTransaction>(
  group: T[],
  startBalance: number,
): T[] | null {
  if (group.some((t) => t.balance === null || t.pending)) return null;

  const remaining = [...group];
  const ordered: T[] = [];
  let previousBalance = startBalance;

  while (remaining.length > 0) {
    const matchIndexes: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const t = remaining[i];
      const expected = roundMoney(
        previousBalance + (t.credit ?? 0) - (t.debit ?? 0),
      );
      if (!differs(expected, t.balance as number)) matchIndexes.push(i);
    }
    // Only commit to a step when exactly one candidate matches — an
    // ambiguous (0 or 2+) match means the evidence doesn't unambiguously
    // support a specific order, so we must not guess.
    if (matchIndexes.length !== 1) return null;

    const [chosenIndex] = matchIndexes;
    const [chosen] = remaining.splice(chosenIndex, 1);
    ordered.push(chosen);
    previousBalance = chosen.balance as number;
  }

  return ordered;
}

/**
 * Re-derives same-day transaction order from each transaction's own printed
 * running balance, whenever that evidence unambiguously supports a specific
 * order. Never reorders across different dates (date order from the
 * chronological sort is trusted as-is), never reorders pending transactions,
 * and never forces an order when the balance evidence is ambiguous or
 * incomplete — in that case the group is left exactly as given, and
 * reconcileStructuralTransactions() will report the mismatch as before.
 */
export function reorderSameDayGroupsByBalanceChain<T extends NormalizedTransaction>(
  transactions: T[],
  openingBalance: number | null,
): T[] {
  const result: T[] = [];
  let previousBalance = openingBalance;
  let i = 0;

  while (i < transactions.length) {
    let j = i + 1;
    while (j < transactions.length && transactions[j].date === transactions[i].date) j++;
    const group = transactions.slice(i, j);

    const canAttempt =
      group.length > 1 &&
      previousBalance !== null &&
      !group.some((t) => t.pending);

    const solved = canAttempt
      ? solveGroupOrderByBalanceChain(group, previousBalance as number)
      : null;

    const finalGroup = solved ?? group;
    result.push(...finalGroup);

    for (const t of finalGroup) {
      if (t.balance !== null) {
        previousBalance = t.balance;
      } else if (previousBalance !== null) {
        previousBalance = roundMoney(
          previousBalance + (t.credit ?? 0) - (t.debit ?? 0),
        );
      }
    }

    i = j;
  }

  return result;
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface PostProcessOptions {
  /**
   * Set when the caller has ALREADY sorted `transactions` chronologically
   * (oldest → newest) — e.g. extractStructuralPdfBuffer.ts, which must sort
   * before running its own internal reconciliation.
   *
   * sortChronologically() works by reversing the input and stable-sorting by
   * date, which correctly recovers oldest-first order (including same-day
   * sub-order) from raw newest-first document order — but is NOT idempotent:
   * applying it a second time to already-sorted input reverses the relative
   * order of same-day transactions again, silently corrupting the sequence
   * the running-balance chain depends on. Passing `alreadyChronological: true`
   * skips the redundant re-sort so already-ordered input is left untouched.
   */
  alreadyChronological?: boolean;
}

export function postProcessBankTransactions<T extends NormalizedTransaction>(
  transactions: T[],
  controls: StructuralReconciliationControls,
  options: PostProcessOptions = {},
): BankPostProcessResult<T> {
  // ── 1. Chronological sort ─────────────────────────────────────────────────
  const dateSorted = options.alreadyChronological
    ? transactions
    : sortChronologically(transactions);

  // ── 1b. Same-day balance-chain reordering ─────────────────────────────────
  // Re-derives same-day sub-order from each row's own printed running
  // balance when the evidence unambiguously supports it; a no-op when the
  // existing order already satisfies the chain.
  const sorted = reorderSameDayGroupsByBalanceChain(
    dateSorted,
    typeof controls.openingBalance === "number" ? controls.openingBalance : null,
  );

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

  // ── 3. Per-transaction mismatch flagging (informational, non-blocking) ────
  // A running-balance-chain mismatch on a row no longer marks it needsReview
  // or excludes it from the income/expense lists — a row with a valid date,
  // amount, and description is classified directly. The mismatch is still
  // recorded on the row as a visible note (reviewReason, needsReview stays
  // false) and surfaces in the reconciliation summary below, so the user can
  // still see and manually correct it, but it never blocks import on its own.
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
      return { ...tx, reviewReason: newReason } as T;
    }
    return tx;
  });

  // ── 4. Posted totals (exclude only pending; needsReview no longer excludes) ─
  const confirmed = flagged.filter((t) => t.amount > 0 && !t.pending);
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
  // Blocked only when there is nothing to import at all. A balance-chain
  // mismatch or flagged row is shown as a warning (validationStatus below)
  // but never blocks confirming the import — the user decides.
  const importAllowed = confirmed.length > 0;

  const validationErrors = [...reconciliation.errors];
  if (reviewCount > 0) {
    validationErrors.push(`${reviewCount} tehingut vajab ülevaatust`);
  }

  // verified        — at least one independent control check was available and passed
  // unverified      — no control data was present; arithmetically neutral
  // review_required — informational only: reconciliation didn't fully match,
  //                   shown as a warning but does not block importAllowed
  const hasControls =
    controls.openingBalance != null ||
    controls.closingBalance != null ||
    controls.printedIncomeTotal != null ||
    controls.printedExpenseTotal != null ||
    reconciliation.runningBalanceChecks > 0;

  const validationStatus: "verified" | "unverified" | "review_required" =
    !reconciliation.ok || reviewCount > 0
      ? "review_required"
      : hasControls
        ? "verified"
        : "unverified";

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
