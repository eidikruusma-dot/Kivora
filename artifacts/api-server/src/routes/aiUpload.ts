import { Router } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { PDFDocument } from "pdf-lib";
import { postProcessBankTransactions } from "../lib/postProcessBankTransactions";
import type { BankPostProcessResult } from "../lib/postProcessBankTransactions";
import { parseBankFile } from "../lib/parseBankCsv";
import {
  extractStructuralPdfBuffer,
  type StructuralPdfBufferResult,
} from "../lib/extractStructuralPdfBuffer";
import type { RawTransactionRow } from "../lib/classifyTransactionRows";

const router = Router();
const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

// In-memory storage — we only process the file content, never save to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Shared types (mirrored in AIAssistantPage.tsx) ───────────────────────────

export interface BankTransaction {
  id: string; // unique per transaction — used for import dedup
  page: number; // 1-based page number where this row was found
  rowIndex: number; // 0-based position within page
  date: string; // ISO: "YYYY-MM-DD"
  description: string; // exact text from statement
  debit: number | null; // raw debit column value (expense signal); null if column empty
  credit: number | null; // raw credit column value (income signal); null if column empty
  balance: number | null; // running account balance from balance column; preserved but never used for direction
  amount: number; // always positive; derived from debit/credit in application code
  direction: "income" | "expense"; // derived deterministically: credit>0 → income, debit>0 → expense
  currency: string;
  needsReview?: boolean; // deterministic validation failed — must not auto-import
  reviewReason?: string; // human-readable reason(s) for review flag
  /** True when the transaction was found inside a pending/reservations section.
   *  Pending rows must NOT be written to Firestore as normal posted transactions.
   *  They are returned in the response so the client can display them separately. */
  pending?: boolean;
}

export interface BankMeta {
  // ── Identity ────────────────────────────────────────────────────────────────
  statementId: string; // UUID identifying this extraction run
  bank?: string;
  accountNumber?: string;
  period?: { from: string; to: string };
  // ── Balances ────────────────────────────────────────────────────────────────
  openingBalance?: number;
  closingBalance?: number;
  // ── Printed summary totals (copied from statement labels, never computed) ──
  summaryIncome?: number;
  summaryExpenses?: number;
  // ── Page coverage ───────────────────────────────────────────────────────────
  pagesTotal: number;
  pagesProcessed: number;
  // ── Computed totals — always in application code, never from LLM ──────────
  incomeCount: number;
  expenseCount: number;
  calculatedIncomeTotal: number;
  calculatedExpenseTotal: number;
  // ── Validation outcome ──────────────────────────────────────────────────────
  /** Three-state validation result.
   *  verified       — structurally valid + at least one control check passes
   *  unverified     — structurally valid but no control totals/balances present
   *  review_required — ambiguous rows OR control total mismatch
   */
  validationStatus: "verified" | "unverified" | "review_required";
  importAllowed: boolean; // true for verified + unverified; false for review_required
  validationErrors: string[]; // human-readable reasons (non-empty when review_required)
  // ── Legacy fields kept for backward compat — not used by new pipeline ──────
  reconciliationOk?: boolean;
  reconciliationNote?: string;
  extractionComplete?: boolean;
  totalIncome?: number;
  totalExpenses?: number;
  needsReviewCount?: number;
  firstPassCount?: number;
  secondPassRecovered?: number;
}

interface PdfExtractResult {
  text: string; // plain-text summary (always present)
  usedOCR: boolean;
  transactions?: BankTransaction[];
  bankMeta?: BankMeta;
}

// ── Helper: strip binary/garbage artifacts from pdf.js text output ──────────
//
// pdf.js produces garbage Unicode when a PDF's embedded font lacks a ToUnicode
// CMap (common with proprietary bank/invoice fonts). The garbage looks like:
//   ■ (U+25A0 Black Square — pdf.js "unknown glyph" placeholder)
//   Private-use-area chars (U+E000–U+F8FF — unmapped glyph indices)
//   U+FFFD Replacement chars
//   C0/C1 control codes
// After stripping, we check whether enough meaningful text survived. If not,
// If not enough meaningful text survives, isGarbledText() returns true
// and extractPdf() falls through to the OCR path (extractScannedPdf).

