import { extractStructuralControls } from "./extractStructuralControls";
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

function runTests(): void {
  let passed = 0;

  // 1. Estonian opening balance
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Algsaldo", x: 50 },
        { str: "500,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(result.controls.openingBalance === 500, "Opening balance incorrect");
    passed++;
  }

  // 2. English closing balance
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Closing Balance", x: 50 },
        { str: "575,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(result.controls.closingBalance === 575, "Closing balance incorrect");
    passed++;
  }

  // 3. Printed income total — requires explicit "kokku" scope qualifier
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Laekumised kokku", x: 50 },
        { str: "1432,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === 1432,
      `Income total incorrect: got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 4. Printed expense total — "Total Expenses" (English, explicit scope)
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Total Expenses", x: 50 },
        { str: "25,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedExpenseTotal === 25,
      "Expense total incorrect",
    );
    passed++;
  }

  // 5. All controls together
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Opening Balance", x: 50 },
        { str: "500,00", x: 500 },
      ]),
      row(1, 1, 680, [
        { str: "Total Credits", x: 50 },
        { str: "100,00", x: 500 },
      ]),
      row(1, 2, 660, [
        { str: "Total Debits", x: 50 },
        { str: "25,00", x: 500 },
      ]),
      row(1, 3, 640, [
        { str: "Closing Balance", x: 50 },
        { str: "575,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(result.controls.openingBalance === 500, "Opening missing");
    assert(result.controls.printedIncomeTotal === 100, "Income missing");
    assert(result.controls.printedExpenseTotal === 25, "Expense missing");
    assert(result.controls.closingBalance === 575, "Closing missing");
    passed++;
  }

  // 6. Rightmost numeric value wins
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Opening Balance", x: 50 },
        { str: "1", x: 200 },
        { str: "500,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.openingBalance === 500,
      "Rightmost control value should be chosen",
    );
    passed++;
  }

  // 7. Missing value produces warning
  {
    const rows = [row(1, 0, 700, [{ str: "Closing Balance", x: 50 }])];

    const result = extractStructuralControls(rows);

    assert(result.controls.closingBalance === null, "Closing should be null");
    assert(result.warnings.length === 1, "Missing value warning expected");
    passed++;
  }

  // 8. Conflicting repeated control produces warning
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Opening Balance", x: 50 },
        { str: "500,00", x: 500 },
      ]),
      row(2, 0, 700, [
        { str: "Opening Balance", x: 50 },
        { str: "999,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.openingBalance === 500,
      "First value should be kept",
    );
    assert(
      result.warnings.some((warning) =>
        warning.includes("Conflicting openingBalance"),
      ),
      "Conflict warning missing",
    );
    passed++;
  }

  // 9. Empty input
  {
    const result = extractStructuralControls([]);

    assert(result.controls.openingBalance === null, "Opening must be null");
    assert(result.controls.closingBalance === null, "Closing must be null");
    assert(result.controls.printedIncomeTotal === null, "Income must be null");
    assert(
      result.controls.printedExpenseTotal === null,
      "Expense must be null",
    );
    assert(result.warnings.length === 1, "Empty-input warning expected");
    passed++;
  }

  // 10. Determinism
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Opening Balance", x: 50 },
        { str: "500,00", x: 500 },
      ]),
      row(1, 1, 680, [
        { str: "Closing Balance", x: 50 },
        { str: "575,00", x: 500 },
      ]),
    ];

    const a = extractStructuralControls(rows);
    const b = extractStructuralControls(rows);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same input must produce identical controls",
    );
    passed++;
  }

  // ── New tests: bare words must NOT become statement-wide totals ───────────

  // 11. REGRESSION: bare "Laekumised" (daily) must NOT produce printedIncomeTotal
  //
  // This reproduces the production failure where a per-day summary row labeled
  // "Laekumised" with value 937.90 appeared before any statement-wide total.
  // The old code picked 937.90 as printedIncomeTotal; the new code must not.
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Laekumised", x: 50 },
        { str: "937,90", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === null,
      `Bare "Laekumised" must NOT become printedIncomeTotal; ` +
        `got ${result.controls.printedIncomeTotal} (was incorrectly 937.90 in old code)`,
    );
    passed++;
  }

  // 12. REGRESSION: "Laekumised" (daily, 937.90) present + "Laekumised kokku"
  //     (statement-wide, 1432.00) also present — correct value must win.
  //
  // The per-day row appears earlier (page 1) than the period total (page 2).
  // Only the "kokku" row qualifies; 1432.00 must be extracted.
  {
    const rows = [
      row(1, 5, 400, [
        { str: "Laekumised", x: 50 },
        { str: "937,90", x: 500 },
      ]),
      row(2, 20, 200, [
        { str: "Laekumised kokku", x: 50 },
        { str: "1 432,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === 1432,
      `Statement-wide "Laekumised kokku" (1432.00) must win over daily "Laekumised" (937.90); ` +
        `got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 13. Bare "Väljaminekud" must NOT become printedExpenseTotal
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Väljaminekud", x: 50 },
        { str: "500,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedExpenseTotal === null,
      `Bare "Väljaminekud" must NOT become printedExpenseTotal; got ${result.controls.printedExpenseTotal}`,
    );
    passed++;
  }

  // 14. Bare "Sissetulekud" must NOT become printedIncomeTotal
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Sissetulekud", x: 50 },
        { str: "200,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === null,
      `Bare "Sissetulekud" must NOT become printedIncomeTotal; got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 15. Multiple daily "Kreeditkäive" rows must NOT produce printedIncomeTotal
  //
  // Real SEB statements have one "Kreeditkäive" row per day.
  // None of them should be picked as the statement-wide income total.
  {
    const rows = [
      row(1, 2, 680, [
        { str: "Kreeditkäive", x: 50 },
        { str: "150,00", x: 500 },
      ]),
      row(1, 8, 620, [
        { str: "Kreeditkäive", x: 50 },
        { str: "280,00", x: 500 },
      ]),
      row(2, 3, 660, [
        { str: "Kreeditkäive", x: 50 },
        { str: "507,90", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === null,
      `Daily "Kreeditkäive" rows must NOT produce printedIncomeTotal; ` +
        `got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 16. Multiple daily "Deebetkäive" rows must NOT produce printedExpenseTotal
  {
    const rows = [
      row(1, 3, 670, [
        { str: "Deebetkäive", x: 50 },
        { str: "320,00", x: 500 },
      ]),
      row(1, 9, 610, [
        { str: "Deebetkäive", x: 50 },
        { str: "215,45", x: 500 },
      ]),
      row(2, 4, 650, [
        { str: "Deebetkäive", x: 50 },
        { str: "372,84", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedExpenseTotal === null,
      `Daily "Deebetkäive" rows must NOT produce printedExpenseTotal; ` +
        `got ${result.controls.printedExpenseTotal}`,
    );
    passed++;
  }

  // 17. "Päeva laekumised" (day's income) must NOT produce printedIncomeTotal
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Päeva laekumised", x: 50 },
        { str: "450,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === null,
      `"Päeva laekumised" must NOT produce printedIncomeTotal; got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 18. "Krediidid kokku" (total credits) IS an accepted statement-wide label
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Krediidid kokku", x: 50 },
        { str: "1 432,00", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedIncomeTotal === 1432,
      `"Krediidid kokku" must be accepted as printedIncomeTotal; got ${result.controls.printedIncomeTotal}`,
    );
    passed++;
  }

  // 19. "Deebetid kokku" (total debits) IS an accepted statement-wide label
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Deebetid kokku", x: 50 },
        { str: "908,29", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.printedExpenseTotal === 908.29,
      `"Deebetid kokku" must be accepted as printedExpenseTotal; got ${result.controls.printedExpenseTotal}`,
    );
    passed++;
  }

  // 20. Mix of daily rows and statement-wide totals: only period-wide rows count
  //
  // Three daily "Kreeditkäive" rows + one "Laekumised kokku" row.
  // Only the "Laekumised kokku" row must be taken.
  {
    const rows = [
      row(1, 2, 680, [
        { str: "Kreeditkäive", x: 50 },
        { str: "150,00", x: 500 },
      ]),
      row(1, 8, 620, [
        { str: "Kreeditkäive", x: 50 },
        { str: "282,10", x: 500 },
      ]),
      row(2, 3, 660, [
        { str: "Kreeditkäive", x: 50 },
        { str: "999,90", x: 500 },
      ]),
      row(2, 15, 200, [
        { str: "Laekumised kokku", x: 50 },
        { str: "1 432,00", x: 500 },
      ]),
      row(1, 4, 650, [
        { str: "Deebetkäive", x: 50 },
        { str: "200,00", x: 500 },
      ]),
      row(2, 16, 190, [
        { str: "Väljaminekud kokku", x: 50 },
        { str: "908,29", x: 500 },
      ]),
      row(1, 0, 700, [
        { str: "Algsaldo", x: 50 },
        { str: "503,61", x: 500 },
      ]),
      row(2, 20, 100, [
        { str: "Lõppsaldo", x: 50 },
        { str: "1 027,32", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.openingBalance === 503.61,
      `Opening balance must be 503.61; got ${result.controls.openingBalance}`,
    );
    assert(
      result.controls.closingBalance === 1027.32,
      `Closing balance must be 1027.32; got ${result.controls.closingBalance}`,
    );
    assert(
      result.controls.printedIncomeTotal === 1432,
      `printedIncomeTotal must be 1432.00; got ${result.controls.printedIncomeTotal}`,
    );
    assert(
      result.controls.printedExpenseTotal === 908.29,
      `printedExpenseTotal must be 908.29; got ${result.controls.printedExpenseTotal}`,
    );
    passed++;
  }

  // 21. If no statement-wide label exists at all, printedIncomeTotal stays null
  //     (missing totals are "control unavailable", not failure)
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Algsaldo", x: 50 },
        { str: "503,61", x: 500 },
      ]),
      row(1, 2, 680, [
        { str: "Kreeditkäive", x: 50 },
        { str: "937,90", x: 500 },
      ]),
      row(1, 3, 670, [
        { str: "Deebetkäive", x: 50 },
        { str: "400,00", x: 500 },
      ]),
      row(2, 10, 200, [
        { str: "Lõppsaldo", x: 50 },
        { str: "141,51", x: 500 },
      ]),
    ];

    const result = extractStructuralControls(rows);

    assert(
      result.controls.openingBalance === 503.61,
      "Opening balance must be present",
    );
    assert(
      result.controls.closingBalance === 141.51,
      "Closing balance must be present",
    );
    assert(
      result.controls.printedIncomeTotal === null,
      `No statement-wide income label → must be null; got ${result.controls.printedIncomeTotal}`,
    );
    assert(
      result.controls.printedExpenseTotal === null,
      `No statement-wide expense label → must be null; got ${result.controls.printedExpenseTotal}`,
    );
    passed++;
  }

  console.log(`extractStructuralControls: ${passed} passed, 0 failed`);
}

runTests();
