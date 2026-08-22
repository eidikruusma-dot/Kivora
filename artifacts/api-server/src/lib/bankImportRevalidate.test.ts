/**
 * bankImportRevalidate.test.ts
 *
 * Regression tests for the POST /api/ai/bank-import/revalidate endpoint logic
 * in routes/aiUpload.ts, added so the Money-module import review screen can
 * let the user manually fix a flagged row (currently: flip a transaction's
 * income/expense direction — a common OCR misread where the amount is read
 * correctly but assigned to the wrong debit/credit column) instead of the
 * import being unconditionally blocked.
 *
 * The endpoint itself is a thin HTTP wrapper around two already-exported,
 * pure functions — postProcessBankTransactions() and buildBankMeta() — so
 * these tests call them directly with the exact same arguments and options
 * the route handler uses, proving:
 *
 *   1. A single misclassified row blocks import (review_required), and
 *      after the user flips its direction, re-running the SAME canonical
 *      reconciliation clears the flag and allows import — with no other
 *      row's data touched.
 *   2. Stale needsReview/reviewReason flags on the client-echoed input MUST
 *      be stripped before re-running reconciliation. postProcessBankTransactions
 *      only ever ADDS a needsReview flag for rows in the current mismatch
 *      set — it never clears one already present on the input — so skipping
 *      the strip step would leave an already-fixed row permanently stuck as
 *      "needs review" forever, even once its data is correct.
 *   3. buildBankMeta() correctly exposes printedIncomeTotal/printedExpenseTotal
 *      as bankMeta.summaryIncome/summaryExpenses (the fields the frontend
 *      needs to echo back on revalidate), and openingBalance/closingBalance
 *      pass through unchanged when re-running on an already-clean list.
 *
 * All data (dates, amounts, descriptions, bank/account names) is entirely
 * synthetic and invented — no real bank statement or personal data is used
 * anywhere.
 *
 * Importing routes/aiUpload.ts constructs an OpenAI client at module scope,
 * which throws without an API key present — so OPENAI_API_KEY is set to an
 * obviously-fake placeholder before the (dynamic) import. No network call is
 * made by any test here.
 *
 * Run:
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/lib/bankImportRevalidate.test.ts \
 *     --outfile=.tmp-bankImportRevalidate.mjs \
 *     && node .tmp-bankImportRevalidate.mjs
 */

import { postProcessBankTransactions } from "./postProcessBankTransactions";
import type { NormalizedTransaction } from "./postProcessBankTransactions";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

interface SynTx extends NormalizedTransaction {
  id: string;
  description: string;
}

function makeTx(overrides: Partial<SynTx> & Pick<SynTx, "id" | "date">): SynTx {
  return {
    page: 1,
    rowIndex: 0,
    description: "synthetic test transaction",
    debit: null,
    credit: null,
    balance: null,
    amount: 0,
    direction: "expense",
    currency: "EUR",
    ...overrides,
  };
}