function sanitizePdfText(raw: string): string {
  return (
    raw
      // C0 control codes (keep HT \x09, LF \x0A, CR \x0D)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      // DEL and C1 controls (U+007F–U+009F)
      .replace(/[\x7F-\x9F]/g, "")
      // Unicode Replacement char + non-chars (U+FFFD, U+FFFE, U+FFFF)
      .replace(/[\uFFFD\uFFFE\uFFFF]/g, "")
      // Private Use Area (U+E000–U+F8FF) — unmapped glyph indices from CIDFonts
      .replace(/[\uE000-\uF8FF]/g, "")
      // Box Drawing / Block Elements / Geometric Shapes (U+2500–U+25FF)
      // This range includes ■ (U+25A0) which pdf.js emits for unknown glyphs
      .replace(/[\u2500-\u25FF]/g, "")
      // pdf-parse v2 page separators (e.g. "-- 1 of 3 --")
      .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
      // Collapse runs of 3+ newlines to 2
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple spaces/tabs (but not newlines) to one space
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/**
 * Returns true if the text is semantically unreadable (garbled CIDFont encoding,
 * broken character mapping, etc.) and should trigger the OCR fallback.
 *
 * The previous approach counted "ASCII printable" characters as meaningful, which
 * silently accepted SEB Estonia PDFs whose broken font mapping produces
 * readable-looking ASCII symbols such as  !" #$% ABB.0? C=DEA  — these are 100%
 * ASCII printable but carry zero semantic content.
 *
 * The new checks use semantic / structural metrics that garbled text fails:
 *   1. Minimum real word count (≥2 consecutive letters)
 *   2. Character-class counts → punctuation density and alphanumeric ratio
 *   3. Long symbol runs (4+ consecutive non-alphanumeric chars)
 *   4. Word-to-token ratio
 *   5. Bank-statement anchor check (fires only for already-suspicious encoding)
 *   6. Final safety floor on readable words and letter density
 */
function isGarbledText(text: string): boolean {
  if (!text) return true;

  const noSpace = text.replace(/\s/g, "");
  if (noSpace.length < 10) return true;

  // ── 1. Real word count ────────────────────────────────────────────────────
  // A "word" is ≥2 consecutive Latin or Estonian letters.
  // Garbled encodings produce symbol clusters, not letter sequences.
  const wordMatches = text.match(/[a-zA-ZäöõüšžÄÖÕÜŠŽ]{2,}/g) ?? [];
  if (wordMatches.length < 10) return true;

  // ── 2. Character class ratios ─────────────────────────────────────────────
  const letters = (text.match(/[a-zA-ZäöõüšžÄÖÕÜŠŽ]/g) ?? []).length;
  const digits = (text.match(/[0-9]/g) ?? []).length;
  // Punctuation: only ASCII symbol characters (not spaces, not letters, not digits)
  const puncts = (text.match(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~`]/g) ?? [])
    .length;

  const punctDensity = noSpace.length > 0 ? puncts / noSpace.length : 1;
  const readableRatio =
    noSpace.length > 0 ? (letters + digits) / noSpace.length : 0;
  const letterRatio = noSpace.length > 0 ? letters / noSpace.length : 0;

  // ── 3. Punctuation density > 35 % ────────────────────────────────────────
  // SEB garbled text: ~50 % punctuation (!" #$% ABB.0? C=DEA …).
  // Clean bank statement: ~10–15 % (date separators, decimal commas).
  if (punctDensity > 0.35) return true;

  // ── 4. Alphanumeric ratio < 40 % ─────────────────────────────────────────
  if (readableRatio < 0.4) return true;

  // ── 5. Long symbol runs ───────────────────────────────────────────────────
  // 4+ consecutive non-alphanumeric chars appear when glyph indices are
  // mapped to punctuation blocks.
  const longSymbolRuns = text.match(/[^a-zA-Z0-9äöõüšžÄÖÕÜŠŽ\s]{4,}/g) ?? [];
  if (longSymbolRuns.length > 3) return true;

  // ── 6. Word-to-token ratio ────────────────────────────────────────────────
  // In garbled text, most whitespace-separated "tokens" are symbol clusters.
  // Require ≥30 % of tokens to be real words.
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length > 15) {
    const wordRatio = wordMatches.length / tokens.length;
    if (wordRatio < 0.3) return true;
  }

  // ── 7. Final safety floor ────────────────────────────────────────────────
  // After all heuristics, reject if the absolute readable word count is still
  // very low relative to the text length.
  if (noSpace.length > 200 && wordMatches.length < 5) return true;

  return false;
}

// ── PDF text extraction via pdf-parse v2 ─────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { PDFParse } = (globalThis as any).require("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer; verbosity?: number }) => {
      getText(): Promise<{ text: string }>;
      destroy(): Promise<void>;
    };
  };
  const parser = new PDFParse({ data: buffer, verbosity: 0 });
  const result = await parser.getText();
  await parser.destroy();
  return sanitizePdfText(result.text as string);
}

// ── Document extraction types ──────────────────────────────────────────────────
//
// Column semantics are DETECTED from the actual document on every run.
// No bank-specific profiles are hardcoded. The model reads each page and reports
// what it sees; application code performs all deterministic logic (direction
// derivation, validation, reconciliation).

type ColumnSemantic =
  | "date" // column with transaction dates
  | "description" // column with payee names, payer names, or references
  | "debit" // money leaving the account; blank on credit rows
  | "credit" // money entering the account; blank on debit rows
  | "balance" // running account balance — NEVER a transaction amount
  | "reference" // archive numbers, transaction IDs
  | "other"; // unclassified

interface DetectedColumn {
  position: number; // 1-based, left-to-right order in the table
  header: string; // exact header text from document ("" if no header row visible)
  semantic: ColumnSemantic;
}

interface PageSchema {
  columns: DetectedColumn[];
}

interface SummaryField {
  value: number;
  sourceLabel: string; // exact label text as it appeared in the document
  page: number; // 1-based page where this was found
}

// ── Page analysis prompt ───────────────────────────────────────────────────────
// Transaction-only call per page: structure detection + row extraction.
// Metadata (bank, period, balances, summary totals) is extracted by a SEPARATE
// buildMetadataPrompt() call so the two concerns never compete for token budget.
function buildPagePrompt(pageNum: number, totalPages: number): string {
  return `\
You are reading page ${pageNum} of ${totalPages} of a financial document.

Analyze this page visually. In order:
1. Identify the page type.
2. Detect any transaction table and map each column to its semantic meaning.
3. Extract every transaction row, preserving exact column values.

Return ONLY valid JSON — no markdown, no explanation:
{
  "pageType": "account_header" | "transactions" | "summary" | "mixed" | "other",
  "isBankStatement": true,
  "tableSchema": {
    "columns": [
      { "position": 1, "header": "exact column header text or empty string", "semantic": "date" }
    ]
  } | null,
  "transactions": [
    {
      "rawDate": "DD.MM.YYYY",
      "description": "exact payee or payer text from document",
      "debit": 123.45,
      "credit": null,
      "balance": 876.55,
      "currency": "EUR"
    }
  ]
}

═══════════════════════════════════════════════════════════
STEP 2 — COLUMN SEMANTIC DETECTION
═══════════════════════════════════════════════════════════
For each column in the transaction table, assign one semantic value:
  "date"        — column with transaction dates
  "description" — payee names, payer names, or payment references
  "debit"       — money LEAVING the account; cell is BLANK/EMPTY on credit transaction rows
  "credit"      — money ENTERING the account; cell is BLANK/EMPTY on debit transaction rows
  "balance"     — running account balance that changes after every transaction
  "reference"   — archive numbers, transaction IDs, reference numbers
  "other"       — any other column type

HOW TO CORRECTLY DISTINGUISH DEBIT vs CREDIT vs BALANCE:

  BALANCE column characteristics:
    • Has a numeric value on EVERY transaction row — it is NEVER blank
    • The value changes on every row (increases after credits, decreases after debits)
    • Usually the RIGHTMOST numeric column in the table
    • Common labels: "Balance", "Jääk", "Saldo", "Running balance", "Jääk pärast"

  DEBIT column characteristics:
    • Has a value ONLY when money left the account on this row
    • Cell is blank/empty on rows where money entered the account
    • Common labels: "Debit", "Deebet", "Amount out", "Paid", "Väljamaksed", "Makse"

  CREDIT column characteristics:
    • Has a value ONLY when money entered the account on this row
    • Cell is blank/empty on rows where money left the account
    • Common labels: "Credit", "Kreedit", "Amount in", "Received", "Laekumised", "Sissetulek"

  KEY TEST — look at 5 or more consecutive transaction rows:
    If a numeric column has a value on EVERY row → it is "balance"
    If a numeric column alternates between having a value and being blank → it is "debit" or "credit"

  If the document has no visible column headers, infer semantics from content:
    The rightmost numeric column with a value on every single row → "balance"
    A numeric column that is sometimes blank → "debit" or "credit"

List ALL visible columns left to right in tableSchema.columns, including non-numeric ones.
If no transaction table is visible on this page: "tableSchema": null.

═══════════════════════════════════════════════════════════
STEP 3 — TRANSACTION EXTRACTION
═══════════════════════════════════════════════════════════
For each transaction row:
  rawDate:     Copy the exact date string from the date column (e.g. "15.01.2024"). Do NOT convert.
  description: Exact text from the description/payee column. Preserve all characters including accented.
  debit:       Number from the debit column for this row. null if the cell is blank.
  credit:      Number from the credit column for this row. null if the cell is blank.
  balance:     Number from the balance column for this row. null if no balance column exists.
  currency:    Currency code (e.g. "EUR"). Default to "EUR" if not shown per-row.

INVARIANT: A transaction row NEVER has both debit and credit non-null simultaneously.
If a row appears to have both, re-examine your column mapping — one of those columns is
almost certainly the balance column being misidentified as debit or credit.

MULTI-LINE DESCRIPTIONS:
Some transactions span two visual lines. The second line has no date and no amounts —
only continuation text (reference number, note, etc.).
Merge both lines into one description joined with a space. Emit ONE transaction, not two.

Number format: "1 234,56" → 1234.56 (space = thousands separator, comma = decimal point).

ROWS TO SKIP — these are NOT individual transactions:
  ✗ Column header rows (rows containing column title labels, not data)
  ✗ Opening/closing balance rows with labels like "Opening balance", "Algsaldo", "Lõppsaldo"
  ✗ Period total rows with labels like "Total credits", "Sissetulekud", "Väljaminekud"
  ✗ Page subtotal rows with labels like "Page total", "Lehe kokku"
  ✗ Blank rows, page numbers, bank logo / header / footer areas

If this page has no transaction rows: "transactions": [].

PAGE TYPE VALUES:
  "account_header" — account info, period, balances but no transaction table rows
  "transactions"   — contains individual transaction rows
  "summary"        — contains period-end summary totals
  "mixed"          — contains multiple of the above on the same page
  "other"          — blank, cover, or unrelated content`;
}

// ── Retry prompt — uses the schema detected in the first pass ─────────────────
// Provides the model with positional column guidance derived from what it
// reported in the initial extraction, so second-pass column mapping matches first.
function buildPageRetryPrompt(
  pageNum: number,
  totalPages: number,
  alreadyFound: string,
  missingAmount: string,
  schema: PageSchema | null,
): string {
  const colGuide =
    schema && schema.columns.length > 0
      ? schema.columns
          .map((c) => {
            const role =
              c.semantic === "debit"
                ? "— DEBIT (money OUT of account; blank on credit rows)"
                : c.semantic === "credit"
                  ? "— CREDIT (money IN to account; blank on debit rows)"
                  : c.semantic === "balance"
                    ? "— RUNNING BALANCE — NEVER copy as debit or credit"
                    : `— ${c.semantic}`;
            return `  Column ${c.position}${c.header ? ` "${c.header}"` : ""}: ${role}`;
          })
          .join("\n")
      : "  (No column schema detected from first pass — use the same detection rules)";

  return `\
SECOND SCAN — page ${pageNum} of ${totalPages}.

The first scan was incomplete. Missing approximately: ${missingAmount}.

ALREADY FOUND on this page — do NOT return these again:
${alreadyFound || "(none)"}

Scan again carefully. Find every transaction row NOT listed above.
Pay close attention to rows near page edges, footers, and rows with two-line descriptions.

COLUMN STRUCTURE DETECTED ON THIS PAGE:
${colGuide}

If any row appears to have both debit and credit non-null, re-examine column positions —
the balance column is likely being misread as debit or credit.

Return ONLY valid JSON:
{
  "transactions": [
    {
      "rawDate": "DD.MM.YYYY",
      "description": "exact payee or payer text",
      "debit": 123.45,
      "credit": null,
      "balance": 876.55,
      "currency": "EUR"
    }
  ]
}

Same rules: rawDate in DD.MM.YYYY; NEVER both debit and credit non-null; exact description.
Return { "transactions": [] } if no additional rows found.`;
}

// ── Correction prompt — used when extracted totals are TOO HIGH (Fix B) ──────
// When the first pass extracted more than the statement says, ask the model to
// inspect the extracted rows and find duplicates, balance rows incorrectly treated
// as transactions, or misclassified debit/credit values.
// The model MUST NOT add more transactions — only correct or flag existing ones.
function buildPageCorrectionPrompt(
  pageNum: number,
  totalPages: number,
  extractedRows: string,
  overAmountStr: string,
  schema: PageSchema | null,
): string {
  const colGuide =
    schema && schema.columns.length > 0
      ? schema.columns
          .map((c) => {
            const role =
              c.semantic === "debit"
                ? "— DEBIT (money OUT; blank on credit rows)"
                : c.semantic === "credit"
                  ? "— CREDIT (money IN; blank on debit rows)"
                  : c.semantic === "balance"
                    ? "— RUNNING BALANCE — NEVER a transaction amount"
                    : `— ${c.semantic}`;
            return `  Column ${c.position}${c.header ? ` "${c.header}"` : ""}: ${role}`;
          })
          .join("\n")
      : "  (No column schema detected)";

  return `\
CORRECTION SCAN — page ${pageNum} of ${totalPages}.

The first scan extracted approximately ${overAmountStr} MORE than the statement total.
This means some rows are wrong. DO NOT add new transactions.

Examine the extracted rows below and identify any that are:
  • Exact or near-exact duplicates (same date + amount + description appearing twice)
  • Balance rows or subtotal rows incorrectly included as transactions
  • Rows with swapped debit/credit columns
  • Rows with a misread amount (wrong decimal, extra digit, etc.)

EXTRACTED ROWS ON THIS PAGE:
${extractedRows || "(none)"}

COLUMN STRUCTURE:
${colGuide}

Return ONLY valid JSON — no markdown, no explanation:
{
  "added": [],
  "corrected": [
    {
      "matchDate": "YYYY-MM-DD",
      "matchDescription": "first 40 chars to identify the row",
      "matchAmount": 123.45,
      "correctedDebit": 123.45,
      "correctedCredit": null,
      "reason": "brief explanation"
    }
  ],
  "removed": [
    {
      "matchDate": "YYYY-MM-DD",
      "matchDescription": "first 40 chars",
      "matchAmount": 123.45,
      "reason": "brief explanation"
    }
  ],
  "uncertain": [
    {
      "matchDate": "YYYY-MM-DD",
      "matchDescription": "first 40 chars",
      "matchAmount": 123.45,
      "reason": "why this row is suspicious but cannot be confirmed"
    }
  ]
}

Rules:
  "added" MUST always be an empty array — do not suggest new transactions.
  "removed" rows are deleted from the import entirely.
  "uncertain" rows are flagged for manual review and block automated import.
  Return { "added": [], "corrected": [], "removed": [], "uncertain": [] } if nothing is wrong.`;
}

// ── Metadata-only prompt — runs as a separate parallel track ──────────────────
// Focused exclusively on document-level control values. Never asks for or returns
// transaction rows. Runs in parallel with buildPagePrompt() so the two tasks
// never compete for the same token budget.
function buildMetadataPrompt(pageNum: number, totalPages: number): string {
  return `\
You are reading page ${pageNum} of ${totalPages} of a bank statement.

Your ONLY task is to find document-level metadata and statement-period control values
that are PRINTED on this page as labelled summary fields.

DO NOT extract transaction rows.
DO NOT return transaction data.
DO NOT calculate any totals from transaction rows.
Copy ONLY values that appear as explicitly labelled document-level fields.

Return ONLY valid JSON — no markdown, no explanation:
{
  "bank": "bank name as printed" | null,
  "accountNumber": "IBAN or account number as printed" | null,
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } | null,

  "openingBalance": { "found": true, "value": 123.45, "sourceLabel": "exact printed label" }
                  | { "found": false },

  "closingBalance": { "found": true, "value": 123.45, "sourceLabel": "exact printed label" }
                  | { "found": false },

  "summaryIncome":  { "found": true, "value": 123.45, "sourceLabel": "exact printed label" }
                  | { "found": false },

  "summaryExpenses":{ "found": true, "value": 123.45, "sourceLabel": "exact printed label" }
                  | { "found": false }
}

FIELD RULES:

bank:
  Name of the bank as printed in a header or footer. null if not clearly printed.

accountNumber:
  IBAN or account number as printed. null if not shown on this page.

period:
  Statement period start and end dates (NOT individual transaction dates).
  Examples: "Period: 01.01.2024 – 31.01.2024", "Väljavõtte periood".
  Convert DD.MM.YYYY → YYYY-MM-DD. null if not shown.

openingBalance — account balance at the START of the statement period.
  Accept labels such as (semantic examples, not an exhaustive list):
    Opening balance, Algsaldo, Avamissaldo, Algjääk, Kuu alguse saldo, Starting balance

closingBalance — account balance at the END of the statement period.
  Accept labels such as:
    Closing balance, Lõppsaldo, Sulgemissaldo, Lõppjääk, Kuu lõpu saldo, Ending balance

summaryIncome — total money RECEIVED during the entire statement period, as a printed aggregate.
  Accept labels such as:
    Total credits, Total income, Sissetulekud, Laekumised, Krediteeriti kokku

summaryExpenses — total money PAID during the entire statement period, as a printed aggregate.
  Accept labels such as:
    Total debits, Total expenses, Väljaminekud, Maksed, Debiteeriti kokku

These label lists are SEMANTIC EXAMPLES only.
Do NOT hard-code any specific monetary amount or any user-specific value.

REJECT the following — return { "found": false } for any field where the only candidates are:
  • Individual transaction amounts
  • Running balance column values (the "Jääk"/"Balance" column that changes on every row)
  • Page subtotals ("Page total", "Lehe kokku")
  • Per-page partial sums
  • Opening/closing balances mistaken for income/expense totals
  • Income/expense totals mistaken for opening/closing balances

sourceLabel must be the EXACT text label printed next to the value in the document.

If a field is not clearly present on this page: return { "found": false }.
Do NOT guess. Do NOT infer. Do NOT compute.`;
}

// ── Application-code subtotal/summary row filter ─────────────────────────────
// Rejects rows deterministically that the LLM should have skipped but did not.
// Patterns matched at the START of the description (case-insensitive):
//   Balance lines:  Algsaldo, Lõppsaldo, Kuu alguse saldo, Kuu lõpu saldo,
//                   Avamissaldo, Sulgemissaldo, Algjääk, Lõppjääk
//   Section totals: Sissetulekud, Väljaminekud, Laekumised, Maksed, Kokku
//   Page subtotals: Lehe kokku, Page total, Deebet kokku, Kreedit kokku
const SUBTOTAL_RE =
  /^(väljaminekud|sissetulekud|laekumised|maksed|kokku|algsaldo|lõppsaldo|avamissaldo|sulgemissaldo|algjääk|lõppjääk|kuu alguse|kuu lõpu|lehe kokku|page total|deebet kokku|kreedit kokku)([\s:,.]|$)/i;

function isSubtotalRow(description: string): boolean {
  return SUBTOTAL_RE.test(description.trim());
}

// ── Deterministic date parser ─────────────────────────────────────────────────
// Parses DD.MM.YYYY strictly — never swaps day and month.
// The LLM is instructed to preserve raw dates; this code does the conversion.
function parseDDMMYYYY(raw: string, fallbackYear?: number): string | null {
  const trimmed = (raw ?? "").trim();

  // Full date: DD.MM.YYYY
  const full = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (full) {
    const day = parseInt(full[1], 10);
    const month = parseInt(full[2], 10);
    const year = parseInt(full[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null; // values out of range → flag for review
  }

  // Short date: DD.MM — use period year as fallback
  const short = /^(\d{1,2})\.(\d{1,2})$/.exec(trimmed);
  if (short && fallbackYear) {
    const day = parseInt(short[1], 10);
    const month = parseInt(short[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

// ── Unique transaction ID ─────────────────────────────────────────────────────
function makeTransactionId(): string {
  // crypto.randomUUID() is available in Node ≥14.17
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback for older Node
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Validate and classify raw LLM transactions ────────────────────────────────
// Derives direction deterministically from debitAmount/creditAmount columns.
// Flags needsReview for anything that fails deterministic validation.
// pageNum is 1-based; used to populate BankTransaction.page on each result.
function validateRawTransactions(
  rawTxns: unknown[],
  period?: { from: string; to: string },
  pageNum = 0,
): BankTransaction[] {
  const periodYear = period ? parseInt(period.from.slice(0, 4), 10) : undefined;

  const results: BankTransaction[] = [];

  for (let rowIndex = 0; rowIndex < rawTxns.length; rowIndex++) {
    const t = rawTxns[rowIndex];
    if (!t || typeof t !== "object") continue;
    const row = t as Record<string, unknown>;
    const reasons: string[] = [];

    // ── Description (checked early so subtotal filter can run before wasting work)
    const description = String(row.description ?? "").trim();

    // ── Application-code subtotal filter ─────────────────────────────────────
    // Reject section-total rows that the LLM should have skipped but didn't.
    if (isSubtotalRow(description)) continue;

    if (!description) reasons.push("Kirjeldus puudub");

    // ── Date ──────────────────────────────────────────────────────────────────
    const rawDate = String(row.rawDate ?? "").trim();
    let date = parseDDMMYYYY(rawDate, periodYear);

    if (!date) {
      // The model may have produced YYYY-MM-DD despite instructions — accept it silently.
      // Do NOT push a review reason: a valid ISO date is not an error.
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        date = rawDate;
      } else {
        reasons.push(`Kuupäeva ei saanud sõeluda: "${rawDate}"`);
      }
    }

    if (date && period) {
      if (date < period.from || date > period.to) {
        reasons.push(
          `Kuupäev ${date} on väljavõtte perioodist väljas (${period.from}–${period.to})`,
        );
      }
    }

    // ── Amount and direction — from columns only ───────────────────────────────
    // Direction is NEVER derived from description, merchant name, or payee type.
    // credit > 0 → income; debit > 0 → expense. This is the only rule.
    // The balance column value is preserved separately and NEVER used for direction.
    const rawDebit =
      typeof row.debit === "number"
        ? row.debit
        : typeof row.debitAmount === "number"
          ? row.debitAmount
          : null;
    const rawCredit =
      typeof row.credit === "number"
        ? row.credit
        : typeof row.creditAmount === "number"
          ? row.creditAmount
          : null;
    const rawBalance =
      typeof row.balance === "number" && isFinite(row.balance as number)
        ? (row.balance as number)
        : null;
    const debitAmt = rawDebit !== null && rawDebit > 0 ? rawDebit : null;
    const creditAmt = rawCredit !== null && rawCredit > 0 ? rawCredit : null;

    let amount: number;
    let direction: "income" | "expense";

    if (debitAmt !== null && creditAmt === null) {
      // Debit-only → expense (money leaves account)
      amount = debitAmt;
      direction = "expense";
    } else if (creditAmt !== null && debitAmt === null) {
      // Credit-only → income (money enters account)
      amount = creditAmt;
      direction = "income";
    } else if (debitAmt !== null && creditAmt !== null) {
      // Both columns filled — ambiguous; flag for review
      amount = Math.max(debitAmt, creditAmt);
      direction = debitAmt >= creditAmt ? "expense" : "income";
      reasons.push(
        `Mõlemad deebet (${debitAmt}) ja kreedit (${creditAmt}) täidetud — suund ebaselge`,
      );
    } else {
      // Neither column has data — cannot determine direction
      reasons.push("Ei deebet- ega kreeditarvutust ei leitud");
      amount = 0;
      direction = "expense";
    }

    if (amount <= 0) reasons.push(`Kehtetu summa: ${amount}`);

    // ── Currency ──────────────────────────────────────────────────────────────
    const currency = String(row.currency ?? "EUR").toUpperCase();
    const SUPPORTED = ["EUR", "USD", "GBP", "SEK", "NOK", "CHF", "JPY"];
    if (!SUPPORTED.includes(currency)) {
      reasons.push(`Toetamata valuuta: ${currency}`);
    }

    const needsReview = reasons.length > 0 || amount <= 0;

    results.push({
      id: makeTransactionId(),
      page: pageNum,
      rowIndex,
      date: date ?? "",
      description: description || "(kirjeldus puudub)",
      debit: debitAmt,
      credit: creditAmt,
      balance: rawBalance,
      amount,
      currency,
      direction,
      ...(needsReview && {
        needsReview: true,
        reviewReason: reasons.join("; "),
      }),
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// DIRECT PDF EXTRACTION — production bank-statement path
// ONE OpenAI Responses API call per upload.  No page splitting.  No retries
// unless the response is technically malformed or returns zero rows from a
// declared bank statement.
// ══════════════════════════════════════════════════════════════════════════════

// ── Model output shape (from json_schema structured output) ───────────────────

export interface ModelTransaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: string | null;
  sourcePage: number | null;
  confidence: "high" | "medium" | "low";
}

export interface ModelDocument {
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

export interface ModelBankStatement {
  document: ModelDocument;
  transactions: ModelTransaction[];
  warnings: Array<{ code: string; message: string }>;
}


// ── Bank-agnostic extraction prompt ──────────────────────────────────────────
// No bank names, no specific labels, no user amounts are hard-coded.
// Semantic examples are provided to illustrate intent, not to constrain format.

export interface PageBatchContext {
  /** 1-based, absolute page number (within the full original document) of this batch's first page. */
  startPage: number;
  /** 1-based, absolute page number of this batch's last page. */
  endPage: number;
  /** Total page count of the full original document. */
  totalPages: number;
}

export function buildBankStatementExtractionPrompt(batch: PageBatchContext): string {
  const pagesInBatch = batch.endPage - batch.startPage + 1;
  const isExcerpt = batch.totalPages > pagesInBatch;

  const excerptNote = isExcerpt
    ? `\nThis PDF is an EXCERPT: pages ${batch.startPage}-${batch.endPage} of a longer ${batch.totalPages}-page bank statement. Extract only what is visible on THESE pages.
Number sourcePage starting at 1 for the first page of THIS excerpt (application code converts it to the absolute page number) — do not try to guess the absolute page number yourself.
Document-level fields (bank name, account number, currency, period, openingBalance, closingBalance, printedIncomeTotal, printedExpenseTotal) may not all be visible on these specific pages. Return null for any field that is not explicitly visible here — never infer, estimate, or carry over a value from outside this excerpt.\n`
    : "";

  return `\
You are a financial document reader.  Analyze the attached PDF.
${excerptNote}
Return a JSON object with EXACTLY this structure:
{
  "document": {
    "isBankStatement": true,
    "bankName": "string or null",
    "accountNumber": "string or null",
    "currency": "string or null",
    "periodFrom": "YYYY-MM-DD or null",
    "periodTo": "YYYY-MM-DD or null",
    "openingBalance": 0.00,
    "closingBalance": 0.00,
    "printedIncomeTotal": 0.00,
    "printedExpenseTotal": 0.00
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "debit": 0.00,
      "credit": 0.00,
      "balance": 0.00,
      "currency": "EUR",
      "sourcePage": 1,
      "confidence": "high"
    }
  ],
  "warnings": [
    { "code": "string", "message": "string" }
  ]
}

Use null for numeric fields that are not present on the document.
The confidence field must be one of: "high", "medium", or "low".

═══════════════════════════════════════════════
STEP 1 — DOCUMENT IDENTIFICATION
═══════════════════════════════════════════════
Determine whether this is a bank account statement.
Set isBankStatement accordingly.

If it is not a bank statement: set isBankStatement=false, return empty transactions[].

═══════════════════════════════════════════════
STEP 2 — DOCUMENT METADATA
═══════════════════════════════════════════════
Extract only values that are EXPLICITLY PRINTED as document-level labels:

bankName        — name of the issuing bank, or null
accountNumber   — IBAN or account number, or null
currency        — primary currency code (e.g. "EUR"), or null
periodFrom      — statement period start in YYYY-MM-DD, or null
periodTo        — statement period end in YYYY-MM-DD, or null
openingBalance  — balance at period start, or null
closingBalance  — balance at period end, or null

printedIncomeTotal  — total money IN for the entire period, as a single
                      explicitly printed aggregate label.
                      Examples of such labels (semantic, not exhaustive):
                        Total credits, Total income, Sissetulekud, Laekumised,
                        Krediteeriti kokku
                      Return null if not explicitly printed.
                      DO NOT sum transaction rows.

printedExpenseTotal — total money OUT for the entire period, printed aggregate.
                      Examples: Total debits, Total expenses, Väljaminekud,
                        Maksed, Debiteeriti kokku
                      Return null if not explicitly printed.
                      DO NOT sum transaction rows.

DO NOT confuse:
  • Running balance values (the per-row "Jääk"/"Balance" column) with openingBalance/closingBalance
  • Per-page subtotals with printedIncomeTotal/printedExpenseTotal
  • Individual transaction amounts with any aggregate field

═══════════════════════════════════════════════
STEP 3 — TRANSACTION TABLE DETECTION
═══════════════════════════════════════════════
Identify the transaction table.  Determine which column is:
  date        — transaction date
  description — payee / payer / reference text
  debit       — money leaving the account (blank on credit rows)
  credit      — money entering the account (blank on debit rows)
  balance     — running balance after the transaction (NEVER blank, changes every row)

KEY RULE: debit and credit are NEVER both non-null on the same row.
If a column has a value on EVERY row → it is the running balance, not debit or credit.
If a column is sometimes blank → it is debit or credit.

═══════════════════════════════════════════════
STEP 4 — TRANSACTION EXTRACTION
═══════════════════════════════════════════════
Extract EVERY genuine transaction row exactly once.

COMPLETENESS IS CRITICAL:
- Read the transaction table sequentially from the first visible transaction row to the last.
- Do not sample, summarize, truncate, or omit repetitive-looking rows.
- Repeated merchants, repeated amounts, and repeated descriptions are separate transactions when they appear on separate rows.
- Do not stop after finding enough examples.
- Before returning the result, make a final top-to-bottom pass over the transaction table and verify that every visible transaction row has been included exactly once.
- If a visible row cannot be read confidently, include it with low confidence rather than silently omitting it.

For each transaction:
  date        — as it appears in the date column.  Do NOT convert.
                If already YYYY-MM-DD, return as-is.
                If DD.MM.YYYY, return as-is (application code normalises).
  description — exact text from description/payee column.
                Merge multi-line descriptions belonging to one transaction.
  debit       — number from the debit column, or null if the cell is blank
  credit      — number from the credit column, or null if the cell is blank
  balance     — number from the running balance column, or null if absent
  currency    — currency for this row (default to document currency)
  sourcePage  — 1-based page number where this row appears, or null
  confidence  — "high"  : row is clearly a transaction
                "medium": row is probably a transaction but layout is ambiguous
                "low"   : row may be a transaction but you are uncertain

Number format: "1 234,56" → 1234.56 (space = thousands, comma = decimal).

ROWS TO SKIP — return these as warnings, not as transactions:
  ✗ Column header rows
  ✗ Opening/closing balance rows
  ✗ Statement-period summary total rows
  ✗ Page subtotal rows
  ✗ Blank rows, page numbers, logos, headers, footers

If you skip a row that looks like it could be a transaction, add a warning.

═══════════════════════════════════════════════
STEP 5 — WARNINGS
═══════════════════════════════════════════════
Add a warning for each of the following:
  • Any row that appeared to be a transaction but was skipped
  • Rows where column mapping was ambiguous
  • Any page that could not be read
  • Any other extraction uncertainty

Each warning has a short code (e.g. "AMBIGUOUS_ROW", "PAGE_UNREADABLE") and a brief message.
Do not add warnings for normal, clearly-readable transactions.`;
}

// ── Normalize one model transaction row → canonical BankTransaction ───────────
// Direction is derived ONLY from debit/credit column values.
// Date is normalized deterministically: YYYY-MM-DD accepted directly,
// DD.MM.YYYY parsed by parseDDMMYYYY.  Other formats → needsReview.

export function normalizeBankTransaction(
  row: ModelTransaction,
  rowIndex: number,
  doc: ModelDocument,
): BankTransaction {
  const reasons: string[] = [];

  // ── Date normalization ────────────────────────────────────────────────────
  const rawDate = (row.date ?? "").trim();
  let date: string | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    date = rawDate; // already ISO — accept silently, no review reason
  } else {
    const periodYear = doc.periodFrom
      ? parseInt(doc.periodFrom.slice(0, 4), 10)
      : undefined;
    date = parseDDMMYYYY(rawDate, periodYear);
    if (!date) reasons.push(`Kuupäeva ei saanud sõeluda: "${rawDate}"`);
  }

  // ── Period bounds check (only when period is known) ───────────────────────
  if (date && doc.periodFrom && doc.periodTo) {
    if (date < doc.periodFrom || date > doc.periodTo) {
      reasons.push(
        `Kuupäev ${date} on väljavõtte perioodist väljas (${doc.periodFrom}–${doc.periodTo})`,
      );
    }
  }

  // ── Description ───────────────────────────────────────────────────────────
  const description = String(row.description ?? "").trim();
  if (!description) reasons.push("Kirjeldus puudub");

  // Reject application-code subtotal rows the model should have skipped
  if (description && isSubtotalRow(description)) {
    return {
      id: makeTransactionId(),
      page: row.sourcePage ?? 0,
      rowIndex,
      date: date ?? rawDate,
      description,
      debit: null,
      credit: null,
      balance: null,
      amount: 0,
      direction: "expense",
      currency: row.currency ?? doc.currency ?? "EUR",
      needsReview: true,
      reviewReason: "Rea kirjeldus vastab kokkuvõtte reale — jäetud vahele",
    };
  }

  // ── Direction from debit/credit columns only ──────────────────────────────
  const rawDebit =
    typeof row.debit === "number" && isFinite(row.debit) && row.debit > 0
      ? row.debit
      : null;
  const rawCredit =
    typeof row.credit === "number" && isFinite(row.credit) && row.credit > 0
      ? row.credit
      : null;

  let direction: "income" | "expense" = "expense";
  let amount = 0;

  if (rawCredit !== null && rawDebit === null) {
    direction = "income";
    amount = rawCredit;
  } else if (rawDebit !== null && rawCredit === null) {
    direction = "expense";
    amount = rawDebit;
  } else if (rawCredit !== null && rawDebit !== null) {
    reasons.push("Mõlemad deebet ja kreedit on täidetud — veerg tuvastamata");
    amount = Math.max(rawDebit, rawCredit);
  } else {
    reasons.push("Ei deebet- ega kreeditarvutust ei leitud");
  }

  // ── Low-confidence rows always flagged for review ─────────────────────────
  if (row.confidence === "low") {
    reasons.push("Madal mudeli usaldusväärsus sellele reale");
  }

  const needsReview = reasons.length > 0;
  return {
    id: makeTransactionId(),
    page: row.sourcePage ?? 0,
    rowIndex,
    date: date ?? rawDate,
    description,
    debit: rawDebit,
    credit: rawCredit,
    balance:
      typeof row.balance === "number" && isFinite(row.balance)
        ? row.balance
        : null,
    amount,
    direction,
    currency: row.currency ?? doc.currency ?? "EUR",
    needsReview,
    reviewReason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

// computeValidationStatus() was removed — its logic lives in postProcessBankTransactions()
// (TOLERANCE = 0.01 in reconcileStructuralTransactions, not 0.02 here).

// ── AI bank-statement extraction — production fallback ─────────────────────────
//
// Splits the PDF into bounded page batches (AI_EXTRACTION_PAGES_PER_BATCH pages
// each), extracts every batch with its own OpenAI Responses API call, then
// deterministically merges the results. This replaces sending the entire PDF
// as a single call: a long, multi-page scanned statement could exceed the
// model's ability to enumerate every row in one pass (either a hard cutoff —
// response.status === "incomplete" — or the model simply under-reading a very
// long document while still reporting status "completed"). Splitting into
// small page batches keeps each individual call's input and expected output
// far below any limit, and every batch is independently verified before the
// merged result is trusted.
//
// A short statement (the overwhelming majority in practice) still fits in a
// single batch, so it makes exactly one API call — identical cost to before.
//
// Reconciliation runs only ONCE, downstream, on the fully merged result
// (buildBankResultFromModel -> postProcessBankTransactions) — never per batch.
// If any batch fails for any reason, the whole extraction fails: no partial
// merged result is ever assembled or returned.

const AI_EXTRACTION_PAGES_PER_BATCH = 5;

export interface PdfPageBatch {
  buffer: Buffer;
  startPage: number; // 1-based, inclusive
  endPage: number; // 1-based, inclusive
}

/** Splits a PDF buffer into contiguous, non-overlapping page-range buffers. */
export async function splitPdfIntoPageBatches(
  buffer: Buffer,
  pagesPerBatch: number = AI_EXTRACTION_PAGES_PER_BATCH,
): Promise<PdfPageBatch[]> {
  const source = await PDFDocument.load(buffer);
  const totalPages = source.getPageCount();
  const batches: PdfPageBatch[] = [];

  for (let start = 0; start < totalPages; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch, totalPages);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    const batchDoc = await PDFDocument.create();
    const copiedPages = await batchDoc.copyPages(source, indices);
    for (const page of copiedPages) batchDoc.addPage(page);
    const bytes = await batchDoc.save();

    batches.push({
      buffer: Buffer.from(bytes),
      startPage: start + 1,
      endPage: end,
    });
  }

  return batches;
}

// Why json_object instead of json_schema strict:
//   With strict schema, a token-truncated response returns EMPTY output
//   (the response is dropped because truncated JSON fails schema validation).
//   With json_object the model returns whatever JSON it produced and we can
//   parse it, even when a batch is large enough to approach the token limit.
//
// max_output_tokens is set high (16 384) per batch; with bounded page batches
// this ceiling is reached only in pathological cases (e.g. an unusually dense
// single page), and status is still checked explicitly below.
//
// Throws:
//   - Any OpenAI SDK error verbatim — never wraps in PDF_NO_TEXT
//   - Error("PDF_MODEL_OUTPUT_TRUNCATED") when response.status === "incomplete"
//     (the model was cut off — most commonly by max_output_tokens — while still
//     generating. output_text is populated regardless of status (it is built by
//     concatenating whatever output_text content parts exist), so an incomplete
//     response can still contain a syntactically valid JSON object with a SHORT
//     transactions[] array. status must be checked explicitly, before trusting
//     a successful JSON.parse.
//   - Error("PDF_EMPTY_MODEL_OUTPUT")  when the model returns no text at all
//   - Error("PDF_INVALID_JSON")        when the response cannot be parsed as JSON

async function callModelForPdfBatch(
  buffer: Buffer,
  filename: string,
  batch: PageBatchContext,
): Promise<ModelBankStatement> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    // Empty or non-Buffer input is a server-side programming error, not a
    // "document has no content" situation. Use BANK_IMPORT_SERVICE_ERROR so
    // the bank-import catch returns 502 rather than misusing PDF_NO_TEXT.
    throw new Error("BANK_IMPORT_SERVICE_ERROR");
  }

  const batchLabel = `pages ${batch.startPage}-${batch.endPage}/${batch.totalPages}`;

  const uploaded = await openai.files.create({
    file: await toFile(buffer, filename, { type: "application/pdf" }),
    purpose: "user_data",
  });

  console.log(
    `[BANK IMPORT AI] ${filename}: batch ${batchLabel} file uploaded (${buffer.length} bytes)`,
  );

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.responses.create as any)({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploaded.id },
            {
              type: "input_text",
              text: buildBankStatementExtractionPrompt(batch),
            },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
      temperature: 0,
      max_output_tokens: 16384,
    });

    // The Responses API populates output_text by concatenating whatever
    // output_text content parts exist, regardless of status — so a response
    // cut off mid-generation (status: "incomplete") can still yield a
    // non-empty, sometimes still-parseable output_text. status and
    // incomplete_details must be checked explicitly; they are never implied
    // by a successful JSON.parse.
    const typedResponse = response as {
      output_text?: string;
      status?: string;
      incomplete_details?: { reason?: string } | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };

    const outputText: string = typedResponse.output_text?.trim() ?? "";
    const status = typedResponse.status ?? "unknown";
    const incompleteReason = typedResponse.incomplete_details?.reason ?? null;
    const usage = typedResponse.usage;

    // Safe diagnostic logging: counts and status only — never transaction
    // contents, names, balances, or account identifiers.
    console.log(
      `[BANK IMPORT AI] ${filename}: batch ${batchLabel} status=${status} incomplete_reason=${incompleteReason ?? "none"} ` +
        `output_tokens=${usage?.output_tokens ?? "unknown"} input_tokens=${usage?.input_tokens ?? "unknown"} ` +
        `output_text length=${outputText.length}`,
    );

    if (status === "incomplete") {
      console.error(
        `[BANK IMPORT AI] ${filename}: batch ${batchLabel} MODEL OUTPUT TRUNCATED — status=incomplete reason=${incompleteReason ?? "unknown"}`,
      );
      throw new Error("PDF_MODEL_OUTPUT_TRUNCATED");
    }

    if (!outputText) {
      throw new Error("PDF_EMPTY_MODEL_OUTPUT");
    }

    let parsed: ModelBankStatement;
    try {
      parsed = JSON.parse(outputText) as ModelBankStatement;
    } catch {
      console.error(
        `[BANK IMPORT AI] JSON parse failed for ${filename} batch ${batchLabel}: ${outputText.slice(0, 120)}`,
      );
      throw new Error("PDF_INVALID_JSON");
    }

    return parsed;
  } finally {
    try {
      await openai.files.delete(uploaded.id);
    } catch (deleteErr) {
      const msg =
        deleteErr instanceof Error ? deleteErr.message : "unknown error";
      console.warn(`[BANK IMPORT AI] File cleanup failed: ${msg}`);
    }
  }
}

export interface ModelBankStatementBatch {
  result: ModelBankStatement;
  startPage: number;
  endPage: number;
}

function transactionFingerprint(t: ModelTransaction): string {
  return [t.date ?? "", t.description ?? "", t.debit ?? "", t.credit ?? "", t.balance ?? "", t.currency ?? ""].join(
    "|",
  );
}

/**
 * Removes exact-duplicate rows introduced at a batch boundary — the only
 * realistic source of duplication once the PDF is split into non-overlapping
 * page batches: a transaction row whose visual position sits exactly on the
 * boundary can occasionally be read by both the batch ending there and the
 * batch beginning there. A row is dropped only when an EARLIER row (by
 * absolute page) has an identical date + description + debit + credit +
 * balance + currency AND sits on the same or an adjacent absolute page.
 *
 * Does NOT collapse genuinely repeated transactions (e.g. two identical
 * coffee purchases on the same day) that are not page-adjacent — those are
 * real, distinct rows and are preserved.
 */
export function dedupeAdjacentDuplicateTransactions(
  transactions: ModelTransaction[],
): ModelTransaction[] {
  const result: ModelTransaction[] = [];
  const lastKeptPageByFingerprint = new Map<string, number>();

  for (const t of transactions) {
    const fingerprint = transactionFingerprint(t);
    const page = t.sourcePage ?? -1;
    const lastPage = lastKeptPageByFingerprint.get(fingerprint);

    if (lastPage !== undefined && Math.abs(page - lastPage) <= 1) {
      continue; // duplicate at/adjacent to a batch boundary — drop
    }

    lastKeptPageByFingerprint.set(fingerprint, page);
    result.push(t);
  }

  return result;
}

/**
 * Deterministically merges per-batch extraction results into one statement.
 *
 * - transactions: concatenated in batch (ascending absolute page) order, with
 *   each row's sourcePage remapped from excerpt-relative to absolute. Batches
 *   are non-overlapping and already in ascending page order, and each batch's
 *   own row order is preserved, so the merged array is in the same overall
 *   visual document order a single non-batched call over the whole PDF would
 *   have produced. This is intentional: downstream (postProcessBankTransactions)
 *   applies its chronological sort exactly once, exactly as it always has for
 *   the AI path — merging must not pre-sort or reorder anything itself.
 * - document metadata: openingBalance/bankName/accountNumber/currency/periodFrom
 *   take the first non-null value found across batches (earliest page order);
 *   closingBalance/periodTo take the last non-null value found (latest page
 *   order). printedIncomeTotal/printedExpenseTotal take the first non-null
 *   value (a statement-wide total is normally printed once).
 * - isBankStatement: true if ANY batch's excerpt was recognised as bank
 *   statement content (a batch that happens to be a cover/disclaimer page must
 *   not veto an otherwise valid statement).
 */
export function mergeModelBankStatements(
  batches: ModelBankStatementBatch[],
): ModelBankStatement {
  const isBankStatement = batches.some((b) => b.result.document.isBankStatement);

  const firstNonNull = <K extends keyof ModelDocument>(
    key: K,
  ): ModelDocument[K] => {
    for (const b of batches) {
      const value = b.result.document[key];
      if (value !== null && value !== undefined) return value;
    }
    return null as ModelDocument[K];
  };

  const lastNonNull = <K extends keyof ModelDocument>(
    key: K,
  ): ModelDocument[K] => {
    for (let i = batches.length - 1; i >= 0; i--) {
      const value = batches[i].result.document[key];
      if (value !== null && value !== undefined) return value;
    }
    return null as ModelDocument[K];
  };

  const mergedDocument: ModelDocument = {
    isBankStatement,
    bankName: firstNonNull("bankName"),
    accountNumber: firstNonNull("accountNumber"),
    currency: firstNonNull("currency"),
    periodFrom: firstNonNull("periodFrom"),
    periodTo: lastNonNull("periodTo"),
    openingBalance: firstNonNull("openingBalance"),
    closingBalance: lastNonNull("closingBalance"),
    printedIncomeTotal: firstNonNull("printedIncomeTotal"),
    printedExpenseTotal: firstNonNull("printedExpenseTotal"),
  };

  const transactions: ModelTransaction[] = [];
  for (const batch of batches) {
    for (const row of batch.result.transactions) {
      const relativePage = row.sourcePage ?? 1;
      transactions.push({
        ...row,
        sourcePage: batch.startPage + relativePage - 1,
      });
    }
  }

  const warnings = batches.flatMap((b) => b.result.warnings ?? []);

  return {
    document: mergedDocument,
    transactions: dedupeAdjacentDuplicateTransactions(transactions),
    warnings,
  };
}

async function extractBankStatementViaOpenAI(
  buffer: Buffer,
  filename: string,
): Promise<ModelBankStatement> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("BANK_IMPORT_SERVICE_ERROR");
  }

  const pageBatches = await splitPdfIntoPageBatches(buffer);
  if (pageBatches.length === 0) {
    throw new Error("BANK_IMPORT_SERVICE_ERROR");
  }
  const totalPages = pageBatches[pageBatches.length - 1].endPage;

  console.log(
    `[BANK IMPORT AI] ${filename}: split into ${pageBatches.length} batch(es) of up to ` +
      `${AI_EXTRACTION_PAGES_PER_BATCH} page(s) each (${totalPages} page(s) total)`,
  );

  // Sequential, not parallel: deterministic order, bounded concurrent OpenAI
  // usage. Any single batch failure aborts the whole extraction immediately —
  // a partial merged result is never assembled or returned.
  const batchResults: ModelBankStatementBatch[] = [];
  for (const pageBatch of pageBatches) {
    const result = await callModelForPdfBatch(pageBatch.buffer, filename, {
      startPage: pageBatch.startPage,
      endPage: pageBatch.endPage,
      totalPages,
    });
    batchResults.push({
      result,
      startPage: pageBatch.startPage,
      endPage: pageBatch.endPage,
    });
  }

  const merged = mergeModelBankStatements(batchResults);
  console.log(
    `[BANK IMPORT AI] ${filename}: merged ${batchResults.length} batch(es) into ${merged.transactions.length} transaction(s)`,
  );
  return merged;
}


// ── Lightweight bank-statement detector (Fix F) ──────────────────────────────
// Returns true when readable PDF text matches ≥2 independent pattern families.
// Used to route readable bank statements through structured extraction even when
// the PDF text layer is clean — so transactions are validated and reconciled.
/**
 * Heuristic classifier: does this extracted text look like a bank/account statement?
 *
 * Uses four STRUCTURAL groups. IBAN, bank name, currency, generic dates, and
 * generic amounts are NOT inputs and cannot contribute to classification.
 * Requires ≥ 2 groups to fire (conservative: prefer false negatives).
 *
 * Group A — Statement-identity wording
 *   "statement" within ~30 chars of "account" or "bank", or known compound terms.
 *   Covers English variants without a language dictionary. Estonian compound words
 *   (kontoväljavõte / pangaväljavõte) matched as high-confidence literals.
 *
 * Group B — Account-activity period (date range)
 *   Two dates forming a range, either with an en/em dash between them (the most
 *   common bank-statement header pattern) or introduced by a period-type label.
 *   An invoice date + due date in separate labelled fields does NOT match.
 *
 * Group C — Debit and credit as paired ledger-column concepts
 *   Both "debit" and "credit" (or "DR"/"CR") within 150 chars of each other,
 *   with exclusions for "debit card", "credit card", "credit note", "credit limit".
 *   Proximity means they are likely adjacent column headers, not incidental mentions.
 *
 * Group D — Opening AND closing balance as a pair
 *   Both halves must match. "previous balance" / "current balance" (utility-bill
 *   language) is deliberately excluded from both patterns.
 */
function looksLikeBankStatement(text: string): boolean {
  // ── Group A: Statement-identity wording ──────────────────────────────────────
  const groupA =
    /\b(?:account|bank)\b[\s\S]{0,30}\bstatement\b/i.test(text) ||
    /\bstatement\b[\s\S]{0,30}\b(?:account|bank)\b/i.test(text) ||
    /\b(?:kontoväljavõt[et]?|pangaväljavõt[et]?|arveldusväljavõt[et]?)\b/i.test(
      text,
    );

  // ── Group B: Account-activity period (date range) ────────────────────────────
  // Pattern 1: two European-format dates separated by an en/em dash
  const groupB_dash =
    /\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*(?:–|—)\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(
      text,
    );
  // Pattern 2: period-type label followed by two dates within 40 chars
  const DATE_RE = String.raw`\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}`;
  const groupB_label = new RegExp(
    String.raw`\b(?:period|periood|statement\s+period|for\s+the\s+period|from)\b[\s\S]{0,10}` +
      DATE_RE +
      String.raw`[\s\S]{0,30}` +
      DATE_RE,
    "i",
  ).test(text);
  const groupB = groupB_dash || groupB_label;

  // ── Group C: Debit and credit as paired ledger-column concepts ───────────────
  // DR/CR abbreviations are bank-statement-specific; match anywhere.
  const drCrPair = /\bDR\b[\s\S]{0,200}\bCR\b|\bCR\b[\s\S]{0,200}\bDR\b/.test(
    text,
  );
  // Debit/credit: match only when not followed by card/note/limit/facility.
  const debitM = /\b(?:debit|deebet|debiit)\b(?!\s*(?:card|kaarti?))/i.exec(
    text,
  );
  const creditM =
    /\b(?:credit|kreedit|krediit)\b(?!\s*(?:card|kaarti?|note|märkus|limit|limiit|facility))/i.exec(
      text,
    );
  const groupC =
    drCrPair ||
    (debitM !== null &&
      creditM !== null &&
      Math.abs(debitM.index - creditM.index) <= 150);

  // ── Group D: Opening AND closing balance as a pair ───────────────────────────
  const hasOpening =
    /\b(?:opening\s+balance|balance\s+b\/f|balance\s+brought\s+forward|algsaldo|avamissaldo|beginning\s+balance|eelmise\s+perioodi\s+lõppsaldo)\b/i.test(
      text,
    );
  const hasClosing =
    /\b(?:closing\s+balance|balance\s+c\/f|balance\s+carried\s+forward|lõppsaldo|sulgemissaldo|ending\s+balance)\b/i.test(
      text,
    );
  const groupD = hasOpening && hasClosing;

  // ── Classification: ≥ 2 structural groups required ───────────────────────────
  const groupCount = [groupA, groupB, groupC, groupD].filter(Boolean).length;
  return groupCount >= 2;
}

// ── Generic scanned-PDF reader ────────────────────────────────────────────────
// Used ONLY for garbled/image-only PDFs that are not bank statements.
// Sends the PDF to GPT-4o as a single input_file with a plain "read this
// document" instruction — no bank-specific schema, no json_schema format.
// Returns the full document text so the AI can answer questions about any
// document type (contract, receipt, form, report, resume, etc.).

async function extractScannedPdf(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; usedOCR: true }> {
  const b64 = `data:application/pdf;base64,${buffer.toString("base64")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses.create as any)({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          { type: "input_file", filename, file_data: b64 },
          {
            type: "input_text",
            text: "Read this document and extract the information needed to understand its contents. Preserve all important labels, dates, amounts, account details, table rows, transaction descriptions, and other factual fields. For long prose sections, summarize faithfully instead of reproducing them verbatim. Return only the extracted document content.",
          },
        ],
      },
    ],
    temperature: 0,
    max_output_tokens: 4096,
  });
  const text = (
    (response as { output_text?: string }).output_text ?? ""
  ).trim();
  // The vision model returned no text. This is empty model output — the model
  // could not extract content from this document — NOT "the document has no text
  // layer". Using PDF_EMPTY_MODEL_OUTPUT keeps the error taxonomy precise:
  //   PDF_NO_TEXT       → document has genuinely no readable/extractable content
  //   PDF_EMPTY_MODEL_OUTPUT → API call succeeded but model returned nothing
  if (!text) throw new Error("PDF_EMPTY_MODEL_OUTPUT");
  return { text, usedOCR: true };
}

