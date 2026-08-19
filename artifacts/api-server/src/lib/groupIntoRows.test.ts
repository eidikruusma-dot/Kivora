/**
 * Unit tests for groupIntoRows (and deriveYTolerance).
 *
 * Self-contained — imports from groupIntoRows.ts.
 * Compile and run:
 *
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/groupIntoRows.test.ts | node
 *
 * All test items are synthetic — no real PDF data, no real financial text.
 * Y=0 is page bottom (PDF space); higher Y = higher on page.
 */

import { groupIntoRows, deriveYTolerance } from "./groupIntoRows.js";
import type { RawPdfTextItem, PdfRow } from "./groupIntoRows.js";

// ── Test harness ──────────────────────────────────────────────────────────────

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

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a synthetic RawPdfTextItem with an identity-plus-translation CTM.
 * Height defaults to 10 (10pt font) so derived tolerance = max(0.5, 10×0.4) = 4.
 */
function item(
  x: number,
  y: number,
  str: string,
  pageNumber = 1,
  height = 10,
): RawPdfTextItem {
  return {
    str,
    transform: [1, 0, 0, 1, x, y],  // standard identity+translation CTM
    width: str.length * 6,            // approximation; not used for grouping
    height,
    pageNumber,
  };
}

/**
 * Deep-equality comparison for PdfRow (structure, not reference).
 * Compares all scalar fields and item arrays.
 */
function rowsEqual(a: PdfRow[], b: PdfRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((rowA, ri) => {
    const rowB = b[ri];
    if (
      rowA.pageNumber !== rowB.pageNumber ||
      rowA.rowY       !== rowB.rowY       ||
      rowA.rowIndex   !== rowB.rowIndex   ||
      rowA.items.length !== rowB.items.length
    ) return false;
    return rowA.items.every((itemA, ii) => {
      const itemB = rowB.items[ii];
      return (
        itemA.str        === itemB.str &&
        itemA.x          === itemB.x   &&
        itemA.y          === itemB.y   &&
        itemA.pageNumber === itemB.pageNumber
      );
    });
  });
}

// Derived tolerance for height=10 items: max(0.5, 10*0.4) = 4.0
const TOL_10PT = 4.0;

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

group("1. Empty input", () => {
  const result = groupIntoRows([]);
  assert(result.length === 0, "empty array → empty result");
});

group("2. Single item", () => {
  const result = groupIntoRows([item(50, 780, "A")]);
  assert(result.length === 1,                   "one row");
  assert(result[0].items.length === 1,          "row has one item");
  assert(result[0].rowIndex === 0,              "rowIndex = 0");
  assert(result[0].rowY === 780,                "rowY = item Y");
  assert(result[0].pageNumber === 1,            "pageNumber = 1");
  assert(result[0].items[0].str === "A",        "item str preserved");
  assert(result[0].items[0].x === 50,           "item x preserved");
  assert(result[0].items[0].y === 780,          "item y preserved");
});

group("3. Two items on the same row — sorted by X ascending", () => {
  // Input order: x=200 first, x=50 second — output must be x=50, x=200
  const result = groupIntoRows([
    item(200, 760, "B"),
    item(50,  760, "A"),
  ]);
  assert(result.length === 1,                    "one row");
  assert(result[0].items.length === 2,           "two items in row");
  assert(result[0].items[0].x === 50,            "first item x=50 (sorted ascending)");
  assert(result[0].items[1].x === 200,           "second item x=200");
  assert(result[0].items[0].str === "A",         "first item str = A");
  assert(result[0].items[1].str === "B",         "second item str = B");
});

group("4. Three items on same row — sorted by X ascending", () => {
  const result = groupIntoRows([
    item(300, 760, "C"),
    item(50,  760, "A"),
    item(150, 760, "B"),
  ]);
  assert(result.length === 1,            "one row");
  assert(result[0].items.length === 3,   "three items");
  assert(result[0].items[0].x === 50,   "x=50 first");
  assert(result[0].items[1].x === 150,  "x=150 second");
  assert(result[0].items[2].x === 300,  "x=300 third");
});

