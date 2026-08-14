import { detectColumnMap } from "./detectColumnMap";
import type { PdfRow } from "./groupIntoRows";

function row(
  pageNumber: number,
  rowIndex: number,
  rowY: number,
  items: Array<{ str: string; x: number; width?: number }>,
): PdfRow {
  return {
    pageNumber,
    rowIndex,
    rowY,
    items: items.map((item) => ({
      str: item.str,
      x: item.x,
      y: rowY,
      width: item.width ?? 40,
      height: 10,
      pageNumber,
    })),
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function approxEqual(
  a: number | undefined,
  b: number,
  tolerance = 0.001,
): boolean {
  return typeof a === "number" && Math.abs(a - b) <= tolerance;
}

function runTests(): void {
  let passed = 0;

  // 1. Estonian standard header
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Kuupäev", x: 50 },
        { str: "Selgitus", x: 150, width: 100 },
        { str: "Deebet", x: 350 },
        { str: "Kreedit", x: 450 },
        { str: "Jääk", x: 550 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result !== null, "ET header should be detected");
    assert(approxEqual(result?.date, 70), "ET date x incorrect");
    assert(approxEqual(result?.description, 200), "ET description x incorrect");
    assert(approxEqual(result?.debit, 370), "ET debit x incorrect");
    assert(approxEqual(result?.credit, 470), "ET credit x incorrect");
    assert(approxEqual(result?.balance, 570), "ET balance x incorrect");
    passed++;
  }

  // 2. English standard header
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Date", x: 40 },
        { str: "Description", x: 130, width: 120 },
        { str: "Debit", x: 330 },
        { str: "Credit", x: 420 },
        { str: "Balance", x: 520 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result !== null, "EN header should be detected");
    assert(result?.date !== undefined, "EN date missing");
    assert(result?.description !== undefined, "EN description missing");
    assert(result?.debit !== undefined, "EN debit missing");
    assert(result?.credit !== undefined, "EN credit missing");
    assert(result?.balance !== undefined, "EN balance missing");
    passed++;
  }

  // 3. Unknown bank name must not matter
  {
    const rows: PdfRow[] = [
      row(1, 0, 730, [
        { str: "Mystery International Bank", x: 40, width: 180 },
      ]),
      row(1, 1, 700, [
        { str: "Date", x: 40 },
        { str: "Details", x: 130 },
        { str: "Debit", x: 330 },
        { str: "Credit", x: 420 },
        { str: "Balance", x: 520 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result !== null, "Unknown bank should not block column detection");
    passed++;
  }

  // 4. Too few recognized columns => null
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Date", x: 40 },
        { str: "Description", x: 130 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result === null, "Two-column header must return null");
    passed++;
  }

  // 5. Repeated header on multiple pages
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Date", x: 40 },
        { str: "Description", x: 130, width: 120 },
        { str: "Debit", x: 330 },
        { str: "Credit", x: 420 },
        { str: "Balance", x: 520 },
      ]),
      row(2, 0, 700, [
        { str: "Date", x: 42 },
        { str: "Description", x: 132, width: 120 },
        { str: "Debit", x: 332 },
        { str: "Credit", x: 422 },
        { str: "Balance", x: 522 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result !== null, "Repeated compatible headers should be detected");
    assert(
      result?.date !== undefined && result.date >= 60 && result.date <= 62,
      "Repeated header median date x unexpected",
    );
    passed++;
  }

  // 6. Header tokens too close together => reject
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Date", x: 40, width: 20 },
        { str: "Description", x: 44, width: 20 },
        { str: "Debit", x: 48, width: 20 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result === null, "Overlapping columns should be rejected");
    passed++;
  }

  // 7. Date must be left of description
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Description", x: 50, width: 100 },
        { str: "Date", x: 300 },
        { str: "Debit", x: 400 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result === null, "Date after description should be rejected");
    passed++;
  }

  // 8. Non-header rows before header should not matter
  {
    const rows: PdfRow[] = [
      row(1, 0, 740, [{ str: "Account statement", x: 50 }]),
      row(1, 1, 720, [{ str: "Period 01.08.2026 - 31.08.2026", x: 50 }]),
      row(1, 2, 700, [
        { str: "Date", x: 40 },
        { str: "Details", x: 130 },
        { str: "Debit", x: 330 },
        { str: "Credit", x: 420 },
        { str: "Balance", x: 520 },
      ]),
    ];

    const result = detectColumnMap(rows);

    assert(result !== null, "Header after metadata rows should still be found");
    passed++;
  }

  // 9. Empty rows => null
  {
    const result = detectColumnMap([]);
    assert(result === null, "Empty input must return null");
    passed++;
  }

  // 10. Determinism
  {
    const rows: PdfRow[] = [
      row(1, 0, 700, [
        { str: "Date", x: 40 },
        { str: "Description", x: 130, width: 120 },
        { str: "Debit", x: 330 },
        { str: "Credit", x: 420 },
        { str: "Balance", x: 520 },
      ]),
    ];

    const a = detectColumnMap(rows);
    const b = detectColumnMap(rows);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same input must produce identical output",
    );
    passed++;
  }

  console.log(`detectColumnMap: ${passed} passed, 0 failed`);
}

runTests();
