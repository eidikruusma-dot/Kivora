import type { RawTransactionRow } from "./classifyTransactionRows";

export interface StructuralReconciliationControls {
  openingBalance?: number | null;
  closingBalance?: number | null;
  printedIncomeTotal?: number | null;
  printedExpenseTotal?: number | null;
}

export interface StructuralReconciliationResult {
  ok: boolean;
  calculatedIncomeTotal: number;
  calculatedExpenseTotal: number;
  calculatedClosingBalance: number | null;
  runningBalanceChecks: number;
  runningBalanceFailures: number;
  errors: string[];
  /** Transactions where the running-balance chain produced a mismatch.
   *  Each entry identifies the row by its original page/row coordinates so
   *  callers can flag those BankTransaction objects for review. */
  mismatchedRows: Array<{ pageNumber: number; rowIndex: number }>;
}

/** Maximum absolute difference (in currency units) that is still considered
 *  a match.  Amounts that differ by more than this are flagged as errors.
 *  0.01 EUR covers rounding differences in bank statement arithmetic. */
const TOLERANCE = 0.01;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function differs(a: number, b: number): boolean {
  // Round the absolute difference to the cent before comparing so that
  // floating-point noise (e.g. 100.01 − 100 = 0.01000…0051 in IEEE 754)
  // does not cause a 0.01 difference to be treated as > 0.01.
  return roundMoney(Math.abs(a - b)) > TOLERANCE;
}

export function reconcileStructuralTransactions(
  transactions: RawTransactionRow[],
  controls: StructuralReconciliationControls = {},
): StructuralReconciliationResult {
  // ── Posted vs pending ─────────────────────────────────────────────────────
  // Pending/reserved rows must not participate in posted income/expense totals
  // or the running-balance chain.  They are classified separately by the
  // extraction pipeline (RawTransactionRow.pending === true).
  const posted = transactions.filter((tx) => !tx.pending);

  // ── Totals ────────────────────────────────────────────────────────────────
  const calculatedIncomeTotal = roundMoney(
    posted.reduce((sum, tx) => sum + (tx.credit ?? 0), 0),
  );

  const calculatedExpenseTotal = roundMoney(
    posted.reduce((sum, tx) => sum + (tx.debit ?? 0), 0),
  );

  // ── Level 3 (weakest): Printed income/expense totals ─────────────────────
  // Mismatches here are demoted to informational when the running-balance
  // chain and opening/closing balance both verify successfully — a printed
  // label could have been misidentified without invalidating the chain.
  const printedTotalErrors: string[] = [];

  if (
    typeof controls.printedIncomeTotal === "number" &&
    differs(calculatedIncomeTotal, controls.printedIncomeTotal)
  ) {
    printedTotalErrors.push(
      `Income total mismatch: calculated ${calculatedIncomeTotal.toFixed(
        2,
      )}, printed ${controls.printedIncomeTotal.toFixed(2)}`,
    );
  }

  if (
    typeof controls.printedExpenseTotal === "number" &&
    differs(calculatedExpenseTotal, controls.printedExpenseTotal)
  ) {
    printedTotalErrors.push(
      `Expense total mismatch: calculated ${calculatedExpenseTotal.toFixed(
        2,
      )}, printed ${controls.printedExpenseTotal.toFixed(2)}`,
    );
  }

  // ── Level 2: Opening → closing balance ────────────────────────────────────
  let calculatedClosingBalance: number | null = null;
  const openingClosingErrors: string[] = [];

  if (typeof controls.openingBalance === "number") {
    calculatedClosingBalance = roundMoney(
      controls.openingBalance +
        calculatedIncomeTotal -
        calculatedExpenseTotal,
    );

    if (
      typeof controls.closingBalance === "number" &&
      differs(calculatedClosingBalance, controls.closingBalance)
    ) {
      openingClosingErrors.push(
        `Closing balance mismatch: calculated ${calculatedClosingBalance.toFixed(
          2,
        )}, printed ${controls.closingBalance.toFixed(2)}`,
      );
    }
  }

  // ── Level 1 (strongest): Per-row running-balance chain ───────────────────
  // Transactions must be supplied in chronological order (oldest → newest)
  // before calling this function; sortTransactionsChronologically() in
  // extractStructuralPdfBuffer.ts handles that before reconciliation.
  let runningBalanceChecks = 0;
  let runningBalanceFailures = 0;
  const mismatchedRows: Array<{ pageNumber: number; rowIndex: number }> = [];
  const runningBalanceErrors: string[] = [];

  let previousBalance: number | null =
    typeof controls.openingBalance === "number"
      ? controls.openingBalance
      : null;

  for (const tx of posted) {
    if (tx.balance === null) {
      if (previousBalance !== null) {
        previousBalance = roundMoney(
          previousBalance + (tx.credit ?? 0) - (tx.debit ?? 0),
        );
      }

      continue;
    }

    if (previousBalance !== null) {
      const expectedBalance = roundMoney(
        previousBalance + (tx.credit ?? 0) - (tx.debit ?? 0),
      );

      runningBalanceChecks++;

      if (differs(expectedBalance, tx.balance)) {
        runningBalanceFailures++;
        mismatchedRows.push({
          pageNumber: tx.pageNumber,
          rowIndex: tx.rowIndex,
        });
        runningBalanceErrors.push(
          `Running balance mismatch on page ${tx.pageNumber}, row ${tx.rowIndex}`,
        );
      }
    }

    previousBalance = tx.balance;
  }

  // Final running balance compared against closing (avoid duplicating the
  // opening-based closing-balance error computed above).
  if (
    typeof controls.closingBalance === "number" &&
    previousBalance !== null &&
    differs(previousBalance, controls.closingBalance)
  ) {
    const alreadyHasClosingError = openingClosingErrors.some((e) =>
      e.startsWith("Closing balance mismatch:"),
    );

    if (!alreadyHasClosingError) {
      openingClosingErrors.push(
        "Final running balance does not match closing balance.",
      );
    }
  }

  // ── Apply control-priority hierarchy ──────────────────────────────────────
  // When the running-balance chain is fully intact (every row with a printed
  // balance agrees with the arithmetic) AND the opening/closing balance check
  // passes, the statement is internally self-consistent.  In that situation a
  // printed income/expense total that was misidentified (e.g. a subtotal
  // mis-labelled as "income total") must not block an otherwise clean import.
  const chainFullyValid =
    runningBalanceChecks > 0 && runningBalanceFailures === 0;
  const hasOpeningClosingError = openingClosingErrors.length > 0;

  const errors: string[] =
    chainFullyValid && !hasOpeningClosingError
      ? [...openingClosingErrors, ...runningBalanceErrors]
      : [...printedTotalErrors, ...openingClosingErrors, ...runningBalanceErrors];

  return {
    ok: errors.length === 0,
    calculatedIncomeTotal,
    calculatedExpenseTotal,
    calculatedClosingBalance,
    runningBalanceChecks,
    runningBalanceFailures,
    errors,
    mismatchedRows,
  };
}
