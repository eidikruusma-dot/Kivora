/**
 * bankImport.test.ts
 *
 * 26 synthetic tests covering the bank-import pipeline:
 *   Tests  1–13: parseBankCsv function-level
 *   Tests 14–19: postProcessBankTransactions function-level
 *   Tests 20–26: full parseBankFile → postProcess pipeline integration
 *
 * Run:
 *   npx esbuild --bundle --platform=node --format=cjs \
 *     src/lib/bankImport.test.ts | node
 */

import assert from "node:assert/strict";
import { parseBankFile } from "./parseBankCsv";
import { postProcessBankTransactions } from "./postProcessBankTransactions";
import type { NormalizedTransaction } from "./postProcessBankTransactions";

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failedNames: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ ${name}: ${msg}`);
    failedNames.push(name);
    failed++;
  }
}

// Helper: build a Buffer from CSV text
function csv(...lines: string[]): Buffer {
  return Buffer.from(lines.join("\n"), "utf-8");
}

// Helper: build a NormalizedTransaction for postProcessBankTransactions tests
function tx(
  overrides: Partial<NormalizedTransaction>,
): NormalizedTransaction {
  return {
    page: 1,
    rowIndex: 0,
    date: "2024-01-15",
    debit: null,
    credit: 100,
    balance: null,
    amount: 100,
    direction: "income",
    currency: "EUR",
    ...overrides,
  };
}

const NO_CONTROLS = {
  openingBalance: null as number | null,
  closingBalance: null as number | null,
  printedIncomeTotal: null as number | null,
  printedExpenseTotal: null as number | null,
};

// ── Tests 1–13: parseBankCsv ─────────────────────────────────────────────────

test("T01 - credit-only row → credit populated, debit null, not flagged", () => {
  const result = parseBankFile(
    csv("Date,Description,Debit,Credit,Balance", "2024-01-15,Salary,,1000.00,1000.00"),
    "test.csv", "text/csv",
  );
  assert.equal(result.error, undefined);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].credit, 1000);
  assert.equal(result.transactions[0].debit, null);
  assert.equal(result.transactions[0].needsReview, undefined);
});

test("T02 - debit-only row → debit populated, credit null, not flagged", () => {
  const result = parseBankFile(
    csv("Date,Description,Debit,Credit,Balance", "2024-01-15,Rent,800.00,,200.00"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].debit, 800);
  assert.equal(result.transactions[0].credit, null);
  assert.equal(result.transactions[0].needsReview, undefined);
});

test("T03 - both debit AND credit filled → needsReview=true, reviewReason mentions deebet", () => {
  const result = parseBankFile(
    csv("Date,Description,Debit,Credit", "2024-01-15,Ambiguous,100.00,100.00"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].debit, 100);
  assert.equal(result.transactions[0].credit, 100);
  assert.equal(result.transactions[0].needsReview, true);
  assert.ok(
    result.transactions[0].reviewReason?.toLowerCase().includes("deebet"),
    `Expected reviewReason to mention deebet, got: ${result.transactions[0].reviewReason}`,
  );
});

test("T04 - D/C indicator D → debit populated (expense direction)", () => {
  const result = parseBankFile(
    csv("Kuupäev,Selgitus,Summa,D/C", "2024-01-15,Rent,800.00,D"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].debit, 800);
  assert.equal(result.transactions[0].credit, null);
  assert.equal(result.transactions[0].needsReview, undefined);
});

test("T05 - D/C indicator C → credit populated (income direction)", () => {
  const result = parseBankFile(
    csv("Kuupäev,Selgitus,Summa,D/C", "2024-01-15,Salary,1000.00,C"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].credit, 1000);
  assert.equal(result.transactions[0].debit, null);
});

test("T06 - D/C unknown indicator falls through to signed-amount rule", () => {
  // Unknown D/C → extractAmounts falls through; signed amount 500>0 → credit
  const result = parseBankFile(
    csv("Date,Description,Amount,D/C", "2024-01-15,Transfer,500.00,X"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].credit, 500);
  assert.equal(result.transactions[0].debit, null);
});

test("T07 - European number format: comma decimal, space thousands", () => {
  const result = parseBankFile(
    csv("Date,Description,Credit", '2024-01-15,Salary,"1 234,56"'),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].credit, 1234.56);
});

test("T08 - pending section rows marked pending=true", () => {
  const result = parseBankFile(
    csv(
      "Date,Description,Credit",
      "2024-01-10,Salary,3000.00",
      "Pending transactions",
      "2024-01-20,Reserved,100.00",
    ),
    "test.csv", "text/csv",
  );
  const pending = result.transactions.filter((t) => t.pending);
  const posted = result.transactions.filter((t) => !t.pending);
  assert.equal(posted.length, 1);
  assert.ok(pending.length >= 1);
});

test("T09 - opening/closing balance rows extracted to controls, not transactions", () => {
  // The balance value must be in a separate CSV cell; inline text is not parsed.
  // "Opening balance,,500.00" → fields=["Opening balance","","500.00"]
  // matchesAny() matches on rowText; firstNumericValue() finds 500 in field[2].
  const result = parseBankFile(
    csv(
      "Date,Description,Credit",
      "Opening balance,,500.00",
      "2024-01-15,Salary,1000.00",
      "Closing balance,,1500.00",
    ),
    "test.csv", "text/csv",
  );
  assert.equal(result.controls.openingBalance, 500);
  assert.equal(result.controls.closingBalance, 1500);
  assert.equal(result.transactions.length, 1); // only the salary row
});

test("T10 - negative signed amount → debit column (expense)", () => {
  const result = parseBankFile(
    csv("Date,Description,Amount", "2024-01-15,Rent,-800.00"),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].debit, 800);
  assert.equal(result.transactions[0].credit, null);
});

test("T11 - balance column extracted per-row", () => {
  const result = parseBankFile(
    csv(
      "Date,Description,Credit,Balance",
      "2024-01-15,Salary,1000.00,1000.00",
      "2024-01-16,Bonus,500.00,1500.00",
    ),
    "test.csv", "text/csv",
  );
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].balance, 1000);
  assert.equal(result.transactions[1].balance, 1500);
});

test("T12 - unrecognized CSV → UNSUPPORTED_BANK_FILE_FORMAT", () => {
  const result = parseBankFile(
    csv("Name,Email,Phone", "Alice,alice@example.com,555-1234"),
    "test.csv", "text/csv",
  );
  assert.equal(result.error, "UNSUPPORTED_BANK_FILE_FORMAT");
});

test("T13 - empty file → error (NO_TRANSACTIONS_FOUND or UNSUPPORTED_BANK_FILE_FORMAT)", () => {
  const result = parseBankFile(Buffer.from(""), "test.csv", "text/csv");
  assert.ok(
    result.error === "NO_TRANSACTIONS_FOUND" ||
      result.error === "UNSUPPORTED_BANK_FILE_FORMAT",
    `Expected an error, got ${result.error ?? "undefined"}`,
  );
});

// ── Tests 14–19: postProcessBankTransactions ─────────────────────────────────

test("T14 - no controls → validationStatus=unverified, importAllowed=true", () => {
  const result = postProcessBankTransactions(
    [tx({ credit: 500, amount: 500 })],
    NO_CONTROLS,
  );
  assert.equal(result.validationStatus, "unverified");
  assert.equal(result.importAllowed, true);
});

test("T15 - balance chain matches → validationStatus=verified", () => {
  const result = postProcessBankTransactions(
    [tx({ credit: 500, amount: 500, direction: "income", balance: 1500 })],
    { openingBalance: 1000, closingBalance: 1500, printedIncomeTotal: null, printedExpenseTotal: null },
  );
  assert.equal(result.validationStatus, "verified");
  assert.equal(result.importAllowed, true);
});

test("T16 - balance chain mismatch → importAllowed=false, review_required", () => {
  // Running balance 1000+500=1500 but row shows 1700 → per-row mismatch
  const result = postProcessBankTransactions(
    [tx({ credit: 500, amount: 500, direction: "income", balance: 1700 })],
    { openingBalance: 1000, closingBalance: 1700, printedIncomeTotal: null, printedExpenseTotal: null },
  );
  assert.equal(result.importAllowed, false);
  assert.notEqual(result.validationStatus, "verified");
});

test("T17 - needsReview row present → importAllowed=false, reviewCount=1", () => {
  const result = postProcessBankTransactions(
    [tx({ needsReview: true, reviewReason: "Both columns", amount: 100 })],
    NO_CONTROLS,
  );
  assert.equal(result.importAllowed, false);
  assert.equal(result.reviewCount, 1);
  assert.equal(result.validationStatus, "review_required");
});

test("T18 - pending rows excluded from income/expense totals", () => {
  const result = postProcessBankTransactions(
    [
      tx({ credit: 1000, amount: 1000, direction: "income" }),
      tx({ credit: 500, amount: 500, direction: "income", pending: true, rowIndex: 1 }),
    ],
    NO_CONTROLS,
  );
  assert.equal(result.incomeCount, 1);
  assert.equal(result.calculatedIncomeTotal, 1000);
});

test("T19 - newest-first input → oldest-first in sorted output", () => {
  const result = postProcessBankTransactions(
    [
      tx({ date: "2024-01-20", amount: 300, rowIndex: 0 }),
      tx({ date: "2024-01-10", amount: 100, rowIndex: 1 }),
      tx({ date: "2024-01-15", amount: 200, rowIndex: 2 }),
    ],
    NO_CONTROLS,
  );
  const dates = result.transactions.map((t) => t.date);
  assert.deepEqual(dates, ["2024-01-10", "2024-01-15", "2024-01-20"]);
});

// ── Tests 20–26: pipeline integration ────────────────────────────────────────
// Exercises parseBankFile → normalizeRow → postProcessBankTransactions,
// mirroring the /ai/bank-import route logic without HTTP scaffolding.

/** Mirror of the route handler's row normalization. */
function normalizeParsedRow(row: ReturnType<typeof parseBankFile>["transactions"][0], idx: number) {
  const reviewReasons: string[] = row.reviewReason ? [row.reviewReason] : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    reviewReasons.push(`Date could not be parsed: "${row.date}"`);
  }
  if (row.debit === null && row.credit === null) {
    reviewReasons.push("Invalid or missing transaction amount");
  }
  const credit = row.credit;
  const debit = row.debit;
  const bothPopulated = credit !== null && debit !== null;
  let amount: number;
  let direction: "income" | "expense";
  if (bothPopulated) {
    amount = Math.max(credit ?? 0, debit ?? 0);
    direction = (credit ?? 0) >= (debit ?? 0) ? "income" : "expense";
  } else {
    amount = credit ?? debit ?? 0;
    direction = credit !== null ? "income" : "expense";
  }
  const needsReview = reviewReasons.length > 0 || row.needsReview === true;
  return {
    page: 1 as const,
    rowIndex: idx,
    date: row.date,
    description: row.description,   // kept so T26 can verify sort stability
    debit: row.debit,
    credit: row.credit,
    balance: row.balance,
    amount,
    direction,
    currency: row.currency || "EUR",
    needsReview: needsReview ? (true as const) : undefined,
    reviewReason: reviewReasons.length > 0 ? reviewReasons.join("; ") : undefined,
    pending: row.pending ? (true as const) : undefined,
  };
}

function runPipeline(buf: Buffer) {
  const parsed = parseBankFile(buf, "test.csv", "text/csv");
  if (parsed.error || parsed.transactions.length === 0) return { parsed, post: null };
  const txns = parsed.transactions.map(normalizeParsedRow);
  const post = postProcessBankTransactions(txns, {
    openingBalance: parsed.controls.openingBalance,
    closingBalance: parsed.controls.closingBalance,
    printedIncomeTotal: null,
    printedExpenseTotal: null,
  });
  return { parsed, post };
}

test("T20 - mixed income/expense: correct incomeCount, expenseCount, totals", () => {
  const { post } = runPipeline(csv(
    "Date,Description,Debit,Credit",
    "2024-01-10,Salary,,3000.00",
    "2024-01-12,Rent,1200.00,",
    "2024-01-15,Groceries,150.00,",
  ));
  assert.ok(post !== null);
  assert.equal(post!.incomeCount, 1);
  assert.equal(post!.expenseCount, 2);
  assert.equal(post!.calculatedIncomeTotal, 3000);
  assert.equal(post!.calculatedExpenseTotal, 1350);
  assert.equal(post!.importAllowed, true);
});

test("T21 - both debit+credit in CSV → review_required, importAllowed=false", () => {
  const { post } = runPipeline(csv(
    "Date,Description,Debit,Credit",
    "2024-01-10,Salary,,3000.00",
    "2024-01-12,Ambiguous,100.00,100.00",
  ));
  assert.ok(post !== null);
  assert.equal(post!.reviewCount, 1);
  assert.equal(post!.importAllowed, false);
  assert.equal(post!.validationStatus, "review_required");
});

test("T22 - opening/closing balance present and correct → verified", () => {
  // Balance value must be in a separate CSV cell (see T09 note).
  const { post } = runPipeline(csv(
    "Date,Description,Credit,Balance",
    "Opening balance,,,1000.00",
    "2024-01-10,Salary,500.00,1500.00",
    "Closing balance,,,1500.00",
  ));
  assert.ok(post !== null);
  assert.equal(post!.validationStatus, "verified");
  assert.equal(post!.importAllowed, true);
});

test("T23 - opening/closing balance mismatch → not verified", () => {
  // Per-row balance 1700 but opening(1000)+credit(500)=1500 → chain mismatch.
  const { post } = runPipeline(csv(
    "Date,Description,Credit,Balance",
    "Opening balance,,,1000.00",
    "2024-01-10,Salary,500.00,1700.00",
    "Closing balance,,,1700.00",
  ));
  assert.ok(post !== null);
  assert.equal(post!.importAllowed, false);
});

test("T24 - no controls at all → unverified, still importAllowed", () => {
  const { post } = runPipeline(csv(
    "Date,Description,Credit",
    "2024-01-10,Salary,3000.00",
  ));
  assert.ok(post !== null);
  assert.equal(post!.validationStatus, "unverified");
  assert.equal(post!.importAllowed, true);
});

test("T25 - control rows excluded from transactions (kreeditkäive matches CONTROL_ROW_PATTERNS)", () => {
  // "Kreeditkäive" matches /\bkreeditkäive\b/i → CONTROL_ROW_PATTERNS → row skipped.
  // "Kokku laekumised" does NOT match (only /\bkokku\b.*\btehingud\b/ does).
  const { post } = runPipeline(csv(
    "Date,Description,Credit",
    "2024-01-10,Salary,3000.00",
    "2024-01-11,Kreeditkäive,3000.00",
    "2024-01-12,Bonus,500.00",
  ));
  assert.ok(post !== null);
  const hasControl = post!.transactions.some((t) =>
    /kreeditkäive/i.test(t.description ?? ""),
  );
  assert.equal(hasControl, false, "kreeditkäive control row should have been excluded");
});

test("T26 - same-day transactions: all present after sort", () => {
  const { post } = runPipeline(csv(
    "Date,Description,Credit",
    "2024-01-15,First,100.00",
    "2024-01-15,Second,200.00",
    "2024-01-15,Third,300.00",
  ));
  assert.ok(post !== null);
  assert.equal(post!.transactions.length, 3);
  const descs = post!.transactions.map((t) => t.description);
  assert.ok(descs.includes("First"));
  assert.ok(descs.includes("Second"));
  assert.ok(descs.includes("Third"));
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failedNames.length > 0) console.error("Failed tests:", failedNames.join(", "));
if (failed > 0) process.exit(1);
