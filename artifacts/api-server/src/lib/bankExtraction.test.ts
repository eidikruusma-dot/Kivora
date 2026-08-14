/**
 * Generic unit tests for the bank-statement extraction layer.
 *
 * Self-contained — no Express or OpenAI imports.  Pure-function logic is
 * inlined so this file can be compiled and run with:
 *
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/bankExtraction.test.ts | node
 *
 * All test cases are bank-agnostic and contain ZERO user-specific amounts,
 * expected transaction counts, bank names, or account numbers.
 */

// ── Minimal interface stubs (mirrors aiUpload.ts types) ──────────────────────

interface BankTransaction {
  id: string;
  page: number;
  rowIndex: number;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  amount: number;
  direction: "income" | "expense";
  currency: string;
  needsReview: boolean;
  reviewReason?: string;
}

interface ModelTransaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: string | null;
  sourcePage: number | null;
  confidence: "high" | "medium" | "low";
}

interface ModelDocument {
  isBankStatement: boolean;
  bankName: string | null;
  accountNumber: string | null;
  currency: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  printedIncomeTotal: number | null;
  printedExpenseTotal: number | null;
}

// ── Inlined looksLikeBankStatement (kept in sync with aiUpload.ts) ───────────
// When the classifier in aiUpload.ts changes, update this copy.

function looksLikeBankStatement(text: string): boolean {
  const groupA =
    /\b(?:account|bank)\b[\s\S]{0,30}\bstatement\b/i.test(text) ||
    /\bstatement\b[\s\S]{0,30}\b(?:account|bank)\b/i.test(text) ||
    /\b(?:kontoväljavõt[et]?|pangaväljavõt[et]?|arveldusväljavõt[et]?)\b/i.test(text);

  const groupB_dash =
    /\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*(?:–|—)\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(text);
  const DATE_RE = String.raw`\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}`;
  const groupB_label = new RegExp(
    String.raw`\b(?:period|periood|statement\s+period|for\s+the\s+period|from)\b[\s\S]{0,10}` +
    DATE_RE + String.raw`[\s\S]{0,30}` + DATE_RE, "i",
  ).test(text);
  const groupB = groupB_dash || groupB_label;

  const drCrPair = /\bDR\b[\s\S]{0,200}\bCR\b|\bCR\b[\s\S]{0,200}\bDR\b/.test(text);
  const debitM  = /\b(?:debit|deebet|debiit)\b(?!\s*(?:card|kaarti?))/i.exec(text);
  const creditM = /\b(?:credit|kreedit|krediit)\b(?!\s*(?:card|kaarti?|note|märkus|limit|limiit|facility))/i.exec(text);
  const groupC =
    drCrPair ||
    (debitM !== null && creditM !== null && Math.abs(debitM.index - creditM.index) <= 150);

  const hasOpening = /\b(?:opening\s+balance|balance\s+b\/f|balance\s+brought\s+forward|algsaldo|avamissaldo|beginning\s+balance|eelmise\s+perioodi\s+lõppsaldo)\b/i.test(text);
  const hasClosing = /\b(?:closing\s+balance|balance\s+c\/f|balance\s+carried\s+forward|lõppsaldo|sulgemissaldo|ending\s+balance)\b/i.test(text);
  const groupD = hasOpening && hasClosing;

  const groupCount = [groupA, groupB, groupC, groupD].filter(Boolean).length;
  return groupCount >= 2;
}

// ── Inlined pure helpers (kept in sync with aiUpload.ts) ─────────────────────

const SUBTOTAL_RE =
  /^(väljaminekud|sissetulekud|laekumised|maksed|kokku|algsaldo|lõppsaldo|avamissaldo|sulgemissaldo|algjääk|lõppjääk|kuu alguse|kuu lõpu|lehe kokku|page total|deebet kokku|kreedit kokku)([\s:,.]|$)/i;

function isSubtotalRow(description: string): boolean {
  return SUBTOTAL_RE.test(description.trim());
}