// ── Shared bank-PDF result ─────────────────────────────────────────────────────

interface BankPdfResult {
  isBankStatement: boolean;
  transactions?: BankTransaction[];
  bankMeta?: BankMeta;
  plainText: string;
  usedOCR: boolean;
}

// ── Normalize one RawTransactionRow → BankTransaction ─────────────────────────
// Direction derives ONLY from debit/credit values — same as normalizeBankTransaction().

function rawRowToBankTransaction(
  row: RawTransactionRow,
  _idx: number,
): BankTransaction {
  const reasons: string[] = [];
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
  } else if (debitAmt !== null && creditAmt !== null) {
    amount = Math.max(debitAmt, creditAmt);
    direction = debitAmt >= creditAmt ? "expense" : "income";
    reasons.push(
      `Mõlemad deebet (${debitAmt}) ja kreedit (${creditAmt}) täidetud — suund ebaselge`,
    );
  } else {
    reasons.push("Ei deebet- ega kreeditarvutust ei leitud");
    amount = 0;
    direction = "expense";
  }

  const needsReview = reasons.length > 0 || amount <= 0;
  return {
    id: makeTransactionId(),
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
    ...(needsReview && {
      needsReview: true,
      reviewReason: reasons.join("; "),
    }),
  };
}

// ── Build BankMeta from post-processing result ────────────────────────────────

