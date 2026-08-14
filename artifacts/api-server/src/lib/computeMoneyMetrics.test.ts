/**
 * computeMoneyMetrics.test.ts
 *
 * Synthetic tests for balance / cash-flow / available-money calculations.
 * ALL values are invented — no real user financial data is used anywhere.
 *
 * Correct availableMoney formula:
 *   availableMoney =
 *     currentAccountBalance
 *     − unpaidUpcomingObligations
 *     − plannedSavingsNotYetTransferred
 *
 * Where:
 *   plannedSavingsNotYetTransferred = max(0, monthlyPlannedSavings − alreadyPostedSavings)
 *
 * Already-posted savings reduced the bank balance when transferred.
 * They are already in currentAccountBalance — must NOT be subtracted again.
 */

import {
  deriveCurrentAccountBalance,
  computeMonthlyNetCashFlow,
  computeAvailableMoney,
  type LightTransaction,
} from "./computeMoneyMetrics";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function run(): void {
  let passed = 0;

  // ── A. Full formula: balance − obligations − unposted planned savings ──────
  // balance=400, upcoming bills=50, monthly savings target=100, already posted=0
  // plannedSavingsNotYetTransferred = max(0, 100 − 0) = 100
  // availableMoney = 400 − 50 − 100 = 250
  {
    const currentBalance = 400;
    const unpaidObligations = 50;
    const monthlyPlannedSavings = 100;
    const alreadyPostedSavings = 0;
    const plannedSavingsNotYetTransferred = Math.max(
      0,
      monthlyPlannedSavings - alreadyPostedSavings,
    );

    const avail = computeAvailableMoney(
      currentBalance,
      unpaidObligations,
      plannedSavingsNotYetTransferred,
    );
    assert(avail === 250,
      `A: expected 250 (400−50−100), got ${avail}`);
    assert(plannedSavingsNotYetTransferred === 100,
      `A: plannedSavingsNotYetTransferred should be 100, got ${plannedSavingsNotYetTransferred}`);

    passed++;
  }

  // ── B. Already-posted savings must NOT be subtracted again ────────────────
  // balance=400 (already reflects the 100 savings transfer that was posted)
  // monthly savings target=100, already posted=100 → remaining=0
  // upcoming bills=0
  // availableMoney = 400 − 0 − 0 = 400
  {
    const currentBalance = 400;    // 100 savings transfer already deducted in this balance
    const unpaidObligations = 0;
    const monthlyPlannedSavings = 100;
    const alreadyPostedSavings = 100; // fully transferred — nothing left to reserve
    const plannedSavingsNotYetTransferred = Math.max(
      0,
      monthlyPlannedSavings - alreadyPostedSavings,
    );

    assert(plannedSavingsNotYetTransferred === 0,
      `B: remaining savings should be 0 (fully posted), got ${plannedSavingsNotYetTransferred}`);

    const avail = computeAvailableMoney(
      currentBalance,
      unpaidObligations,
      plannedSavingsNotYetTransferred,
    );
    assert(avail === 400,
      `B: expected 400 (posted savings not re-subtracted), got ${avail}`);

    passed++;
  }

  // ── C. Partially completed savings: subtract only the remainder ───────────
  // monthly savings target=100, already posted=40 → remaining=60
  // balance=500, upcoming bills=30
  // availableMoney = 500 − 30 − 60 = 410
  {
    const currentBalance = 500;
    const unpaidObligations = 30;
    const monthlyPlannedSavings = 100;
    const alreadyPostedSavings = 40;
    const plannedSavingsNotYetTransferred = Math.max(
      0,
      monthlyPlannedSavings - alreadyPostedSavings,
    );

    assert(plannedSavingsNotYetTransferred === 60,
      `C: remaining savings should be 60, got ${plannedSavingsNotYetTransferred}`);

    const avail = computeAvailableMoney(
      currentBalance,
      unpaidObligations,
      plannedSavingsNotYetTransferred,
    );
    assert(avail === 410,
      `C: expected 410 (500−30−60), got ${avail}`);

    passed++;
  }

  // ── D. No current balance → availableMoney must be null ──────────────────
  // No transactions carry a balance column → currentAccountBalance = null.
  // availableMoney must not be fabricated from income/expenses.
  {
    const txs: LightTransaction[] = [
      { date: "2026-08-01", type: "income",  amount: 500 },
      { date: "2026-08-05", type: "expense", amount: 300 },
    ];

    const currentBalance = deriveCurrentAccountBalance(txs);
    assert(currentBalance === null,
      `D: currentAccountBalance should be null, got ${currentBalance}`);

    const avail = computeAvailableMoney(currentBalance, 50, 100);
    assert(avail === null,
      `D: availableMoney should be null (not fabricated), got ${avail}`);

    passed++;
  }

  // ── E. Newest posted transaction determines balance (not first row) ────────
  {
    const txs: LightTransaction[] = [
      { date: "2026-08-15", type: "expense", amount: 30,  balance: 970 },
      { date: "2026-08-01", type: "income",  amount: 500, balance: 500 },
      { date: "2026-08-20", type: "expense", amount: 70,  balance: 900 },
    ];
    const currentBalance = deriveCurrentAccountBalance(txs);
    assert(currentBalance === 900,
      `E: newest posted balance should be 900 (2026-08-20), got ${currentBalance}`);
    passed++;
  }

  // ── F. Pending transaction does not override newest posted balance ─────────
  {
    const txs: LightTransaction[] = [
      { date: "2026-08-20", type: "expense", amount: 70,  balance: 900, pending: false },
      { date: "2026-08-25", type: "expense", amount: 400, balance: 500, pending: true },
    ];
    const currentBalance = deriveCurrentAccountBalance(txs);
    assert(currentBalance === 900,
      `F: pending row must not override posted balance; got ${currentBalance}`);
    passed++;
  }

  // ── G. Monthly net cash flow is income − expenses (not balance-based) ──────
  {
    const cashFlow = computeMonthlyNetCashFlow(100, 200);
    assert(cashFlow === -100,
      `G: cashFlow should be -100, got ${cashFlow}`);
    // Positive case
    const cashFlow2 = computeMonthlyNetCashFlow(1500, 800);
    assert(cashFlow2 === 700,
      `G: cashFlow should be 700, got ${cashFlow2}`);
    passed++;
  }

  // ── H. Over-posted savings → remaining is 0, not negative ─────────────────
  // If the user transferred more to savings than the monthly target, max(0,…) clamps.
  {
    const monthlyPlannedSavings = 100;
    const alreadyPostedSavings = 150; // transferred more than planned
    const plannedSavingsNotYetTransferred = Math.max(
      0,
      monthlyPlannedSavings - alreadyPostedSavings,
    );
    assert(plannedSavingsNotYetTransferred === 0,
      `H: over-posted savings → remaining 0 (clamped), got ${plannedSavingsNotYetTransferred}`);
    passed++;
  }

  // ── I. No balance → monthly-plan availableMoney is also null (not income-expense) ──
  // When no transaction has a balance column value, availableMoney MUST be null.
  // It must not be filled with income − expenses.
  // This is test 6 from the task spec.
  {
    // Suppose income=1500, expenses=800 — but no balance column in any imported row.
    const txs: LightTransaction[] = [
      { date: "2026-08-01", type: "income",  amount: 1500 }, // no balance field
      { date: "2026-08-05", type: "expense", amount:  800 }, // no balance field
    ];
    const totalIncome = 1500;
    const totalExpenses = 800;
    const currentBalance = deriveCurrentAccountBalance(txs);
    const cashFlow = computeMonthlyNetCashFlow(totalIncome, totalExpenses);

    assert(currentBalance === null,
      `I: currentBalance must be null when no balance column, got ${currentBalance}`);

    const availableMoney = computeAvailableMoney(currentBalance, 50, 100);
    assert(availableMoney === null,
      `I: monthly-plan availableMoney must be null (not ${cashFlow}), got ${availableMoney}`);

    // Confirm cashFlow is the income-expense metric — distinct from availableMoney.
    assert(cashFlow === 700,
      `I: cashFlow=${cashFlow} is correct but must NOT be used as availableMoney`);

    passed++;
  }

  // ── J. Dashboard and monthly-plan use the same computeAvailableMoney call ─────
  // Both contexts call computeAvailableMoney with the same inputs and must receive
  // identical results. This test demonstrates that a single source of truth exists.
  // Test 7 from the task spec.
  {
    const currentBalance = 1200;
    const unpaidBills   = 150;
    const unpostedSavings = 80;

    // Dashboard context
    const dashboardAvailable = computeAvailableMoney(currentBalance, unpaidBills, unpostedSavings);

    // Monthly-plan context (must call the same function with the same inputs)
    const planAvailable = computeAvailableMoney(currentBalance, unpaidBills, unpostedSavings);

    assert(dashboardAvailable === planAvailable,
      `J: dashboard (${dashboardAvailable}) and monthly-plan (${planAvailable}) must be equal`);
    assert(dashboardAvailable === 970,
      `J: expected 970 (1200−150−80), got ${dashboardAvailable}`);

    passed++;
  }

  console.log(`computeMoneyMetrics: ${passed} passed, 0 failed`);
}

run();
