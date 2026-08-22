/**
 * pdfMultiPageImportPipeline.test.ts
 *
 * End-to-end regression test for the production Money PDF import path:
 *
 *   extractStructuralPdfBuffer(buffer)  →  rawRowToBankTransaction() mapping
 *                                        →  postProcessBankTransactions()
 *
 * This is exactly the sequence buildBankResultFromStructural() in
 * routes/aiUpload.ts runs for every readable-text PDF bank statement
 * (the primary, deterministic path — no OpenAI call). The mapping logic
 * below is a deliberate 1:1 mirror of rawRowToBankTransaction() so this
 * test exercises the real production behavior, not a reimplementation.
 *
 * Root cause under test: extractStructuralPdfBuffer() already sorts its
 * output chronologically (needed for its own internal reconciliation).
 * postProcessBankTransactions() used to unconditionally re-sort on top of
 * that — and because its sort algorithm is "reverse + stable sort by date"
 * (designed to recover oldest-first order from raw newest-first document
 * order), applying it a SECOND time to already-sorted input silently
 * reverses the relative order of same-day transactions. Once one row's
 * position is wrong, the running-balance chain check is sequential and
 * cumulative, so every later transaction in the chain fails too — which is
 * what made large parts of a multi-page statement appear to fail import
 * ("needsReview" + totals mismatch), even though every page was read
 * correctly and no transaction was ever dropped.
 *
 * All data below (dates, amounts, descriptions) is entirely invented —
 * no real bank statement, account, or personal data is used anywhere.
 *
 * Run:
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/lib/pdfMultiPageImportPipeline.test.ts \
 *     --outfile=.tmp-pdfMultiPageImportPipeline.mjs \
 *     && node .tmp-pdfMultiPageImportPipeline.mjs
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  extractStructuralPdfBuffer,
  type StructuralPdfBufferResult,
} from "./extractStructuralPdfBuffer";
import {
  postProcessBankTransactions,
  type NormalizedTransaction,
} from "./postProcessBankTransactions";
import type { RawTransactionRow } from "./classifyTransactionRows";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── 1:1 mirror of rawRowToBankTransaction() in routes/aiUpload.ts ───────────
// Direction derives ONLY from debit/credit values, same as production.
interface PipelineTransaction extends NormalizedTransaction {
  description: string;
}

function rawRowToTransaction(row: RawTransactionRow): PipelineTransaction {
  const debitAmt = row.debit !== null && row.debit > 0 ? row.debit : null;
  const creditAmt = row.credit !== null && row.credit > 0 ? row.credit : null;

  let amount: number;
  let direction: "income" | "expense";
  if (debitAmt !== null && creditAmt === null) {
    amount = debitAmt;
    direction = "expense";
  } else if (creditAmt !== null && debitAmt === null) {
    amount = creditAmt;
    direction = "income";
  } else {
    amount = Math.max(debitAmt ?? 0, creditAmt ?? 0);
    direction = "expense";
  }

  return {
    page: row.pageNumber,
    rowIndex: row.rowIndex,
    date: row.date,
    description: row.description,
    debit: debitAmt,
    credit: creditAmt,
    balance: row.balance,
    amount,
    direction,
    currency: "EUR",
    ...(row.pending && { pending: true }),
  };
}

/** Mirrors buildBankResultFromStructural()'s call into postProcessBankTransactions. */
function runProductionPipeline(structural: StructuralPdfBufferResult) {
  const rawTxns = structural.transactions.map(rawRowToTransaction);
  return postProcessBankTransactions(
    rawTxns,
    {
      openingBalance: structural.controls.openingBalance,
      closingBalance: structural.controls.closingBalance,
      printedIncomeTotal: structural.controls.printedIncomeTotal,
      printedExpenseTotal: structural.controls.printedExpenseTotal,
    },
    { alreadyChronological: true },
  );
}

/** Reproduces the pre-fix call (no alreadyChronological flag) for regression proof. */
function runPreFixPipeline(structural: StructuralPdfBufferResult) {
  const rawTxns = structural.transactions.map(rawRowToTransaction);
  return postProcessBankTransactions(rawTxns, {
    openingBalance: structural.controls.openingBalance,
    closingBalance: structural.controls.closingBalance,
    printedIncomeTotal: structural.controls.printedIncomeTotal,
    printedExpenseTotal: structural.controls.printedExpenseTotal,
  });
}