function buildBankMeta(
  post: BankPostProcessResult<BankTransaction>,
  controls: { openingBalance: number | null; closingBalance: number | null },
  pagesTotal: number,
  docMeta?: {
    bank?: string;
    period?: { from: string; to: string };
    accountNumber?: string;
  },
): BankMeta {
  return {
    statementId: makeTransactionId(),
    ...(docMeta?.bank != null && { bank: docMeta.bank }),
    ...(docMeta?.period != null && { period: docMeta.period }),
    ...(docMeta?.accountNumber != null && {
      accountNumber: docMeta.accountNumber,
    }),
    openingBalance: controls.openingBalance ?? undefined,
    closingBalance: controls.closingBalance ?? undefined,
    // The structural and AI-model pipelines both read every page unconditionally
    // (no partial-page skip logic exists anywhere in the extraction pipeline),
    // so pagesProcessed always equals the observed page count.
    pagesTotal,
    pagesProcessed: pagesTotal,
    incomeCount: post.incomeCount,
    expenseCount: post.expenseCount,
    calculatedIncomeTotal: post.calculatedIncomeTotal,
    calculatedExpenseTotal: post.calculatedExpenseTotal,
    validationStatus: post.validationStatus,
    importAllowed: post.importAllowed,
    validationErrors: post.validationErrors,
    needsReviewCount: post.reviewCount,
    totalIncome: post.calculatedIncomeTotal,
    totalExpenses: post.calculatedExpenseTotal,
    reconciliationOk: post.reconciliationOk,
    extractionComplete: post.importAllowed,
  };
}

