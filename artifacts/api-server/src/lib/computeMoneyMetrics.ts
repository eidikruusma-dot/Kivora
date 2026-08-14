/**
 * computeMoneyMetrics.ts
 *
 * Pure functions for Money-module balance / cash-flow / available-money
 * calculations. No I/O, no Firestore, no AI.
 *
 * These functions are mirrored in planner-app/src/lib/moneyStore.ts.
 * The standalone copy here exists so the logic can be tested with esbuild
 * outside of the React/Vite build pipeline.
 *
 * Do NOT use any real user financial data in tests.
 */

// ── Types (minimal — no dependency on planner-app) ───────────────────────────

export interface LightTransaction {
  date: string               // YYYY-MM-DD
  type: "income" | "expense" | "savings"
  amount: number             // always positive
  balance?: number | null    // running balance from bank statement, or null
  pending?: boolean          // true = pending/reserved (excluded from balance)
  createdAt?: number         // ms since epoch (used for secondary sort)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive the current account balance from the newest POSTED transaction that
 * carries a bank-statement balance value.
 *
 * Rules:
 *   - Pending transactions are excluded (they are not booked into the account).
 *   - The newest transaction by date (then by createdAt as tiebreaker) wins.
 *   - Returns null when no qualifying transaction exists — balance is never
 *     fabricated from income/expense arithmetic.
 *
 * Posted expenses are already reflected in the running balance; callers must
 * NOT subtract them again when computing available money.
 */
export function deriveCurrentAccountBalance(
  transactions: LightTransaction[],
): number | null {
  const posted = transactions.filter(
    (t) => !t.pending && t.balance != null && typeof t.balance === "number",
  );
  if (posted.length === 0) return null;

  const sorted = [...posted].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });

  return sorted[0].balance as number;
}

/**
 * Monthly net cash flow: totalIncome − totalExpenses.
 *
 * This is a cash-flow indicator, NOT the user's current bank balance.
 * A positive value means more money came in than went out this month.
 * A negative value means the user spent more than they received.
 */
export function computeMonthlyNetCashFlow(
  totalIncome: number,
  totalExpenses: number,
): number {
  return totalIncome - totalExpenses;
}

/**
 * Available money formula:
 *
 *   availableMoney =
 *     currentAccountBalance
 *     − unpaidUpcomingObligations      (bills not yet paid this month)
 *     − plannedSavingsNotYetTransferred (monthly savings target minus what is
 *                                        already reflected in the bank balance)
 *
 * Returns null when currentAccountBalance is null — never fabricated.
 *
 * Callers MUST pre-compute plannedSavingsNotYetTransferred as:
 *   Math.max(0, monthlyPlannedSavings − alreadyPostedSavingsThisMonth)
 *
 * Already-posted savings transfers reduced the bank balance when they were
 * executed; they are already in currentAccountBalance and must NOT be
 * subtracted again.  Only the REMAINING portion of the savings target
 * (not yet transferred from the account) is subtracted here.
 *
 * Already-posted expenses are in the balance for the same reason — pass
 * only future unpaid bill amounts in unpaidUpcomingObligations.
 */
export function computeAvailableMoney(
  currentAccountBalance: number | null,
  unpaidUpcomingObligations: number,
  plannedSavingsNotYetTransferred: number,
): number | null {
  if (currentAccountBalance === null) return null;
  return currentAccountBalance - unpaidUpcomingObligations - plannedSavingsNotYetTransferred;
}
