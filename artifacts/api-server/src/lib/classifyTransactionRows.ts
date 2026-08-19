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
  pending?: boolean;
}

export interface ClassifyTransactionRowsResult {
  transactions: RawTransactionRow[];
  warnings: string[];
}

const DATE_REGEX = /(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/;

const SKIP_PATTERNS = [
  /\bopening\s+balance\b/i,
  /\bclosing\s+balance\b/i,
  /\balgsaldo\b/i,
  /\blõppsaldo\b/i,
  /\bsubtotal\b/i,
  /\bvahekokku\b/i,
  /\blehekülg\b/i,
  /\bpage\b/i,
  /\bdeebetkäive\b/i,
  /\bkreeditkäive\b/i,
  /\bpäeva\s+jääk\b/i,
  /\bdebit\s+turnover\b/i,
  /\bcredit\s+turnover\b/i,
  /\bdaily\s+balance\b/i,
];

const PENDING_SECTION_PATTERNS = [
  /\breserveeritud\b/i,
  /\breservations?\b/i,
  /\bpending\s+(?:payments?|transactions?|card\s+payments?)\b/i,
  /\bcard\s+reservations?\b/i,
  /\breserveeritud\s+maksed\b/i,
];

function isPendingSectionHeader(text: string): boolean {
  return PENDING_SECTION_PATTERNS.some((p) => p.test(text));
}

function centerX(item: PdfRow["items"][number]): number {
  return item.x + item.width / 2;
}

function extractDate(value: string): string | null {
  const match = value.match(DATE_REGEX);
  return match ? match[1] : null;
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
  let inPendingSection = false;

  for (const row of orderedRows) {
    const fullRowText = row.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!fullRowText) continue;

    const cells = rowToColumns(row, columnMap);
    const rawDate = cells.date?.trim() || "";
    const parsedDate = extractDate(rawDate) || extractDate(fullRowText);

    if (!parsedDate && isPendingSectionHeader(fullRowText)) {
      inPendingSection = true;
      previousTransaction = null;
      continue;
    }

    if (shouldSkipRow(fullRowText)) continue;

    const description = cells.description?.trim() || "";
    let debit = cells.debit !== undefined ? parseEuropeanNumber(cells.debit) : null;
    let credit = cells.credit !== undefined ? parseEuropeanNumber(cells.credit) : null;
    const balance = cells.balance !== undefined ? parseEuropeanNumber(cells.balance) : null;

    if (!parsedDate) {
      const continuationText = description || fullRowText;
      if (previousTransaction && continuationText) {
        previousTransaction.description =
          `${previousTransaction.description} ${continuationText}`
            .replace(/\s+/g, " ")
            .trim();
      }
      continue;
    }

    // Kui mõlemad loeti kogemata täidetuks, määrame suurema või vaatame märki
    if (debit !== null && credit !== null) {
      if (debit === credit) {
        credit = null;
      } else {
        debit = debit > credit ? debit : null;
        credit = credit > (debit ?? 0) ? credit : null;
      }
    }

    if (debit === null && credit === null) {
      // Proovime leida summat tekstist otse
      const numMatch = fullRowText.match(/[-+]?\d+([.,]\d{2})/);
      if (numMatch) {
        const val = parseEuropeanNumber(numMatch[0]);
        if (val !== null) {
          if (val < 0) debit = Math.abs(val);
          else credit = val;
        }
      }
    }

    if (debit === null && credit === null) {
      continue;
    }

    const transaction: RawTransactionRow = {
      date: parsedDate,
      description: description || fullRowText,
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
