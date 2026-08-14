import type { RawPdfTextItem } from "../lib/groupIntoRows";
/**
 * pdfTextProbe.ts — PDF positional text extraction
 *
 * Contains two exported functions with different roles:
 *
 * extractAllPdfTextItems(buffer)  [PRODUCTION]
 *   Called by extractStructuralPdfBuffer on every /api/ai/bank-import request.
 *   Extracts positional TextItem[] (x, y, width, height) from all pages of a
 *   PDF buffer using pdfjs-dist.  This is the primary production export.
 *
 * probePdfTextExtraction(buffer)  [DIAGNOSTIC ONLY]
 *   Returns a privacy-safe shape report for page 1 — never the actual text.
 *   Used only for manual environment verification; not called from any
 *   production endpoint or test suite.
 *
 * Both functions share a single lazy-initialised pdfjs-dist + DOMMatrix setup
 * (ensurePdfjs) so the module is only loaded once per process.
 */

// ── Public result shape ───────────────────────────────────────────────────────

/** Privacy-safe representation of one TextItem for reporting. */
export interface PdfTextItemShape {
  /** typeof item.str — always "string" */
  strType: string;
  /** item.str.length — character count, not the text itself */
  strLength: number;
  /** typeof item.transform[4] — x coordinate type */
  xType: string;
  /** typeof item.transform[5] — y coordinate type */
  yType: string;
  /** Whether item.transform[4] is a finite number */
  xFinite: boolean;
  /** Whether item.transform[5] is a finite number */
  yFinite: boolean;
  /** typeof item.width */
  widthType: string;
  /** typeof item.height */
  heightType: string;
}

export interface PdfProbeResult {
  /** Exact pdfjs-dist version string, e.g. "5.4.296" */
  version: string;
  /** Source of the DOMMatrix global — "native" or "@napi-rs/canvas" */
  domMatrixSource: string;
  /** Worker configuration used */
  workerMode: string;
  /** Number of pages in the probed document */
  pageCount: number;
  /** Number of TextItem objects returned for page 1 */
  page1ItemCount: number;
  /** Whether all items have the required positional fields */
  allItemsStructured: boolean;
  /** Number of distinct Y positions (≈ visual rows) on page 1 */
  distinctYPositions: number;
  /** X-coordinate range on page 1: [min, max] */
  xRange: [number, number];
  /** Y-coordinate range on page 1: [min, max] — Y=0 at page bottom (PDF space) */
  yRange: [number, number];
  /** Privacy-safe structure report for the first item */
  sampleItemShape: PdfTextItemShape | null;
}

// ── Types mirroring pdfjs-dist's TextItem (subset we care about) ──────────────

interface PdfjsTextItem {
  str: string;
  dir: string;
  /** 6-element CTM matrix: [a, b, c, d, x, y] — transform[4]=x, transform[5]=y */
  transform: number[];
  width: number;
  height: number;
}

// ── Module-level caching — pdfjs-dist is only imported once per process ───────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pdfjsLib: any | null = null;
let _domMatrixSource = "native";

/**
 * Ensure DOMMatrix is on globalThis and pdfjs-dist is imported.
 * Safe to call multiple times (idempotent after first call).
 */
