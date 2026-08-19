/**
 * parseBankCsv.ts
 *
 * Deterministic CSV and Excel bank statement parser.
 *
 * NO AI.  NO OpenAI.  NO PDF.  Pure application code.
 *
 * Supports:
 *   - .csv  (comma, semicolon, tab delimited; UTF-8 / UTF-8 BOM; quoted fields;
 *            decimal comma and decimal point; spaces as thousands separators)
 *   - .xlsx / .xls  (selects the best transaction sheet automatically)
 *
 * Column detection:
 *   A) Separate debit / credit columns
 *   B) Single signed amount column
 *   C) Amount + direction/type column (status column determines direction)
 */

import { parseEuropeanNumber } from "./parseEuropeanNumber";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ParsedBankRow {
  rowIndex: number;
  /** ISO YYYY-MM-DD, or the raw string when a date could not be parsed */
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: string;
  pending: boolean;
  /** Set when the row is structurally ambiguous and requires manual review. */
  needsReview?: boolean;
  reviewReason?: string;
}

export interface BankFileParseResult {
  transactions: ParsedBankRow[];
  controls: {
    openingBalance: number | null;
    closingBalance: number | null;
  };
  detectedFormat: "csv" | "xlsx" | "xls";
  warnings: string[];
  error?: "NO_TRANSACTIONS_FOUND" | "UNSUPPORTED_BANK_FILE_FORMAT";
}

// ── xlsx loading (CJS package) ────────────────────────────────────────────────
// In the production ESM build, xlsx is external and the build banner sets
// globalThis.require = createRequire(import.meta.url).
// In the CJS test bundle the test file sets globalThis.require = require before
// calling parseBankFile, making the same path work.

function loadXlsx(): typeof import("xlsx") {
  if (typeof (globalThis as any).require === "function") {
    return (globalThis as any).require("xlsx") as typeof import("xlsx");
  }
  throw new Error(
    "xlsx not available: globalThis.require is not set. " +
      "In tests, add `(globalThis as any).require = require;` before calling parseBankFile.",
  );
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  const s = raw.trim();

  // ISO YYYY-MM-DD (exact)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO with time: YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM
  const isoTime = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(s);
  if (isoTime) return isoTime[1];

  // ── European day-first formats ────────────────────────────────────────────
  // DD.MM.YYYY  — used by SEB, LHV, Swedbank Estonian exports
  // DD/MM/YYYY  — used by many international banks; slash is ALWAYS day-first here
  //               (MM/DD/YYYY is NOT supported — see task 4 safety requirements)
  // DD-MM-YYYY  — hyphen variant; distinct from ISO (4-digit year comes last)
  const dmy =
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s) ||
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    const y = dmy[3];
    if (+dmy[1] >= 1 && +dmy[1] <= 31 && +dmy[2] >= 1 && +dmy[2] <= 12 && +y >= 2000) {
      return `${y}-${m}-${d}`;
    }
  }

  // YYYY/MM/DD — 4-digit year first unambiguously identifies the format
  const ymd = /^(\d{4})[/](\d{2})[/](\d{2})$/.exec(s);
  if (ymd) {
    if (+ymd[2] >= 1 && +ymd[2] <= 12 && +ymd[3] >= 1 && +ymd[3] <= 31) {
      return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    }
  }

  return null;
}

// ── CSV field tokenizer (RFC 4180) ────────────────────────────────────────────

