import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractAllPdfTextItems } from "./pdfTextProbe";
import { extractStructuralFromItems } from "./extractStructural";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function buildSyntheticStatementPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const draw = (text: string, x: number, y: number, size = 10): void => {
    page.drawText(text, {
      x,
      y,
      size,
      font,
    });
  };

  // Header
  draw("Date", 50, 780);
  draw("Description", 150, 780);
  draw("Debit", 350, 780);
  draw("Credit", 450, 780);
  draw("Balance", 530, 780);

  // Expense
  draw("01.08.2026", 50, 760);
  draw("Synthetic Shop", 150, 760);
  draw("12,50", 350, 760);
  draw("487,50", 530, 760);

  // Income
  draw("02.08.2026", 50, 740);
  draw("Synthetic Income", 150, 740);
  draw("100,00", 450, 740);
  draw("587,50", 530, 740);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function run(): Promise<void> {
  const buffer = await buildSyntheticStatementPdf();

  const items = await extractAllPdfTextItems(buffer);

  assert(items.length > 0, "PDF positional extraction returned no items");

  const result = extractStructuralFromItems(items);

  assert(result.columnMap !== null, "Column map was not detected");
  assert(result.success === true, "Structural extraction did not succeed");
  assert(
    result.transactions.length === 2,
    `Expected 2 transactions, got ${result.transactions.length}`,
  );

  const expense = result.transactions[0];
  const income = result.transactions[1];

  assert(expense.debit === 12.5, "Expense debit amount incorrect");
  assert(expense.credit === null, "Expense credit should be null");
  assert(expense.balance === 487.5, "Expense balance incorrect");

  assert(income.credit === 100, "Income credit amount incorrect");
  assert(income.debit === null, "Income debit should be null");
  assert(income.balance === 587.5, "Income balance incorrect");

  console.log(
    `extractStructural: 1 passed, 0 failed (${items.length} positional items)`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