async function ensurePdfjs(): Promise<{ pdfjsLib: unknown; domMatrixSource: string }> {
  if (_pdfjsLib) return { pdfjsLib: _pdfjsLib, domMatrixSource: _domMatrixSource };

  // ── Step A: DOMMatrix polyfill ───────────────────────────────────────────
  //
  // pdfjs-dist@5.4.296 runs `const SCALE_MATRIX = new DOMMatrix()` at
  // module initialisation (build/pdf.mjs:9387), so globalThis.DOMMatrix must
  // exist BEFORE the dynamic import below executes.
  //
  // Node.js v24 does NOT include DOMMatrix.
  // @napi-rs/canvas is pdfjs-dist's own optional dependency and provides a
  // standards-compliant DOMMatrix backed by Skia. It is installed as a
  // transitive dependency of pdfjs-dist.
  //
  // We do NOT add a custom stub: using pdfjs-dist's own optional dependency
  // is the correct, supported approach. Any matrix operations inside pdfjs-dist
  // that require a real DOMMatrix implementation will work correctly.

  const gThis = globalThis as Record<string, unknown>;
  if (typeof gThis.DOMMatrix === "undefined") {
    const canvas = await import("@napi-rs/canvas");
    gThis.DOMMatrix = canvas.DOMMatrix;
    _domMatrixSource = "@napi-rs/canvas";
  }

  // ── Step B: Import pdfjs-dist ────────────────────────────────────────────
  //
  // Listed as `external` in build.mjs so esbuild does not attempt to bundle it.
  // Resolved at runtime from node_modules. Dynamic import() is used rather than
  // a static import because the DOMMatrix polyfill must be in place first.
  //
  // We use the `legacy` build (pdfjs-dist/legacy/build/pdf.mjs) rather than
  // the default ESM build (pdfjs-dist/build/pdf.mjs).
  //
  // Rationale: the default build at build/pdf.mjs emits a runtime warning in
  // every Node.js process:
  //   "Please use the `legacy` build in Node.js environments."
  // (source: build/pdf.mjs:8178 — triggered by `isNodeJS` detection in node_utils.js)
  //
  // The legacy build is proper ESM (named exports, no `.default` wrapping) with an
  // identical public API — same getDocument, GlobalWorkerOptions, version — but
  // omits the browser-only DOM-rendering code that causes the warning.
  // Confirmed for pdfjs-dist@5.4.296 by inspecting the export shape at runtime.

  _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // ── Step C: Worker configuration ────────────────────────────────────────
  //
  // pdfjs-dist requires a worker. In Node.js we point GlobalWorkerOptions.workerSrc
  // to the bundled worker file using import.meta.resolve() (available in Node ≥20,
  // synchronous in Node ≥22). This returns a file:// URL string that Node.js
  // worker_threads can accept.
  //
  // The worker path matches the build variant: legacy/build/pdf.worker.mjs.
  // Using the standard build/pdf.worker.mjs with the legacy main module would
  // create a version mismatch that could cause silent failures.
  //
  // Rationale for NOT using workerSrc = '':
  //   An empty string causes pdfjs-dist to attempt resolving a relative URL,
  //   which fails in a Node.js context without a valid document.baseURI.
  //
  // The worker runs in a real worker_thread (not fake-worker / main-thread mode).
  // This is the production-correct configuration.

  const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  return { pdfjsLib: _pdfjsLib, domMatrixSource: _domMatrixSource };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * [PRODUCTION] Extract positional text items from every page of a PDF buffer.
 *
 * Returns one RawPdfTextItem per text run across all pages, preserving the
 * exact x/y/width/height coordinates needed by the structural bank-statement
 * parser (groupIntoRows → detectColumnMap → classifyTransactionRows).
 *
 * Called by extractStructuralPdfBuffer on every /api/ai/bank-import request.
 *
 * @param buffer  PDF file contents as a Node.js Buffer.
 * @returns       Array of positional text items across all pages.
 * @throws        If the PDF cannot be loaded or text items cannot be extracted.
 */
export async function extractAllPdfTextItems(
  buffer: Buffer,
): Promise<RawPdfTextItem[]> {
  const { pdfjsLib } = await ensurePdfjs();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjsLib as any;

  // Create an independent copy of the PDF bytes before handing them to pdfjs.
  // pdfjs-dist transfers ownership of the Uint8Array to its worker thread via
  // structured clone (Transferable), which zeroes the source buffer in-place.
  // Passing a copy ensures the caller's Buffer is never detached or emptied.
  const pdfData = Uint8Array.from(buffer);

  const loadingTask = lib.getDocument({
    data: pdfData,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const result: RawPdfTextItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });

      for (const rawItem of content.items as unknown[]) {
        if (
          typeof rawItem !== "object" ||
          rawItem === null ||
          !("str" in rawItem) ||
          !("transform" in rawItem)
        ) {
          continue;
        }

        const item = rawItem as PdfjsTextItem;

        if (
          typeof item.str !== "string" ||
          !Array.isArray(item.transform) ||
          item.transform.length !== 6 ||
          !Number.isFinite(item.transform[4]) ||
          !Number.isFinite(item.transform[5]) ||
          !Number.isFinite(item.width) ||
          !Number.isFinite(item.height)
        ) {
          continue;
        }

        result.push({
          str: item.str,
          transform: [...item.transform],
          width: item.width,
          height: item.height,
          pageNumber,
        });
      }

      await page.cleanup();
    }

    return result;
  } finally {
    await pdf.destroy();
  }
}