// ── Build result from structural extraction ───────────────────────────────────

function buildBankResultFromStructural(
  structural: StructuralPdfBufferResult,
  plainText: string,
): BankPdfResult {
  const rawTxns = structural.transactions.map((row, idx) =>
    rawRowToBankTransaction(row, idx),
  );
  // structural.transactions is already chronologically sorted by
  // extractStructuralPdfBuffer (needed for its own internal reconciliation
  // output). postProcessBankTransactions must NOT re-sort it: its sort
  // algorithm reverses same-day transaction order to recover chronological
  // order from raw newest-first input, and is not idempotent — applying it a
  // second time to already-sorted input silently re-reverses same-day rows,
  // which breaks the running-balance chain and cascades into false
  // needsReview flags for every later transaction.
  const post = postProcessBankTransactions(
    rawTxns,
    {
      openingBalance: structural.controls.openingBalance,
      closingBalance: structural.controls.closingBalance,
      printedIncomeTotal: structural.controls.printedIncomeTotal,
      printedExpenseTotal: structural.controls.printedExpenseTotal,
    },
    { alreadyChronological: true },
  );
  const bankMeta = buildBankMeta(
    post,
    {
      openingBalance: structural.controls.openingBalance,
      closingBalance: structural.controls.closingBalance,
    },
    structural.pagesTotal,
  );
  console.log(
    `[PDF BANK] Structural: ${post.transactions.length} txns, status=${post.validationStatus}`,
  );
  return {
    isBankStatement: true,
    transactions: post.transactions,
    bankMeta,
    plainText,
    usedOCR: false,
  };
}

