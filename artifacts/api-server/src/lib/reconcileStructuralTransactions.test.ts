import {
  reconcileStructuralTransactions,
  type StructuralReconciliationControls,
} from "./reconcileStructuralTransactions";
import type { RawTransactionRow } from "./classifyTransactionRows";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function tx(
  pageNumber: number,
  rowIndex: number,
  debit: number | null,
  credit: number | null,
  balance: number | null,
  opts: { date?: string; pending?: boolean } = {},
): RawTransactionRow {
  return {
    date: opts.date ?? "01.08.2026",
    description: "Synthetic transaction",
    debit,
    credit,
    balance,
    pageNumber,
    rowIndex,
    ...(opts.pending && { pending: true }),
  };
}

function runTests(): void {
  let passed = 0;

  // ── Original 10 tests ────────────────────────────────────────────────────

  // 1. Matching totals and balances => ok
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 25, null, 475),
      tx(1, 2, null, 100, 575),
    ];

    const controls: StructuralReconciliationControls = {
      openingBalance: 500,
      closingBalance: 575,
      printedIncomeTotal: 100,
      printedExpenseTotal: 25,
    };

    const result = reconcileStructuralTransactions(transactions, controls);

    assert(result.ok === true, "Matching reconciliation should pass");
    assert(result.calculatedIncomeTotal === 100, "Income total incorrect");
    assert(result.calculatedExpenseTotal === 25, "Expense total incorrect");
    assert(
      result.calculatedClosingBalance === 575,
      "Closing balance incorrect",
    );
    assert(
      result.runningBalanceChecks === 2,
      "Expected 2 running balance checks",
    );
    assert(
      result.runningBalanceFailures === 0,
      "No running balance failures expected",
    );
    assert(result.errors.length === 0, "No reconciliation errors expected");
    assert(
      result.mismatchedRows.length === 0,
      "No mismatched rows expected",
    );

    passed++;
  }

  // 2. Printed income mismatch => fail
  {
    const transactions: RawTransactionRow[] = [tx(1, 1, null, 100, null)];

    const result = reconcileStructuralTransactions(transactions, {
      printedIncomeTotal: 90,
    });

    assert(result.ok === false, "Income mismatch must fail");
    assert(
      result.errors.some((error) => error.startsWith("Income total mismatch:")),
      "Income mismatch error missing",
    );

    passed++;
  }

  // 3. Printed expense mismatch => fail
  {
    const transactions: RawTransactionRow[] = [tx(1, 1, 40, null, null)];

    const result = reconcileStructuralTransactions(transactions, {
      printedExpenseTotal: 35,
    });

    assert(result.ok === false, "Expense mismatch must fail");
    assert(
      result.errors.some((error) =>
        error.startsWith("Expense total mismatch:"),
      ),
      "Expense mismatch error missing",
    );

    passed++;
  }

  // 4. Opening/closing balance mismatch => fail
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 20, null, null),
      tx(1, 2, null, 50, null),
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 100,
      closingBalance: 999,
    });

    assert(result.ok === false, "Closing mismatch must fail");
    assert(
      result.calculatedClosingBalance === 130,
      "Calculated closing balance incorrect",
    );

    passed++;
  }

  // 5. Running balance mismatch => fail
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 20, null, 80),
      tx(1, 2, null, 50, 999),
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 100,
    });

    assert(result.ok === false, "Running balance mismatch must fail");
    assert(result.runningBalanceChecks === 2, "Two running checks expected");
    assert(result.runningBalanceFailures === 1, "One running failure expected");
    assert(
      result.errors.some((error) =>
        error.startsWith("Running balance mismatch"),
      ),
      "Running balance error missing",
    );

    passed++;
  }

  // 6. Missing running balances still allows total reconciliation
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 20, null, null),
      tx(1, 2, null, 50, null),
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 100,
      closingBalance: 130,
      printedIncomeTotal: 50,
      printedExpenseTotal: 20,
    });

    assert(result.ok === true, "Totals should reconcile without row balances");
    assert(result.runningBalanceChecks === 0, "No row balance checks expected");

    passed++;
  }

  // 7. One-cent tolerance boundary passes (TOLERANCE = 0.01)
  {
    const transactions: RawTransactionRow[] = [tx(1, 1, null, 100, null)];

    const result = reconcileStructuralTransactions(transactions, {
      printedIncomeTotal: 100.01,
    });

    assert(result.ok === true, "Exactly 0.01 difference should pass");

    passed++;
  }

  // 8. Difference above one-cent tolerance fails
  {
    const transactions: RawTransactionRow[] = [tx(1, 1, null, 100, null)];

    const result = reconcileStructuralTransactions(transactions, {
      printedIncomeTotal: 100.02,
    });

    assert(result.ok === false, "Difference of 0.02 must fail with 0.01 tolerance");

    passed++;
  }

  // 9. Empty transaction list with no controls is neutral
  {
    const result = reconcileStructuralTransactions([]);

    assert(result.ok === true, "Empty list with no controls should be neutral");
    assert(result.calculatedIncomeTotal === 0, "Income should be zero");
    assert(result.calculatedExpenseTotal === 0, "Expense should be zero");
    assert(result.calculatedClosingBalance === null, "Closing should be null");
    assert(result.mismatchedRows.length === 0, "No mismatched rows expected");

    passed++;
  }

  // 10. Determinism
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 10, null, 90),
      tx(1, 2, null, 30, 120),
    ];

    const controls: StructuralReconciliationControls = {
      openingBalance: 100,
      closingBalance: 120,
      printedIncomeTotal: 30,
      printedExpenseTotal: 10,
    };

    const a = reconcileStructuralTransactions(transactions, controls);
    const b = reconcileStructuralTransactions(transactions, controls);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same inputs must produce identical reconciliation result",
    );

    passed++;
  }

  // ── Regression tests (Task 7) ────────────────────────────────────────────

  // 11. Pending rows are excluded from posted income/expense totals
  {
    // A posted transaction for 50 and a pending card reservation for 200.
    // Only the posted one should appear in totals — the pending one must not
    // inflate the income figure or cause a printed-total mismatch.
    const transactions: RawTransactionRow[] = [
      tx(1, 1, null, 50, null),                        // posted income
      tx(1, 2, null, 200, null, { pending: true }),     // pending — excluded
    ];

    const result = reconcileStructuralTransactions(transactions, {
      printedIncomeTotal: 50,   // matches posted-only total
    });

    assert(
      result.ok === true,
      "Pending rows must not contribute to posted income total",
    );
    assert(
      result.calculatedIncomeTotal === 50,
      "Calculated income must reflect posted rows only",
    );

    passed++;
  }

  // 12. Running-balance chain fully valid → printed total mismatch suppressed
  //
  // When the per-row running-balance chain validates completely, and the
  // opening/closing balance also checks out, a misidentified printed total
  // label must NOT block an otherwise clean import.  The chain is the
  // strongest control; printed totals are weakest.
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 25, null, 475),
      tx(1, 2, null, 100, 575),
    ];

    const controls: StructuralReconciliationControls = {
      openingBalance: 500,
      closingBalance: 575,
      // Printed income is slightly off — simulates a misidentified label.
      // The chain is clean, so this must NOT block import.
      printedIncomeTotal: 95,    // diff = 5 >> 0.01 tolerance
      printedExpenseTotal: 25,   // correct
    };

    const result = reconcileStructuralTransactions(transactions, controls);

    assert(
      result.runningBalanceChecks === 2,
      "Expected 2 running-balance checks",
    );
    assert(
      result.runningBalanceFailures === 0,
      "Running-balance chain must pass",
    );
    assert(
      result.ok === true,
      "Fully valid chain must not be blocked by a printed-total mismatch",
    );
    assert(
      result.errors.length === 0,
      "No errors expected when chain takes priority over printed totals",
    );

    passed++;
  }

  // 13. mismatchedRows identifies the specific failing transaction
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 20, null, 80),    // 100 - 20 = 80 ✓
      tx(1, 2, null, 50, 999),   // 80 + 50 = 130, printed 999 ✗
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 100,
    });

    assert(
      result.ok === false,
      "Running balance mismatch must fail reconciliation",
    );
    assert(
      result.mismatchedRows.length === 1,
      "Exactly one mismatched row expected",
    );
    assert(
      result.mismatchedRows[0].pageNumber === 1,
      "Mismatched row page number incorrect",
    );
    assert(
      result.mismatchedRows[0].rowIndex === 2,
      "Mismatched row index incorrect",
    );

    passed++;
  }

  // 14. Same-day transactions in chronological (oldest-first) order → validates
  //
  // Three transactions on the same date processed oldest → newest.  The
  // running-balance chain must hold for all three.
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 10, null, 490, { date: "01.08.2026" }),  // 500 - 10 = 490 ✓
      tx(1, 2, null, 30, 520, { date: "01.08.2026" }),  // 490 + 30 = 520 ✓
      tx(1, 3, 20, null, 500, { date: "01.08.2026" }),  // 520 - 20 = 500 ✓
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 500,
      closingBalance: 500,
    });

    assert(
      result.ok === true,
      "Same-day transactions in chronological order must validate",
    );
    assert(
      result.runningBalanceChecks === 3,
      "All three row balances must be checked",
    );
    assert(
      result.runningBalanceFailures === 0,
      "No running-balance failures expected",
    );

    passed++;
  }

  // 15. Same-day transactions in newest-first order → running-balance fails
  //
  // This demonstrates WHY sortTransactionsChronologically() must run before
  // reconciliation.  The same three transactions as test 14, but supplied in
  // the PDF's visual (newest-first) display order, produce chain mismatches.
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 3, 20, null, 500, { date: "01.08.2026" }),  // newest (visual row 3)
      tx(1, 2, null, 30, 520, { date: "01.08.2026" }),  // middle
      tx(1, 1, 10, null, 490, { date: "01.08.2026" }),  // oldest (visual row 1)
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 500,
    });

    assert(
      result.ok === false,
      "Newest-first same-day order must produce chain mismatches",
    );
    assert(
      result.runningBalanceFailures > 0,
      "At least one running-balance failure expected for out-of-order input",
    );

    passed++;
  }

  // 16. Pending transactions are excluded from the running-balance chain
  //
  // A pending row with a balance field must not participate in the chain.
  // If it did, the arithmetic would break; since it is excluded the chain
  // remains intact.
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 25, null, 475),                         // posted: 500 - 25 = 475 ✓
      tx(1, 2, null, 999, 9999, { pending: true }),     // pending: must be skipped
      tx(1, 3, null, 100, 575),                         // posted: 475 + 100 = 575 ✓
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 500,
      closingBalance: 575,
    });

    assert(
      result.ok === true,
      "Pending row must not corrupt the posted running-balance chain",
    );
    assert(
      result.runningBalanceChecks === 2,
      "Only two posted rows with balances should be checked",
    );

    passed++;
  }

  // 17. Only opening balance (no closing, no printed totals) + clean chain → ok
  //     Verifies that partial controls do not create false failures or block a
  //     statement where the chain itself validates.
  {
    const transactions: RawTransactionRow[] = [
      tx(1, 1, 15, null, 485),  // 500 - 15 = 485 ✓
      tx(1, 2, null, 45, 530),  // 485 + 45 = 530 ✓
    ];

    const result = reconcileStructuralTransactions(transactions, {
      openingBalance: 500,
      // No closingBalance, no printedIncomeTotal, no printedExpenseTotal
    });

    assert(
      result.ok === true,
      "Clean chain with only opening balance should reconcile successfully",
    );
    assert(
      result.runningBalanceChecks === 2,
      "Both row balances should be checked",
    );
    assert(
      result.runningBalanceFailures === 0,
      "No failures expected",
    );
    assert(
      result.calculatedClosingBalance === 530,
      "Calculated closing should be opening + income - expense",
    );

    passed++;
  }

  console.log(`reconcileStructuralTransactions: ${passed} passed, 0 failed`);
}

runTests();