/**
 * [DIAGNOSTIC ONLY] Load a PDF buffer and extract positional text items from
 * page 1. Returns a privacy-safe result describing item structure, types, and
 * coordinate ranges — never the actual text content.
 *
 * Not called from any production endpoint or test suite. Intended for manual
 * environment verification only (e.g. confirming pdfjs-dist is correctly
 * configured in a new deployment).
 *
 * @param buffer  PDF file contents as a Node.js Buffer.
 * @returns       PdfProbeResult describing structure/coordinates of page 1.
 * @throws        If the PDF cannot be loaded or text items cannot be extracted.
 */
export async function probePdfTextExtraction(buffer: Buffer): Promise<PdfProbeResult> {
  const { pdfjsLib, domMatrixSource } = await ensurePdfjs();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjsLib as any;

  // Independent copy — pdfjs transfers ownership of the Uint8Array to its
  // worker thread, zeroing the original. A copy prevents caller data loss.
  const pdfData = Uint8Array.from(buffer);
  const loadingTask = lib.getDocument({
    data: pdfData,
    useWorkerFetch: false,     // no fetch() in Node
    isEvalSupported: false,    // disable eval-based font decoding
    disableFontFace: true,     // no DOM font loading
  });

  const pdf = await loadingTask.promise;
  const pageCount: number = pdf.numPages;

  const page = await pdf.getPage(1);
  const content = await page.getTextContent({ includeMarkedContent: false });

  // Filter to actual TextItems (pdfjs-dist also returns TextMarkedContent objects)
  const textItems = (content.items as unknown[]).filter(
    (item): item is PdfjsTextItem =>
      typeof item === "object" &&
      item !== null &&
      "str" in item &&
      "transform" in item &&
      Array.isArray((item as PdfjsTextItem).transform) &&
      (item as PdfjsTextItem).transform.length === 6,
  );

  const allItemsStructured = textItems.every(
    (i) =>
      typeof i.str === "string" &&
      typeof i.transform[4] === "number" &&
      typeof i.transform[5] === "number" &&
      typeof i.width === "number" &&
      typeof i.height === "number" &&
      isFinite(i.transform[4]) &&
      isFinite(i.transform[5]),
  );

  let sampleItemShape: PdfTextItemShape | null = null;
  if (textItems.length > 0) {
    const f = textItems[0];
    sampleItemShape = {
      strType: typeof f.str,
      strLength: f.str.length,
      xType: typeof f.transform[4],
      yType: typeof f.transform[5],
      xFinite: isFinite(f.transform[4]),
      yFinite: isFinite(f.transform[5]),
      widthType: typeof f.width,
      heightType: typeof f.height,
    };
  }

  const xs = textItems.map((i) => i.transform[4]);
  const ys = textItems.map((i) => i.transform[5]);
  const distinctYPositions = new Set(ys.map((y) => Math.round(y))).size;

  await page.cleanup();
  await pdf.destroy();

  return {
    version: lib.version as string,
    domMatrixSource,
    workerMode: "worker_thread via pdf.worker.mjs",
    pageCount,
    page1ItemCount: textItems.length,
    allItemsStructured,
    distinctYPositions,
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)],
    sampleItemShape,
  };
}