// ── Build result from AI model extraction ────────────────────────────────────

function buildBankResultFromModel(
  model: ModelBankStatement,
  plainText: string,
  usedOCR: boolean,
): BankPdfResult {
  const rawTxns = model.transactions.map((row, idx) =>
    normalizeBankTransaction(row, idx, model.document),
  );
  const post = postProcessBankTransactions(rawTxns, {
    openingBalance: model.document.openingBalance,
    closingBalance: model.document.closingBalance,
    printedIncomeTotal: model.document.printedIncomeTotal,
    printedExpenseTotal: model.document.printedExpenseTotal,
  });
  // The model reports which page each row came from; use the highest
  // observed page number as the page count (same convention as the
  // structural path — no partial-page skip logic exists in either pipeline).
  const pagesTotal = model.transactions.reduce(
    (max, t) => Math.max(max, t.sourcePage ?? 1),
    model.transactions.length > 0 ? 1 : 0,
  );
  const bankMeta = buildBankMeta(
    post,
    {
      openingBalance: model.document.openingBalance,
      closingBalance: model.document.closingBalance,
    },
    pagesTotal,
    {
      bank: model.document.bankName ?? undefined,
      period:
        model.document.periodFrom && model.document.periodTo
          ? {
              from: model.document.periodFrom,
              to: model.document.periodTo,
            }
          : undefined,
      accountNumber: model.document.accountNumber ?? undefined,
    },
  );
  console.log(
    `[PDF BANK] AI model: ${post.transactions.length} txns, status=${post.validationStatus}`,
  );
  return {
    isBankStatement: true,
    transactions: post.transactions,
    bankMeta,
    plainText,
    usedOCR,
  };
}

// ── AI extraction with bounded retry ─────────────────────────────────────────
//
// The AI/OCR extraction path is not perfectly repeatable: the identical PDF
// can produce a different same-day transaction sequence between separate
// upload attempts (confirmed in production — same file, same size, two
// uploads, two different transaction counts and two different reconciliation
// failures). reorderSameDayGroupsByBalanceChain() in postProcessBankTransactions
// resolves the common case (rows present but mis-ordered) deterministically
// and for free, with no extra API cost. It cannot help when the extraction
// itself is genuinely incomplete or wrong for that attempt — for that
// residual case, retry the WHOLE extraction (all batches) once more before
// giving up. Each attempt is independently subject to every existing
// check (per-batch truncation detection, merge, dedup, reordering,
// reconciliation); attempts are never mixed — the returned result is always
// one complete, self-consistent attempt, never a partial combination.

const AI_EXTRACTION_MAX_ATTEMPTS = 2;