function parseCsvRow(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (line.startsWith(delimiter, i)) {
        fields.push(cur);
        cur = "";
        i += delimiter.length - 1;
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

// ── Delimiter detection ───────────────────────────────────────────────────────

function detectDelimiter(lines: string[]): string {
  const candidates = [";", ",", "\t"];
  const sample = lines.slice(0, 10).filter((l) => l.trim());

  let best = ",";
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sample.map((l) => parseCsvRow(l, delim).length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const consistent = counts.filter((c) => c === max).length;
    const score = max * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }

  return best;
}

// ── Column name matching ──────────────────────────────────────────────────────

const DATE_HEADERS = new Set([
  "date",
  "kuupäev",
  "kuupaev",
  "booking date",
  "transaction date",
  "value date",
  "value_date",
  "booking_date",
  "transaction_date",
  "tehingu kuupäev",
  "tehingupäev",
  "trade date",
]);

const DESC_HEADERS = new Set([
  "description",
  "selgitus",
  "details",
  "transaction",
  "payee",
  "payer",
  "beneficiary",
  "saaja",
  "maksja",
  "reference",
  "info",
  "memo",
  "kirjeldus",
  "selgitus / beneficiary name",
  "narrative",
  "particulars",
]);

const DEBIT_HEADERS = new Set(["debit", "deebet", "debiit", "out", "withdrawal", "debet"]);
const CREDIT_HEADERS = new Set(["credit", "kreedit", "kreediit", "in", "deposit"]);
const AMOUNT_HEADERS = new Set(["amount", "summa", "sum"]);
const BALANCE_HEADERS = new Set([
  "balance",
  "saldo",
  "jääk",
  "jaak",
  "running balance",
  "account balance",
  "jooksev saldo",
  "jooksev jääk",         // SEB "running balance" ET
  "konto jääk",           // account balance ET
  "jääk pärast",          // balance after (transaction)
  "jääk pärast tehingut", // full SEB label variant
]);

/**
 * Returns true when a normalised header string refers to a running account
 * balance column. Extends exact Set membership with prefix/suffix rules so
 * that multi-word bank-specific variants (e.g. "jääk eur", "saldo (eur)")
 * are matched without enumerating every possible currency suffix.
 *
 * Intentionally does NOT match "algsaldo" (opening balance) or "lõppsaldo"
 * (closing balance) — those are single-row metadata, not per-transaction columns.
 */
function isBalanceHeader(h: string): boolean {
  if (BALANCE_HEADERS.has(h)) return true;
  // "jääk EUR", "jääk (eur)", "jääk pärast tehingut EUR", etc.
  if (/^(jääk|jaak)\b/.test(h)) return true;
  // "saldo EUR", "saldo (eur)" — but NOT "algsaldo" or "lõppsaldo"
  if (/^saldo\b/.test(h)) return true;
  // "running balance EUR", "account balance (eur)", etc.
  if (/^(running|account)\s+balance\b/.test(h)) return true;
  return false;
}
const CURRENCY_HEADERS = new Set(["currency", "valuuta", "curr"]);
const STATUS_HEADERS = new Set(["status", "olek", "state", "type", "tüüp"]);

// D/C indicator column — encodes direction independently of the amount sign.
// When present, this column has absolute priority over amount-sign inference.
// Recognised values: D / DR / DEBIT / DEEBET (→ expense) and C / CR / CREDIT / KREEDIT (→ income).
const DC_HEADERS = new Set([
  "deebet/kreedit (d/c)",
  "deebet/kreedit",
  "d/c",
  "debit/credit",
  "debit credit",
  "dr/cr",
  "dc",
]);

// Counterparty name column — separate from the narration/selgitus description.
// Used as description fallback or combined with descCol when both are populated.
const PAYEE_HEADERS = new Set([
  "saaja/maksja nimi",
  "saaja nimi",
  "maksja nimi",
  "beneficiary name",
  "counterparty",
  "counterparty name",
  "vastaspool",
]);

function normalizeHeader(h: string): string {
  // Lowercase, collapse extra spaces, strip surrounding whitespace.
  // Keep Estonian letters (äöüõ) for matching.
  return h
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface ColumnMap {
  dateCol: number | null;
  descCol: number | null;
  /** Counterparty name (Saaja/maksja nimi). Used as description fallback or combined. */
  payeeCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  amountCol: number | null;
  balanceCol: number | null;
  currencyCol: number | null;
  statusCol: number | null;
  /** Explicit D/C indicator column — takes absolute priority over amount-sign inference. */
  dcCol: number | null;
}

function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    dateCol: null,
    descCol: null,
    payeeCol: null,
    debitCol: null,
    creditCol: null,
    amountCol: null,
    balanceCol: null,
    currencyCol: null,
    statusCol: null,
    dcCol: null,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (!h) continue;

    if (map.dateCol === null && DATE_HEADERS.has(h)) {
      map.dateCol = i;
    } else if (map.dcCol === null && DC_HEADERS.has(h)) {
      // DC before DESC so "d/c" is never confused with a description column
      map.dcCol = i;
    } else if (map.payeeCol === null && PAYEE_HEADERS.has(h)) {
      map.payeeCol = i;
    } else if (map.descCol === null && DESC_HEADERS.has(h)) {
      map.descCol = i;
    } else if (map.debitCol === null && DEBIT_HEADERS.has(h)) {
      map.debitCol = i;
    } else if (map.creditCol === null && CREDIT_HEADERS.has(h)) {
      map.creditCol = i;
    } else if (map.amountCol === null && AMOUNT_HEADERS.has(h)) {
      map.amountCol = i;
    } else if (map.balanceCol === null && isBalanceHeader(h)) {
      map.balanceCol = i;
    } else if (map.currencyCol === null && CURRENCY_HEADERS.has(h)) {
      map.currencyCol = i;
    } else if (map.statusCol === null && STATUS_HEADERS.has(h)) {
      map.statusCol = i;
    }
  }

  return map;
}

function isValidColumnMap(map: ColumnMap): boolean {
  if (map.dateCol === null) return false;
  // Require at least one description-like column (narration OR counterparty name)
  const hasDesc = map.descCol !== null || map.payeeCol !== null;
  if (!hasDesc) return false;
  const hasAmount =
    map.amountCol !== null || map.debitCol !== null || map.creditCol !== null;
  return hasAmount;
}

// ── Row classification ────────────────────────────────────────────────────────

const CONTROL_ROW_PATTERNS = [
  // Estonian
  /\bkreeditkäive\b/i,
  /\bdeebetkäive\b/i,
  /\bpäeva jääk\b/i,
  /\bpäeva käive\b/i,
  /\bkokku\b.*\btehingud\b/i,
  // English
  /\bcredit turnover\b/i,
  /\bdebit turnover\b/i,
  /\bdaily turnover\b/i,
  /\bdaily balance\b/i,
  /\bpage total\b/i,
  /\bsubtotal\b/i,
  /\bvahesumma\b/i,
];

const OPENING_PATTERNS = [
  /\balgsaldo\b/i,
  /\bopening balance\b/i,
  /\bstart balance\b/i,
  /\bbalance at period start\b/i,
  /\bbeginning balance\b/i,
];

const CLOSING_PATTERNS = [
  /\blõppsaldo\b/i,
  /\bclosing balance\b/i,
  /\bend balance\b/i,
  /\bbalance at period end\b/i,
  /\bending balance\b/i,
];

const PENDING_SECTION_PATTERNS = [
  /\breserveeritud\b/i,
  /\bpending\b/i,
  /\breserved\b/i,
  /\beelinfo\b/i,
  /\breserv[^a-z]/i,
];

function rowText(fields: string[]): string {
  return fields.join(" ").replace(/\s+/g, " ").trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function isHeaderLike(fields: string[]): boolean {
  let matches = 0;
  for (const f of fields) {
    const h = normalizeHeader(f);
    if (
      DATE_HEADERS.has(h) ||
      DC_HEADERS.has(h) ||
      PAYEE_HEADERS.has(h) ||
      DESC_HEADERS.has(h) ||
      DEBIT_HEADERS.has(h) ||
      CREDIT_HEADERS.has(h) ||
      AMOUNT_HEADERS.has(h) ||
      isBalanceHeader(h) ||
      CURRENCY_HEADERS.has(h) ||
      STATUS_HEADERS.has(h)
    ) {
      matches++;
    }
  }
  return matches >= 2;
}

// ── Cell helper ───────────────────────────────────────────────────────────────

function getCell(fields: string[], idx: number | null): string {
  if (idx === null || idx < 0 || idx >= fields.length) return "";
  return (fields[idx] ?? "").trim();
}

// ── Amount extraction ─────────────────────────────────────────────────────────

function extractAmounts(
  fields: string[],
  map: ColumnMap,
): { debit: number | null; credit: number | null } {
  // ── Case DC: explicit D/C indicator column — highest priority ────────────────
  //
  // Used by banks (e.g. SEB) that export unsigned (always-positive) amounts and
  // encode direction in a separate "Deebet/Kreedit (D/C)" / "D/C" column.
  //
  // "D" (Deebet / Debit / DR)  → expense (debit)
  // "C" (Kreedit / Credit / CR) → income (credit)
  //
  // This case runs BEFORE signed-amount logic and BEFORE the status/type column.
  // "Tüüp" or any other text column must NEVER override the D/C indicator.
  if (map.dcCol !== null && map.amountCol !== null) {
    const raw = getCell(fields, map.amountCol);
    const val = parseEuropeanNumber(raw);
    if (val !== null) {
      const dc = getCell(fields, map.dcCol).trim().toUpperCase();
      const amount = Math.abs(val); // amount is unsigned in D/C-column banks
      if (dc === "D" || dc === "DR" || dc === "DEBIT" || dc === "DEEBET") {
        return { debit: amount, credit: null };
      }
      if (dc === "C" || dc === "CR" || dc === "CREDIT" || dc === "KREEDIT") {
        return { debit: null, credit: amount };
      }
      // Unknown indicator — fall through to signed-amount logic below
    }
  }

  // Case A: separate debit and credit columns
  if (map.debitCol !== null && map.creditCol !== null) {
    const d = parseEuropeanNumber(getCell(fields, map.debitCol));
    const c = parseEuropeanNumber(getCell(fields, map.creditCol));
    return {
      debit: d !== null && d > 0 ? d : null,
      credit: c !== null && c > 0 ? c : null,
    };
  }

  // Case B/C: signed amount column, optionally with a direction/status column
  if (map.amountCol !== null) {
    const raw = getCell(fields, map.amountCol);
    const val = parseEuropeanNumber(raw);
    if (val === null) return { debit: null, credit: null };

    // Case C: amount + direction column (status/type tells us which side).
    //
    // GUARD: val > 0 only.
    //
    // Case C applies exclusively to banks that always export unsigned (positive)
    // amounts and use a separate direction/type column to indicate which side of
    // the ledger the row belongs to.  When the amount already carries a negative
    // sign, the sign IS the direction — Case C must not run, because running it
    // would strip the sign via Math.abs and potentially assign the wrong side
    // (e.g. status = "credit transfer" on a negative outgoing payment would be
    // misclassified as income).
    //
    // Correct order:
    //   signedAmount = parseEuropeanNumber(raw)   // sign preserved
    //   if val > 0 → check status column (Case C) or treat as income (Case B)
    //   if val < 0 → always expense (Case B), sign is authoritative
    if (map.statusCol !== null && val > 0) {
      const status = getCell(fields, map.statusCol).toLowerCase();
      const isExpense =
        /\bdebit\b|\bdeebet\b|\bout\b|\bwithdrawal\b|\bdr\b/.test(status);
      const isIncome =
        /\bcredit\b|\bkreedit\b|\bin\b|\bdeposit\b|\blaekumine\b|\bcr\b/.test(status);
      // val is already positive here; no Math.abs needed
      if (isExpense) return { debit: val, credit: null };
      if (isIncome) return { debit: null, credit: val };
    }

    // Case B: signed amount — positive = income, negative = expense.
    // This is the canonical path for all banks that export signed amounts.
    if (val > 0) return { debit: null, credit: val };
    if (val < 0) return { debit: Math.abs(val), credit: null };
    return { debit: null, credit: null };
  }

  // Partial Case A: only one of debit/credit is present
  if (map.debitCol !== null) {
    // All amounts are in the debit column; status column determines direction
    const d = parseEuropeanNumber(getCell(fields, map.debitCol));
    if (d !== null && d > 0 && map.statusCol !== null) {
      const status = getCell(fields, map.statusCol).toLowerCase();
      const isIncome =
        /\bcredit\b|\bkreedit\b|\bin\b|\bdeposit\b|\blaekumine\b|\bcr\b/.test(status);
      if (isIncome) return { debit: null, credit: d };
    }
    return { debit: d !== null && d > 0 ? d : null, credit: null };
  }

  if (map.creditCol !== null) {
    const c = parseEuropeanNumber(getCell(fields, map.creditCol));
    return { debit: null, credit: c !== null && c > 0 ? c : null };
  }

  return { debit: null, credit: null };
}

// ── Control value from row ────────────────────────────────────────────────────

function firstNumericValue(fields: string[]): number | null {
  for (const f of fields) {
    const v = parseEuropeanNumber(f.trim());
    if (v !== null) return v;
  }
  return null;
}

function lastNumericValue(fields: string[]): number | null {
  for (let i = fields.length - 1; i >= 0; i--) {
    const v = parseEuropeanNumber(fields[i].trim());
    if (v !== null) return v;
  }
  return null;
}

// ── Core row processor (shared between CSV and XLSX paths) ────────────────────

interface ProcessRowsResult {
  transactions: ParsedBankRow[];
  controls: {
    openingBalance: number | null;
    closingBalance: number | null;
  };
  warnings: string[];
}

function processRows(allRows: string[][], headerRowIdx: number, map: ColumnMap): ProcessRowsResult {
  const transactions: ParsedBankRow[] = [];
  const controls: { openingBalance: number | null; closingBalance: number | null } = {
    openingBalance: null,
    closingBalance: null,
  };
  const warnings: string[] = [];
  let inPendingSection = false;
  let rowIndex = 0;

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const fields = allRows[i];
    const text = rowText(fields);
    if (!text) continue;

    // ── Pending section header detection ─────────────────────────────────────
    // A pending section header is a row whose text matches a pending keyword
    // AND which is not a valid transaction: no parseable date in the date column
    // AND no monetary amounts.  "Pending" may fall in the date column position
    // (the most common layout), so we check parseDate(), not just emptiness.
    if (matchesAny(text, PENDING_SECTION_PATTERNS)) {
      const dateCell = getCell(fields, map.dateCol);
      const hasValidDate = !!dateCell && parseDate(dateCell) !== null;
      const { debit: pd, credit: pc } = extractAmounts(fields, map);
      if (!hasValidDate && pd === null && pc === null) {
        inPendingSection = true;
        continue;
      }
    }

    // ── Reset pending on repeated header row ──────────────────────────────────
    if (isHeaderLike(fields)) {
      inPendingSection = false;
      continue;
    }

    // ── Opening balance ───────────────────────────────────────────────────────
    if (controls.openingBalance === null && matchesAny(text, OPENING_PATTERNS)) {
      const v = firstNumericValue(fields);
      if (v !== null) controls.openingBalance = v;
      continue; // not a transaction
    }

    // ── Closing balance ───────────────────────────────────────────────────────
    if (matchesAny(text, CLOSING_PATTERNS)) {
      const v = lastNumericValue(fields);
      if (v !== null) controls.closingBalance = v;
      continue; // not a transaction
    }

    // ── Other control / summary rows ──────────────────────────────────────────
    if (matchesAny(text, CONTROL_ROW_PATTERNS)) continue;

    // ── Parse as transaction ──────────────────────────────────────────────────
    const rawDate = getCell(fields, map.dateCol);
    const parsedDate = parseDate(rawDate);

    // ── Description construction ──────────────────────────────────────────────
    // Priority: Selgitus (descCol) is the primary narration.
    // Saaja/maksja nimi (payeeCol) is the counterparty name.
    // Rules:
    //   1. Both present and different → combine as "<payee>: <selgitus>"
    //   2. Only descCol present       → use descCol
    //   3. Only payeeCol present       → use payeeCol (never "Empty description")
    //   4. Neither                    → ""
    const selgitus = getCell(fields, map.descCol);
    const payeeName = getCell(fields, map.payeeCol);
    let description: string;
    if (selgitus && payeeName && selgitus !== payeeName) {
      description = `${payeeName}: ${selgitus}`;
    } else {
      description = selgitus || payeeName || "";
    }

    const { debit, credit } = extractAmounts(fields, map);

    const rawBalance = getCell(fields, map.balanceCol);
    const balance = rawBalance ? parseEuropeanNumber(rawBalance) : null;

    const rawCurrency = getCell(fields, map.currencyCol);
    const currency = (rawCurrency || "EUR").toUpperCase().trim() || "EUR";

    // Pending: section flag OR row-level status value
    const rawStatus = getCell(fields, map.statusCol);
    const isPending =
      inPendingSection ||
      /\breserv/i.test(rawStatus) ||
      /\bpending\b/i.test(rawStatus);

    // Skip completely empty/metadata rows
    if (!rawDate && debit === null && credit === null) continue;

    // Skip rows with no amount and no balance (pure metadata text)
    if (debit === null && credit === null && balance === null && !rawDate) continue;

    // ── Both debit and credit filled → ambiguous direction, flag for review ───
    // This can happen when a CSV uses separate D/C columns but both cells happen
    // to have values (data-entry error, reversed-sign convention, etc.).
    const rowReasons: string[] = [];
    if (debit !== null && credit !== null) {
      rowReasons.push(
        `Mõlemad deebet (${debit}) ja kreedit (${credit}) täidetud — suund ebaselge`,
      );
    }

    transactions.push({
      rowIndex: rowIndex++,
      date: parsedDate ?? rawDate,
      description,
      debit,
      credit,
      balance,
      currency,
      pending: isPending,
      ...(rowReasons.length > 0 && {
        needsReview: true,
        reviewReason: rowReasons.join("; "),
      }),
    });
  }

  return { transactions, controls, warnings };
}

// ── CSV parse ─────────────────────────────────────────────────────────────────

function parseCsvBuffer(buffer: Buffer): BankFileParseResult {
  const warnings: string[] = [];

  let text = buffer.toString("utf-8");

  // Strip UTF-8 BOM (U+FEFF)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rawLines = text.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);

  if (nonEmpty.length === 0) {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: "csv",
      warnings,
      error: "NO_TRANSACTIONS_FOUND",
    };
  }

  const delimiter = detectDelimiter(nonEmpty.slice(0, 20));

  const allParsed = nonEmpty.map((l) => parseCsvRow(l, delimiter));

  // Find header row (first 20 rows)
  let headerRowIdx = -1;
  let headerFields: string[] = [];

  for (let i = 0; i < Math.min(20, allParsed.length); i++) {
    if (isHeaderLike(allParsed[i])) {
      headerRowIdx = i;
      headerFields = allParsed[i];
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: "csv",
      warnings,
      error: "UNSUPPORTED_BANK_FILE_FORMAT",
    };
  }

  const map = detectColumns(headerFields);

  if (!isValidColumnMap(map)) {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: "csv",
      warnings,
      error: "UNSUPPORTED_BANK_FILE_FORMAT",
    };
  }

  const { transactions, controls, warnings: rowWarnings } = processRows(allParsed, headerRowIdx, map);
  warnings.push(...rowWarnings);

  if (transactions.length === 0) {
    return { transactions, controls, detectedFormat: "csv", warnings, error: "NO_TRANSACTIONS_FOUND" };
  }

  return { transactions, controls, detectedFormat: "csv", warnings };
}

