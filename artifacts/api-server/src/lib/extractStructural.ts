import {
  groupIntoRows,
  type RawPdfTextItem,
  type PdfRow,
} from "./groupIntoRows";
import { detectColumnMap, type ColumnMap } from "./detectColumnMap";
import {
  classifyTransactionRows,
  type RawTransactionRow,
} from "./classifyTransactionRows";

export interface StructuralExtractionResult {
  rows: PdfRow[];
  columnMap: ColumnMap | null;
  transactions: RawTransactionRow[];
  warnings: string[];
  success: boolean;
}

export function extractStructuralFromItems(
  items: RawPdfTextItem[],
): StructuralExtractionResult {
  const warnings: string[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["No positional PDF text items were provided."],
      success: false,
    };
  }

  // Step 1: deterministic visual row grouping
  const rows = groupIntoRows(items);

  if (rows.length === 0) {
    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["No visual text rows could be reconstructed."],
      success: false,
    };
  }

  // Step 2: deterministic transaction-column detection
  const columnMap = detectColumnMap(rows);

  if (!columnMap) {
    return {
      rows,
      columnMap: null,
      transactions: [],
      warnings: [
        "Transaction table columns could not be identified confidently.",
      ],
      success: false,
    };
  }

  // Step 3: deterministic transaction-row classification
  const classified = classifyTransactionRows(rows, columnMap);

  warnings.push(...classified.warnings);

  if (classified.transactions.length === 0) {
    warnings.push("No valid transaction rows were extracted.");
  }

  return {
    rows,
    columnMap,
    transactions: classified.transactions,
    warnings,
    success: classified.transactions.length > 0,
  };
}
