/**
 * Unit tests for parseEuropeanNumber.
 *
 * Self-contained — imports the function from parseEuropeanNumber.ts.
 * Compile and run:
 *
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/parseEuropeanNumber.test.ts | node
 *
 * No real financial data used. All test numbers are synthetic.
 */

import { parseEuropeanNumber } from "./parseEuropeanNumber.js";

// ── Minimal test harness ──────────────────────────────────────────────────────

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

function assertNull(result: number | null, label: string): void {
  assert(result === null, `${label} → null`);
}

function assertNum(result: number | null, expected: number, label: string): void {
  assert(
    result !== null && Math.abs(result - expected) < 1e-9,
    `${label} → ${expected} (got ${result})`,
  );
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

group("1. Plain integers", () => {
  assertNum(parseEuropeanNumber("0"),       0,       '"0"');
  assertNum(parseEuropeanNumber("42"),      42,      '"42"');
  assertNum(parseEuropeanNumber("1000"),    1000,    '"1000"');
  assertNum(parseEuropeanNumber("999999"), 999999,  '"999999"');
});

group("2. Comma as decimal separator (no thousands)", () => {
  assertNum(parseEuropeanNumber("1234,56"),   1234.56,   '"1234,56"');
  assertNum(parseEuropeanNumber("1234,5"),    1234.5,    '"1234,5"');
  assertNum(parseEuropeanNumber("1234,50"),   1234.5,    '"1234,50"');
  assertNum(parseEuropeanNumber("0,50"),      0.5,       '"0,50"');
  assertNum(parseEuropeanNumber("0,5"),       0.5,       '"0,5"');
  assertNum(parseEuropeanNumber("0,05"),      0.05,      '"0,05"');
  assertNum(parseEuropeanNumber("1234,5678"), 1234.5678, '"1234,5678" (4 decimal digits → unambiguous decimal)');
});

group("3. Period as decimal separator (no thousands, unambiguous)", () => {
  assertNum(parseEuropeanNumber("1234.56"),  1234.56,  '"1234.56"');
  assertNum(parseEuropeanNumber("1234.5"),   1234.5,   '"1234.5"');
  assertNum(parseEuropeanNumber("0.50"),     0.5,      '"0.50"');
  assertNum(parseEuropeanNumber("0.5"),      0.5,      '"0.5"');
  assertNum(parseEuropeanNumber("1.56"),     1.56,     '"1.56" (2 decimal digits → clearly decimal)');
  assertNum(parseEuropeanNumber("12.34"),    12.34,    '"12.34"');
  assertNum(parseEuropeanNumber("12.3456"),  12.3456,  '"12.3456" (4 decimal digits → clearly decimal)');
});

group("4. Space thousands + comma decimal (primary European format)", () => {
  assertNum(parseEuropeanNumber("1 234,56"),     1234.56,    '"1 234,56"');
  assertNum(parseEuropeanNumber("12 345,67"),    12345.67,   '"12 345,67"');
  assertNum(parseEuropeanNumber("1 234 567,89"), 1234567.89, '"1 234 567,89"');
  assertNum(parseEuropeanNumber("1 234,5"),      1234.5,     '"1 234,5"');
});

group("5. Space thousands + period decimal", () => {
  assertNum(parseEuropeanNumber("1 234.56"),     1234.56,    '"1 234.56"');
  assertNum(parseEuropeanNumber("12 345.67"),    12345.67,   '"12 345.67"');
  assertNum(parseEuropeanNumber("1 234 567.89"), 1234567.89, '"1 234 567.89"');
});

group("6. Period thousands + comma decimal (European with period grouping)", () => {
  assertNum(parseEuropeanNumber("1.234,56"),     1234.56,    '"1.234,56"');
  assertNum(parseEuropeanNumber("12.345,67"),    12345.67,   '"12.345,67"');
  assertNum(parseEuropeanNumber("1.234.567,89"), 1234567.89, '"1.234.567,89"');
  assertNum(parseEuropeanNumber("1.234,5"),      1234.5,     '"1.234,5"');
});

group("7. Comma thousands + period decimal (UK/US hybrid)", () => {
  assertNum(parseEuropeanNumber("1,234.56"),     1234.56,    '"1,234.56"');
  assertNum(parseEuropeanNumber("12,345.67"),    12345.67,   '"12,345.67"');
  assertNum(parseEuropeanNumber("1,234,567.89"), 1234567.89, '"1,234,567.89"');
  assertNum(parseEuropeanNumber("1,234.5"),      1234.5,     '"1,234.5"');
});

group("8. Integer thousands separators (no decimal part)", () => {
  assertNum(parseEuropeanNumber("1 234"),         1234,      '"1 234" (space thousands, integer)');
  assertNum(parseEuropeanNumber("1 234 567"),     1234567,   '"1 234 567" (multiple space groups)');
  assertNum(parseEuropeanNumber("1,234,567"),     1234567,   '"1,234,567" (comma thousands, integer)');
  assertNum(parseEuropeanNumber("1.234.567"),     1234567,   '"1.234.567" (period thousands, integer)');
});

group("9. Leading sign (+ and -)", () => {
  assertNum(parseEuropeanNumber("+1234,56"),    1234.56,   '"+1234,56"');
  assertNum(parseEuropeanNumber("-1234,56"),   -1234.56,   '"-1234,56"');
  assertNum(parseEuropeanNumber("+1 234,56"),  1234.56,   '"+1 234,56"');
  assertNum(parseEuropeanNumber("-1 234,56"), -1234.56,   '"-1 234,56"');
  assertNum(parseEuropeanNumber("-0,50"),     -0.5,        '"-0,50"');
  assertNum(parseEuropeanNumber("+0,50"),      0.5,        '"+0,50"');
  assertNum(parseEuropeanNumber("-1.234,56"), -1234.56,   '"-1.234,56"');
});

group("10. Whitespace stripping", () => {
  assertNum(parseEuropeanNumber("  1234,56  "),  1234.56, '"  1234,56  " (leading/trailing whitespace)');
  assertNum(parseEuropeanNumber("\t1234,56\n"),  1234.56, '"\\t1234,56\\n" (tab and newline)');
  // Non-breaking space as thousands separator
  assertNum(parseEuropeanNumber("1\u00a0234,56"), 1234.56, '"1\\u00a0234,56" (NBSP as thousands)');
  assertNum(parseEuropeanNumber("1\u202f234,56"), 1234.56, '"1\\u202f234,56" (narrow NBSP as thousands)');
});

group("11. Currency symbol prefix/suffix", () => {
  assertNum(parseEuropeanNumber("€1234,56"),      1234.56, '"€1234,56" (symbol prefix, no space)');
  assertNum(parseEuropeanNumber("€ 1234,56"),     1234.56, '"€ 1234,56" (symbol prefix with space)');
  assertNum(parseEuropeanNumber("1234,56€"),      1234.56, '"1234,56€" (symbol suffix)');
  assertNum(parseEuropeanNumber("1234,56 €"),     1234.56, '"1234,56 €" (symbol suffix with space)');
  assertNum(parseEuropeanNumber("€ 1 234,56"),    1234.56, '"€ 1 234,56" (symbol + space thousands)');
  assertNum(parseEuropeanNumber("$1234.56"),      1234.56, '"$1234.56"');
  assertNum(parseEuropeanNumber("£1 234.56"),     1234.56, '"£1 234.56"');
});

group("12. Currency code prefix/suffix", () => {
  assertNum(parseEuropeanNumber("EUR 1234,56"),    1234.56,   '"EUR 1234,56"');
  assertNum(parseEuropeanNumber("1234,56 EUR"),    1234.56,   '"1234,56 EUR"');
  assertNum(parseEuropeanNumber("EUR 1 234,56"),   1234.56,   '"EUR 1 234,56"');
  assertNum(parseEuropeanNumber("1 234,56 EUR"),   1234.56,   '"1 234,56 EUR"');
  assertNum(parseEuropeanNumber("-1234,56 EUR"),  -1234.56,   '"-1234,56 EUR"');
  assertNum(parseEuropeanNumber("SEK 1 234,56"),   1234.56,   '"SEK 1 234,56"');
});

group("13. Ambiguous formats → null", () => {
  // Single separator + exactly 3 trailing digits: could be thousands or decimal
  assertNull(parseEuropeanNumber("1,234"),    '"1,234" (1 comma, 3 trailing digits)');
  assertNull(parseEuropeanNumber("1.234"),    '"1.234" (1 period, 3 trailing digits)');
  assertNull(parseEuropeanNumber("1,000"),    '"1,000"');
  assertNull(parseEuropeanNumber("1.000"),    '"1.000"');
  assertNull(parseEuropeanNumber("100,000"),  '"100,000" (single comma, 3 trailing digits)');
  assertNull(parseEuropeanNumber("100.000"),  '"100.000"');
  // NOTE: "1,234,000" has MULTIPLE commas with all-3-digit groups → unambiguous integer 1234000.
  // That case is covered in group 13b below — it must NOT be null.
});

// Verify the "1,234,000" case is integer (not ambiguous) since multiple commas resolve it
group("13b. Multiple commas with all 3-digit groups → integer (not ambiguous)", () => {
  assertNum(parseEuropeanNumber("1,234,000"), 1234000, '"1,234,000" → 1234000 (multiple commas, all 3-digit groups)');
  assertNum(parseEuropeanNumber("1.234.000"), 1234000, '"1.234.000" → 1234000 (multiple periods, all 3-digit groups)');
});

group("14. Invalid / malformed formats → null", () => {
  assertNull(parseEuropeanNumber(""),         '"" (empty string)');
  assertNull(parseEuropeanNumber("   "),      '"   " (whitespace only)');
  assertNull(parseEuropeanNumber("abc"),      '"abc" (non-numeric)');
  assertNull(parseEuropeanNumber("€"),        '"€" (only currency symbol)');
  assertNull(parseEuropeanNumber("EUR"),      '"EUR" (only currency code)');
  assertNull(parseEuropeanNumber("-"),        '"-" (only sign)');
  assertNull(parseEuropeanNumber("+"),        '"+" (only sign)');
  assertNull(parseEuropeanNumber("1.2.3"),    '"1.2.3" (non-3-digit last group)');
  assertNull(parseEuropeanNumber("1,2,3"),    '"1,2,3" (non-3-digit last group)');
  assertNull(parseEuropeanNumber("1.234.56"), '"1.234.56" (second group not 3 digits)');
  assertNull(parseEuropeanNumber("1,234,56"), '"1,234,56" (second group not 3 digits)');
  assertNull(parseEuropeanNumber("1,23,456"), '"1,23,456" (non-3-digit middle group)');
  assertNull(parseEuropeanNumber("1.23.456"), '"1.23.456" (non-3-digit middle group)');
  assertNull(parseEuropeanNumber("12 34"),    '"12 34" (space group not 3 digits)');
  assertNull(parseEuropeanNumber("1 2 34"),   '"1 2 34" (space groups not all 3 digits)');
  assertNull(parseEuropeanNumber("NaN"),      '"NaN"');
  assertNull(parseEuropeanNumber("1e5"),      '"1e5" (scientific notation)');
  assertNull(parseEuropeanNumber("1,234.5.6"), '"1,234.5.6" (two periods after comma)');
});

group("15. Non-string input → null", () => {
  // TypeScript callers won't trigger these, but the guard matters for JS callers
  assert(parseEuropeanNumber(null as unknown as string) === null, "null → null");
  assert(parseEuropeanNumber(undefined as unknown as string) === null, "undefined → null");
  assert(parseEuropeanNumber(1234 as unknown as string) === null, "number 1234 → null");
});

group("16. Determinism — identical calls produce identical results", () => {
  const cases = [
    "1 234,56",
    "1.234.567,89",
    "1,234,567.89",
    "-0,50",
    "€ 1 234,56 EUR",
    "1,234",
  ] as const;
  let allMatch = true;
  for (const c of cases) {
    const r1 = parseEuropeanNumber(c);
    const r2 = parseEuropeanNumber(c);
    if (r1 !== r2) { allMatch = false; }
  }
  assert(allMatch, "all repeated calls return the same value");
});

group("17. Edge: zero values", () => {
  assertNum(parseEuropeanNumber("0,00"),   0, '"0,00"');
  assertNum(parseEuropeanNumber("0.00"),   0, '"0.00"');
  assertNum(parseEuropeanNumber("0"),      0, '"0"');
  assertNum(parseEuropeanNumber("-0,00"),  0, '"-0,00" normalised to 0');
});

group("18. Large amounts (common in bank statement totals)", () => {
  assertNum(parseEuropeanNumber("1 234 567,89"),  1234567.89, '"1 234 567,89"');
  assertNum(parseEuropeanNumber("1.234.567,89"),  1234567.89, '"1.234.567,89"');
  assertNum(parseEuropeanNumber("1,234,567.89"),  1234567.89, '"1,234,567.89"');
  assertNum(parseEuropeanNumber("10 000 000,00"), 10000000,   '"10 000 000,00"');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(48)}`);
console.log(`  parseEuropeanNumber: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
