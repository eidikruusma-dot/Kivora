import { extractAllPdfTextItems } from "./pdfTextProbe";
import {
  extractStructuralFromItems,
  type StructuralExtractionResult,
} from "./extractStructural";
import {
  extractStructuralControls,
  type StructuralControls,
} from "./extractStructuralControls";
import {
  reconcileStructuralTransactions,
  type StructuralReconciliationResult,
} from "./reconcileStructuralTransactions";
import type { RawTransactionRow } from "./classifyTransactionRows";

export interface StructuralPdfBufferResult extends StructuralExtractionResult {
  controls: StructuralControls;
  reconciliation: StructuralReconciliationResult;
}

function emptyControls(): StructuralControls {
  return {
    openingBalance: null,
    closingBalance: null,
    printedIncomeTotal: null,
    printedExpenseTotal: null,
  };
}

/**
 * Normalise a raw date string from the extraction pipeline into an ISO-style
 * sortable string (YYYY-MM-DD).  Accepts:
 *   dd.mm.yyyy   (common in Estonian/European bank statements)
 *   dd/mm/yyyy
 *   yyyy-mm-dd   (ISO, already sortable)
 * Returns the input unchanged for any unrecognised format so that the sort
 * degrades gracefully rather than throwing.
 */
function parseDateForSort(dateStr: string): string {
  const ddmm = dateStr.trim().match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
  return dateStr;
}

/**
 * Sort transactions chronologically: oldest first, newest last.
 *
 * Real bank statements are typically presented newest-first (the most recent
 * transaction is at the top of the first page).  The raw extraction preserves
 * that visual order.  To validate the running-balance chain we must process
 * transactions in the opposite order — oldest → newest.
 *
 * Strategy:
 *   1. Reverse the extraction order.  On a newest-first statement this
 *      converts the within-day order from newest→oldest to oldest→newest,
 *      which is exactly the chronological running-balance sequence.
 *   2. Stable-sort by date ascending.  This correctly handles spans of
 *      multiple days while preserving the within-day sequence produced by
 *      step 1.
 *
 * For statements that are already ordered oldest-first (e.g. synthetic test
 * PDFs) the reversal puts same-day rows in the wrong order, but the date sort
 * restores the correct sequence for different-day rows.  Within-day order on
 * an oldest-first statement is preserved because the stable sort does not
 * reorder rows with equal keys.
 */
function sortTransactionsChronologically(
  txs: RawTransactionRow[],
): RawTransactionRow[] {
  const reversed = [...txs].reverse();
  return reversed.sort((a, b) => {
    const da = parseDateForSort(a.date);
    const db = parseDateForSort(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}

export async function extractStructuralPdfBuffer(
  buffer: Buffer,
): Promise<StructuralPdfBufferResult> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const controls = emptyControls();

    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["PDF buffer is empty."],
      success: false,
      controls,
      reconciliation: reconcileStructuralTransactions([], controls),
    };
  }

  const items = await extractAllPdfTextItems(buffer);

  if (items.length === 0) {
    const controls = emptyControls();

    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["No positional text items were extracted from the PDF."],
      success: false,
      controls,
      reconciliation: reconcileStructuralTransactions([], controls),
    };
  }

  const structural = extractStructuralFromItems(items);

  const controlResult = extractStructuralControls(structural.rows);

  // ── Chronological sort ───────────────────────────────────────────────────
  // Sort before reconciliation so the running-balance chain is validated in
  // the correct accounting order regardless of how the PDF displays rows.
  const chronological = sortTransactionsChronologically(structural.transactions);

  const reconciliation = reconcileStructuralTransactions(
    chronological,
    controlResult.controls,
  );

  const warnings = [...structural.warnings, ...controlResult.warnings];

  const hasBalanceControl =
    controlResult.controls.openingBalance !== null &&
    controlResult.controls.closingBalance !== null;

  const hasPrintedTotalsControl =
    controlResult.controls.printedIncomeTotal !== null ||
    controlResult.controls.printedExpenseTotal !== null;

  const hasIndependentControl = hasBalanceControl || hasPrintedTotalsControl;

  if (!hasIndependentControl) {
    warnings.push(
      "No independent statement control values were found; structural extraction is not safe for import.",
    );
  }

  return {
    ...structural,
    // Keep the original PDF presentation order here. The shared
    // postProcessBankTransactions() pipeline performs the canonical
    // newest-first → oldest-first conversion exactly once. Returning the
    // chronological array here caused structural PDFs to be reversed twice.
    transactions: structural.transactions,
    warnings,
    controls: controlResult.controls,
    reconciliation,
    success: structural.success && hasIndependentControl && reconciliation.ok,
  };
}
