import type { PdfRow } from "./groupIntoRows";
import { parseEuropeanNumber } from "./parseEuropeanNumber";

export interface StructuralControls {
  openingBalance: number | null;
  closingBalance: number | null;
  printedIncomeTotal: number | null;
  printedExpenseTotal: number | null;
}

export interface StructuralControlsResult {
  controls: StructuralControls;
  warnings: string[];
}

// ── Opening/closing balance ───────────────────────────────────────────────────
// These labels are inherently statement-level concepts; no scope qualifier needed.

const OPENING_PATTERNS = [
  /\balgsaldo\b/i,
  /\bopening balance\b/i,
  /\bstart balance\b/i,
  /\bbalance at period start\b/i,
];

const CLOSING_PATTERNS = [
  /\blõppsaldo\b/i,
  /\bclosing balance\b/i,
  /\bend balance\b/i,
  /\bbalance at period end\b/i,
];

// ── Statement-wide printed income total ──────────────────────────────────────
//
// REQUIREMENT: A row may only set printedIncomeTotal when its label
// unambiguously represents the TOTAL FOR THE WHOLE STATEMENT PERIOD.
//
// Rules for every pattern here:
//   - Must contain an explicit scope-qualifying word ("kokku", "total", "period")
//     OR be an unambiguous English multi-word phrase that carries period scope.
//   - Bare words ("laekumised", "sissetulekud") are intentionally NOT here
//     because they appear as per-day and per-page subtotals and would produce
//     false positives (e.g. a daily "Laekumised 937,90" on page 1 would be
//     taken instead of the actual statement-wide total).

const INCOME_PATTERNS = [
  // Estonian — "kokku" (= total/altogether) makes these unambiguously period-wide
  /\blaekumised kokku\b/i,
  /\bkokku laekumised\b/i,
  /\bsissetulekud kokku\b/i,
  /\bkokku sissetulekud\b/i,
  /\bkrediidid kokku\b/i,
  /\bkokku krediidid\b/i,
  // English — "total" is an explicit scope qualifier
  /\btotal credits\b/i,
  /\btotal income\b/i,
  /\bincome total\b/i,
];

// ── Statement-wide printed expense total ─────────────────────────────────────
//
// Same rules: every pattern must carry an explicit scope qualifier.
// Bare "väljaminekud" is not here for the same reason as "laekumised".

const EXPENSE_PATTERNS = [
  // Estonian — "kokku" makes these unambiguously period-wide
  /\bväljaminekud kokku\b/i,
  /\bkokku väljaminekud\b/i,
  /\bkulud kokku\b/i,
  /\bkokku kulud\b/i,
  /\bdeebetid kokku\b/i,
  /\bkokku deebetid\b/i,
  /\bmaksed kokku\b/i,
  /\bkokku maksed\b/i,
  // English — "total" is an explicit scope qualifier
  /\btotal debits\b/i,
  /\btotal expenses\b/i,
  /\bexpense total\b/i,
];

// ── Daily / per-page / intermediate scope exclusions ─────────────────────────
//
// Belt-and-suspenders: if a row's text matches any of these patterns, it is a
// per-day, per-page, or intermediate summary and must NOT become the
// statement-wide printed income or expense total, regardless of what other
// words appear on the row.
//
// Applied only to printedIncomeTotal and printedExpenseTotal — opening and
// closing balance patterns are already unambiguous and do not need this filter.

const DAILY_SCOPE_EXCLUSION_PATTERNS = [
  /\bpäeva\b/i,              // "day's" — "päeva laekumised" = day's income
  /\bkreeditkäive\b/i,      // daily credit turnover
  /\bdeebetkäive\b/i,       // daily debit turnover
  /\bdaily\b/i,
  /\bsubtotal\b/i,
  /\bvahesumma\b/i,          // subtotal in Estonian
  /\bpending\b/i,
  /\breserveeritud\b/i,      // reserved in Estonian
];

function rowText(row: PdfRow): string {
  return row.items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function numericCandidates(row: PdfRow): number[] {
  const values: number[] = [];

  for (const item of row.items) {
    const raw = item.str.trim();
    if (!raw) continue;

    const parsed = parseEuropeanNumber(raw);

    if (parsed !== null) {
      values.push(parsed);
    }
  }

  return values;
}

function chooseRightmostNumericValue(row: PdfRow): number | null {
  const candidates = row.items
    .map((item) => ({
      x: item.x + item.width / 2,
      value: parseEuropeanNumber(item.str.trim()),
    }))
    .filter(
      (entry): entry is { x: number; value: number } => entry.value !== null,
    )
    .sort((a, b) => b.x - a.x);

  return candidates.length > 0 ? candidates[0].value : null;
}

export function extractStructuralControls(
  rows: PdfRow[],
): StructuralControlsResult {
  const warnings: string[] = [];

  const controls: StructuralControls = {
    openingBalance: null,
    closingBalance: null,
    printedIncomeTotal: null,
    printedExpenseTotal: null,
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      controls,
      warnings: ["No structural rows were provided."],
    };
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

  for (const row of orderedRows) {
    const text = rowText(row);
    if (!text) continue;

    let target: keyof StructuralControls | null = null;

    if (matchesAny(text, OPENING_PATTERNS)) {
      target = "openingBalance";
    } else if (matchesAny(text, CLOSING_PATTERNS)) {
      target = "closingBalance";
    } else if (matchesAny(text, INCOME_PATTERNS)) {
      // Extra guard: per-day or intermediate rows must never become the
      // statement-wide income total even if the row matches an income pattern.
      if (matchesAny(text, DAILY_SCOPE_EXCLUSION_PATTERNS)) {
        warnings.push(
          `Income label found but excluded (per-day/intermediate scope) on page ${row.pageNumber}, row ${row.rowIndex}: "${text.slice(0, 80)}"`,
        );
        continue;
      }
      target = "printedIncomeTotal";
    } else if (matchesAny(text, EXPENSE_PATTERNS)) {
      // Same guard for expense.
      if (matchesAny(text, DAILY_SCOPE_EXCLUSION_PATTERNS)) {
        warnings.push(
          `Expense label found but excluded (per-day/intermediate scope) on page ${row.pageNumber}, row ${row.rowIndex}: "${text.slice(0, 80)}"`,
        );
        continue;
      }
      target = "printedExpenseTotal";
    }

    if (!target) continue;

    const values = numericCandidates(row);

    if (values.length === 0) {
      warnings.push(
        `Control label found but no numeric value on page ${row.pageNumber}, row ${row.rowIndex}`,
      );
      continue;
    }

    const value = chooseRightmostNumericValue(row);

    if (value === null) {
      warnings.push(
        `Control value could not be parsed on page ${row.pageNumber}, row ${row.rowIndex}`,
      );
      continue;
    }

    if (controls[target] !== null) {
      if (Math.abs((controls[target] as number) - value) > 0.02) {
        warnings.push(
          `Conflicting ${target} values found on page ${row.pageNumber}, row ${row.rowIndex}`,
        );
      }

      continue;
    }

    controls[target] = value;
  }

  return {
    controls,
    warnings,
  };
}