group("5. Small Y jitter — items within tolerance grouped into same row", () => {
  // Height=10 → tolerance=4. Y difference of 0.2 << 4 → same row.
  const result = groupIntoRows([
    item(50,  100.0, "Left",   1, 10),
    item(200, 100.2, "Right",  1, 10),
  ]);
  assert(result.length === 1,           "Y jitter of 0.2 within tolerance 4 → one row");
  assert(result[0].items.length === 2,  "both items in the row");
  // rowY is the seed Y (highest Y in cluster, from the first-sorted item)
  assert(result[0].rowY === 100.2,      "rowY = seed Y (100.2, highest in cluster)");
});

group("6. Nearby but distinct rows — gap clearly above tolerance", () => {
  // height=10 → tolerance=4. Y=780 and Y=760: gap=20 >> 4 → separate rows.
  const result = groupIntoRows([
    item(50, 780, "Header"),
    item(50, 760, "Row1"),
  ]);
  assert(result.length === 2,                  "two distinct rows");
  assert(result[0].rowY === 780,               "first row: Y=780 (top)");
  assert(result[1].rowY === 760,               "second row: Y=760");
  assert(result[0].rowIndex === 0,             "rowIndex 0 = topmost");
  assert(result[1].rowIndex === 1,             "rowIndex 1 = next");
  assert(result[0].items[0].str === "Header",  "first row contains Header");
  assert(result[1].items[0].str === "Row1",    "second row contains Row1");
});

group("7. Multiple rows with multiple items each", () => {
  // 3 rows of 3 items each
  const input = [
    item(300, 780, "C1"), item(50, 780, "A1"), item(150, 780, "B1"),
    item(300, 760, "C2"), item(50, 760, "A2"), item(150, 760, "B2"),
    item(300, 740, "C3"), item(50, 740, "A3"), item(150, 740, "B3"),
  ];
  const result = groupIntoRows(input);
  assert(result.length === 3,                        "three rows");
  // Rows in top-to-bottom order
  assert(result[0].rowY === 780,                     "row 0: Y=780");
  assert(result[1].rowY === 760,                     "row 1: Y=760");
  assert(result[2].rowY === 740,                     "row 2: Y=740");
  // Each row has 3 items sorted by X
  assert(result[0].items.length === 3,               "row 0 has 3 items");
  assert(result[0].items[0].x === 50,               "row 0 item 0: x=50");
  assert(result[0].items[1].x === 150,              "row 0 item 1: x=150");
  assert(result[0].items[2].x === 300,              "row 0 item 2: x=300");
  // rowIndex sequential
  assert(result[0].rowIndex === 0,                   "rowIndex 0");
  assert(result[1].rowIndex === 1,                   "rowIndex 1");
  assert(result[2].rowIndex === 2,                   "rowIndex 2");
});

group("8. Multi-page input — pages kept separate, returned in ascending page order", () => {
  // Page 2: both items at Y=760 (same row); page 1: rows at Y=780 and Y=760.
  const input = [
    item(50,  760, "P2-Row1-ItemA", 2),
    item(50,  780, "P1-Row1-ItemA", 1),
    item(50,  760, "P1-Row2-ItemA", 1),
    item(150, 760, "P2-Row1-ItemB", 2),   // different X, same Y=760 → same row as P2-Row1-ItemA
  ];
  const result = groupIntoRows(input);
  // Page 1: rows at Y=780 and Y=760; Page 2: row at Y=780 (both items same Y)
  assert(result.length === 3,                             "three rows total (2 on p1, 1 on p2)");
  assert(result[0].pageNumber === 1,                      "first two rows: page 1");
  assert(result[1].pageNumber === 1,                      "second row also page 1");
  assert(result[2].pageNumber === 2,                      "third row: page 2");
  assert(result[0].rowY === 780,                          "page 1 row 0: Y=780");
  assert(result[1].rowY === 760,                          "page 1 row 1: Y=760");
  assert(result[2].items.length === 2,                    "page 2 row has 2 items");
  // Row indices are per-page
  assert(result[0].rowIndex === 0,                        "page 1: rowIndex 0");
  assert(result[1].rowIndex === 1,                        "page 1: rowIndex 1");
  assert(result[2].rowIndex === 0,                        "page 2: rowIndex 0 (fresh per page)");
});

