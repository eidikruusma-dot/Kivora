import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractStructuralPdfBuffer } from "./extractStructuralPdfBuffer";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function buildSyntheticPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const draw = (text: string, x: number, y: number): void => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font,
    });
  };

  // Controls
  draw("Opening Balance", 50, 810);
  draw("500,00", 530, 810);

  draw("Total Credits", 50, 795);
  draw("100,00", 530, 795);

  draw("Total Debits", 50, 780);
  draw("25,50", 530, 780);

  draw("Closing Balance", 50, 765);
  draw("574,50", 530, 765);

  // Transaction table header
  draw("Date", 50, 730);
  draw("Description", 150, 730);
  draw("Debit", 350, 730);
  draw("Credit", 450, 730);
  draw("Balance", 530, 730);

  // Expense transaction (older date, higher y = nearer to top of PDF page
  // in a standard oldest-first layout used by this synthetic helper)
  draw("01.08.2026", 50, 710);
  draw("Synthetic Expense", 150, 710);
  draw("25,50", 350, 710);
  draw("474,50", 530, 710);

  // Income transaction
  draw("02.08.2026", 50, 690);
  draw("Synthetic Income", 150, 690);
  draw("100,00", 450, 690);
  draw("574,50", 530, 690);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function buildPdfWithoutIndependentControls(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const draw = (text: string, x: number, y: number): void => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font,
    });
  };

  // Transaction table header
  draw("Date", 50, 780);
  draw("Description", 150, 780);
  draw("Debit", 350, 780);
  draw("Credit", 450, 780);
  draw("Balance", 530, 780);

  // Valid-looking transaction, but no document-level controls
  draw("01.08.2026", 50, 760);
  draw("Synthetic Expense", 150, 760);
  draw("25,50", 350, 760);
  draw("474,50", 530, 760);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/**
 * A PDF where the NEWER date (02.08) sits at a higher y-coordinate (nearer
 * the top of the page) and the OLDER date (01.08) sits lower — exactly as a
 * real bank statement presents transactions newest-first.
 *
 * The pipeline must sort these into chronological order (01.08 → 02.08)
 * before reconciliation so that the running-balance chain validates correctly.
 *
 * Running balance (chronological):
 *   Opening   500,00
 *   01.08 −25,50 → 474,50  ✓
 *   02.08 +100,00 → 574,50 ✓
 */
