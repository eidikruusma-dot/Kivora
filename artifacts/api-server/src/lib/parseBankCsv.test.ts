/**
 * parseBankCsv.test.ts
 *
 * Deterministic tests for the CSV / XLSX bank statement parser.
 * ALL data is synthetic — no real user bank data is used anywhere in this file.
 *
 * Tests 1–13 cover the parser itself.
 * Test 14 covers within-file row identity (distinct rowIndex for identical-looking rows).
 * Test 15 covers client-loop pending-row exclusion logic (simulated inline).
 */

// In the CJS test bundle, require is a module-local variable (not globalThis).
// parseBankCsv uses (globalThis as any).require("xlsx") so we must expose it here.
(globalThis as any).require = require;

import { parseBankFile } from "./parseBankCsv";

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function csv(lines: string[]): Buffer {
  return Buffer.from(lines.join("\n"), "utf-8");
}

function csvWith(lines: string[], encoding: BufferEncoding = "utf-8"): Buffer {
  return Buffer.from(lines.join("\n"), encoding);
}

/** Create an XLSX buffer with one sheet using the xlsx library. */
function makeXlsx(rows: string[][], sheetName = "Transactions"): Buffer {
  const XLSX = require("xlsx") as typeof import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Create an XLSX buffer with two sheets. */
function makeXlsxMultiSheet(
  sheet1: { name: string; rows: string[][] },
  sheet2: { name: string; rows: string[][] },
): Buffer {
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1.rows), sheet1.name);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2.rows), sheet2.name);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function run(): void {
  let passed = 0;

  // ── 1. CSV with separate debit / credit columns ───────────────────────────
  {
    const buf = csv([
      "Date,Description,Debit,Credit,Balance",
      "2026-08-01,Supermarket,25.00,,475.00",
      "2026-08-02,Salary,,1000.00,1475.00",
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 1: no error expected");
    assert(result.transactions.length === 2, `test 1: expected 2 txs, got ${result.transactions.length}`);
    assert(result.transactions[0].debit === 25, "test 1: debit row");
    assert(result.transactions[0].credit === null, "test 1: no credit on debit row");
    // direction is set by the route layer after normalization; parser produces debit/credit
    assert(result.transactions[1].credit === 1000, "test 1: credit row");
    assert(result.transactions[1].debit === null, "test 1: no debit on credit row");
    passed++;
  }

  // ── 2. CSV with signed amount column ─────────────────────────────────────
  {
    const buf = csv([
      "Date,Description,Amount,Balance",
      "2026-08-01,Coffee,-3.50,496.50",
      "2026-08-02,Refund,15.00,511.50",
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 2: no error");
    assert(result.transactions.length === 2, `test 2: 2 txs, got ${result.transactions.length}`);
    // Negative amount → debit (expense)
    assert(result.transactions[0].debit === 3.5, `test 2: negative → debit=${result.transactions[0].debit}`);
    assert(result.transactions[0].credit === null, "test 2: no credit for negative amount");
    // Positive amount → credit (income)
    assert(result.transactions[1].credit === 15, `test 2: positive → credit=${result.transactions[1].credit}`);
    assert(result.transactions[1].debit === null, "test 2: no debit for positive amount");
    passed++;
  }

  // ── 3. Semicolon-delimited CSV ────────────────────────────────────────────
  {
    const buf = csv([
      "Kuupäev;Selgitus;Deebet;Kreedit",
      "2026-08-01;Pood;12,50;",
      "2026-08-02;Palk;;800,00",
    ]);
    const result = parseBankFile(buf, "väljavõte.csv");

    assert(result.error == null, "test 3: no error");
    assert(result.transactions.length === 2, `test 3: 2 txs, got ${result.transactions.length}`);
    assert(result.transactions[0].debit === 12.5, `test 3: debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 800, `test 3: credit=${result.transactions[1].credit}`);
    passed++;
  }

  // ── 4. Decimal comma parsing ──────────────────────────────────────────────
  {
    const buf = csv([
      "Date;Description;Amount",
      "2026-08-01;Bakery;-4,80",
      "2026-08-02;Invoice;1 250,00",
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 4: no error");
    assert(result.transactions[0].debit === 4.8, `test 4: decimal comma debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 1250, `test 4: thousands sep credit=${result.transactions[1].credit}`);
    passed++;
  }

  // ── 5. UTF-8 BOM stripped ─────────────────────────────────────────────────
  {
    const content = "Date,Description,Amount\n2026-08-01,Test payment,-10.00\n";
    // Prepend BOM bytes manually
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, Buffer.from(content, "utf-8")]);
    const result = parseBankFile(buf, "bom.csv");

    assert(result.error == null, "test 5: no error (BOM stripped)");
    assert(result.transactions.length === 1, `test 5: 1 tx, got ${result.transactions.length}`);
    assert(result.transactions[0].debit === 10, `test 5: debit=${result.transactions[0].debit}`);
    passed++;
  }

  // ── 6. Quoted description containing delimiter ────────────────────────────
  {
    const buf = csv([
      'Date,Description,Amount',
      '2026-08-01,"Coffee, milk & sugar",-5.40',
      '2026-08-02,"Salary: ""main job""",3000.00',
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 6: no error");
    assert(result.transactions.length === 2, `test 6: 2 txs, got ${result.transactions.length}`);
    assert(
      result.transactions[0].description === "Coffee, milk & sugar",
      `test 6: description="${result.transactions[0].description}"`,
    );
    assert(
      result.transactions[1].description === 'Salary: "main job"',
      `test 6: escaped quote description="${result.transactions[1].description}"`,
    );
    passed++;
  }

  // ── 7. Header row not on first row ───────────────────────────────────────
  {
    const buf = csv([
      "Account: EE123456789",          // metadata row 0 — no header keywords
      "Statement period: 2026-08",     // metadata row 1
      "",                               // empty row 2
      "Date,Description,Debit,Credit", // header on row 3
      "2026-08-01,Rent,500.00,",
      "2026-08-05,Client payment,,2000.00",
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 7: no error");
    assert(result.transactions.length === 2, `test 7: 2 txs, got ${result.transactions.length}`);
    assert(result.transactions[0].debit === 500, `test 7: first tx debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 2000, `test 7: second tx credit=${result.transactions[1].credit}`);
    passed++;
  }

  // ── 8. Summary / control rows skipped ───────────────────────────────────
  {
    const buf = csv([
      "Date,Description,Debit,Credit,Balance",
      "Opening Balance,,,, 500.00",           // opening balance row
      "2026-08-01,Coffee,5.00,,495.00",
      "Kreeditkäive,,, 200.00,",              // daily credit turnover — must skip
      "Deebetkäive,,5.00,,",                  // daily debit turnover — must skip
      "2026-08-02,Salary,,200.00,695.00",
      "Closing Balance,,,,695.00",            // closing balance row
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 8: no error");
    assert(result.transactions.length === 2, `test 8: 2 txs only (control rows skipped), got ${result.transactions.length}`);
    assert(result.controls.openingBalance === 500, `test 8: opening=${result.controls.openingBalance}`);
    assert(result.controls.closingBalance === 695, `test 8: closing=${result.controls.closingBalance}`);
    passed++;
  }

  // ── 9. Pending row marked and excluded from posted totals ────────────────
  // (Exclusion from totals is done in the route via postProcessBankTransactions;
  //  the parser's job is to set pending=true on the right rows.)
  {
    const buf = csv([
      "Date,Description,Amount,Status",
      "2026-08-01,Groceries,-30.00,",
      "Pending,,,,",                          // section header (no date) → pending mode
      "2026-08-05,Reserved transfer,-100.00,",
      "2026-08-06,Another pending,-50.00,reserved",  // status field also marks pending
    ]);
    const result = parseBankFile(buf, "statement.csv");

    // The posted (non-pending) transaction
    const posted = result.transactions.filter((t) => !t.pending);
    const pending = result.transactions.filter((t) => t.pending);

    assert(posted.length === 1, `test 9: 1 posted tx, got ${posted.length}`);
    assert(
      posted[0].description === "Groceries",
      `test 9: posted tx description="${posted[0].description}"`,
    );
    assert(pending.length >= 1, `test 9: at least 1 pending tx, got ${pending.length}`);
    assert(pending.every((t) => t.pending === true), "test 9: all pending txs must have pending=true");
    passed++;
  }

  // ── 10. XLSX transaction sheet parsed correctly ──────────────────────────
  {
    const buf = makeXlsx([
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-08-01", "Supermarket", "40.00", "", "460.00"],
      ["2026-08-02", "Freelance income", "", "500.00", "960.00"],
    ]);
    const result = parseBankFile(buf, "statement.xlsx");

    assert(result.error == null, `test 10: no error, got ${result.error}`);
    assert(result.detectedFormat === "xlsx", `test 10: detectedFormat=${result.detectedFormat}`);
    assert(result.transactions.length === 2, `test 10: 2 txs, got ${result.transactions.length}`);
    assert(result.transactions[0].debit === 40, `test 10: debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 500, `test 10: credit=${result.transactions[1].credit}`);
    passed++;
  }

  // ── 11. Non-transaction sheet ignored (multi-sheet XLSX) ─────────────────
  {
    const buf = makeXlsxMultiSheet(
      {
        name: "Summary",
        rows: [
          ["Period", "2026-08"],      // no transaction headers
          ["Total", "1234.56"],
        ],
      },
      {
        name: "Transactions",
        rows: [
          ["Date", "Description", "Amount"],
          ["2026-08-01", "Office supplies", "-120.00"],
          ["2026-08-03", "Consulting fee", "800.00"],
        ],
      },
    );
    const result = parseBankFile(buf, "report.xlsx");

    assert(result.error == null, `test 11: no error, got ${result.error}`);
    assert(result.transactions.length === 2, `test 11: 2 txs from correct sheet, got ${result.transactions.length}`);
    // Transactions sheet: -120 → debit, +800 → credit
    assert(result.transactions[0].debit === 120, `test 11: debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 800, `test 11: credit=${result.transactions[1].credit}`);
    passed++;
  }

  // ── 12. Unsupported file structure → UNSUPPORTED_BANK_FILE_FORMAT ─────────
  {
    // No recognizable header keywords anywhere
    const buf = csv([
      "col1,col2,col3",
      "foo,bar,baz",
      "aaa,bbb,ccc",
    ]);
    const result = parseBankFile(buf, "garbage.csv");

    assert(
      result.error === "UNSUPPORTED_BANK_FILE_FORMAT",
      `test 12: expected UNSUPPORTED_BANK_FILE_FORMAT, got ${result.error}`,
    );
    assert(result.transactions.length === 0, "test 12: no transactions");
    passed++;
  }

  // ── 13. Empty file → NO_TRANSACTIONS_FOUND ───────────────────────────────
  {
    const buf = csv([""]);
    const result = parseBankFile(buf, "empty.csv");

    assert(
      result.error === "NO_TRANSACTIONS_FOUND",
      `test 13: expected NO_TRANSACTIONS_FOUND, got ${result.error}`,
    );
    assert(result.transactions.length === 0, "test 13: no transactions");
    passed++;
  }

  // ── 14. Two identical-looking rows → two distinct transactions ────────────
  // The client import loop handles dedup against Firestore; the parser must
  // NOT silently collapse two separate transactions that happen to look alike.
  // Each row gets a unique rowIndex so callers can distinguish them.
  {
    const buf = csv([
      "Date,Description,Amount",
      "2026-08-01,Bus ticket,-2.50",
      "2026-08-01,Bus ticket,-2.50",   // genuinely separate purchase
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, "test 14: no error");
    assert(result.transactions.length === 2, `test 14: both rows returned, got ${result.transactions.length}`);
    assert(
      result.transactions[0].rowIndex !== result.transactions[1].rowIndex,
      "test 14: each row has a distinct rowIndex",
    );
    // Both are independently valid debit transactions
    assert(result.transactions[0].debit === 2.5, "test 14: first debit");
    assert(result.transactions[1].debit === 2.5, "test 14: second debit");
    passed++;
  }

  // ── 15. Client import loop skips pending=true rows ───────────────────────
  // Simulates the write loop in FinancePage.runImport() and
  // AIAssistantPage.confirmMoneyImport() — both guard against pending rows.
  {
    const buf = csv([
      "Date,Description,Amount",
      "2026-08-01,Posted payment,-20.00",
      "Pending,,,",                          // section header → pending mode on
      "2026-08-02,Reserved hold,-15.00",
    ]);
    const parsed = parseBankFile(buf, "statement.csv");

    // Simulate the client write loop guard
    let written = 0;
    let skipped = 0;
    for (const item of parsed.transactions) {
      if (item.pending) {
        skipped++;
        continue; // client guard: must not write pending rows
      }
      written++;
    }

    assert(written === 1, `test 15: 1 row written (posted only), got ${written}`);
    assert(skipped >= 1, `test 15: at least 1 row skipped (pending), got ${skipped}`);
    passed++;
  }

  // ── 16. Summary sheet has many rows; transaction sheet must win ──────────
  // Sheet 1 = "Overview" — many rows but no recognised transaction header.
  // Sheet 2 = "Transactions" — proper Date/Description/Amount header + real rows.
  // The scorer must choose sheet 2 despite sheet 1 having more total rows.
  {
    // Build a summary sheet: lots of label rows, no column header keywords.
    const summaryRows: string[][] = [["Account summary for August 2026"]];
    for (let i = 1; i <= 30; i++) {
      summaryRows.push([`Category ${i}`, `${(i * 12.34).toFixed(2)}`]);
    }

    const buf = makeXlsxMultiSheet(
      {
        name: "Overview",
        rows: summaryRows,       // 31 rows, no date/description/amount header
      },
      {
        name: "Transactions",
        rows: [
          ["Date", "Description", "Amount"],
          ["2026-08-01", "Rent payment", "-750.00"],
          ["2026-08-05", "Client invoice", "1200.00"],
          ["2026-08-10", "Utilities", "-85.50"],
        ],
      },
    );
    const result = parseBankFile(buf, "workbook.xlsx");

    assert(result.error == null, `test 16: no error, got ${result.error}`);
    assert(
      result.transactions.length === 3,
      `test 16: 3 txs from Transactions sheet, got ${result.transactions.length}`,
    );
    assert(result.transactions[0].debit === 750, `test 16: first tx debit=${result.transactions[0].debit}`);
    assert(result.transactions[1].credit === 1200, `test 16: second tx credit=${result.transactions[1].credit}`);
    assert(result.transactions[2].debit === 85.5, `test 16: third tx debit=${result.transactions[2].debit}`);
    passed++;
  }

  // ── 17. Date ambiguity: slash dates treated as DD/MM/YYYY (day-first) ────
  // 05/08/2026 must parse as 2026-08-05 (Aug 5), never as 2026-05-08 (May 8).
  // DD-MM-YYYY (hyphen variant) must also be supported.
  // MM/DD/YYYY is not accepted — there is no implicit month-first interpretation.
  {
    const buf = csv([
      "Date,Description,Amount",
      "05/08/2026,Slash-date payment,-45.00",      // DD/MM/YYYY → 2026-08-05
      "12.09.2026,Dot-date salary,2500.00",         // DD.MM.YYYY → 2026-09-12
      "28-02-2026,Hyphen-date refund,30.00",        // DD-MM-YYYY → 2026-02-28
      "2026-07-15,ISO already correct,-10.00",      // YYYY-MM-DD → unchanged
    ]);
    const result = parseBankFile(buf, "statement.csv");

    assert(result.error == null, `test 17: no error, got ${result.error}`);
    assert(result.transactions.length === 4, `test 17: 4 txs, got ${result.transactions.length}`);

    assert(
      result.transactions[0].date === "2026-08-05",
      `test 17: DD/MM/YYYY slash → got "${result.transactions[0].date}", want "2026-08-05"`,
    );
    assert(
      result.transactions[1].date === "2026-09-12",
      `test 17: DD.MM.YYYY dot → got "${result.transactions[1].date}", want "2026-09-12"`,
    );
    assert(
      result.transactions[2].date === "2026-02-28",
      `test 17: DD-MM-YYYY hyphen → got "${result.transactions[2].date}", want "2026-02-28"`,
    );
    assert(
      result.transactions[3].date === "2026-07-15",
      `test 17: ISO unchanged → got "${result.transactions[3].date}", want "2026-07-15"`,
    );
    passed++;
  }

  // ── 18. Signed-amount direction regression ───────────────────────────────
  //
  // Verifies that a negative signed amount is ALWAYS classified as expense
  // (debit), regardless of any status/type column value.  This is the exact
  // regression for the Case C bug where `val !== 0` allowed a negative amount
  // to enter the status-column branch, which then called Math.abs() and
  // returned a credit (income) for a negative outgoing payment.
  //
  // Sub-cases:
  //   a) "+100.00"         → income 100        (positive, period-decimal)
  //   b) "-25.00"          → expense 25        (negative, period-decimal)
  //   c) "+100,00"         → income 100        (positive, comma-decimal)
  //   d) "-25,00"          → expense 25        (negative, comma-decimal)
  //   e) "1 234,56"        → income 1234.56    (positive, space-thousands comma-decimal)
  //   f) "-1 234,56"       → expense 1234.56   (negative, space-thousands comma-decimal)
  //   g) quoted "-42.00"   → expense 42        (sign survives RFC 4180 quoting)
  //   h) status="credit transfer" + amount=-99 → MUST be expense 99 (sign wins over status)
  //   i) debit/credit columns unaffected       (Case A must still work normally)
  {
    // Sub-cases a–g: pure signed-amount column, no Status column
    const buf = csv([
      "Date,Description,Amount",
      '2026-01-01,PositivePeriod,+100.00',
      '2026-01-02,NegativePeriod,-25.00',
      '2026-01-03,PositiveComma,+100,00',
      '2026-01-04,NegativeComma,-25,00',
      '2026-01-05,PosSpaceThousands,"1 234,56"',
      '2026-01-06,NegSpaceThousands,"-1 234,56"',
      '2026-01-07,QuotedNegative,"-42.00"',
    ]);
    const r = parseBankFile(buf, "signed.csv");
    assert(r.error == null, `test 18a-g: no error, got ${r.error}`);
    assert(r.transactions.length === 7, `test 18: 7 txs, got ${r.transactions.length}`);

    // a: +100.00 → credit (income)
    assert(r.transactions[0].credit === 100 && r.transactions[0].debit === null,
      `test 18a: +100.00 → income, got credit=${r.transactions[0].credit} debit=${r.transactions[0].debit}`);

    // b: -25.00 → debit (expense)
    assert(r.transactions[1].debit === 25 && r.transactions[1].credit === null,
      `test 18b: -25.00 → expense, got debit=${r.transactions[1].debit} credit=${r.transactions[1].credit}`);

    // c: +100,00 → credit (income)
    assert(r.transactions[2].credit === 100 && r.transactions[2].debit === null,
      `test 18c: +100,00 → income, got credit=${r.transactions[2].credit}`);

    // d: -25,00 → debit (expense)
    assert(r.transactions[3].debit === 25 && r.transactions[3].credit === null,
      `test 18d: -25,00 → expense, got debit=${r.transactions[3].debit}`);

    // e: "1 234,56" → credit (income) 1234.56
    assert(r.transactions[4].credit === 1234.56 && r.transactions[4].debit === null,
      `test 18e: 1 234,56 → income 1234.56, got credit=${r.transactions[4].credit}`);

    // f: "-1 234,56" → debit (expense) 1234.56
    assert(r.transactions[5].debit === 1234.56 && r.transactions[5].credit === null,
      `test 18f: -1 234,56 → expense 1234.56, got debit=${r.transactions[5].debit}`);

    // g: quoted "-42.00" → debit (expense) 42
    assert(r.transactions[6].debit === 42 && r.transactions[6].credit === null,
      `test 18g: quoted "-42.00" → expense 42, got debit=${r.transactions[6].debit}`);

    // h: Status column with "credit transfer" + negative amount → expense (sign wins)
    const bufH = csv([
      "Date,Description,Amount,Type",
      "2026-01-01,Outgoing SEPA,-99.00,Credit transfer",
    ]);
    const rH = parseBankFile(bufH, "signed-type.csv");
    assert(rH.error == null, `test 18h: no error`);
    assert(rH.transactions.length === 1, `test 18h: 1 tx`);
    assert(
      rH.transactions[0].debit === 99 && rH.transactions[0].credit === null,
      `test 18h: negative amount + status "Credit transfer" → expense 99 (sign wins); ` +
      `got debit=${rH.transactions[0].debit} credit=${rH.transactions[0].credit}`,
    );

    // i: debit/credit columns (Case A) must remain unaffected
    const bufI = csv([
      "Date,Description,Debit,Credit",
      "2026-01-01,Expense row,50.00,",
      "2026-01-02,Income row,,200.00",
    ]);
    const rI = parseBankFile(bufI, "debitcredit.csv");
    assert(rI.error == null, `test 18i: no error`);
    assert(rI.transactions[0].debit === 50 && rI.transactions[0].credit === null,
      `test 18i: debit col → expense 50, got ${rI.transactions[0].debit}`);
    assert(rI.transactions[1].credit === 200 && rI.transactions[1].debit === null,
      `test 18i: credit col → income 200, got ${rI.transactions[1].credit}`);

    passed++;
  }

  // ── 19. D/C indicator column format (SEB-style) ──────────────────────────
  //
  // Headers:  Kuupäev;Saaja/maksja nimi;Tüüp;Deebet/Kreedit (D/C);Summa;Selgitus;Valuuta
  // Summa is UNSIGNED/POSITIVE. Direction comes from "Deebet/Kreedit (D/C)".
  // "Tüüp" (transaction type) must NEVER influence direction.
  //
  // Sub-cases:
  //   a) D + 25.00     → expense 25
  //   b) C + 100.00    → income 100
  //   c) D + 8.90      → expense 8.90
  //   d) D + 15.00     → expense 15
  //   e) C + 50.00     → income 50
  //   f) Tüüp="Credit transfer" + D → expense (Tüüp must NOT override D)
  //   g) Empty Selgitus + populated Saaja/maksja nimi → uses name as description
  //   h) Both Selgitus + Saaja/maksja nimi populated → combined, no duplication
  {
    // All Summa values are positive (unsigned).  Type column contains text that
    // would accidentally match income/expense patterns — must be ignored.
    const buf = csv([
      "Kuupäev;Saaja/maksja nimi;Tüüp;Deebet/Kreedit (D/C);Summa;Selgitus;Valuuta",
      // a: D + 25.00
      "2026-08-01;Shop Alpha;Card payment;D;25,00;Office supplies;EUR",
      // b: C + 100.00
      "2026-08-02;Client Beta;Income;C;100,00;Invoice 1001;EUR",
      // c: D + 8.90
      "2026-08-03;Shop Gamma;Card;D;8,90;;EUR",
      // d: D + 15.00
      "2026-08-04;Service Delta;Fee;D;15,00;Monthly fee;EUR",
      // e: C + 50.00
      "2026-08-05;Employer Epsilon;Salary;C;50,00;Partial advance;EUR",
      // f: Tüüp="Credit transfer" with D → must be expense (D wins)
      "2026-08-06;Outgoing Corp;Credit transfer;D;99,00;Rent payment;EUR",
      // g: empty Selgitus, populated Saaja/maksja nimi
      "2026-08-07;Payee Only Corp;Transfer;D;12,00;;EUR",
      // h: both Selgitus and Saaja/maksja nimi
      "2026-08-08;Named Party;Transfer;C;200,00;Contract work;EUR",
    ]);
    const r = parseBankFile(buf, "seb_export.csv");
    assert(r.error == null, `test 19: no error, got ${r.error}`);
    assert(r.transactions.length === 8, `test 19: 8 txs, got ${r.transactions.length}`);

    // a: D + 25.00 → expense 25
    assert(r.transactions[0].debit === 25 && r.transactions[0].credit === null,
      `test 19a: D+25 → expense; got debit=${r.transactions[0].debit} credit=${r.transactions[0].credit}`);

    // b: C + 100.00 → income 100
    assert(r.transactions[1].credit === 100 && r.transactions[1].debit === null,
      `test 19b: C+100 → income; got credit=${r.transactions[1].credit} debit=${r.transactions[1].debit}`);

    // c: D + 8.90 → expense 8.90
    assert(r.transactions[2].debit === 8.9 && r.transactions[2].credit === null,
      `test 19c: D+8.90 → expense; got debit=${r.transactions[2].debit}`);

    // d: D + 15.00 → expense 15
    assert(r.transactions[3].debit === 15 && r.transactions[3].credit === null,
      `test 19d: D+15 → expense; got debit=${r.transactions[3].debit}`);

    // e: C + 50.00 → income 50
    assert(r.transactions[4].credit === 50 && r.transactions[4].debit === null,
      `test 19e: C+50 → income; got credit=${r.transactions[4].credit}`);

    // f: Tüüp="Credit transfer" + D → expense (Tüüp must NOT override D)
    assert(r.transactions[5].debit === 99 && r.transactions[5].credit === null,
      `test 19f: D wins over Tüüp="Credit transfer"; got debit=${r.transactions[5].debit} credit=${r.transactions[5].credit}`);

    // g: empty Selgitus + populated Saaja/maksja nimi → description from name
    assert(
      r.transactions[6].description === "Payee Only Corp",
      `test 19g: empty Selgitus → name used; got "${r.transactions[6].description}"`,
    );

    // h: both fields populated and different → combined
    assert(
      r.transactions[7].description.includes("Named Party") &&
        r.transactions[7].description.includes("Contract work"),
      `test 19h: both fields → combined; got "${r.transactions[7].description}"`,
    );
    // no duplication: should not appear twice
    assert(
      r.transactions[7].description !== "Named Party: Named Party" &&
        r.transactions[7].description !== "Contract work: Contract work",
      `test 19h: no duplication in "${r.transactions[7].description}"`,
    );

    passed++;
  }

  console.log(`parseBankCsv: ${passed} passed, 0 failed`);
}

run();