group("9. Repeated identical text — preserved as separate items (no deduplication)", () => {
  const result = groupIntoRows([
    item(50,  780, "same"),
    item(150, 780, "same"),
    item(250, 780, "same"),
  ]);
  assert(result.length === 1,           "one row");
  assert(result[0].items.length === 3,  "three items preserved even with same str");
  assert(result[0].items[0].x === 50,  "item 0 x=50");
  assert(result[0].items[1].x === 150, "item 1 x=150");
  assert(result[0].items[2].x === 250, "item 2 x=250");
});

group("10. Determinism — same input produces identical output on repeated calls", () => {
  const input = [
    item(300, 780, "C"), item(50, 780, "A"), item(150, 780, "B"),
    item(50,  760, "D"), item(200, 760, "E"),
    item(100, 740, "F"),
  ];
  const r1 = groupIntoRows(input);
  const r2 = groupIntoRows(input);
  assert(rowsEqual(r1, r2), "two calls with identical input → identical output");
});

group("11. Custom yTolerance overrides derived tolerance", () => {
  // Items at Y=100 and Y=100.2; default tolerance=4 → same row.
  // With tolerance=0.1, gap=0.2 > 0.1 → separate rows.
  const input = [
    item(50, 100.0, "A", 1, 10),
    item(50, 100.2, "B", 1, 10),
  ];
  const defaultResult = groupIntoRows(input);
  const tightResult   = groupIntoRows(input, 0.1);

  assert(defaultResult.length === 1, "default tolerance: one row (gap 0.2 < 4)");
  assert(tightResult.length === 2,   "tight tolerance 0.1: two rows (gap 0.2 > 0.1)");
});

group("12. Items with invalid coordinates are filtered out", () => {
  const input: RawPdfTextItem[] = [
    item(50, 780, "Valid"),
    {
      // Invalid: NaN coordinates
      str: "Invalid",
      transform: [1, 0, 0, 1, NaN, NaN],
      width: 30,
      height: 10,
      pageNumber: 1,
    },
    {
      // Invalid: Infinity
      str: "AlsoInvalid",
      transform: [1, 0, 0, 1, Infinity, 760],
      width: 30,
      height: 10,
      pageNumber: 1,
    },
  ];
  const result = groupIntoRows(input);
  assert(result.length === 1,              "only one row (invalid items filtered)");
  assert(result[0].items.length === 1,     "only the valid item present");
  assert(result[0].items[0].str === "Valid", "valid item's str preserved");
});

group("13. Items at the exact tolerance boundary", () => {
  // height=10 → tol=4. Gap exactly 4: |760 - 756| = 4.
  // Condition: Math.abs(item.y - seedY) > tol → 4 > 4 is false → same row.
  const result = groupIntoRows([
    item(50, 760, "SeedItem", 1, 10),
    item(50, 756, "BoundaryItem", 1, 10),
  ]);
  assert(result.length === 1,   "gap = tolerance → same row (boundary inclusive)");

  // Gap one unit above tolerance: 4.01 > 4 → different rows
  const result2 = groupIntoRows([
    item(50, 760.00, "SeedItem", 1, 10),
    item(50, 755.99, "FarItem",  1, 10),
  ]);
  assert(result2.length === 2, "gap 4.01 > tolerance 4 → different rows");
});

group("14. Row ordering is top-to-bottom (descending Y)", () => {
  // Input deliberately in bottom-to-top order to confirm re-sorting
  const result = groupIntoRows([
    item(50, 700, "Bottom"),
    item(50, 740, "Middle"),
    item(50, 780, "Top"),
  ]);
  assert(result.length === 3,                      "three rows");
  assert(result[0].items[0].str === "Top",         "row 0 = topmost (Y=780)");
  assert(result[1].items[0].str === "Middle",      "row 1 = middle (Y=740)");
  assert(result[2].items[0].str === "Bottom",      "row 2 = bottom (Y=700)");
  assert(result[0].rowIndex === 0,                 "rowIndex 0 = topmost");
  assert(result[2].rowIndex === 2,                 "rowIndex 2 = bottom");
});

group("15. Items with same X sorted by str for full stability", () => {
  // Two items at the exact same (x, y) — must produce stable order by str
  const result = groupIntoRows([
    item(50, 780, "Z-item"),
    item(50, 780, "A-item"),
  ]);
  assert(result.length === 1,                          "one row");
  assert(result[0].items.length === 2,                 "two items");
  assert(result[0].items[0].str === "A-item",          "A-item first (str sort ascending)");
  assert(result[0].items[1].str === "Z-item",          "Z-item second");
});

