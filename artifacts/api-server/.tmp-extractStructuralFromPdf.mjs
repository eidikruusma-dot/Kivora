// src/lib/extractStructuralFromPdf.test.ts
import { PDFDocument, StandardFonts } from "pdf-lib";

// src/routes/pdfTextProbe.ts
var _pdfjsLib = null;
var _domMatrixSource = "native";
async function ensurePdfjs() {
  if (_pdfjsLib) return { pdfjsLib: _pdfjsLib, domMatrixSource: _domMatrixSource };
  const gThis = globalThis;
  if (typeof gThis.DOMMatrix === "undefined") {
    const canvas = await import("@napi-rs/canvas");
    gThis.DOMMatrix = canvas.DOMMatrix;
    _domMatrixSource = "@napi-rs/canvas";
  }
  _pdfjsLib = await import("pdfjs-dist");
  const workerUrl = import.meta.resolve("pdfjs-dist/build/pdf.worker.mjs");
  _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return { pdfjsLib: _pdfjsLib, domMatrixSource: _domMatrixSource };
}
async function extractAllPdfTextItems(buffer) {
  const { pdfjsLib } = await ensurePdfjs();
  const lib = pdfjsLib;
  const uint8Array = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const loadingTask = lib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true
  });
  const pdf = await loadingTask.promise;
  const result = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false
      });
      for (const rawItem of content.items) {
        if (typeof rawItem !== "object" || rawItem === null || !("str" in rawItem) || !("transform" in rawItem)) {
          continue;
        }
        const item = rawItem;
        if (typeof item.str !== "string" || !Array.isArray(item.transform) || item.transform.length !== 6 || !Number.isFinite(item.transform[4]) || !Number.isFinite(item.transform[5]) || !Number.isFinite(item.width) || !Number.isFinite(item.height)) {
          continue;
        }
        result.push({
          str: item.str,
          transform: [...item.transform],
          width: item.width,
          height: item.height,
          pageNumber
        });
      }
      await page.cleanup();
    }
    return result;
  } finally {
    await pdf.destroy();
  }
}

// src/lib/groupIntoRows.ts
function groupIntoRows(items, yTolerance) {
  if (items.length === 0) return [];
  const tol = yTolerance !== void 0 && isFinite(yTolerance) && yTolerance >= 0 ? yTolerance : deriveYTolerance(items);
  const normalised = items.filter(
    (i) => Array.isArray(i.transform) && i.transform.length >= 6 && isFinite(i.transform[4]) && isFinite(i.transform[5])
  ).map((i) => ({
    str: i.str,
    x: i.transform[4],
    y: i.transform[5],
    width: i.width,
    height: i.height,
    pageNumber: i.pageNumber
  }));
  if (normalised.length === 0) return [];
  const byPage = /* @__PURE__ */ new Map();
  for (const item of normalised) {
    const bucket = byPage.get(item.pageNumber);
    if (bucket) {
      bucket.push(item);
    } else {
      byPage.set(item.pageNumber, [item]);
    }
  }
  const sortedPageNums = [...byPage.keys()].sort((a, b) => a - b);
  const allRows = [];
  for (const pageNumber of sortedPageNums) {
    const rows = groupPageIntoRows(byPage.get(pageNumber), pageNumber, tol);
    allRows.push(...rows);
  }
  return allRows;
}
function groupPageIntoRows(items, pageNumber, tol) {
  const sorted = [...items].sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.str < b.str ? -1 : a.str > b.str ? 1 : 0;
  });
  const rows = [];
  let clusterSeedY = null;
  let clusterItems = [];
  const flushCluster = () => {
    if (clusterItems.length === 0) return;
    const rowItems = [...clusterItems].sort((a, b) => {
      if (a.x !== b.x) return a.x - b.x;
      return a.str < b.str ? -1 : a.str > b.str ? 1 : 0;
    });
    rows.push({
      pageNumber,
      rowY: clusterSeedY,
      rowIndex: rows.length,
      // 0-based, sequential — assigned at flush time
      items: rowItems
    });
    clusterItems = [];
    clusterSeedY = null;
  };
  for (const item of sorted) {
    if (clusterSeedY === null || Math.abs(item.y - clusterSeedY) > tol) {
      flushCluster();
      clusterSeedY = item.y;
    }
    clusterItems.push(item);
  }
  flushCluster();
  return rows;
}
function deriveYTolerance(items) {
  const heights = items.map((i) => i.height).filter((h) => typeof h === "number" && isFinite(h) && h > 0).sort((a, b) => a - b);
  if (heights.length === 0) return 2;
  const medianHeight = heights[Math.floor((heights.length - 1) / 2)];
  return Math.max(0.5, medianHeight * 0.4);
}

