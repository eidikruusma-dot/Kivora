/**
 * groupIntoRows.ts
 *
 * Groups positional PDF text items into visual rows based on Y-position proximity.
 * Pure deterministic function — no I/O, no AI, no bank-specific logic.
 *
 * PDF coordinate convention:
 *   Y = 0 at the page bottom; larger Y values appear higher on the page.
 *   Rows are returned top-to-bottom (descending Y) within each page.
 *   Pages are returned in ascending page-number order.
 *
 * This module deliberately does NOT:
 *   - classify columns (debit, credit, balance, date, description)
 *   - classify or merge transactions
 *   - apply any bank-specific heuristics
 *
 * Those responsibilities belong to later pipeline steps.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal shape required from a pdfjs-dist TextItem, plus a page annotation.
 * Callers should pass items exactly as returned by `page.getTextContent()`,
 * adding only the `pageNumber` field.
 */
export interface RawPdfTextItem {
  /** The text content of this glyph run. May be empty. */
  str: string;
  /**
   * 6-element Current Transformation Matrix: [a, b, c, d, x, y].
   *   transform[4] = x — horizontal position in user-space units.
   *   transform[5] = y — vertical position in user-space units (0 = page bottom).
   */
  transform: number[];
  /** Width of this text run in user-space units. */
  width: number;
  /** Height (≈ font size) of this text run in user-space units. */
  height: number;
  /** 1-based page number this item was extracted from. */
  pageNumber: number;
}

/**
 * A single text item with coordinates extracted from the CTM.
 * Preserved exactly as provided — no rounding, no normalization.
 */
export interface PdfTextItem {
  str: string;
  /** Horizontal position: transform[4] of the source item. */
  x: number;
  /** Vertical position: transform[5] of the source item. Y=0 is page bottom. */
  y: number;
  width: number;
  height: number;
  pageNumber: number;
}

/**
 * A visual row: a set of text items sharing approximately the same Y position,
 * sorted left-to-right (ascending X), annotated with stable row metadata.
 */
export interface PdfRow {
  /** 1-based page number. */
  pageNumber: number;
  /**
   * Representative Y for this row.
   * Defined as the Y of the first item that seeded the cluster — i.e., the
   * highest Y value within the group (topmost position on the page).
   * Deterministic: does not depend on input ordering beyond the initial sort.
   */
  rowY: number;
  /**
   * 0-based row index within the page.
   * 0 = topmost row on the page (highest Y). Sequential with no gaps.
   */
  rowIndex: number;
  /** Items in this row, sorted ascending by X (left → right). */
  items: PdfTextItem[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Group PDF text items into visual rows.
 *
 * @param items       Positional text items from pdfjs-dist, each with a `pageNumber`.
 *                    Items with non-finite x/y coordinates are silently filtered.
 * @param yTolerance  Maximum Y-distance between two items to be placed in the same row.
 *                    Must be ≥ 0. If omitted or non-finite, derived automatically from
 *                    the median item height (see `deriveYTolerance`).
 * @returns           Rows sorted top-to-bottom per page, pages in ascending order.
 *                    Same input always produces byte-equivalent output (deterministic).
 */
export function groupIntoRows(
  items: RawPdfTextItem[],
  yTolerance?: number,
): PdfRow[] {
  if (items.length === 0) return [];

  // Resolve tolerance
  const tol =
    yTolerance !== undefined && isFinite(yTolerance) && yTolerance >= 0
      ? yTolerance
      : deriveYTolerance(items);

  // Extract and validate positional data
  const normalised: PdfTextItem[] = items
    .filter(
      (i) =>
        Array.isArray(i.transform) &&
        i.transform.length >= 6 &&
        isFinite(i.transform[4]) &&
        isFinite(i.transform[5]),
    )
    .map((i) => ({
      str:        i.str,
      x:          i.transform[4],
      y:          i.transform[5],
      width:      i.width,
      height:     i.height,
      pageNumber: i.pageNumber,
    }));

  if (normalised.length === 0) return [];

  // Partition by page
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of normalised) {
    const bucket = byPage.get(item.pageNumber);
    if (bucket) {
      bucket.push(item);
    } else {
      byPage.set(item.pageNumber, [item]);
    }
  }

  // Process pages in ascending order for stable output
  const sortedPageNums = [...byPage.keys()].sort((a, b) => a - b);

  const allRows: PdfRow[] = [];
  for (const pageNumber of sortedPageNums) {
    const rows = groupPageIntoRows(byPage.get(pageNumber)!, pageNumber, tol);
    allRows.push(...rows);
  }

  return allRows;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Group items from a single page into rows, returning them top-to-bottom.
 *
 * Clustering strategy:
 *   1. Sort items by Y descending (top → bottom). Ties broken by X ascending,
 *      then by `str` lexicographically — ensures identical input → identical sort.
 *   2. Scan linearly. Start a new cluster when the current item's Y differs from
 *      the cluster-seed Y by more than `tol`. The seed Y is the Y of the FIRST
 *      item added to the cluster (not updated as items are added), providing a
 *      stable reference point that does not drift.
 *   3. Within each cluster, sort items by X ascending (then `str` for ties).
 */
function groupPageIntoRows(
  items: PdfTextItem[],
  pageNumber: number,
  tol: number,
): PdfRow[] {
  // Primary: Y descending (top of page first).
  // Secondary: X ascending, then str — makes sort fully deterministic.
  const sorted = [...items].sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.str < b.str ? -1 : a.str > b.str ? 1 : 0;
  });

