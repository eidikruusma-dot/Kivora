import type { PdfRow } from "./groupIntoRows";
import type { ColumnMap } from "./detectColumnMap";
import { parseEuropeanNumber } from "./parseEuropeanNumber";

export interface RawTransactionRow {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  pageNumber: number;
  rowIndex: number;
  /** True when the row was found inside a pending/reservations section.
   *  Pending rows must not be counted in posted income/expense totals and
   *  must not participate in the running-balance chain. */
  pending?: boolean;
}

export interface ClassifyTransactionRowsResult {
  transactions: RawTransactionRow[];
  warnings: string[];
}

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
];

/**
 * Rows whose full text matches any of these patterns are CONTROL rows
 * (opening/closing balances, turnover summaries, page labels, etc.) and
 * must never be imported as income or expense transactions.
 */
const SKIP_PATTERNS = [
  /\bopening balance\b/i,
  /\bclosing balance\b/i,
  /\balgsaldo\b/i,
  /\blõppsaldo\b/i,
  /\bsubtotal\b/i,
  /\bvahekokku\b/i,
  /\bkokku\b/i,
  /\btotal\b/i,
  /\blehekülg\b/i,
  /\bpage\b/i,
  // ── Turnover / daily-balance rows ───────────────────────────────────────
  /\bdeebetkäive\b/i,       // Estonian: debit turnover
  /\bkreeditkäive\b/i,      // Estonian: credit turnover
  /\bpäeva\s+jääk\b/i,      // Estonian: daily balance
  /\bdebit\s+turnover\b/i,
  /\bcredit\s+turnover\b/i,
  /\bdaily\s+balance\b/i,
  /\bturnover\b/i,
];

/**
 * Section headings that signal the start of a reserved/pending-payments
 * block.  Rows that follow (until the end of the document) are classified
 * as pending and must not be included in posted totals.
 */
const PENDING_SECTION_PATTERNS = [
  /\breserveeritud\b/i,           // Estonian: reserved
  /\breservations?\b/i,
  /\bpending\s+(?:payments?|transactions?|card\s+payments?)\b/i,
  /\bcard\s+reservations?\b/i,
  /\breserveeritud\s+maksed\b/i,  // Estonian: reserved payments
];

function isPendingSectionHeader(text: string): boolean {
  return PENDING_SECTION_PATTERNS.some((p) => p.test(text));
}

function centerX(item: PdfRow["items"][number]): number {
  return item.x + item.width / 2;
}

function isDateLike(value: string): boolean {
  const text = value.trim();
  return DATE_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldSkipRow(text: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

function nearestColumn(
  x: number,
  columns: Array<{ key: keyof ColumnMap; x: number }>,
): keyof ColumnMap | null {
  if (columns.length === 0) return null;

  let best = columns[0];
  let bestDistance = Math.abs(x - best.x);

  for (let i = 1; i < columns.length; i++) {
    const distance = Math.abs(x - columns[i].x);
    if (distance < bestDistance) {
      best = columns[i];
      bestDistance = distance;
    }
  }

  return best.key;
}

function rowToColumns(
  row: PdfRow,
  columnMap: ColumnMap,
): Partial<Record<keyof ColumnMap, string>> {
  const columns = Object.entries(columnMap)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => ({
      key: key as keyof ColumnMap,
      x: value as number,
    }));

  const grouped: Partial<Record<keyof ColumnMap, string[]>> = {};

  for (const item of row.items) {
    const text = item.str.trim();
    if (!text) continue;

    const key = nearestColumn(centerX(item), columns);
    if (!key) continue;

    const current = grouped[key] ?? [];
    current.push(text);
    grouped[key] = current;
  }

  const result: Partial<Record<keyof ColumnMap, string>> = {};

  for (const [key, values] of Object.entries(grouped) as [
    keyof ColumnMap,
    string[],
  ][]) {
    result[key] = values.join(" ").replace(/\s+/g, " ").trim();
  }

  return result;
}

export function classifyTransactionRows(
  rows: PdfRow[],
  columnMap: ColumnMap,
): ClassifyTransactionRowsResult {
  const transactions: RawTransactionRow[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { transactions, warnings };
  }

  const orderedRows = [...rows].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }

    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }

    return b.rowY - a.rowY;
  });

  let previousTransaction: RawTransactionRow | null = null;
  // Once we enter a pending/reservations section we stay in it for the rest
  // of the document — pending sections are always at the end of a statement.
  let inPendingSection = false;

  for (const row of orderedRows) {
    const fullRowText = row.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!fullRowText) continue;

    // ── Detect pending section heading ──────────────────────────────────────
    // Must check before SKIP_PATTERNS because "Reserveeritud" alone wouldn't
    // match SKIP_PATTERNS but is a section heading, not a transaction.
    const cells = rowToColumns(row, columnMap);
    const date = cells.date?.trim() ?? "";
    const hasDate = isDateLike(date);

    if (!hasDate && isPendingSectionHeader(fullRowText)) {
      inPendingSection = true;
      previousTransaction = null;
      continue;
    }

    if (shouldSkipRow(fullRowText)) continue;

    const description = cells.description?.trim() ?? "";

    const debit =
      cells.debit !== undefined ? parseEuropeanNumber(cells.debit) : null;

    const credit =
      cells.credit !== undefined ? parseEuropeanNumber(cells.credit) : null;

    const balance =
      cells.balance !== undefined ? parseEuropeanNumber(cells.balance) : null;

    if (!hasDate) {
      const continuationText = description || fullRowText;

      if (previousTransaction && continuationText) {
        previousTransaction.description =
          `${previousTransaction.description} ${continuationText}`
            .replace(/\s+/g, " ")
            .trim();
      } else {
        warnings.push(
          `Unclassified row on page ${row.pageNumber}, row ${row.rowIndex}`,
        );
      }

      continue;
    }

    if (debit !== null && credit !== null) {
      warnings.push(
        `Both debit and credit present on page ${row.pageNumber}, row ${row.rowIndex}`,
      );
      previousTransaction = null;
      continue;
    }

    if (debit === null && credit === null) {
      warnings.push(
        `Transaction row has no amount on page ${row.pageNumber}, row ${row.rowIndex}`,
      );
      previousTransaction = null;
      continue;
    }

    const transaction: RawTransactionRow = {
      date,
      description,
      debit,
      credit,
      balance,
      pageNumber: row.pageNumber,
      rowIndex: row.rowIndex,
      ...(inPendingSection && { pending: true }),
    };

    transactions.push(transaction);
    previousTransaction = transaction;
  }

  return {
    transactions,
    warnings,
  };
}