// src/lib/detectColumnMap.ts
var HEADER_PATTERNS = {
  date: [/\bkuupäev\b/i, /\bdate\b/i, /\bdatum\b/i],
  description: [
    /\bselgitus\b/i,
    /\bkirjeldus\b/i,
    /\bdescription\b/i,
    /\bdetails\b/i,
    /\bsaaja\b/i,
    /\bmaksja\b/i
  ],
  debit: [/\bdeebet\b/i, /\bdebit\b/i],
  credit: [/\bkreedit\b/i, /\bcredit\b/i],
  balance: [/\bjääk\b/i, /\bsaldo\b/i, /\bbalance\b/i]
};
function itemCenterX(item) {
  return item.x + item.width / 2;
}
function normalizeHeaderText(value) {
  return value.replace(/\s+/g, " ").trim();
}
function detectHeaderMatches(row) {
  const matches = {};
  for (const item of row.items) {
    const text = normalizeHeaderText(item.str);
    if (!text) continue;
    for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
      if (matches[key] !== void 0) continue;
      if (patterns.some((pattern) => pattern.test(text))) {
        matches[key] = itemCenterX(item);
      }
    }
  }
  return matches;
}
function countDefinedColumns(map) {
  return Object.values(map).filter((value) => typeof value === "number").length;
}
function isSaneColumnOrder(map) {
  const entries = Object.entries(map).filter(([, value]) => typeof value === "number").map(([key, value]) => ({
    key,
    x: value
  })).sort((a, b) => a.x - b.x);
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].x - entries[i - 1].x < 8) {
      return false;
    }
  }
  if (map.date !== void 0 && map.description !== void 0 && map.date >= map.description) {
    return false;
  }
  return true;
}
function mapsAreCompatible(a, b) {
  const keys = [
    "date",
    "description",
    "debit",
    "credit",
    "balance"
  ];
  let compared = 0;
  for (const key of keys) {
    const ax = a[key];
    const bx = b[key];
    if (ax === void 0 || bx === void 0) continue;
    compared++;
    if (Math.abs(ax - bx) > 20) {
      return false;
    }
  }
  return compared >= 2;
}
function detectColumnMap(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const rowsByPage = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const pageRows = rowsByPage.get(row.pageNumber) ?? [];
    pageRows.push(row);
    rowsByPage.set(row.pageNumber, pageRows);
  }
  const candidates = [];
  for (const [, pageRows] of rowsByPage) {
    const ordered = [...pageRows].sort((a, b) => {
      if (a.rowIndex !== b.rowIndex) {
        return a.rowIndex - b.rowIndex;
      }
      return b.rowY - a.rowY;
    }).slice(0, 30);
    for (const row of ordered) {
      const matches = detectHeaderMatches(row);
      const count = countDefinedColumns(matches);
      if (count < 3) continue;
      const candidate = {
        ...matches
      };
      if (!isSaneColumnOrder(candidate)) {
        continue;
      }
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const best = [...candidates].sort((a, b) => {
    const countDiff = countDefinedColumns(b) - countDefinedColumns(a);
    if (countDiff !== 0) return countDiff;
    const aDate = a.date ?? Number.POSITIVE_INFINITY;
    const bDate = b.date ?? Number.POSITIVE_INFINITY;
    return aDate - bDate;
  })[0];
  const compatible = candidates.filter(
    (candidate) => mapsAreCompatible(best, candidate)
  );
  if (compatible.length === 0) {
    return best;
  }
  const result = {};
  const keys = [
    "date",
    "description",
    "debit",
    "credit",
    "balance"
  ];
  for (const key of keys) {
    const xs = compatible.map((candidate) => candidate[key]).filter((value) => typeof value === "number").sort((a, b) => a - b);
    if (xs.length === 0) continue;
    result[key] = xs[Math.floor((xs.length - 1) / 2)];
  }
  return isSaneColumnOrder(result) ? result : null;
}

// src/lib/parseEuropeanNumber.ts
var CURRENCY_SYMBOLS_RE = /^[€$£¥₩₽]\s*|\s*[€$£¥₩₽]$/g;
var CURRENCY_CODE_START_RE = /^(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|HRK|kr|Kč|zł)\s+/i;
var CURRENCY_CODE_END_RE = /\s+(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|HRK|kr|Kč|zł)$/i;
function parseEuropeanNumber(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(CURRENCY_SYMBOLS_RE, "").replace(CURRENCY_CODE_START_RE, "").replace(CURRENCY_CODE_END_RE, "").trim();
  if (!text) return null;
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }
  if (!text) return null;
  const value = parseCore(text);
  if (value === null) return null;
  if (!isFinite(value)) return null;
  if (value === 0) return 0;
  return negative ? -value : value;
}
function parseCore(text) {
  text = text.replace(/[\u00a0\u202f\u2009\u2007]/g, " ");
  const hasComma = text.includes(",");
  const hasPeriod = text.includes(".");
  const hasSpace = text.includes(" ");
  if (hasComma && hasPeriod && hasSpace) return null;
  if (hasComma && hasPeriod) {
    const lastCommaIdx = text.lastIndexOf(",");
    const lastPeriodIdx = text.lastIndexOf(".");
    if (lastCommaIdx > lastPeriodIdx) {
      return parseDecimalWithThousands(text, ".", ",");
    } else {
      return parseDecimalWithThousands(text, ",", ".");
    }
  }
  if (hasSpace && hasComma) {
    return parseDecimalWithThousands(text, " ", ",");
  }
  if (hasSpace && hasPeriod) {
    return parseDecimalWithThousands(text, " ", ".");
  }
  if (hasComma && !hasPeriod && !hasSpace) {
    return parseSingleSeparatorType(text, ",");
  }
  if (hasPeriod && !hasComma && !hasSpace) {
    return parseSingleSeparatorType(text, ".");
  }
  if (hasSpace && !hasComma && !hasPeriod) {
    return parseSpaceOnlyInteger(text);
  }
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}
function parseDecimalWithThousands(text, thousandsSep, decimalSep) {
  const decIdx = text.lastIndexOf(decimalSep);
  if (decIdx === -1) {
    const groups = splitOnSep(text, thousandsSep);
    if (!groups) return null;
    if (!validateIntegerGroups(groups)) return null;
    const clean = groups.join("");
    if (!/^\d+$/.test(clean)) return null;
    return Number(clean);
  }
  const intPart = text.slice(0, decIdx);
  const decPart = text.slice(decIdx + 1);
  if (!decPart || !/^\d+$/.test(decPart)) return null;
  if (!intPart) return null;
  const intGroups = splitOnSep(intPart, thousandsSep);
  if (!intGroups) return null;
  if (!validateIntegerGroups(intGroups)) return null;
  const intClean = intGroups.join("");
  if (!/^\d+$/.test(intClean)) return null;
  return parseFloat(`${intClean}.${decPart}`);
}
function parseSingleSeparatorType(text, sep) {
  const parts = text.split(sep);
  if (parts.length < 2) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  if (parts.length === 2) {
    const [intPart, fracPart] = parts;
    if (!intPart) return null;
    if (fracPart.length === 3) {
      return null;
    }
    return parseFloat(`${intPart}.${fracPart}`);
  }
  if (!validateIntegerGroups(parts)) return null;
  if (parts[parts.length - 1].length !== 3) return null;
  return Number(parts.join(""));
}
function parseSpaceOnlyInteger(text) {
  const groups = text.split(" ").filter((g) => g.length > 0);
  if (!validateIntegerGroups(groups)) return null;
  if (!groups.every((g) => /^\d+$/.test(g))) return null;
  return Number(groups.join(""));
}
function splitOnSep(text, sep) {
  const parts = text.split(sep);
  if (parts.some((p) => p === "")) return null;
  return parts;
}
function validateIntegerGroups(groups) {
  if (groups.length === 0) return false;
  if (groups.length === 1) return /^\d+$/.test(groups[0]);
  if (!/^\d{1,3}$/.test(groups[0])) return false;
  for (let i = 1; i < groups.length; i++) {
    if (!/^\d{3}$/.test(groups[i])) return false;
  }
  return true;
}

