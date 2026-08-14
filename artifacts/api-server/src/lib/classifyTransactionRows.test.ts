import { classifyTransactionRows } from "./classifyTransactionRows";
import type { PdfRow } from "./groupIntoRows";
import type { ColumnMap } from "./detectColumnMap";

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
  if (!condition) throw new Error(message);
}

const columns: ColumnMap = {
  date: 70,
  description: 200,
  debit: 370,
  credit: 470,
  balance: 570,
};

function runTests(): void {
  let passed = 0;

  // 1. Expense row
  {
    const rows = [
      row(1, 0, 700, [
        { str: "01.08.2026", x: 50 },
        { str: "Pood", x: 150, width: 100 },
        { str: "12,50", x: 350 },
        { str: "487,50", x: 550 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 1, "Expense row missing");
    assert(result.transactions[0].debit === 12.5, "Debit incorrect");
    assert(result.transactions[0].credit === null, "Credit must be null");
    assert(result.transactions[0].balance === 487.5, "Balance incorrect");
    passed++;
  }

  // 2. Income row
  {
    const rows = [
      row(1, 0, 700, [
        { str: "02.08.2026", x: 50 },
        { str: "Laekumine", x: 150, width: 100 },
        { str: "100,00", x: 450 },
        { str: "587,50", x: 550 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 1, "Income row missing");
    assert(result.transactions[0].credit === 100, "Credit incorrect");
    assert(result.transactions[0].debit === null, "Debit must be null");
    passed++;
  }

  // 3. Continuation description row
  {
    const rows = [
      row(1, 0, 700, [
        { str: "03.08.2026", x: 50 },
        { str: "Pikk", x: 150 },
        { str: "5,00", x: 350 },
        { str: "582,50", x: 550 },
      ]),
      row(1, 1, 688, [{ str: "kirjeldus jätkub", x: 150, width: 120 }]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 1, "Continuation created extra row");
    assert(
      result.transactions[0].description.includes("kirjeldus jätkub"),
      "Continuation text not merged",
    );
    passed++;
  }

  // 4. Opening balance row must be skipped
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Algsaldo", x: 150 },
        { str: "500,00", x: 550 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(
      result.transactions.length === 0,
      "Opening balance must not be transaction",
    );
    passed++;
  }

  // 5. Total row must be skipped
  {
    const rows = [
      row(1, 0, 700, [
        { str: "Kokku", x: 150 },
        { str: "100,00", x: 350 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 0, "Total row must be skipped");
    passed++;
  }

  // 6. Both debit and credit present => reject row
  {
    const rows = [
      row(1, 0, 700, [
        { str: "04.08.2026", x: 50 },
        { str: "Kahtlane", x: 150 },
        { str: "10,00", x: 350 },
        { str: "20,00", x: 450 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 0, "Ambiguous row must not pass");
    assert(result.warnings.length === 1, "Ambiguous row warning missing");
    passed++;
  }

  // 7. No amount => reject row
  {
    const rows = [
      row(1, 0, 700, [
        { str: "05.08.2026", x: 50 },
        { str: "Ilma summata", x: 150 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 0, "No-amount row must not pass");
    assert(result.warnings.length === 1, "No-amount warning missing");
    passed++;
  }

  // 8. Multi-page ordering
  {
    const rows = [
      row(2, 0, 700, [
        { str: "07.08.2026", x: 50 },
        { str: "Teine leht", x: 150 },
        { str: "30,00", x: 350 },
      ]),
      row(1, 0, 700, [
        { str: "06.08.2026", x: 50 },
        { str: "Esimene leht", x: 150 },
        { str: "20,00", x: 350 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(result.transactions.length === 2, "Two rows expected");
    assert(result.transactions[0].pageNumber === 1, "Page ordering wrong");
    assert(result.transactions[1].pageNumber === 2, "Page ordering wrong");
    passed++;
  }

  // 9. Repeated identical transactions are preserved
  {
    const rows = [
      row(1, 0, 700, [
        { str: "08.08.2026", x: 50 },
        { str: "Sama", x: 150 },
        { str: "15,00", x: 350 },
      ]),
      row(1, 1, 688, [
        { str: "08.08.2026", x: 50 },
        { str: "Sama", x: 150 },
        { str: "15,00", x: 350 },
      ]),
    ];

    const result = classifyTransactionRows(rows, columns);

    assert(
      result.transactions.length === 2,
      "Repeated transactions must be preserved",
    );
    passed++;
  }

  // 10. Determinism
  {
    const rows = [
      row(1, 0, 700, [
        { str: "09.08.2026", x: 50 },
        { str: "Test", x: 150 },
        { str: "25,00", x: 350 },
      ]),
    ];

    const a = classifyTransactionRows(rows, columns);
    const b = classifyTransactionRows(rows, columns);

    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same input must produce identical output",
    );
    passed++;
  }

  console.log(`classifyTransactionRows: ${passed} passed, 0 failed`);
}

runTests();
