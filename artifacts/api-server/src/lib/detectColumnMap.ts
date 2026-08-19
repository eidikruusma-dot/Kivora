import type { PdfRow } from "./groupIntoRows";

export interface ColumnMap {
  date?: number;
  description?: number;
  debit?: number;
  credit?: number;
  balance?: number;
}

type ColumnKey = keyof ColumnMap;

const HEADER_PATTERNS: Record<ColumnKey, RegExp[]> = {
  date: [
    /\bkuupäev\b/i,
    /\bdate\b/i,
    /\bdatum\b/i,
    /\bkp\b/i,
    /\btehingu\s*kuupäev\b/i,
    /\bväärtuspäev\b/i,
  ],
  description: [
    /\bselgitus\b/i,
    /\bkirjeldus\b/i,
    /\bdescription\b/i,
    /\bdetails\b/i,
    /\bsaaja\b/i,
    /\bmaksja\b/i,
    /\bsaaja\s*\/\s*maksja\b/i,
    /\bpartner\b/i,
    /\bnimi\b/i,
    /\btehingu\s*kirjeldus\b/i,
  ],
  debit: [
    /\bdeebet\b/i,
    /\bdebit\b/i,
    /\bväljamakse\b/i,
    /\bväljaminek\b/i,
    /\bmaha\b/i,
    /\bdebiteeritud\b/i,
    /\bdebet\b/i,
  ],
  credit: [
    /\bkreedit\b/i,
    /\bcredit\b/i,
    /\bsissemakse\b/i,
    /\bsissetulek\b/i,
    /\bjuurde\b/i,
    /\bkrediteeritud\b/i,
    /\bkredit\b/i,
  ],
  balance: [
    /\bjääk\b/i,
    /\bsaldo\b/i,
    /\bbalance\b/i,
    /\blõppjääk\b/i,
    /\brunning\s*balance\b/i,
  ],
};

function itemCenterX(item: PdfRow["items"][number]): number {
  return item.x + item.width / 2;
}

function normalizeHeaderText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function detectHeaderMatches(row: PdfRow): Partial<Record<ColumnKey, number>> {
  const matches: Partial<Record<ColumnKey, number>> = {};

  for (const item of row.items) {
    const text = normalizeHeaderText(item.str);
    if (!text) continue;

    for (const [key, patterns] of Object.entries(HEADER_PATTERNS) as [
      ColumnKey,
      RegExp[],
    ][]) {
      if (matches[key] !== undefined) continue;

      if (patterns.some((pattern) => pattern.test(text))) {
        matches[key] = itemCenterX(item);
      }
    }
  }

  return matches;
}

function countDefinedColumns(map: Partial<Record<ColumnKey, number>>): number {
  return Object.values(map).filter((value) => typeof value === "number").length;
}

function isSaneColumnOrder(map: ColumnMap): boolean {
  const entries = Object.entries(map)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => ({
      key: key as ColumnKey,
      x: value as number,
    }))
    .sort((a, b) => a.x - b.x);

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].x - entries[i - 1].x < 5) {
      return false;
    }
  }

  if (
    map.date !== undefined &&
    map.description !== undefined &&
    map.date >= map.description
  ) {
    return false;
  }

  return true;
}

function mapsAreCompatible(a: ColumnMap, b: ColumnMap): boolean {
  const keys: ColumnKey[] = [
    "date",
    "description",
    "debit",
    "credit",
    "balance",
  ];

  let compared = 0;

  for (const key of keys) {
    const ax = a[key];
    const bx = b[key];

    if (ax === undefined || bx === undefined) continue;

    compared++;

    if (Math.abs(ax - bx) > 30) {
      return false;
    }
  }

  return compared >= 2;
}

export function detectColumnMap(rows: PdfRow[]): ColumnMap | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const rowsByPage = new Map<number, PdfRow[]>();

  for (const row of rows) {
    const pageRows = rowsByPage.get(row.pageNumber) ?? [];
    pageRows.push(row);
    rowsByPage.set(row.pageNumber, pageRows);
  }

  const candidates: ColumnMap[] = [];

  for (const [, pageRows] of rowsByPage) {
    const ordered = [...pageRows]
      .sort((a, b) => {
        if (a.rowIndex !== b.rowIndex) {
          return a.rowIndex - b.rowIndex;
        }
        return b.rowY - a.rowY;
      })
      .slice(0, 50);

    for (const row of ordered) {
      const matches = detectHeaderMatches(row);
      const count = countDefinedColumns(matches);

      // Lubame ka 2 veeruga tabamused (nt kuupäev + selgitus)
      if (count < 2) continue;

      const candidate: ColumnMap = {
        ...matches,
      };

      if (!isSaneColumnOrder(candidate)) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const best = [...candidates].sort((a, b) => {
    const countDiff = countDefinedColumns(b) - countDefinedColumns(a);
    if (countDiff !== 0) return countDiff;

    const aDate = a.date ?? Number.POSITIVE_INFINITY;
    const bDate = b.date ?? Number.POSITIVE_INFINITY;
    return aDate - bDate;
  })[0];

  const compatible = candidates.filter((candidate) =>
    mapsAreCompatible(best, candidate),
  );

  if (compatible.length === 0) {
    return best;
  }

  const result: ColumnMap = {};
  const keys: ColumnKey[] = [
    "date",
    "description",
    "debit",
    "credit",
    "balance",
  ];

  for (const key of keys) {
    const xs = compatible
      .map((candidate) => candidate[key])
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);

    if (xs.length === 0) continue;

    result[key] = xs[Math.floor((xs.length - 1) / 2)];
  }

  return isSaneColumnOrder(result) ? result : null;
}