// ── XLSX / XLS parse ──────────────────────────────────────────────────────────

// ── Worksheet scorer ──────────────────────────────────────────────────────────
//
// Scores a sheet's suitability as a transaction table using four independent
// signals, so a summary sheet with many rows never beats a real transaction
// sheet with a proper header + parseable rows.
//
// Signal weights:
//   +3  date column detected in header
//   +2  description column detected in header
//   +3  separate debit+credit columns detected
//   +2  single signed amount column detected
//   +1  only one of debit/credit column detected
//   +2  per parseable transaction row (valid date + at least one amount)
//
// A summary/metadata sheet scores 0 even with hundreds of rows because it has
// no recognisable header, and therefore no column map and no parseable rows.

interface SheetScore {
  score: number;
  headerRowIdx: number;
  map: ColumnMap;
}

function scoreSheet(rows: string[][]): SheetScore {
  const nullMap: ColumnMap = {
    dateCol: null, descCol: null, payeeCol: null, debitCol: null,
    creditCol: null, amountCol: null, balanceCol: null, currencyCol: null,
    statusCol: null, dcCol: null,
  };

  // Locate the first recognisable header row (within first 20 rows)
  let headerRowIdx = -1;
  let map = nullMap;

  for (let i = 0; i < Math.min(20, rows.length); i++) {
    if (isHeaderLike(rows[i])) {
      const candidate = detectColumns(rows[i]);
      if (isValidColumnMap(candidate)) {
        headerRowIdx = i;
        map = candidate;
        break;
      }
    }
  }

  if (headerRowIdx === -1) return { score: 0, headerRowIdx: -1, map: nullMap };

  // Column quality score
  let score = 0;
  if (map.dateCol !== null)  score += 3;
  if (map.descCol !== null)  score += 2;
  if (map.debitCol !== null && map.creditCol !== null) score += 3;
  else if (map.amountCol !== null) score += 2;
  else if (map.debitCol !== null || map.creditCol !== null) score += 1;

  // Count rows with a parseable date AND at least one monetary amount —
  // these are the definitive evidence that a sheet is a transaction table.
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const dateCell = (rows[i][map.dateCol ?? -1] ?? "").trim();
    if (!parseDate(dateCell)) continue;
    const { debit, credit } = extractAmounts(rows[i], map);
    if (debit !== null || credit !== null) score += 2;
  }

  return { score, headerRowIdx, map };
}

