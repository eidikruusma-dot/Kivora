/**
 * pdfBatchedExtraction.test.ts
 *
 * Regression tests for the batched OCR/AI PDF-import extraction pipeline in
 * routes/aiUpload.ts: splitPdfIntoPageBatches, buildBankStatementExtractionPrompt,
 * dedupeAdjacentDuplicateTransactions, and mergeModelBankStatements.
 *
 * Root cause this replaces: a long, multi-page scanned bank statement sent as
 * a single OpenAI Responses API call could come back with a short
 * transactions[] array — either a hard cutoff (response.status: "incomplete")
 * or the model simply under-reading a very long document while still
 * reporting status "completed". Splitting the PDF into small, bounded page
 * batches (AI_EXTRACTION_PAGES_PER_BATCH pages each) keeps every individual
 * call's input and expected output far below any limit, and the merge step
 * deterministically reassembles one complete result — reconciliation
 * (postProcessBankTransactions) still runs exactly once, only on the fully
 * merged result, unchanged from before.
 *
 * These tests import the REAL functions from routes/aiUpload.ts (not
 * reimplementations) so they exercise production code directly. Importing
 * that module constructs an OpenAI client at module scope, which throws
 * without an API key present — so OPENAI_API_KEY is set to an obviously-fake
 * placeholder before the (dynamic) import. No network call is made by any
 * test here; only the pure, non-network functions are exercised.
 *
 * All data (dates, amounts, descriptions, bank/account names) is entirely
 * synthetic and invented — no real bank statement or personal data is used
 * anywhere.
 *
 * Run:
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/lib/pdfBatchedExtraction.test.ts \
 *     --outfile=.tmp-pdfBatchedExtraction.mjs \
 *     && node .tmp-pdfBatchedExtraction.mjs
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { postProcessBankTransactions } from "./postProcessBankTransactions";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function buildBlankPdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Synthetic page ${i + 1}`, { x: 50, y: 800, size: 10, font });
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function run(): Promise<void> {
  process.env.OPENAI_API_KEY =
    process.env.OPENAI_API_KEY ?? "sk-test-placeholder-not-a-real-key";

  const {
    splitPdfIntoPageBatches,
    buildBankStatementExtractionPrompt,
    dedupeAdjacentDuplicateTransactions,
    mergeModelBankStatements,
    normalizeBankTransaction,
  } = await import("../routes/aiUpload");

  let passed = 0;

  // ── 1. Long document splits into bounded, contiguous, non-overlapping batches ──
  {
    const buffer = await buildBlankPdf(12); // 12 pages, default 5 pages/batch
    const batches = await splitPdfIntoPageBatches(buffer);

    assert(batches.length === 3, `Expected 3 batches for 12 pages; got ${batches.length}`);
    assert(
      batches[0].startPage === 1 && batches[0].endPage === 5,
      `Batch 1 must cover pages 1-5; got ${batches[0].startPage}-${batches[0].endPage}`,
    );
    assert(
      batches[1].startPage === 6 && batches[1].endPage === 10,
      `Batch 2 must cover pages 6-10; got ${batches[1].startPage}-${batches[1].endPage}`,
    );
    assert(
      batches[2].startPage === 11 && batches[2].endPage === 12,
      `Batch 3 must cover pages 11-12; got ${batches[2].startPage}-${batches[2].endPage}`,
    );

    // Every page of the source document must be covered exactly once.
    const covered = new Set<number>();
    for (const b of batches) {
      for (let p = b.startPage; p <= b.endPage; p++) {
        assert(!covered.has(p), `Page ${p} covered by more than one batch`);
        covered.add(p);
      }
    }
    assert(covered.size === 12, `Expected all 12 pages covered; got ${covered.size}`);

    // Each batch buffer must itself be a valid, independently loadable PDF
    // with exactly the expected number of pages.
    for (const b of batches) {
      const batchDoc = await PDFDocument.load(b.buffer);
      const expectedPages = b.endPage - b.startPage + 1;
      assert(
        batchDoc.getPageCount() === expectedPages,
        `Batch ${b.startPage}-${b.endPage} buffer must contain ${expectedPages} page(s); got ${batchDoc.getPageCount()}`,
      );
    }

    passed++;
  }

  // ── 2. Short document (fits in one batch) makes exactly one batch — no cost
  //       regression for the overwhelming majority of real statements ─────────
  {
    const buffer = await buildBlankPdf(3);
    const batches = await splitPdfIntoPageBatches(buffer);

    assert(batches.length === 1, `Expected exactly 1 batch for a 3-page document; got ${batches.length}`);
    assert(
      batches[0].startPage === 1 && batches[0].endPage === 3,
      "Single batch must cover the whole 3-page document",
    );

    passed++;
  }

  // ── 3. Prompt: single-batch (whole document) case has no excerpt framing ──────
  {
    const prompt = buildBankStatementExtractionPrompt({
      startPage: 1,
      endPage: 3,
      totalPages: 3,
    });
    assert(
      !/EXCERPT/.test(prompt),
      "A batch covering the entire document must not be framed as an excerpt",
    );

    passed++;
  }

  // ── 4. Prompt: multi-batch excerpt case is framed correctly ────────────────────
  {
    const prompt = buildBankStatementExtractionPrompt({
      startPage: 6,
      endPage: 10,
      totalPages: 12,
    });
    assert(/EXCERPT/.test(prompt), "A partial batch must be framed as an excerpt");
    assert(prompt.includes("pages 6-10"), "Prompt must state the absolute page range");
    assert(prompt.includes("12-page"), "Prompt must state the true total page count");

    passed++;
  }

  // ── 5. Dedup: identical row at a batch boundary (adjacent pages) is dropped ────
  {
    const rows = [
      {
        date: "2031-06-01",
        description: "Synthetic Boundary Row",
        debit: 40,
        credit: null,
        balance: 960,
        currency: "EUR",
        sourcePage: 5,
        confidence: "high" as const,
      },
      {
        date: "2031-06-01",
        description: "Synthetic Boundary Row",
        debit: 40,
        credit: null,
        balance: 960,
        currency: "EUR",
        sourcePage: 6, // adjacent page — same batch-boundary row re-read
        confidence: "high" as const,
      },
    ];

    const result = dedupeAdjacentDuplicateTransactions(rows);
    assert(result.length === 1, `Expected the adjacent-page duplicate to be dropped; got ${result.length}`);
    assert(result[0].sourcePage === 5, "The earlier occurrence must be kept");

    passed++;
  }

  // ── 6. Dedup: identical-looking rows far apart are genuine, both preserved ─────
  {
    const rows = [
      {
        date: "2031-06-01",
        description: "Synthetic Coffee Shop",
        debit: 4.5,
        credit: null,
        balance: 995.5,
        currency: "EUR",
        sourcePage: 1,
        confidence: "high" as const,
      },
      {
        date: "2031-06-01",
        description: "Synthetic Coffee Shop",
        debit: 4.5,
        credit: null,
        balance: 986.0, // different balance too — clearly a distinct later purchase
        currency: "EUR",
        sourcePage: 9, // far from page 1 — not a batch-boundary artifact
        confidence: "high" as const,
      },
    ];

    const result = dedupeAdjacentDuplicateTransactions(rows);
    assert(
      result.length === 2,
      `Two genuinely repeated same-day transactions far apart must both be kept; got ${result.length}`,
    );

    passed++;
  }

  // ── 6b. Dedup: OCR-noisy re-read of the SAME boundary row (different
  //        description tail, different balance digit) is still caught ─────────
  // This is the exact real-world case the fuzzy key was introduced for: two
  // separate OCR/vision reads of the identical physical row rarely come back
  // byte-for-byte identical. The old exact-match key would have kept both,
  // inflating the count.
  {
    const rows = [
      {
        date: "2031-07-01",
        description: "Synthetic Vendor Co 15/07/2031 09:29 24.80 USD(21.82 EUR + TT 0.33 fee)",
        debit: 21.82,
        credit: null,
        balance: 900.0,
        currency: "EUR",
        sourcePage: 5,
        confidence: "high" as const,
      },
      {
        // Same row, read again at the next batch's boundary: extra space,
        // truncated tail, and a one-cent-off balance misread.
        date: "2031-07-01",
        description: "Synthetic Vendor Co 15/07/2031 09:29 24.80 USD (21.82 EUR + TT 0.33 fe",
        debit: 21.82,
        credit: null,
        balance: 899.98,
        currency: "EUR",
        sourcePage: 6,
        confidence: "high" as const,
      },
    ];

    const result = dedupeAdjacentDuplicateTransactions(rows);
    assert(
      result.length === 1,
      `A noisy re-read of the same boundary row must still be caught; got ${result.length}`,
    );
    assert(result[0].sourcePage === 5, "The earlier occurrence must be kept");

    passed++;
  }

  // ── 6c. Dedup: same date/amount/merchant but a genuinely different embedded
  //        time, on adjacent pages, must NOT be collapsed ───────────────────────
  // A legitimate retried same-day, same-amount charge from the same merchant
  // (e.g. a declined payment retried later) must survive as two transactions
  // — the fuzzy key still distinguishes them because the differing detail
  // (the time) falls within the compared prefix window.
  {
    const rows = [
      {
        date: "2031-07-02",
        description: "Synthetic Vendor Co 02/07/2031 09:15 10.00 EUR",
        debit: 10.0,
        credit: null,
        balance: 500,
        currency: "EUR",
        sourcePage: 3,
        confidence: "high" as const,
      },
      {
        date: "2031-07-02",
        description: "Synthetic Vendor Co 02/07/2031 14:47 10.00 EUR",
        debit: 10.0,
        credit: null,
        balance: 490,
        currency: "EUR",
        sourcePage: 4, // adjacent page, but a distinguishably different row
        confidence: "high" as const,
      },
    ];

    const result = dedupeAdjacentDuplicateTransactions(rows);
    assert(
      result.length === 2,
      `A genuinely different same-day, same-amount, same-merchant transaction must not be collapsed; got ${result.length}`,
    );

    passed++;
  }

  // ── 7. Merge: sourcePage remapped from excerpt-relative to absolute, and
  //       batch order is preserved exactly (no reordering) ──────────────────────
  {
    const batches = [
      {
        startPage: 1,
        endPage: 5,
        result: {
          document: {
            isBankStatement: true,
            bankName: "Synthetic Test Bank",
            accountNumber: "SY0000000001",
            currency: "EUR",
            periodFrom: "2031-06-01",
            periodTo: null,
            openingBalance: 1000,
            closingBalance: null,
            printedIncomeTotal: 500,
            printedExpenseTotal: 350,
          },
          transactions: [
            {
              date: "2031-06-10",
              description: "Synthetic Newest Row",
              debit: null,
              credit: 100,
              balance: 1150,
              currency: "EUR",
              sourcePage: 1, // relative to this batch — absolute page 1
              confidence: "high" as const,
            },
            {
              date: "2031-06-05",
              description: "Synthetic Middle Row",
              debit: 50,
              credit: null,
              balance: 1050,
              currency: "EUR",
              sourcePage: 3, // relative to this batch — absolute page 3
              confidence: "high" as const,
            },
          ],
          warnings: [{ code: "TEST_WARNING_A", message: "synthetic" }],
        },
      },
      {
        startPage: 6,
        endPage: 10,
        result: {
          document: {
            isBankStatement: true,
            bankName: null,
            accountNumber: null,
            currency: null,
            periodFrom: null,
            periodTo: "2031-06-30",
            openingBalance: null,
            closingBalance: 1990,
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          transactions: [
            {
              date: "2031-06-01",
              description: "Synthetic Oldest Row",
              debit: 100,
              credit: null,
              balance: 1000,
              currency: "EUR",
              sourcePage: 2, // relative to this batch — absolute page 7
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
    ];

    const merged = mergeModelBankStatements(batches);

    assert(merged.transactions.length === 3, `Expected 3 merged transactions; got ${merged.transactions.length}`);
    // Batch order preserved: batch 1's rows first (in their own order), then batch 2's.
    assert(
      merged.transactions[0].description === "Synthetic Newest Row",
      "Batch 1's first row must be merged first",
    );
    assert(
      merged.transactions[1].description === "Synthetic Middle Row",
      "Batch 1's second row must be merged second",
    );
    assert(
      merged.transactions[2].description === "Synthetic Oldest Row",
      "Batch 2's row must be merged last",
    );

    // sourcePage remapped from excerpt-relative to absolute.
    assert(merged.transactions[0].sourcePage === 1, "Row on batch-relative page 1 of batch 1 -> absolute page 1");
    assert(merged.transactions[1].sourcePage === 3, "Row on batch-relative page 3 of batch 1 -> absolute page 3");
    assert(
      merged.transactions[2].sourcePage === 7,
      `Row on batch-relative page 2 of batch 2 (startPage 6) must map to absolute page 7; got ${merged.transactions[2].sourcePage}`,
    );

    // Document metadata merge: openingBalance from batch 1 (first non-null),
    // closingBalance from batch 2 (last non-null), totals from batch 1.
    assert(merged.document.openingBalance === 1000, "openingBalance must come from batch 1");
    assert(merged.document.closingBalance === 1990, "closingBalance must come from batch 2");
    assert(merged.document.printedIncomeTotal === 500, "printedIncomeTotal must come from batch 1");
    assert(merged.document.printedExpenseTotal === 350, "printedExpenseTotal must come from batch 1");
    assert(merged.document.bankName === "Synthetic Test Bank", "bankName must come from batch 1");
    assert(merged.document.periodFrom === "2031-06-01", "periodFrom must come from batch 1");
    assert(merged.document.periodTo === "2031-06-30", "periodTo must come from batch 2 (last non-null)");
    assert(merged.document.isBankStatement === true, "merged isBankStatement must be true");

    assert(merged.warnings.length === 1, "Warnings from all batches must be concatenated");

    passed++;
  }

  // ── 8. Merge: one batch reporting isBankStatement=false must not veto the
  //       overall result when another batch found real statement content ───────
  {
    const batches = [
      {
        startPage: 1,
        endPage: 1,
        result: {
          document: {
            isBankStatement: false, // e.g. a cover/disclaimer-only page
            bankName: null,
            accountNumber: null,
            currency: null,
            periodFrom: null,
            periodTo: null,
            openingBalance: null,
            closingBalance: null,
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          transactions: [],
          warnings: [],
        },
      },
      {
        startPage: 2,
        endPage: 2,
        result: {
          document: {
            isBankStatement: true,
            bankName: "Synthetic Test Bank",
            accountNumber: null,
            currency: "EUR",
            periodFrom: null,
            periodTo: null,
            openingBalance: null,
            closingBalance: null,
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          transactions: [
            {
              date: "2031-06-01",
              description: "Synthetic Row",
              debit: 10,
              credit: null,
              balance: null,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
    ];

    const merged = mergeModelBankStatements(batches);
    assert(
      merged.document.isBankStatement === true,
      "One non-statement batch must not veto an otherwise valid multi-batch statement",
    );

    passed++;
  }

  // ── 9. Full pipeline: 3 single-page batches (newest-first, matching real
  //       document layout) -> merge -> normalizeBankTransaction ->
  //       postProcessBankTransactions (the exact sequence buildBankResultFromModel
  //       runs). Proves same-day order and running balances survive batching
  //       and merging, and that reconciliation passes only once, on the
  //       complete merged result — mirroring the real production call, which
  //       does NOT pass alreadyChronological (unlike the structural path):
  //       the merged array must still be in the same raw newest-first visual
  //       order a single non-batched call would have produced, so the
  //       existing single chronological sort recovers it correctly. ─────────
  {
    const batches = [
      {
        startPage: 1,
        endPage: 1,
        result: {
          document: {
            isBankStatement: true,
            bankName: "Synthetic Test Bank",
            accountNumber: "SY0000000099",
            currency: "EUR",
            periodFrom: "2031-07-01",
            periodTo: null,
            openingBalance: 1000,
            closingBalance: null,
            printedIncomeTotal: 520,
            printedExpenseTotal: 80,
          },
          transactions: [
            {
              date: "2031-07-10",
              description: "Synthetic Salary",
              debit: null,
              credit: 400,
              balance: 1440,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
      {
        startPage: 2,
        endPage: 2,
        result: {
          document: {
            isBankStatement: true,
            bankName: null,
            accountNumber: null,
            currency: null,
            periodFrom: null,
            periodTo: null,
            openingBalance: null,
            closingBalance: null,
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          transactions: [
            {
              date: "2031-07-05",
              description: "Synthetic Utility",
              debit: 60,
              credit: null,
              balance: 1040,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
      {
        startPage: 3,
        endPage: 3,
        result: {
          document: {
            isBankStatement: true,
            bankName: null,
            accountNumber: null,
            currency: null,
            periodFrom: null,
            periodTo: "2031-07-31",
            openingBalance: null,
            closingBalance: 1440,
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          // Newest-of-day (Refund) listed before oldest-of-day (Fee) — exactly
          // how a newest-first statement presents two same-day rows.
          transactions: [
            {
              date: "2031-07-01",
              description: "Synthetic Refund",
              debit: null,
              credit: 120,
              balance: 1100,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
            {
              date: "2031-07-01",
              description: "Synthetic Fee",
              debit: 20,
              credit: null,
              balance: 980,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
    ];

    const merged = mergeModelBankStatements(batches);
    assert(merged.transactions.length === 4, `Expected 4 merged transactions; got ${merged.transactions.length}`);

    const rawTxns = merged.transactions.map((row, idx) =>
      normalizeBankTransaction(row, idx, merged.document),
    );
    const post = postProcessBankTransactions(rawTxns, {
      openingBalance: merged.document.openingBalance,
      closingBalance: merged.document.closingBalance,
      printedIncomeTotal: merged.document.printedIncomeTotal,
      printedExpenseTotal: merged.document.printedExpenseTotal,
    });

    const order = post.transactions.map((t) => t.description);
    assert(
      JSON.stringify(order) ===
        JSON.stringify(["Synthetic Fee", "Synthetic Refund", "Synthetic Utility", "Synthetic Salary"]),
      `Wrong chronological order after batching+merge: ${JSON.stringify(order)}`,
    );

    assert(
      post.reconciliation.ok === true,
      `Reconciliation must pass on the complete merged result; errors: ${post.reconciliation.errors.join("; ")}`,
    );
    assert(post.reviewCount === 0, `No transaction should need review; reviewCount=${post.reviewCount}`);
    assert(post.importAllowed === true, "A fully valid batched-and-merged statement must be importable");
    assert(post.validationStatus === "verified", `Expected 'verified', got '${post.validationStatus}'`);
    assert(post.calculatedIncomeTotal === 520, `Income total incorrect: ${post.calculatedIncomeTotal}`);
    assert(post.calculatedExpenseTotal === 80, `Expense total incorrect: ${post.calculatedExpenseTotal}`);

    // Running balances preserved end to end.
    const byDesc = new Map(post.transactions.map((t) => [t.description, t]));
    assert(byDesc.get("Synthetic Fee")!.balance === 980, "Fee balance incorrect");
    assert(byDesc.get("Synthetic Salary")!.balance === 1440, "Salary balance incorrect");

    passed++;
  }

  // ── 10. Incomplete merged result (a page's transaction missing) must still
  //        fail reconciliation and be blocked — batching must never weaken
  //        the existing "never import incomplete data" guarantee ────────────
  {
    const batches = [
      {
        startPage: 1,
        endPage: 1,
        result: {
          document: {
            isBankStatement: true,
            bankName: null,
            accountNumber: null,
            currency: null,
            periodFrom: null,
            periodTo: null,
            openingBalance: 1000,
            closingBalance: 1440, // true closing balance, but a batch's row is missing below
            printedIncomeTotal: null,
            printedExpenseTotal: null,
          },
          transactions: [
            {
              date: "2031-07-10",
              description: "Synthetic Salary",
              debit: null,
              credit: 400,
              balance: 1440,
              currency: "EUR",
              sourcePage: 1,
              confidence: "high" as const,
            },
          ],
          warnings: [],
        },
      },
      // Batch 2 (the "Synthetic Utility" row) is simply absent here, simulating
      // a batch that failed to reach the merge step in some hypothetical
      // future refactor — proving the merge+reconcile combination still
      // catches incompleteness even if the fail-fast guarantee were bypassed.
    ];

    const merged = mergeModelBankStatements(batches);
    const rawTxns = merged.transactions.map((row, idx) =>
      normalizeBankTransaction(row, idx, merged.document),
    );
    const post = postProcessBankTransactions(rawTxns, {
      openingBalance: merged.document.openingBalance,
      closingBalance: merged.document.closingBalance,
      printedIncomeTotal: merged.document.printedIncomeTotal,
      printedExpenseTotal: merged.document.printedExpenseTotal,
    });

    assert(post.reconciliation.ok === false, "Incomplete merged data must never reconcile successfully");
    assert(post.importAllowed === false, "Incomplete merged data must never be importable");

    passed++;
  }

  console.log(`pdfBatchedExtraction: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