function parseDDMMYYYY(raw: string, fallbackYear?: number): string | null {
  const trimmed = (raw ?? "").trim();
  const full = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (full) {
    const day   = parseInt(full[1], 10);
    const month = parseInt(full[2], 10);
    const year  = parseInt(full[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }
  const short = /^(\d{1,2})\.(\d{1,2})$/.exec(trimmed);
  if (short && fallbackYear) {
    const day   = parseInt(short[1], 10);
    const month = parseInt(short[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function makeTransactionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Pure functions under test ─────────────────────────────────────────────────
// These are inlined copies of normalizeBankTransaction and computeValidationStatus
// from aiUpload.ts.  When aiUpload.ts logic changes, keep these in sync.

function normalizeBankTransaction(
  row: ModelTransaction,
  rowIndex: number,
  doc: ModelDocument,
): BankTransaction {
  const reasons: string[] = [];

  // Date normalization
  const rawDate = (row.date ?? "").trim();
  let date: string | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    date = rawDate;
  } else {
    const periodYear = doc.periodFrom ? parseInt(doc.periodFrom.slice(0, 4), 10) : undefined;
    date = parseDDMMYYYY(rawDate, periodYear);
    if (!date) reasons.push(`Kuupäeva ei saanud sõeluda: "${rawDate}"`);
  }

  // Period bounds check
  if (date && doc.periodFrom && doc.periodTo) {
    if (date < doc.periodFrom || date > doc.periodTo) {
      reasons.push(`Kuupäev ${date} on väljavõtte perioodist väljas`);
    }
  }

  // Description
  const description = String(row.description ?? "").trim();
  if (!description) reasons.push("Kirjeldus puudub");

  // Reject subtotal rows
  if (description && isSubtotalRow(description)) {
    return {
      id:           makeTransactionId(),
      page:         row.sourcePage ?? 0,
      rowIndex,
      date:         date ?? rawDate,
      description,
      debit:        null,
      credit:       null,
      balance:      null,
      amount:       0,
      direction:    "expense",
      currency:     row.currency ?? doc.currency ?? "EUR",
      needsReview:  true,
      reviewReason: "Rea kirjeldus vastab kokkuvõtte reale — jäetud vahele",
    };
  }

  // Direction from debit/credit columns only
  const rawDebit  = typeof row.debit  === "number" && isFinite(row.debit)  && row.debit  > 0 ? row.debit  : null;
  const rawCredit = typeof row.credit === "number" && isFinite(row.credit) && row.credit > 0 ? row.credit : null;

  let direction: "income" | "expense" = "expense";
  let amount = 0;

  if (rawCredit !== null && rawDebit === null) {
    direction = "income";
    amount    = rawCredit;
  } else if (rawDebit !== null && rawCredit === null) {
    direction = "expense";
    amount    = rawDebit;
  } else if (rawCredit !== null && rawDebit !== null) {
    reasons.push("Mõlemad deebet ja kreedit on täidetud — veerg tuvastamata");
    amount = Math.max(rawDebit, rawCredit);
  } else {
    reasons.push("Ei deebet- ega kreeditarvutust ei leitud");
  }

  // Low confidence → always flagged
  if (row.confidence === "low") {
    reasons.push("Madal mudeli usaldusväärsus sellele reale");
  }

  const needsReview = reasons.length > 0;
  return {
    id:           makeTransactionId(),
    page:         row.sourcePage ?? 0,
    rowIndex,
    date:         date ?? rawDate,
    description,
    debit:        rawDebit,
    credit:       rawCredit,
    balance:      typeof row.balance === "number" && isFinite(row.balance) ? row.balance : null,
    amount,
    direction,
    currency:     row.currency ?? doc.currency ?? "EUR",
    needsReview,
    reviewReason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

function computeValidationStatus(
  transactions: BankTransaction[],
  doc: ModelDocument,
  calculatedIncomeTotal: number,
  calculatedExpenseTotal: number,
): "verified" | "unverified" | "review_required" {
  const TOLERANCE = 0.02;

  if (transactions.some((t) => t.needsReview)) return "review_required";

  let controlPassCount = 0;

  if (doc.printedIncomeTotal != null) {
    const diff = Math.abs(calculatedIncomeTotal - doc.printedIncomeTotal);
    if (diff > TOLERANCE) return "review_required";
    controlPassCount++;
  }

  if (doc.printedExpenseTotal != null) {
    const diff = Math.abs(calculatedExpenseTotal - doc.printedExpenseTotal);
    if (diff > TOLERANCE) return "review_required";
    controlPassCount++;
  }

  if (doc.openingBalance != null && doc.closingBalance != null) {
    const computed = doc.openingBalance + calculatedIncomeTotal - calculatedExpenseTotal;
    const diff     = Math.abs(computed - doc.closingBalance);
    if (diff > TOLERANCE) return "review_required";
    controlPassCount++;
  }

  if (controlPassCount > 0) return "verified";
  return "unverified";
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function doc(overrides: Partial<ModelDocument> = {}): ModelDocument {
  return {
    isBankStatement:     true,
    bankName:            null,
    accountNumber:       null,
    currency:            "EUR",
    periodFrom:          null,
    periodTo:            null,
    openingBalance:      null,
    closingBalance:      null,
    printedIncomeTotal:  null,
    printedExpenseTotal: null,
    ...overrides,
  };
}

function row(overrides: Partial<ModelTransaction> = {}): ModelTransaction {
  return {
    date:        "2024-01-15",
    description: "Test transaction",
    debit:       null,
    credit:      null,
    balance:     null,
    currency:    null,
    sourcePage:  1,
    confidence:  "high",
    ...overrides,
  };
}

// ── Assertion harness ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

group("1. Debit-only row → expense", () => {
  const t = normalizeBankTransaction(row({ debit: 100, credit: null }), 0, doc());
  assert(t.direction === "expense", "direction = expense");
  assert(t.amount    === 100,       "amount = debit value");
  assert(!t.needsReview,            "no needsReview");
});

group("2. Credit-only row → income", () => {
  const t = normalizeBankTransaction(row({ credit: 250.5, debit: null }), 0, doc());
  assert(t.direction === "income", "direction = income");
  assert(t.amount    === 250.5,    "amount = credit value");
  assert(!t.needsReview,           "no needsReview");
});

group("3. Both debit + credit → needsReview", () => {
  const t = normalizeBankTransaction(row({ debit: 50, credit: 50 }), 0, doc());
  assert(t.needsReview === true,   "needsReview = true");
  assert(t.reviewReason != null,   "reviewReason present");
});

group("4. Neither debit nor credit → needsReview", () => {
  const t = normalizeBankTransaction(row({ debit: null, credit: null }), 0, doc());
  assert(t.needsReview === true,   "needsReview = true");
  assert(t.reviewReason != null,   "reviewReason present");
});

group("5. Valid YYYY-MM-DD date → accepted without review flag", () => {
  const t = normalizeBankTransaction(row({ date: "2024-03-15", credit: 100 }), 0, doc());
  assert(t.date       === "2024-03-15", "date preserved");
  assert(!t.needsReview,                "no needsReview for valid ISO date");
});

group("6. DD.MM.YYYY date → normalised to ISO", () => {
  const t = normalizeBankTransaction(row({ date: "15.03.2024", credit: 100 }), 0, doc());
  assert(t.date === "2024-03-15",       "date normalised to YYYY-MM-DD");
  assert(!t.needsReview,                "no needsReview");
});

group("6b. Unparseable date → needsReview", () => {
  const t = normalizeBankTransaction(row({ date: "not-a-date", credit: 100 }), 0, doc());
  assert(t.needsReview === true,        "needsReview = true for bad date");
});

group("7. No control totals → unverified (not review_required)", () => {
  const t = normalizeBankTransaction(row({ credit: 100 }), 0, doc());
  const status = computeValidationStatus([t], doc(), 100, 0);
  assert(status === "unverified",       "status = unverified");
});

group("8. Matching printed totals → verified", () => {
  const t = normalizeBankTransaction(row({ credit: 200 }), 0, doc());
  const status = computeValidationStatus(
    [t],
    doc({ printedIncomeTotal: 200, printedExpenseTotal: 0 }),
    200, 0,
  );
  assert(status === "verified",         "status = verified");
});

group("9. Mismatching printed totals → review_required", () => {
  const t = normalizeBankTransaction(row({ credit: 200 }), 0, doc());
  const status = computeValidationStatus(
    [t],
    doc({ printedIncomeTotal: 999 }),
    200, 0,
  );
  assert(status === "review_required",  "status = review_required");
});

group("10. Missing opening/closing balance → no penalty", () => {
  const t = normalizeBankTransaction(row({ credit: 100 }), 0, doc());
  const status = computeValidationStatus([t], doc(), 100, 0);
  assert(status === "unverified",       "status = unverified when no controls");
});

group("11. Reconciling opening + closing balance → verified", () => {
  const t = normalizeBankTransaction(row({ credit: 100 }), 0, doc());
  const status = computeValidationStatus(
    [t],
    doc({ openingBalance: 500, closingBalance: 600 }), // 500+100-0=600 ✓
    100, 0,
  );
  assert(status === "verified",         "status = verified when balance reconciles");
});

group("11b. Contradicting balance → review_required", () => {
  const t = normalizeBankTransaction(row({ credit: 100 }), 0, doc());
  const status = computeValidationStatus(
    [t],
    doc({ openingBalance: 500, closingBalance: 999 }), // 500+100 ≠ 999
    100, 0,
  );
  assert(status === "review_required",  "status = review_required when balance contradicts");
});

group("12. Two identical-looking rows → distinct IDs + rowIndex", () => {
  const r = row({ credit: 50 });
  const t1 = normalizeBankTransaction(r, 0, doc());
  const t2 = normalizeBankTransaction(r, 1, doc());
  assert(t1.id !== t2.id,              "distinct IDs");
  assert(t1.rowIndex !== t2.rowIndex,  "distinct rowIndex");
});

group("13. Subtotal row → needsReview + skip reason", () => {
  const t = normalizeBankTransaction(
    row({ description: "Kokku", credit: 5000 }),
    0, doc(),
  );
  assert(t.needsReview === true,             "subtotal row flagged needsReview");
  assert((t.reviewReason ?? "").length > 0,  "reviewReason set");
});

group("14. Low-confidence row → needsReview → review_required status", () => {
  const t = normalizeBankTransaction(
    row({ credit: 75, confidence: "low" }),
    0, doc(),
  );
  assert(t.needsReview === true,        "low-confidence row flagged needsReview");
  const status = computeValidationStatus([t], doc(), 0, 0);
  assert(status === "review_required",  "status = review_required when any row needsReview");
});

group("15. Zero transactions + no controls → unverified", () => {
  const status = computeValidationStatus([], doc(), 0, 0);
  assert(status === "unverified",
    "zero transactions + no controls = unverified (not an error by itself)");
});

// ── looksLikeBankStatement classifier tests ───────────────────────────────────

// ── Negative tests: must NOT be classified as a bank statement ────────────────

group("16. Estonian invoice with IBAN + itemised dated amounts → NOT bank statement", () => {
  // Mirrors the structure of arve_26081.pdf: readable invoice, Estonian IBAN,
  // multiple line items with dates and amounts — the combination that triggered
  // the old false-positive bug.
  const text = `
ARVE Nr. 26081
Arve kuupäev: 01.08.2026
Maksetähtaeg: 15.08.2026

Müüja: OÜ Testfirma
Ostja: AS Klient

Kirjeldus                    Kogus  Ühikuhind    Summa
Konsultatsiooniteenus        10h    50.00        500.00
Reisikulud 01.07.2026        1      125.00       125.00
Materjalid 15.07.2026        5      30.00        150.00
Seadistusteenus 20.07.2026   2      75.00        150.00

Kokku (ilma KM-ta): 925.00 EUR
Käibemaks (20%):    185.00 EUR
Tasumisele kuuluv:  1 110.00 EUR

Palun tasuge arvelduskontole: EE382200221020145685 (LHV Pank)
Selgitus: Arve nr 26081
`;
  assert(looksLikeBankStatement(text) === false, "Estonian invoice must NOT be classified as bank statement");
});

group("17. Invoice with bank name + IBAN + total → NOT bank statement", () => {
  const text = `
INVOICE #INV-2026-0042
Date: 2026-08-01    Due: 2026-08-31

From: Testfirma OÜ
To:   Client AS

Services rendered:
  Software development    40h × €85    €3 400.00
  Code review             8h × €85    €680.00

Subtotal: €4 080.00
VAT 20%:  €816.00
Total:    €4 896.00

Please transfer to: Swedbank, EE962200001101014016
Reference: INV-2026-0042
`;
  assert(looksLikeBankStatement(text) === false, "Invoice with bank name + IBAN must NOT be classified as bank statement");
});

group("18. Utility bill with previous/current readings and amounts → NOT bank statement", () => {
  const text = `
ELEKTRIARVEET

Klient: Mari Tamm, Tamme 5, Tallinn
Arvestusperiood: juuli 2026

Eelmine näit (01.07.2026): 12 345 kWh
Praegune näit (01.08.2026): 12 567 kWh
Tarbimine: 222 kWh × 0.1200 €/kWh = 26.64 €

Võrguteenus: 5.00 €
Käibemaks (20%): 6.33 €

Tasumisele kuuluv: 37.97 €
Palun tasuge: EE382200221020145685
`;
  assert(looksLikeBankStatement(text) === false, "Utility bill must NOT be classified as bank statement");
});

group("19. Receipt with many dated/amount entries → NOT bank statement", () => {
  const text = `
KVIITUNG

Kaupluse nimi: Supermarket OÜ
Kassa: 003  Kviitung: 884412

01.08.2026 14:32

Piim 1L                  1.29
Leib 800g                1.89
Juust 200g               2.49
Õun 1kg                  1.99
Kohv 250g                3.49
Kartul 2kg               1.99
Jogurti 4-pak            2.39
Pasta 500g               0.99
Tomatid 500g             1.79
Liha 300g                4.99

Kokku:                  24.29 EUR
Makse: pangakaart       24.29 EUR
Tagasi:                  0.00 EUR

Aitäh ostu eest!
`;
  assert(looksLikeBankStatement(text) === false, "Receipt with many entries must NOT be classified as bank statement");
});

// ── Positive tests: must be classified as a bank statement ────────────────────

group("20. Estonian bank statement → bank statement", () => {
  const text = `
LHV Pank
KONTOVÄLJAVÕTE

Konto omanik: Mari Tamm
Konto number: EE382200221020145685
Valuuta: EUR
Väljavõtte periood: 01.07.2026 – 31.07.2026

Algsaldo: 1 250.00
Lõppsaldo: 2 145.00

Kuupäev     Kirjeldus                           Deebet    Kreedit    Jääk
01.07.2026  Palgalaekumine                                1 500.00   2 750.00
05.07.2026  Kortermaja haldus OÜ                200.00              2 550.00
12.07.2026  Toidupood AS                         85.40              2 464.60
18.07.2026  Tagasimakse laekumine                          30.00    2 494.60
`;
  assert(looksLikeBankStatement(text) === true, "Estonian bank statement must be classified as bank statement");
});

group("21. English bank statement → bank statement", () => {
  const text = `
NATIONAL BANK
BANK STATEMENT

Account Holder: John Smith
Account Number: GB29NWBK60161331926819
Currency: GBP
Statement Period: 01/07/2026 – 31/07/2026

Opening Balance: 1,250.00
Closing Balance: 2,145.00

Date        Description                  Debit       Credit      Balance
01/07/2026  Salary Payment                           1,500.00    2,750.00
05/07/2026  Direct Debit Utilities       200.00                  2,550.00
12/07/2026  Supermarket Purchase          85.40                  2,464.60
18/07/2026  Refund Received                             30.00    2,494.60
`;
  assert(looksLikeBankStatement(text) === true, "English bank statement must be classified as bank statement");
});

group("22. Bank statement without an IBAN → bank statement if structure is clear", () => {
  // No IBAN/account number — classification must rely on structure alone.
  const text = `
ACCOUNT STATEMENT

Statement Period: 01/07/2026 – 31/07/2026

Opening Balance:   500.00
Closing Balance:   743.50

Date        Description          Debit    Credit   Balance
03/07/2026  Transfer in                   300.00   800.00
10/07/2026  Online purchase       56.50            743.50
`;
  assert(looksLikeBankStatement(text) === true, "Bank statement without IBAN must still be classified as bank statement");
});

group("23. Bank statement from an unknown bank → bank statement", () => {
  // No named bank that any heuristic could recognise; classification from structure only.
  const text = `
GENERIC FINANCIAL INSTITUTION
ACCOUNT STATEMENT

Account: 0099-4421-8833-0012
Period: 01.08.2026 – 31.08.2026

Opening Balance: 3 000.00 EUR
Closing Balance: 2 874.15 EUR

Date         Reference        Debit      Credit     Balance
02.08.2026   REF-0012-A                  500.00     3 500.00
07.08.2026   REF-0033-B       625.85               2 874.15
`;
  assert(looksLikeBankStatement(text) === true, "Unknown-bank statement must be classified as bank statement");
});



console.log(`\n${"═".repeat(32)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(32)}`);
if (failed > 0) process.exit(1);