/**
 * A synthetic 4-page bank statement, newest-first, entirely invented data.
 * Opening balance 1000.00; two same-day transactions (page 4) to exercise
 * intra-day ordering across the full pipeline.
 *
 * True chronological order (oldest → newest):
 *   Page 4: 01.04.2031 Synthetic Fee        −20.00 →  980.00
 *   Page 4: 01.04.2031 Synthetic Refund     +120.00 → 1100.00  (same day, later)
 *   Page 3: 04.04.2031 Synthetic Utility    −60.00  → 1040.00
 *   Page 2: 08.04.2031 Synthetic Freelance  +250.00 → 1290.00
 *   Page 1: 12.04.2031 Synthetic Salary     +400.00 → 1690.00
 *
 * Printed controls: opening 1000.00, closing 1690.00,
 * total credits 770.00 (120+250+400), total debits 80.00 (20+60).
 */
async function buildFourPageStatement(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const drawOn = (
    page: Awaited<ReturnType<typeof pdf.addPage>>,
    text: string,
    x: number,
    y: number,
  ): void => {
    page.drawText(text, { x, y, size: 10, font });
  };

  const page1 = pdf.addPage([595, 842]);
  drawOn(page1, "Opening Balance", 50, 810);
  drawOn(page1, "1 000,00", 530, 810);
  drawOn(page1, "Total Credits", 50, 795);
  drawOn(page1, "770,00", 530, 795);
  drawOn(page1, "Total Debits", 50, 780);
  drawOn(page1, "80,00", 530, 780);
  drawOn(page1, "Closing Balance", 50, 765);
  drawOn(page1, "1 690,00", 530, 765);

  drawOn(page1, "Date", 50, 730);
  drawOn(page1, "Description", 150, 730);
  drawOn(page1, "Debit", 350, 730);
  drawOn(page1, "Credit", 450, 730);
  drawOn(page1, "Balance", 530, 730);

  drawOn(page1, "12.04.2031", 50, 710);
  drawOn(page1, "Synthetic Salary", 150, 710);
  drawOn(page1, "400,00", 450, 710);
  drawOn(page1, "1 690,00", 530, 710);

  const page2 = pdf.addPage([595, 842]);
  drawOn(page2, "08.04.2031", 50, 800);
  drawOn(page2, "Synthetic Freelance", 150, 800);
  drawOn(page2, "250,00", 450, 800);
  drawOn(page2, "1 290,00", 530, 800);

  const page3 = pdf.addPage([595, 842]);
  drawOn(page3, "04.04.2031", 50, 800);
  drawOn(page3, "Synthetic Utility", 150, 800);
  drawOn(page3, "60,00", 350, 800);
  drawOn(page3, "1 040,00", 530, 800);

  // Same-day pair, newest-first within the day (Refund above Fee).
  const page4 = pdf.addPage([595, 842]);
  drawOn(page4, "01.04.2031", 50, 800);
  drawOn(page4, "Synthetic Refund", 150, 800);
  drawOn(page4, "120,00", 450, 800);
  drawOn(page4, "1 100,00", 530, 800);

  drawOn(page4, "01.04.2031", 50, 780);
  drawOn(page4, "Synthetic Fee", 150, 780);
  drawOn(page4, "20,00", 350, 780);
  drawOn(page4, "980,00", 530, 780);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function run(): Promise<void> {
  let passed = 0;

  const buffer = await buildFourPageStatement();
  const structural = await extractStructuralPdfBuffer(buffer);

  // ── 1. Every page was read by the deterministic extractor ────────────────
  {
    assert(
      structural.pagesTotal === 4,
      `Expected all 4 pages to be read; pagesTotal=${structural.pagesTotal}`,
    );
    assert(
      structural.transactions.length === 5,
      `Expected 5 transactions across all pages; got ${structural.transactions.length}`,
    );
    const pages = new Set(structural.transactions.map((t) => t.pageNumber));
    assert(
      [1, 2, 3, 4].every((p) => pages.has(p)),
      `Every page must contribute at least one transaction; got pages ${[...pages].join(",")}`,
    );
    passed++;
  }

  // ── 2. Production pipeline (fixed): full multi-page import succeeds ──────
  {
    const post = runProductionPipeline(structural);

    assert(
      post.reconciliation.ok === true,
      `Reconciliation must pass for a valid multi-page statement; errors: ${post.reconciliation.errors.join("; ")}`,
    );
    assert(
      post.reviewCount === 0,
      `No transaction should need review; reviewCount=${post.reviewCount}`,
    );
    assert(
      post.importAllowed === true,
      "A fully valid multi-page statement must be importable",
    );
    assert(
      post.validationStatus === "verified",
      `Expected 'verified', got '${post.validationStatus}'`,
    );

    // Correct chronological order across all 4 pages, same-day pair intact.
    const order = (post.transactions as PipelineTransaction[]).map((t) => t.description);
    assert(
      JSON.stringify(order) ===
        JSON.stringify([
          "Synthetic Fee",
          "Synthetic Refund",
          "Synthetic Utility",
          "Synthetic Freelance",
          "Synthetic Salary",
        ]),
      `Wrong transaction order: ${JSON.stringify(order)}`,
    );

    // Direction correctness.
    const byDesc = new Map(
      (post.transactions as PipelineTransaction[]).map((t) => [t.description, t]),
    );
    assert(byDesc.get("Synthetic Fee")!.direction === "expense", "Fee must be expense");
    assert(byDesc.get("Synthetic Refund")!.direction === "income", "Refund must be income");
    assert(byDesc.get("Synthetic Utility")!.direction === "expense", "Utility must be expense");
    assert(byDesc.get("Synthetic Freelance")!.direction === "income", "Freelance must be income");
    assert(byDesc.get("Synthetic Salary")!.direction === "income", "Salary must be income");

    // Running balances preserved (optional field, present here).
    assert(byDesc.get("Synthetic Fee")!.balance === 980, "Fee balance incorrect");
    assert(byDesc.get("Synthetic Salary")!.balance === 1690, "Salary balance incorrect");

    // Totals reconciliation.
    assert(
      post.calculatedIncomeTotal === 770,
      `Income total incorrect: ${post.calculatedIncomeTotal}`,
    );
    assert(
      post.calculatedExpenseTotal === 80,
      `Expense total incorrect: ${post.calculatedExpenseTotal}`,
    );

    passed++;
  }

  // ── 3. Defense in depth: same-day balance-chain reordering self-heals the
  //       pre-fix (double-sort) call pattern on this exact multi-page
  //       extraction ─────────────────────────────────────────────────────────
  // Historically (before reorderSameDayGroupsByBalanceChain existed) calling
  // postProcessBankTransactions without alreadyChronological on already-
  // sorted structural output corrupted the same-day pair and broke
  // reconciliation for every later transaction. That direct defect is still
  // fixed the efficient way (alreadyChronological: true, test 2 above /
  // runProductionPipeline). This test proves the *symptom* is now also
  // independently caught and corrected: even the old, redundant-sort call
  // pattern reconciles correctly, because the same-day pair's true order is
  // unambiguously re-derivable from each row's own printed balance.
  {
    const healedPost = runPreFixPipeline(structural);

    assert(
      healedPost.reconciliation.ok === true,
      `Same-day balance-chain reordering must self-heal the double-sort call pattern; errors: ${healedPost.reconciliation.errors.join("; ")}`,
    );
    assert(
      healedPost.reviewCount === 0,
      "No transaction should be wrongly flagged once the chain self-heals",
    );
    assert(
      healedPost.importAllowed === true,
      "A perfectly valid statement must be importable even via the old call pattern",
    );

    passed++;
  }

  // ── 4. Genuine incompleteness is still detected through the full pipeline ─
  // Drop one page's transaction (simulating a real truncation) while keeping
  // the original printed controls — the chain can no longer reach the
  // printed closing balance. Reconciliation must still catch this (never
  // silently "ok"), but per an explicit product decision it surfaces as a
  // review_required warning rather than blocking import outright — the user
  // decides whether to fix the flagged rows or import anyway.
  {
    const truncatedStructural: StructuralPdfBufferResult = {
      ...structural,
      transactions: structural.transactions.filter(
        (t) => t.description !== "Synthetic Salary",
      ),
    };

    const post = runProductionPipeline(truncatedStructural);

    assert(
      post.reconciliation.ok === false,
      "Truncated extraction must never reconcile successfully",
    );
    assert(
      post.validationStatus === "review_required",
      "Truncated extraction must still surface as review_required",
    );
    assert(
      post.importAllowed === true,
      "Import is allowed regardless — reconciliation failures warn, never hard-block",
    );

    passed++;
  }

  console.log(`pdfMultiPageImportPipeline: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