// src/lib/classifyTransactionRows.ts
var DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
  /^\d{2}\/\d{2}\/\d{4}$/
];
var SKIP_PATTERNS = [
  /\bopening balance\b/i,
  /\bclosing balance\b/i,
  /\balgsaldo\b/i,
  /\blõppsaldo\b/i,
  /\bsubtotal\b/i,
  /\bvahekokku\b/i,
  /\bkokku\b/i,
  /\btotal\b/i,
  /\blehekülg\b/i,
  /\bpage\b/i
];
function centerX(item) {
  return item.x + item.width / 2;
}
function isDateLike(value) {
  const text = value.trim();
  return DATE_PATTERNS.some((pattern) => pattern.test(text));
}
function shouldSkipRow(text) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(text));
}
function nearestColumn(x, columns) {
  if (columns.length === 0) return null;
  let best = columns[0];
  let bestDistance = Math.abs(x - best.x);
  for (let i = 1; i < columns.length; i++) {
    const distance = Math.abs(x - columns[i].x);
    if (distance < bestDistance) {
      best = columns[i];
      bestDistance = distance;
    }
  }
  return best.key;
}
function rowToColumns(row, columnMap) {
  const columns = Object.entries(columnMap).filter(([, value]) => typeof value === "number").map(([key, value]) => ({
    key,
    x: value
  }));
  const grouped = {};
  for (const item of row.items) {
    const text = item.str.trim();
    if (!text) continue;
    const key = nearestColumn(centerX(item), columns);
    if (!key) continue;
    const current = grouped[key] ?? [];
    current.push(text);
    grouped[key] = current;
  }
  const result = {};
  for (const [key, values] of Object.entries(grouped)) {
    result[key] = values.join(" ").replace(/\s+/g, " ").trim();
  }
  return result;
}
function classifyTransactionRows(rows, columnMap) {
  const transactions = [];
  const warnings = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { transactions, warnings };
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
  let previousTransaction = null;
  for (const row of orderedRows) {
    const fullRowText = row.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (!fullRowText) continue;
    if (shouldSkipRow(fullRowText)) continue;
    const cells = rowToColumns(row, columnMap);
    const date = cells.date?.trim() ?? "";
    const description = cells.description?.trim() ?? "";
    const debit = cells.debit !== void 0 ? parseEuropeanNumber(cells.debit) : null;
    const credit = cells.credit !== void 0 ? parseEuropeanNumber(cells.credit) : null;
    const balance = cells.balance !== void 0 ? parseEuropeanNumber(cells.balance) : null;
    const hasDate = isDateLike(date);
    if (!hasDate) {
      const continuationText = description || fullRowText;
      if (previousTransaction && continuationText) {
        previousTransaction.description = `${previousTransaction.description} ${continuationText}`.replace(/\s+/g, " ").trim();
      } else {
        warnings.push(
          `Unclassified row on page ${row.pageNumber}, row ${row.rowIndex}`
        );
      }
      continue;
    }
    if (debit !== null && credit !== null) {
      warnings.push(
        `Both debit and credit present on page ${row.pageNumber}, row ${row.rowIndex}`
      );
      previousTransaction = null;
      continue;
    }
    if (debit === null && credit === null) {
      warnings.push(
        `Transaction row has no amount on page ${row.pageNumber}, row ${row.rowIndex}`
      );
      previousTransaction = null;
      continue;
    }
    const transaction = {
      date,
      description,
      debit,
      credit,
      balance,
      pageNumber: row.pageNumber,
      rowIndex: row.rowIndex
    };
    transactions.push(transaction);
    previousTransaction = transaction;
  }
  return {
    transactions,
    warnings
  };
}