group("16. Coordinates preserved exactly from source (no rounding)", () => {
  const src = item(123.456789, 789.123456, "Precise");
  const result = groupIntoRows([src]);
  assert(result[0].items[0].x === 123.456789,   "x coordinate preserved exactly");
  assert(result[0].items[0].y === 789.123456,   "y coordinate preserved exactly");
});

group("17. Empty string items included (not filtered on str)", () => {
  const result = groupIntoRows([
    item(50,  780, ""),
    item(100, 780, "NonEmpty"),
  ]);
  assert(result.length === 1,                       "one row");
  assert(result[0].items.length === 2,              "both items included (empty str not filtered)");
});

group("18. deriveYTolerance — data-driven, not hardcoded", () => {
  // 10pt items → 40% of 10 = 4
  const tol10 = deriveYTolerance([item(0, 0, "A", 1, 10)]);
  assert(Math.abs(tol10 - 4.0) < 1e-9,   "10pt items → tolerance 4.0");

  // 20pt items → 40% of 20 = 8
  const tol20 = deriveYTolerance([item(0, 0, "A", 1, 20)]);
  assert(Math.abs(tol20 - 8.0) < 1e-9,   "20pt items → tolerance 8.0");

  // Mixed: heights [10, 10, 20, 20] → sorted → median = 10 (index 2 of 4) → 40% of 10 = 4
  const tolMixed = deriveYTolerance([
    item(0, 0, "A", 1, 10),
    item(0, 0, "B", 1, 20),
    item(0, 0, "C", 1, 10),
    item(0, 0, "D", 1, 20),
  ]);
  assert(Math.abs(tolMixed - 4.0) < 1e-9, "mixed heights [10,10,20,20] → median=10 → tol=4.0");

  // No items with valid height → fallback 2
  const tolFallback = deriveYTolerance([{
    str: "X", transform: [1,0,0,1,0,0], width: 10, height: 0, pageNumber: 1,
  }]);
  assert(tolFallback === 2,               "all-zero heights → fallback tol=2");

  // Very small font (1pt) → minimum clamp applies: max(0.5, 1*0.4)=max(0.5, 0.4)=0.5
  const tolTiny = deriveYTolerance([item(0, 0, "A", 1, 1)]);
  assert(Math.abs(tolTiny - 0.5) < 1e-9, "1pt items → tolerance clamped to 0.5 minimum");
});

group("19. pageNumber correctly preserved in PdfTextItem output", () => {
  const result = groupIntoRows([
    item(50, 780, "PageTwoItem", 2),
  ]);
  assert(result[0].items[0].pageNumber === 2, "pageNumber in item matches source pageNumber");
  assert(result[0].pageNumber === 2,          "pageNumber in row matches source pageNumber");
});

group("20. Large multi-row, multi-page input — structural integrity", () => {
  // 5 pages × 4 rows × 3 items = 60 items total
  const input: RawPdfTextItem[] = [];
  for (let p = 1; p <= 5; p++) {
    for (let r = 0; r < 4; r++) {
      const y = 780 - r * 20; // rows 20pt apart (>> tolerance 4)
      for (let col = 0; col < 3; col++) {
        input.push(item(50 + col * 100, y, `P${p}R${r}C${col}`, p));
      }
    }
  }
  const result = groupIntoRows(input);
  assert(result.length === 20,              "20 rows total (5 pages × 4 rows)");
  assert(result.every(r => r.items.length === 3), "each row has 3 items");
  assert(result.every(r => r.items[0].x === 50 && r.items[1].x === 150 && r.items[2].x === 250),
    "all items sorted by X within rows");
  // Check page order
  const pageNums = result.map(r => r.pageNumber);
  const isSorted = pageNums.every((p, i) => i === 0 || pageNums[i - 1] <= p);
  assert(isSorted, "rows appear in ascending page-number order");
  // Check rowIndex per page
  for (let p = 1; p <= 5; p++) {
    const pageRows = result.filter(r => r.pageNumber === p);
    assert(pageRows.length === 4, `page ${p}: 4 rows`);
    assert(
      pageRows.every((r, i) => r.rowIndex === i),
      `page ${p}: rowIndex 0..3 sequential`,
    );
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(48)}`);
console.log(`  groupIntoRows: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