async function extractBankStatementWithRetry(
  buffer: Buffer,
  filename: string,
  plainText: string,
  usedOCR: boolean,
): Promise<BankPdfResult> {
  let lastResult: BankPdfResult | null = null;

  for (let attempt = 1; attempt <= AI_EXTRACTION_MAX_ATTEMPTS; attempt++) {
    const model = await extractBankStatementViaOpenAI(buffer, filename);

    if (!model.document.isBankStatement) {
      return { isBankStatement: false, plainText, usedOCR };
    }

    const result = buildBankResultFromModel(model, plainText, usedOCR);
    lastResult = result;

    if (result.bankMeta?.importAllowed) {
      console.log(
        `[BANK IMPORT AI] ${filename}: attempt ${attempt}/${AI_EXTRACTION_MAX_ATTEMPTS} reconciled successfully`,
      );
      return result;
    }

    console.warn(
      `[BANK IMPORT AI] ${filename}: attempt ${attempt}/${AI_EXTRACTION_MAX_ATTEMPTS} did not reconcile ` +
        `(importAllowed=false)${attempt < AI_EXTRACTION_MAX_ATTEMPTS ? " — retrying" : " — giving up"}`,
    );
  }

  // All attempts failed to reconcile — return the last attempt's result
  // as-is (never a mix of attempts). Its own importAllowed=false already
  // blocks the caller from importing it; this is a diagnosable failure,
  // never a silently-accepted partial result.
  return lastResult as BankPdfResult;
}

// ── Shared PDF bank-statement detection + extraction ───────────────────────────
//
// Used by both /ai/upload (returns bank result OR plain text to AI chat) and
// /ai/bank-import (route decides what to do when !isBankStatement).
//
// Decision tree — two independent questions:
//   Q1. Is the PDF text layer readable (not garbled)?
//   Q2. Does the text look like a bank statement?
//
//   Readable + bank:   extractStructuralPdfBuffer first; genuine failure → AI fallback
//   Readable + other:  isBankStatement = false, return plain text
//   Garbled + bank:    extractScannedPdf OCR text → AI model extraction
//   Garbled + other:   isBankStatement = false, return OCR text
//
// "Genuine failure" = structural.transactions.length === 0 OR structural.columnMap === null.
// Do NOT fall back merely because !structural.success — that flag also fires when
// hasIndependentControl is false (valid extraction with no control totals), and
// those transactions should still be processed structurally, not discarded.

async function processBankPdfBuffer(
  buffer: Buffer,
  filename: string,
): Promise<BankPdfResult> {
  // ── Step 1: text layer ────────────────────────────────────────────────────────
  let text = "";
  try {
    text = await extractPdfText(buffer);
  } catch (err) {
    console.error(
      "[PDF BANK] text extraction error:",
      err instanceof Error ? err.message : err,
    );
    // fall through — isGarbledText("") = true → OCR path
  }

  if (isGarbledText(text)) {
    // ── Step 2a: garbled / image-only → generic OCR ───────────────────────────
    console.log(`[PDF BANK] garbled text → OCR: ${filename}`);
    const scanned = await extractScannedPdf(buffer, filename);
    text = scanned.text;

    if (!looksLikeBankStatement(text)) {
      return { isBankStatement: false, plainText: text, usedOCR: true };
    }

    // ── Step 2b: OCR text IS a bank statement → AI extraction ─────────────────
    console.log(`[PDF BANK] OCR result looks like bank statement: ${filename}`);
    return extractBankStatementWithRetry(buffer, filename, text, true);
  }

  // ── Step 3: readable text — is this a bank statement? ────────────────────────
  if (!looksLikeBankStatement(text)) {
    return { isBankStatement: false, plainText: text, usedOCR: false };
  }

  // ── Step 4a: structural (positional) extraction ──────────────────────────────
  console.log(`[PDF BANK] readable + bank statement, trying structural: ${filename}`);
  const structural = await extractStructuralPdfBuffer(buffer);
  const genuineFail =
    structural.transactions.length === 0 || structural.columnMap === null;

  if (!genuineFail) {
    return buildBankResultFromStructural(structural, text);
  }

  // ── Step 4b: structural returned no data → AI fallback ──────────────────────
  console.warn(
    `[PDF BANK] structural returned no data, falling back to AI: ${filename}`,
  );
  return extractBankStatementWithRetry(buffer, filename, text, false);
}

// ── Helper: parse file buffer to plain text (non-PDF types) ─────────────────

async function extractText(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
): Promise<string> {
  const name = originalname.toLowerCase();

  // ── Plain text / CSV ──
  if (
    mimetype.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".md")
  ) {
    return buffer.toString("utf-8");
  }

  // ── DOCX ──
  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mammoth: any = (globalThis as any).require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return (result.value as string).trim();
    } catch {
      throw new Error("DOCX file could not be parsed.");
    }
  }

  // ── XLSX / Excel ──
  if (
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX: any = (globalThis as any).require("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = workbook.SheetNames.map((sheetName: string) => {
        const csv: string = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        return `Sheet: ${sheetName}\n${csv}`;
      });
      return parts.join("\n\n").trim();
    } catch {
      throw new Error("Spreadsheet file could not be parsed.");
    }
  }

  // ── Images — use GPT-4o vision ──
  if (
    mimetype.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => name.endsWith(ext))
  ) {
    const base64 = buffer.toString("base64");
    const imageType = mimetype || "image/jpeg";
    const vision = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${imageType};base64,${base64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Extract and transcribe ALL text visible in this image. Also describe any charts, tables, diagrams, or visual content clearly. Be thorough and accurate.",
            },
          ],
        },
      ],
      max_tokens: 4096,
    });
    return vision.choices[0]?.message?.content?.trim() ?? "";
  }

  throw new Error(
    `Unsupported file type: ${mimetype || name}. Supported types: PDF, DOCX, TXT, CSV, XLSX, JPG, PNG, WEBP.`,
  );
}

// ── POST /api/ai/upload ─────────────────────────────────────────────────────
//
// Generic file upload for the AI chat.  Classifies uploaded files:
//   - PDF:          processBankPdfBuffer() → bank statement OR plain text
//   - CSV / XLSX:   parseBankFile() → bank statement OR extractText() plain text
//   - Other types:  extractText() plain text (DOCX, images, TXT, etc.)

router.post("/ai/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided." });
    return;
  }

  const name = file.originalname.toLowerCase();
  const isPdf =
    file.mimetype === "application/pdf" || name.endsWith(".pdf");
  const isSpreadsheetLike =
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    file.mimetype.includes("spreadsheet") ||
    file.mimetype.includes("excel") ||
    file.mimetype === "text/csv";

  try {
    if (isPdf) {
      // ── PDF: detect bank statement; else return plain text ─────────────────
      let bankResult: BankPdfResult;
      try {
        bankResult = await processBankPdfBuffer(file.buffer, file.originalname);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (
          msg === "PDF_NO_TEXT" ||
          msg === "PDF_EMPTY_MODEL_OUTPUT" ||
          msg === "PDF_INVALID_JSON" ||
          msg === "PDF_MODEL_OUTPUT_TRUNCATED"
        ) {
          res.status(422).json({ error: msg });
          return;
        }
        throw err;
      }

      if (bankResult.isBankStatement) {
        // Bank statement: return structured transactions for the review card
        res.json({
          content: bankResult.plainText.slice(0, 30_000),
          fileName: file.originalname,
          mimeType: file.mimetype,
          chars: bankResult.plainText.length,
          usedOCR: bankResult.usedOCR,
          transactions: bankResult.transactions,
          bankMeta: bankResult.bankMeta,
        });
      } else {
        // Generic document: return plain text for AI chat
        const PLACEHOLDER_RE =
          /^Content extracted from .+ via (?:direct PDF|image) analysis\.$/;
        if (PLACEHOLDER_RE.test(bankResult.plainText.trim())) {
          res.status(422).json({ error: "PDF_NO_TEXT" });
          return;
        }
        res.json({
          content: bankResult.plainText.slice(0, 30_000),
          fileName: file.originalname,
          mimeType: file.mimetype,
          chars: bankResult.plainText.length,
          usedOCR: bankResult.usedOCR,
        });
      }
    } else if (isSpreadsheetLike) {
      // ── CSV / XLSX: try bank detection; fall back to plain text ────────────
      const parsed = parseBankFile(file.buffer, file.originalname, file.mimetype);
      if (!parsed.error && parsed.transactions.length > 0) {
        // Recognised bank statement — normalise and return structured result
        const rawTxns: BankTransaction[] = parsed.transactions.map((row) => {
          const reviewReasons: string[] = [
            ...(row.reviewReason ? [row.reviewReason] : []),
          ];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
            reviewReasons.push(`Date could not be parsed: "${row.date}"`);
          }
          if (row.debit === null && row.credit === null) {
            reviewReasons.push("Invalid or missing transaction amount");
          }
          if (!row.description) {
            reviewReasons.push("Empty description");
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
            id: makeTransactionId(),
            page: 1,
            rowIndex: row.rowIndex,
            date: row.date,
            description: row.description || "(no description)",
            debit,
            credit,
            balance: row.balance,
            amount,
            direction,
            currency: row.currency || "EUR",
            ...(needsReview && {
              needsReview: true,
              reviewReason: reviewReasons.join("; "),
            }),
            ...(row.pending && { pending: true }),
          };
        });
        const post = postProcessBankTransactions(rawTxns, {
          openingBalance: parsed.controls.openingBalance,
          closingBalance: parsed.controls.closingBalance,
          printedIncomeTotal: null,
          printedExpenseTotal: null,
        });
        const bankMeta = buildBankMeta(
          post,
          {
            openingBalance: parsed.controls.openingBalance,
            closingBalance: parsed.controls.closingBalance,
          },
          1, // CSV/Excel has no page concept — always 1, matching row.page above
        );
        console.log(
          `[UPLOAD CSV] ${file.originalname}: bank detected,` +
            ` txns=${post.transactions.length}, status=${post.validationStatus}`,
        );
        res.json({
          content: "",
          fileName: file.originalname,
          mimeType: file.mimetype,
          chars: 0,
          transactions: post.transactions,
          bankMeta,
        });
      } else {
        // Not a recognised bank format — extract as plain text for AI
        const text = await extractText(
          file.buffer,
          file.originalname,
          file.mimetype,
        );
        res.json({
          content: text.slice(0, 30_000),
          fileName: file.originalname,
          mimeType: file.mimetype,
          chars: text.length,
        });
      }
    } else {
      // Non-PDF, non-spreadsheet: standard extraction (DOCX, images, TXT, etc.)
      const text = await extractText(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      res.json({
        content: text.slice(0, 30_000),
        fileName: file.originalname,
        mimeType: file.mimetype,
        chars: text.length,
      });
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "File could not be processed.";
    res.status(422).json({ error: message });
  }
});

// ── POST /api/ai/bank-import ──────────────────────────────────────────────────
//
// Dedicated endpoint for the Money-module "Import bank statement" flow.
//
//   - Accepts CSV (.csv), Excel (.xlsx / .xls), and PDF (.pdf).
//   - CSV / XLSX: fully deterministic parse via parseBankFile() — no OpenAI.
//   - PDF: processBankPdfBuffer() — structural extraction, AI fallback for
//     unreadable PDFs; returns NOT_A_BANK_STATEMENT for non-bank PDFs.
//   - Returns { transactions, bankMeta } on success.
//   - Returns HTTP 400 for unsupported file types.
//   - Returns HTTP 422 for parse failures or non-bank documents.
//   - Never writes to Firestore — import requires explicit user confirmation.