// src/lib/extractStructural.ts
function extractStructuralFromItems(items) {
  const warnings = [];
  if (!Array.isArray(items) || items.length === 0) {
    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["No positional PDF text items were provided."],
      success: false
    };
  }
  const rows = groupIntoRows(items);
  if (rows.length === 0) {
    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["No visual text rows could be reconstructed."],
      success: false
    };
  }
  const columnMap = detectColumnMap(rows);
  if (!columnMap) {
    return {
      rows,
      columnMap: null,
      transactions: [],
      warnings: [
        "Transaction table columns could not be identified confidently."
      ],
      success: false
    };
  }
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
    success: classified.transactions.length > 0
  };
}

// src/lib/extractStructuralFromPdf.test.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
async function buildSyntheticStatementPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y, size = 10) => {
    page.drawText(text, {
      x,
      y,
      size,
      font
    });
  };
  draw("Date", 50, 780);
  draw("Description", 150, 780);
  draw("Debit", 350, 780);
  draw("Credit", 450, 780);
  draw("Balance", 530, 780);
  draw("01.08.2026", 50, 760);
  draw("Synthetic Shop", 150, 760);
  draw("12,50", 350, 760);
  draw("487,50", 530, 760);
  draw("02.08.2026", 50, 740);
  draw("Synthetic Income", 150, 740);
  draw("100,00", 450, 740);
  draw("587,50", 530, 740);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
async function run() {
  const buffer = await buildSyntheticStatementPdf();
  const items = await extractAllPdfTextItems(buffer);
  assert(items.length > 0, "PDF positional extraction returned no items");
  const result = extractStructuralFromItems(items);
  assert(result.columnMap !== null, "Column map was not detected");
  assert(result.success === true, "Structural extraction did not succeed");
  assert(
    result.transactions.length === 2,
    `Expected 2 transactions, got ${result.transactions.length}`
  );
  const expense = result.transactions[0];
  const income = result.transactions[1];
  assert(expense.debit === 12.5, "Expense debit amount incorrect");
  assert(expense.credit === null, "Expense credit should be null");
  assert(expense.balance === 487.5, "Expense balance incorrect");
  assert(income.credit === 100, "Income credit amount incorrect");
  assert(income.debit === null, "Income debit should be null");
  assert(income.balance === 587.5, "Income balance incorrect");
  console.log(
    `extractStructuralFromPdf: 1 passed, 0 failed (${items.length} positional items)`
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