  const rows: PdfRow[] = [];

  // Current cluster state
  let clusterSeedY: number | null = null;
  let clusterItems: PdfTextItem[] = [];

  const flushCluster = (): void => {
    if (clusterItems.length === 0) return;

    // Sort within row: X ascending, then str for full determinism
    const rowItems = [...clusterItems].sort((a, b) => {
      if (a.x !== b.x) return a.x - b.x;
      return a.str < b.str ? -1 : a.str > b.str ? 1 : 0;
    });

    rows.push({
      pageNumber,
      rowY:     clusterSeedY!,
      rowIndex: rows.length,    // 0-based, sequential — assigned at flush time
      items:    rowItems,
    });

    clusterItems = [];
    clusterSeedY = null;
  };

  for (const item of sorted) {
    if (clusterSeedY === null || Math.abs(item.y - clusterSeedY) > tol) {
      // Start a new cluster
      flushCluster();
      clusterSeedY = item.y;
    }
    clusterItems.push(item);
  }
  flushCluster(); // flush the last cluster

  return rows;
}

/**
 * Derive a Y-grouping tolerance from the actual item metrics.
 *
 * Method: 40% of the median item height across all items with height > 0.
 *
 * Rationale:
 *   - Typical PDF line spacing is ~1.2× the font size (e.g., 12pt for 10pt text).
 *   - Within a single visual line, Y values of individual glyph runs may differ by
 *     0–1pt due to baseline shifts, superscripts, or sub-pixel rounding.
 *   - 40% of median height (e.g., 4pt for 10pt text) sits comfortably between
 *     within-line jitter (<1pt) and between-line gaps (~12pt), so it groups
 *     same-line items without accidentally merging adjacent lines.
 *   - The 0.5pt minimum avoids grouping failure from floating-point noise when
 *     all items have zero height (e.g., from a scanned/image PDF).
 *
 * This is data-derived, not bank-specific. Pass an explicit `yTolerance` when
 * you have domain knowledge about a particular document's line spacing.
 */
export function deriveYTolerance(items: RawPdfTextItem[]): number {
  const heights = items
    .map((i) => i.height)
    .filter((h) => typeof h === "number" && isFinite(h) && h > 0)
    .sort((a, b) => a - b);

  if (heights.length === 0) return 2; // safe fallback for image-only PDFs

  // Lower-median index: for even-length arrays this picks the lower of the two
  // middle values, which is more conservative (smaller tolerance, fewer false merges).
  const medianHeight = heights[Math.floor((heights.length - 1) / 2)];
  return Math.max(0.5, medianHeight * 0.4);
}