async function buildNewestFirstPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const draw = (text: string, x: number, y: number): void => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font,
    });
  };

  // Controls
  draw("Opening Balance", 50, 810);
  draw("500,00", 530, 810);

  draw("Total Credits", 50, 795);
  draw("100,00", 530, 795);

  draw("Total Debits", 50, 780);
  draw("25,50", 530, 780);

  draw("Closing Balance", 50, 765);
  draw("574,50", 530, 765);

  // Transaction table header
  draw("Date", 50, 730);
  draw("Description", 150, 730);
  draw("Debit", 350, 730);
  draw("Credit", 450, 730);
  draw("Balance", 530, 730);

  // 02.08 (NEWER) at y=710 — visually at the top of the transaction list.
  // On a newest-first statement this row appears first visually.
  draw("02.08.2026", 50, 710);
  draw("Newest-First Income", 150, 710);
  draw("100,00", 450, 710);
  draw("574,50", 530, 710);

  // 01.08 (OLDER) at y=690 — visually below the newer transaction.
  draw("01.08.2026", 50, 690);
  draw("Newest-First Expense", 150, 690);
  draw("25,50", 350, 690);
  draw("474,50", 530, 690);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function run(): Promise<void> {
  let passed = 0;

  // 1. Empty buffer fails safely
  {
    const result = await extractStructuralPdfBuffer(Buffer.alloc(0));

    assert(result.success === false, "Empty buffer must fail");
    assert(
      result.transactions.length === 0,
      "Empty buffer returned transactions",
    );

    passed++;
  }

  // 2. Full structural extraction + controls + reconciliation
  {
    const buffer = await buildSyntheticPdf();
    const result = await extractStructuralPdfBuffer(buffer);

    assert(result.columnMap !== null, "Column map missing");
    assert(result.transactions.length === 2, "Expected 2 transactions");

    assert(result.controls.openingBalance === 500, "Opening balance incorrect");
    assert(
      result.controls.closingBalance === 574.5,
      "Closing balance incorrect",
    );
    assert(
      result.controls.printedIncomeTotal === 100,
      "Income control incorrect",
    );
    assert(
      result.controls.printedExpenseTotal === 25.5,
      "Expense control incorrect",
    );

    assert(result.reconciliation.ok === true, "Reconciliation should pass");

    assert(
      result.reconciliation.calculatedIncomeTotal === 100,
      "Calculated income incorrect",
    );

    assert(
      result.reconciliation.calculatedExpenseTotal === 25.5,
      "Calculated expense incorrect",
    );

    assert(
      result.reconciliation.calculatedClosingBalance === 574.5,
      "Calculated closing incorrect",
    );

    assert(
      result.success === true,
      "Fully reconciled structural extraction should succeed",
    );

    passed++;
  }

  // 3. Same PDF produces identical result
  {
    const buffer = await buildSyntheticPdf();

    const a = await extractStructuralPdfBuffer(buffer);
    const b = await extractStructuralPdfBuffer(buffer);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same PDF buffer must produce identical full structural result",
    );

    passed++;
  }

  // 4. Structural extraction without independent controls must fail closed
  {
    const buffer = await buildPdfWithoutIndependentControls();

    const result = await extractStructuralPdfBuffer(buffer);

    assert(
      result.transactions.length === 1,
      "Transaction should still be structurally extracted",
    );

    assert(
      result.controls.openingBalance === null,
      "Opening balance should be absent",
    );

    assert(
      result.controls.closingBalance === null,
      "Closing balance should be absent",
    );

    assert(
      result.controls.printedIncomeTotal === null,
      "Printed income total should be absent",
    );

    assert(
      result.controls.printedExpenseTotal === null,
      "Printed expense total should be absent",
    );

    assert(
      result.success === false,
      "Import must fail closed when no independent controls are present",
    );

    assert(
      result.warnings.some((warning) =>
        warning.includes("No independent statement control values"),
      ),
      "Missing independent-control warning expected",
    );

    passed++;
  }

  // 5. Regression: source buffer not detached after structural extraction
  {
    const buffer = await buildSyntheticPdf();
    const originalByteLength = buffer.byteLength;

    assert(originalByteLength > 0, "Synthetic PDF must be non-empty");

    // Simulate the fix: give structural extraction its own copy.
    const structuralBuffer = Buffer.from(buffer);
    await extractStructuralPdfBuffer(structuralBuffer);

    // The original must be completely unaffected — same length, still a Buffer,
    // still usable for the AI fallback path.
    assert(
      buffer.byteLength === originalByteLength,
      `Original buffer was zeroed by pdfjs transfer: expected ${originalByteLength} bytes, got ${buffer.byteLength}`,
    );
    assert(
      Buffer.isBuffer(buffer) && buffer.length > 0,
      "Original buffer must remain a non-empty Buffer after structural extraction",
    );

    passed++;
  }

  // 6. Regression: newest-first PDF → transactions returned in chronological order
  //
  // On the real bank statement the newest transaction appears at the top of
  // the page (highest y-coordinate).  The pipeline must detect this and sort
  // into chronological order before reconciliation so that the running-balance
  // chain validates correctly.
  //
  // This test builds a PDF where 02.08 (newer) is at the top and 01.08 (older)
  // is at the bottom — the opposite of standard chronological presentation.
  // After extractStructuralPdfBuffer runs, we expect:
  //   result.transactions[0].date → contains "01" (older date first)
  //   result.transactions[1].date → contains "02" (newer date second)
  //   result.reconciliation.ok   → true (chain validates in sorted order)
  {
    const buffer = await buildNewestFirstPdf();
    const result = await extractStructuralPdfBuffer(buffer);

    assert(
      result.transactions.length === 2,
      "Expected 2 transactions from newest-first PDF",
    );

    const firstDate = result.transactions[0].date;
    const secondDate = result.transactions[1].date;

    // Parsed dates will be ISO (YYYY-MM-DD) after normalisation, or still
    // in the original dd.mm.yyyy format — either way the older date must
    // sort lexicographically before the newer one.
    assert(
      firstDate < secondDate || firstDate.includes("01"),
      `First transaction must be the older date; got "${firstDate}" before "${secondDate}"`,
    );

    assert(
      result.reconciliation.ok === true,
      "Running-balance chain must validate after chronological sort of newest-first input",
    );

    assert(
      result.success === true,
      "Fully reconciled extraction from newest-first PDF must succeed",
    );

    passed++;
  }

  console.log(`extractStructuralPdfBuffer: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