router.post("/ai/bank-import", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided." });
    return;
  }

  const name = file.originalname.toLowerCase();
  const isXlsx =
    name.endsWith(".xlsx") ||
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const isXls =
    name.endsWith(".xls") ||
    file.mimetype === "application/vnd.ms-excel";
  const isCsv =
    name.endsWith(".csv") ||
    file.mimetype === "text/csv" ||
    file.mimetype === "text/plain";
  const isPdf =
    name.endsWith(".pdf") || file.mimetype === "application/pdf";

  if (!isXlsx && !isXls && !isCsv && !isPdf) {
    res.status(400).json({
      error:
        "Only CSV, Excel (.csv, .xlsx, .xls), and PDF (.pdf) files are supported for bank statement import.",
    });
    return;
  }

  try {
    // ── PDF path: structural extraction + AI fallback ──────────────────────
    if (isPdf) {
      let bankResult: BankPdfResult;
      try {
        bankResult = await processBankPdfBuffer(file.buffer, file.originalname);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (
          msg === "PDF_EMPTY_MODEL_OUTPUT" ||
          msg === "PDF_INVALID_JSON" ||
          msg === "BANK_IMPORT_SERVICE_ERROR" ||
          msg === "PDF_MODEL_OUTPUT_TRUNCATED"
        ) {
          console.error(`[BANK IMPORT PDF] ${msg}: ${file.originalname}`);
          res.status(502).json({ error: msg });
          return;
        }
        throw err;
      }

      if (!bankResult.isBankStatement) {
        console.warn(
          `[BANK IMPORT PDF] NOT_A_BANK_STATEMENT: ${file.originalname}`,
        );
        res.status(422).json({ error: "NOT_A_BANK_STATEMENT" });
        return;
      }

      console.log(
        `[BANK IMPORT PDF] ${file.originalname}:` +
          ` transactions=${bankResult.transactions?.length ?? 0}` +
          ` validationStatus=${bankResult.bankMeta?.validationStatus}`,
      );
      res.json({
        transactions: bankResult.transactions,
        bankMeta: bankResult.bankMeta,
      });
      return;
    }

    // ── Deterministic CSV / Excel parse — no AI ────────────────────────────
    const parsed = parseBankFile(file.buffer, file.originalname, file.mimetype);

    if (parsed.error === "UNSUPPORTED_BANK_FILE_FORMAT") {
      console.warn(
        `[BANK IMPORT CSV] UNSUPPORTED_BANK_FILE_FORMAT: ${file.originalname}`,
      );
      res.status(422).json({ error: "UNSUPPORTED_BANK_FILE_FORMAT" });
      return;
    }

    if (parsed.error === "NO_TRANSACTIONS_FOUND" || parsed.transactions.length === 0) {
      console.warn(
        `[BANK IMPORT CSV] NO_TRANSACTIONS_FOUND: ${file.originalname}`,
      );
      res.status(422).json({ error: "NO_TRANSACTIONS_FOUND" });
      return;
    }

    // ── Normalize ParsedBankRow[] → BankTransaction[] ─────────────────────
    // Direction is deterministic: credit > 0 → income, debit > 0 → expense.
    // Both-populated rows are ambiguous and flagged needsReview.
    const rawTransactions: BankTransaction[] = parsed.transactions.map((row) => {
      const reviewReasons: string[] = [
        ...(row.reviewReason ? [row.reviewReason] : []),
      ];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        reviewReasons.push(`Date could not be parsed: "${row.date}"`);
      }
      if (row.debit === null && row.credit === null) {
        reviewReasons.push("Invalid or missing transaction amount");
      }
      if (!row.description) {
        reviewReasons.push("Empty description");
      }

      const credit = row.credit;
      const debit = row.debit;
      const bothPopulated = credit !== null && debit !== null;
      let amount: number;
      let direction: "income" | "expense";
      if (bothPopulated) {
        // Both columns filled — direction ambiguous; flag for review
        amount = Math.max(credit ?? 0, debit ?? 0);
        direction = (credit ?? 0) >= (debit ?? 0) ? "income" : "expense";
        // Note: reviewReason already set in ParsedBankRow by parseBankCsv.ts
      } else {
        amount = credit ?? debit ?? 0;
        direction = credit !== null ? "income" : "expense";
      }
      const needsReview = reviewReasons.length > 0 || row.needsReview === true;

      return {
        id: makeTransactionId(),
        page: 1, // CSV/Excel has no page concept; use 1 throughout
        rowIndex: row.rowIndex,
        date: row.date,
        description: row.description || "(no description)",
        debit,
        credit,
        balance: row.balance,
        amount,
        direction,
        currency: row.currency || "EUR",
        ...(needsReview && {
          needsReview: true,
          reviewReason: reviewReasons.join("; "),
        }),
        ...(row.pending && { pending: true }),
      };
    });

    // ── Shared post-processing: sort + optional balance validation + totals ─
    const post = postProcessBankTransactions(rawTransactions, {
      openingBalance: parsed.controls.openingBalance,
      closingBalance: parsed.controls.closingBalance,
      printedIncomeTotal: null,
      printedExpenseTotal: null,
    });

    const bankMeta = buildBankMeta(
      post,
      {
        openingBalance: parsed.controls.openingBalance,
        closingBalance: parsed.controls.closingBalance,
      },
      1, // CSV/Excel has no page concept — always 1, matching row.page above
    );
    // Include parse warnings in the errors list
    bankMeta.validationErrors = [
      ...parsed.warnings,
      ...bankMeta.validationErrors,
    ];

    console.log(
      `[BANK IMPORT CSV] ${file.originalname} (${parsed.detectedFormat}):` +
        ` transactions=${post.transactions.length}` +
        ` income=${post.incomeCount}/${post.calculatedIncomeTotal.toFixed(2)}` +
        ` expenses=${post.expenseCount}/${post.calculatedExpenseTotal.toFixed(2)}` +
        ` validationStatus=${post.validationStatus}`,
    );

    res.json({ transactions: post.transactions, bankMeta });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "File could not be processed.";
    console.error(
      `[BANK IMPORT] Unexpected error for ${file.originalname}:`,
      message,
    );
    res.status(422).json({ error: message });
  }
});

// ── POST /api/ai/upload-direct-test ──────────────────────────────────────────
//
// DIAGNOSTIC EXPERIMENT — isolated from the production import pipeline.
//
// Sends the ORIGINAL uploaded PDF directly to the OpenAI Responses API as a
// single input_file, without any of the following:
//   - pdf-lib page splitting
//   - buildPagePrompt / buildMetadataPrompt
//   - validateRawTransactions / applyRunningBalanceValidation
//   - retry / correction passes
//   - reconcileBalances / importAllowed logic
//
// Purpose: A/B comparison between the existing per-page extraction pipeline
// (Track A) and raw OpenAI single-PDF reading (Track B).
//
// This endpoint is READ-ONLY — it never writes to Firestore, never calls
// preview_bank_import, and never modifies any bank data.
//
// DO NOT use this endpoint for production imports.

const DIRECT_TEST_PROMPT = `\
Read the attached bank statement directly from the PDF.

Extract every individual transaction exactly once.

For each transaction return:
- date
- description
- debit amount
- credit amount
- running balance, if the document actually provides one

Use the actual document/table structure. Do not infer a running balance column if one is not present.

Do not treat any of the following as individual transactions:
- opening balance
- closing balance
- running balance
- statement summary totals
- page subtotals
- column headers

Then report:
- number of income transactions
- total income
- number of expense transactions
- total expenses
- opening balance, if explicitly printed
- closing balance, if explicitly printed
- printed statement-level income total, if explicitly printed
- printed statement-level expense total, if explicitly printed

Do not guess missing values.
Do not reconstruct unreadable rows.
Do not invent transactions.
Do not infer totals that are not explicitly printed.

Return ONLY valid JSON — no markdown, no explanation:
{
  "transactions": [
    {
      "date": "string",
      "description": "string",
      "debit": null,
      "credit": 123.45,
      "balance": 876.55,
      "currency": "EUR"
    }
  ],
  "summary": {
    "incomeCount": 0,
    "expenseCount": 0,
    "calculatedIncomeTotal": 0,
    "calculatedExpenseTotal": 0,
    "openingBalance": null,
    "closingBalance": null,
    "printedIncomeTotal": null,
    "printedExpenseTotal": null
  },
  "warnings": []
}`;

router.post(
  "/ai/upload-direct-test",
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided." });
      return;
    }

    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      res.status(400).json({ error: "This endpoint only accepts PDF files." });
      return;
    }

    try {
      const b64 = `data:application/pdf;base64,${file.buffer.toString("base64")}`;

      // Single Responses API call — full original PDF, no splitting.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (openai.responses.create as any)({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: file.originalname,
                file_data: b64,
              },
              {
                type: "input_text",
                text: DIRECT_TEST_PROMPT,
              },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
        temperature: 0,
        max_output_tokens: 8192,
      });

      const raw: string =
        (response as { output_text?: string }).output_text ?? "{}";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error(
          "[DIRECT PDF TEST] Invalid JSON from model:",
          raw.slice(0, 300),
        );
        res.status(502).json({
          error: "Model returned invalid JSON.",
          raw: raw.slice(0, 500),
        });
        return;
      }

      // ── Privacy-safe diagnostic log ─────────────────────────────────────────
      const txns: unknown[] = Array.isArray(parsed?.transactions)
        ? parsed.transactions
        : [];
      const summary = parsed?.summary ?? {};
      const warnings: unknown[] = Array.isArray(parsed?.warnings)
        ? parsed.warnings
        : [];

      const incomeCount =
        typeof summary.incomeCount === "number" ? summary.incomeCount : null;
      const expenseCount =
        typeof summary.expenseCount === "number" ? summary.expenseCount : null;
      const incomeTotal =
        typeof summary.calculatedIncomeTotal === "number"
          ? summary.calculatedIncomeTotal
          : null;
      const expenseTotal =
        typeof summary.calculatedExpenseTotal === "number"
          ? summary.calculatedExpenseTotal
          : null;
      const openingBalance =
        typeof summary.openingBalance === "number"
          ? summary.openingBalance
          : null;
      const closingBalance =
        typeof summary.closingBalance === "number"
          ? summary.closingBalance
          : null;
      const printedIncome =
        typeof summary.printedIncomeTotal === "number"
          ? summary.printedIncomeTotal
          : null;
      const printedExpenses =
        typeof summary.printedExpenseTotal === "number"
          ? summary.printedExpenseTotal
          : null;

      console.log(
        `[DIRECT PDF TEST] ${file.originalname}\n` +
          `  transactions=${txns.length}\n` +
          `  incomeCount=${incomeCount ?? "?"}\n` +
          `  expenseCount=${expenseCount ?? "?"}\n` +
          `  calculatedIncomeTotal=${incomeTotal ?? "?"}\n` +
          `  calculatedExpenseTotal=${expenseTotal ?? "?"}\n` +
          `  openingBalanceFound=${openingBalance !== null}\n` +
          `  closingBalanceFound=${closingBalance !== null}\n` +
          `  printedIncomeTotalFound=${printedIncome !== null}\n` +
          `  printedExpenseTotalFound=${printedExpenses !== null}\n` +
          `  warnings=${warnings.length}`,
      );

      res.json(parsed);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Direct PDF test failed.";
      console.error("[DIRECT PDF TEST] Error:", message);
      res.status(502).json({ error: message });
    }
  },
);

export default router;
