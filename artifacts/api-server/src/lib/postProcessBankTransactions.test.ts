/**
 * postProcessBankTransactions — unit tests
 *
 * These tests cover the shared post-processing pipeline used by BOTH the
 * structural extraction path (Track A) and the AI fallback path (Track B).
 *
 * The key regression scenario: structural extraction returns 0 transactions
 * (Track A fails or finds no independent controls) and the AI fallback
 * produces transactions in newest-first order (the order the model reads the
 * PDF).  postProcessBankTransactions must sort them oldest-first and validate
 * the running-balance chain in the correct accounting order.
 */

import {
  postProcessBankTransactions,
  type NormalizedTransaction,
} from "./postProcessBankTransactions";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function tx(
  page: number,
  rowIndex: number,
  date: string,
  debit: number | null,
  credit: number | null,
  balance: number | null,
  opts: { pending?: boolean; needsReview?: boolean; reviewReason?: string } = {},
): NormalizedTransaction {
  const amount = credit ?? debit ?? 0;
  return {
    page,
    rowIndex,
    date,
    debit,
    credit,
    balance,
    amount,
    direction: credit !== null ? "income" : "expense",
    currency: "EUR",
    ...opts,
  };
}

function run(): void {
  let passed = 0;

  // ── 1. Regression: AI fallback newest-first → sorted oldest-first ─────────
  //
  // Simulates the critical production scenario:
  //   - Track A structural extraction returned 0 transactions.
  //   - Track B AI fallback parsed a real bank statement and returned
  //     transactions in the PDF's newest-first visual order.
  //   - postProcessBankTransactions must reverse this, sort by date, and
  //     validate the running-balance chain in chronological (oldest→newest)
  //     order so the reconciliation passes.
  //
  // Running balance (chronological):
  //   Opening    500.00
  //   01.08 −25  → 475.00  ✓
  //   02.08 +100 → 575.00  ✓
  {
    // AI fallback returns newest-first — 02.08 (newer) appears first.
    const aiNewestFirst: NormalizedTransaction[] = [
      tx(0, 1, "2026-08-02", null, 100, 575),  // newer date — position 0 in AI output
      tx(0, 0, "2026-08-01", 25,   null, 475), // older date — position 1 in AI output
    ];

    const result = postProcessBankTransactions(aiNewestFirst, {
      openingBalance: 500,
      closingBalance: 575,
    });

    assert(
      result.transactions[0].date === "2026-08-01",
      `First transaction after sort must be the older date; got "${result.transactions[0].date}"`,
    );
    assert(
      result.transactions[1].date === "2026-08-02",
      `Second transaction after sort must be the newer date; got "${result.transactions[1].date}"`,
    );
    assert(
      result.reconciliation.ok === true,
      "Running-balance chain must validate when processed oldest-first",
    );
    assert(
      result.importAllowed === true,
      "Import must be allowed when chain validates",
    );
    assert(
      result.validationStatus === "verified",
      "Status must be verified when opening/closing balance controls pass",
    );
    assert(
      result.reconciliation.runningBalanceChecks === 2,
      "Both balance rows must be checked",
    );
    assert(
      result.reconciliation.runningBalanceFailures === 0,
      "No failures expected for correctly sorted chain",
    );

    passed++;
  }

  // ── 2. Same-day newest-first order sorted to oldest-first ─────────────────
  //
  // Three transactions on the same date in newest-first order.
  // After postProcess they must be in oldest-first order and the chain passes.
  {
    // Visual order: newest (balance=500) → middle (balance=490) → oldest (balance=470)
    // Chronological: oldest (470) → middle (490) → newest (500)
    const newestFirst: NormalizedTransaction[] = [
      tx(1, 3, "2026-08-01", 20, null,  500), // newest of the day (balance 500)
      tx(1, 2, "2026-08-01", null, 30,  520), // middle            (balance 520)
      tx(1, 1, "2026-08-01", 10, null,  490), // oldest of the day (balance 490)
    ];

    const result = postProcessBankTransactions(newestFirst, {
      openingBalance: 500,
    });

    // After reversal + date sort (same date, stable), order should be:
    // row 1 (oldest) → row 2 (middle) → row 3 (newest)
    assert(
      result.transactions[0].balance === 490,
      `First transaction must be the oldest (balance 490); got ${result.transactions[0].balance}`,
    );
    assert(
      result.transactions[2].balance === 500,
      `Last transaction must be the newest (balance 500); got ${result.transactions[2].balance}`,
    );
    assert(
      result.reconciliation.ok === true,
      "Chronological same-day chain must validate",
    );

    passed++;
  }

  // ── 3. Pending transactions excluded from posted totals ───────────────────
  {
    const transactions: NormalizedTransaction[] = [
      tx(0, 0, "2026-08-01", null, 100, null),           // posted income
      tx(0, 1, "2026-08-01", null, 500, null, { pending: true }), // pending — excluded
    ];

    const result = postProcessBankTransactions(transactions, {
      printedIncomeTotal: 100, // matches posted-only total
    });

    assert(
      result.calculatedIncomeTotal === 100,
      "Pending income must not contribute to posted calculated total",
    );
    assert(
      result.reconciliation.ok === true,
      "Reconciliation must pass when posted total matches printed total",
    );
    assert(
      result.importAllowed === true,
      "Import must be allowed",
    );

    passed++;
  }

  // ── 4. Balance mismatch flagged as needsReview on the failing row ─────────
  //
  // Input is in newest-first order (as the AI model returns it).  After the
  // chronological sort, tx(1,1) runs first (100-20=80 ✓) and tx(1,2) runs
  // second (80+50=130 ≠ 999 ✗).  Only the second row must be flagged.
  {
    const transactions: NormalizedTransaction[] = [
      tx(1, 2, "2026-08-01", null, 50, 999), // newest in AI output — wrong balance
      tx(1, 1, "2026-08-01", 20, null, 80),  // oldest in AI output — correct balance
    ];

    const result = postProcessBankTransactions(transactions, {
      openingBalance: 100,
    });

    // After sort: [tx(1,1), tx(1,2)]; tx(1,1) passes, tx(1,2) fails.
    assert(
      result.reconciliation.ok === false,
      "Balance mismatch must fail reconciliation",
    );
    assert(
      result.transactions[1].needsReview === true,
      "Mismatched transaction (tx rowIndex 2, index 1 after sort) must be flagged",
    );
    assert(
      result.transactions[1].reviewReason?.includes("Jooksev saldo"),
      "Review reason must mention balance mismatch",
    );
    assert(
      result.transactions[0].needsReview !== true,
      "First transaction (correct balance) must not be flagged",
    );
    assert(
      result.importAllowed === false,
      "Import must be blocked when chain fails",
    );
    assert(
      result.reconciliation.mismatchedRows.length === 1,
      "Exactly one mismatched row expected",
    );
    assert(
      result.reconciliation.mismatchedRows[0].rowIndex === 2,
      "Mismatch must be on rowIndex 2",
    );

    passed++;
  }

  // ── 5. No controls → unverified (neutral, not blocked) ────────────────────
  {
    const transactions: NormalizedTransaction[] = [
      tx(0, 0, "2026-08-01", null, 50, null),
      tx(0, 1, "2026-08-01", 20, null, null),
    ];

    const result = postProcessBankTransactions(transactions, {});

    assert(
      result.reconciliation.ok === true,
      "No controls → no errors → reconciliation ok",
    );
    assert(
      result.validationStatus === "unverified",
      "No controls must produce 'unverified' status, not 'verified' or 'review_required'",
    );
    assert(
      result.importAllowed === true,
      "Unverified import must be allowed (no evidence of error)",
    );

    passed++;
  }

  // ── 6. Running-balance chain takes priority over printed total mismatch ────
  //
  // The chain validates fully; a printed total mismatch (possibly a
  // misidentified label) must not block the import.
  {
    const transactions: NormalizedTransaction[] = [
      tx(1, 1, "2026-08-01", 25, null, 475),
      tx(1, 2, "2026-08-02", null, 100, 575),
    ];

    const result = postProcessBankTransactions(transactions, {
      openingBalance: 500,
      closingBalance: 575,
      printedIncomeTotal: 50,  // wrong — should be 100 — but chain is clean
    });

    assert(
      result.reconciliation.runningBalanceChecks === 2,
      "Both balances must be checked",
    );
    assert(
      result.reconciliation.runningBalanceFailures === 0,
      "Chain must be clean",
    );
    assert(
      result.reconciliation.ok === true,
      "Clean chain with matching opening/closing must win over printed-total mismatch",
    );
    assert(
      result.importAllowed === true,
      "Clean chain must allow import despite printed total mismatch",
    );

    passed++;
  }

  // ── 7. Existing needsReview reason preserved when balance mismatch added ──
  {
    const badTx: NormalizedTransaction = {
      ...tx(1, 1, "2026-08-01", null, 50, 999),
      needsReview: true,
      reviewReason: "Kehtetu või puuduv tehingusumma",
    };

    const result = postProcessBankTransactions([badTx], { openingBalance: 100 });

    const flaggedTx = result.transactions[0];
    assert(
      flaggedTx.reviewReason?.includes("Kehtetu"),
      "Original review reason must be preserved",
    );
    assert(
      flaggedTx.reviewReason?.includes("Jooksev saldo"),
      "Balance mismatch reason must be appended",
    );

    passed++;
  }

  // ── 8. Determinism ────────────────────────────────────────────────────────
  {
    const transactions: NormalizedTransaction[] = [
      tx(0, 1, "2026-08-02", null, 100, 575),
      tx(0, 0, "2026-08-01", 25,   null, 475),
    ];
    const controls = { openingBalance: 500, closingBalance: 575 };

    const a = postProcessBankTransactions(transactions, controls);
    const b = postProcessBankTransactions(transactions, controls);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same inputs must produce identical results",
    );

    passed++;
  }

  console.log(`postProcessBankTransactions: ${passed} passed, 0 failed`);
}

run();