function parseXlsxBuffer(buffer: Buffer, ext: "xlsx" | "xls"): BankFileParseResult {
  const XLSX = loadXlsx();
  const warnings: string[] = [];

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  } catch {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: ext,
      warnings,
      error: "UNSUPPORTED_BANK_FILE_FORMAT",
    };
  }

  // Inspect ALL sheets and choose the one with the highest transaction-table score.
  let bestRows: string[][] | null = null;
  let bestSheetName = "";
  let bestHeaderRowIdx = -1;
  let bestMap: ColumnMap | null = null;
  let bestScore = -1;

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    const rows = raw.map((r) => (Array.isArray(r) ? r.map(String) : []));
    const { score, headerRowIdx, map } = scoreSheet(rows);

    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
      bestSheetName = name;
      bestHeaderRowIdx = headerRowIdx;
      bestMap = map;
    }
  }

  if (!bestRows || bestScore <= 0 || bestHeaderRowIdx === -1 || !bestMap) {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: ext,
      warnings,
      error: "UNSUPPORTED_BANK_FILE_FORMAT",
    };
  }

  if (!isValidColumnMap(bestMap)) {
    return {
      transactions: [],
      controls: { openingBalance: null, closingBalance: null },
      detectedFormat: ext,
      warnings: [...warnings, `Unsupported column layout in sheet: ${bestSheetName}`],
      error: "UNSUPPORTED_BANK_FILE_FORMAT",
    };
  }

  const { transactions, controls, warnings: rowWarnings } = processRows(bestRows, bestHeaderRowIdx, bestMap);
  warnings.push(...rowWarnings);

  if (transactions.length === 0) {
    return { transactions, controls, detectedFormat: ext, warnings, error: "NO_TRANSACTIONS_FOUND" };
  }

  return { transactions, controls, detectedFormat: ext, warnings };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseBankFile(
  buffer: Buffer,
  filename: string,
  mimetype?: string,
): BankFileParseResult {
  const name = (filename || "").toLowerCase();
  const isXlsx =
    name.endsWith(".xlsx") ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const isXls =
    name.endsWith(".xls") ||
    mimetype === "application/vnd.ms-excel";

  if (isXlsx || isXls) {
    return parseXlsxBuffer(buffer, isXlsx ? "xlsx" : "xls");
  }

  // Default: CSV (covers .csv, text/csv, text/plain, unknown extension)
  return parseCsvBuffer(buffer);
}