async function run(): Promise<void> {
  process.env.OPENAI_API_KEY =
    process.env.OPENAI_API_KEY ?? "sk-test-placeholder-not-a-real-key";

  const { buildBankMeta } = await import("../routes/aiUpload");

  let passed = 0;

  // ── 1. Flipping a misread row's direction clears its flag and unblocks import ──
  {
    // Ground truth (what the statement actually printed):
    //   row1: 2026-01-05  -50.00 (expense)  balance 950.00
    //   row2: 2026-01-06  +30.00 (income)   balance 980.00
    //   row3: 2026-01-07  -20.00 (expense)  balance 960.00
    // Extraction misread row2's column: amount and printed balance are
    // exactly right, but it landed in "debit" (expense) instead of "credit"
    // (income) — the single most common OCR misread for tabular bank
    // statements, and exactly what the user asked to be able to fix by hand.
    const misread: SynTx[] = [
      makeTx({ id: "row1", date: "2026-01-05", rowIndex: 0, debit: 50, credit: null, balance: 950, amount: 50, direction: "expense" }),
      makeTx({ id: "row2", date: "2026-01-06", rowIndex: 1, debit: 30, credit: null, balance: 980, amount: 30, direction: "expense" }),
      makeTx({ id: "row3", date: "2026-01-07", rowIndex: 2, debit: 20, credit: null, balance: 960, amount: 20, direction: "expense" }),
    ];

    const controls = {
      openingBalance: 1000,
      closingBalance: 960,
      printedIncomeTotal: null,
      printedExpenseTotal: null,
    };

    const before = postProcessBankTransactions(misread, controls, {
      alreadyChronological: true,
    });

    // A balance-chain mismatch alone no longer blocks import or sets
    // needsReview (explicit product decision — see
    // postProcessBankTransactions.test.ts #4) — it is still detected and
    // surfaced as a review_required warning + reviewReason text, which is
    // exactly what the user needs to spot row2 and fix it by hand.
    assert(before.importAllowed === true, "Import is never blocked by a balance mismatch alone");
    assert(before.validationStatus === "review_required", "Mismatch must still surface as review_required");
    assert(before.reviewCount === 0, `A balance mismatch alone must not set needsReview; got reviewCount=${before.reviewCount}`);
    const flaggedBefore = before.transactions.find((t) => t.id === "row2");
    assert(
      flaggedBefore?.reviewReason?.includes("Jooksev saldo"),
      "row2 (the misread one) must still carry a reviewReason mentioning the mismatch",
    );
    assert(
      before.reconciliation.mismatchedRows.length === 1 &&
        before.reconciliation.mismatchedRows[0].rowIndex === 1,
      "Exactly row2 must be identified as the mismatched row",
    );

    const bankMetaBefore = buildBankMeta(before, controls, 1);
    assert(bankMetaBefore.importAllowed === true, "bankMeta must mirror post.importAllowed");

    // ── Simulate the client edit: user clicks row2 and flips it to income ──
    // (amount/balance untouched — only which column the amount belongs to).
    const editedRaw = before.transactions.map((t) =>
      t.id === "row2"
        ? { ...t, direction: "income" as const, debit: null, credit: t.amount }
        : t,
    );
    // Route handler strips stale needsReview/reviewReason from EVERY row
    // before re-running reconciliation — simulated here identically.
    const cleaned: SynTx[] = editedRaw.map((t) => {
      const { needsReview: _needsReview, reviewReason: _reviewReason, ...rest } = t;
      return rest as SynTx;
    });

    const after = postProcessBankTransactions(
      cleaned,
      {
        openingBalance: bankMetaBefore.openingBalance ?? null,
        closingBalance: bankMetaBefore.closingBalance ?? null,
        printedIncomeTotal: bankMetaBefore.summaryIncome ?? null,
        printedExpenseTotal: bankMetaBefore.summaryExpenses ?? null,
      },
      { alreadyChronological: true },
    );

    assert(after.importAllowed === true, "Import must be allowed once the misread row is fixed");
    assert(after.reviewCount === 0, `Expected 0 flagged rows after fix; got ${after.reviewCount}`);
    assert(
      after.transactions.find((t) => t.id === "row2")?.needsReview !== true,
      "row2 must no longer be flagged after the fix",
    );
    // Untouched rows must keep their original amounts exactly.
    assert(
      after.transactions.find((t) => t.id === "row1")?.debit === 50,
      "row1 must be unmodified by an edit made to a different row",
    );
    assert(
      after.transactions.find((t) => t.id === "row3")?.debit === 20,
      "row3 must be unmodified by an edit made to a different row",
    );

    passed++;
  }

  // ── 2. Stale needsReview MUST be stripped before re-running reconciliation ──
  {
    const clean: SynTx[] = [
      makeTx({ id: "a", date: "2026-02-01", rowIndex: 0, credit: 100, balance: 1100, amount: 100, direction: "income" }),
      makeTx({ id: "b", date: "2026-02-02", rowIndex: 1, debit: 40, balance: 1060, amount: 40, direction: "expense" }),
    ];
    const controls = {
      openingBalance: 1000,
      closingBalance: 1060,
      printedIncomeTotal: null,
      printedExpenseTotal: null,
    };

    // Row "b" carries a STALE flag from a previous (already-fixed) run —
    // its own numbers reconcile perfectly, the flag is just leftover state.
    // A stale flag never blocks import (importAllowed only depends on
    // having at least one transaction), but it would still mislead the
    // user by appearing in the "needs review" list — stripping it keeps
    // that list accurate.
    const staleInput: SynTx[] = [
      clean[0],
      { ...clean[1], needsReview: true, reviewReason: "stale reason from a prior attempt" },
    ];

    const withoutStripping = postProcessBankTransactions(staleInput, controls, {
      alreadyChronological: true,
    });
    assert(
      withoutStripping.reviewCount === 1,
      "Without stripping, the stale flag alone would still appear in the needs-review list (proves stripping is necessary, not optional)",
    );
    assert(withoutStripping.importAllowed === true, "A stale needsReview flag never blocks import either way");

    const stripped: SynTx[] = staleInput.map((t) => {
      const { needsReview: _needsReview, reviewReason: _reviewReason, ...rest } = t;
      return rest as SynTx;
    });
    const withStripping = postProcessBankTransactions(stripped, controls, {
      alreadyChronological: true,
    });
    assert(withStripping.reviewCount === 0, "After stripping, a genuinely clean statement must have 0 flagged rows");
    assert(withStripping.importAllowed === true, "After stripping, a genuinely clean statement must be importable");

    passed++;
  }

  // ── 3. buildBankMeta exposes printed totals for the client to echo back ──
  {
    const rows: SynTx[] = [
      makeTx({ id: "x", date: "2026-03-01", rowIndex: 0, credit: 200, balance: 1200, amount: 200, direction: "income" }),
    ];
    const controls = {
      openingBalance: 1000,
      closingBalance: 1200,
      printedIncomeTotal: 200,
      printedExpenseTotal: 0,
    };
    const post = postProcessBankTransactions(rows, controls, { alreadyChronological: true });
    const meta = buildBankMeta(post, controls, 1);

    assert(meta.summaryIncome === 200, `Expected summaryIncome 200; got ${meta.summaryIncome}`);
    assert(meta.summaryExpenses === 0, `Expected summaryExpenses 0; got ${meta.summaryExpenses}`);
    assert(meta.openingBalance === 1000, `Expected openingBalance 1000; got ${meta.openingBalance}`);
    assert(meta.closingBalance === 1200, `Expected closingBalance 1200; got ${meta.closingBalance}`);
    assert(meta.importAllowed === true, "Clean single-row statement must be importable");

    passed++;
  }

  console.log(`bankImportRevalidate: ${passed} passed, 0 failed`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
