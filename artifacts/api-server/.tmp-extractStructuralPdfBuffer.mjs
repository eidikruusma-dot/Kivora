// src/lib/extractStructuralPdfBuffer.test.ts
import { PDFDocument, StandardFonts } from "pdf-lib";

// src/lib/pdfTextProbe.ts
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
  _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return { pdfjsLib: _pdfjsLib, domMatrixSource: _domMatrixSource };
}
async function extractAllPdfTextItems(buffer) {
  const { pdfjsLib } = await ensurePdfjs();
  const lib = pdfjsLib;
  const pdfData = Uint8Array.from(buffer);
  const loadingTask = lib.getDocument({
    data: pdfData,
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
  /\bpage\b/i,
  // ── Turnover / daily-balance rows ───────────────────────────────────────
  /\bdeebetkäive\b/i,
  // Estonian: debit turnover
  /\bkreeditkäive\b/i,
  // Estonian: credit turnover
  /\bpäeva\s+jääk\b/i,
  // Estonian: daily balance
  /\bdebit\s+turnover\b/i,
  /\bcredit\s+turnover\b/i,
  /\bdaily\s+balance\b/i,
  /\bturnover\b/i
];
var PENDING_SECTION_PATTERNS = [
  /\breserveeritud\b/i,
  // Estonian: reserved
  /\breservations?\b/i,
  /\bpending\s+(?:payments?|transactions?|card\s+payments?)\b/i,
  /\bcard\s+reservations?\b/i,
  /\breserveeritud\s+maksed\b/i
  // Estonian: reserved payments
];
function isPendingSectionHeader(text) {
  return PENDING_SECTION_PATTERNS.some((p) => p.test(text));
}
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
  let inPendingSection = false;
  for (const row of orderedRows) {
    const fullRowText = row.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (!fullRowText) continue;
    const cells = rowToColumns(row, columnMap);
    const date = cells.date?.trim() ?? "";
    const hasDate = isDateLike(date);
    if (!hasDate && isPendingSectionHeader(fullRowText)) {
      inPendingSection = true;
      previousTransaction = null;
      continue;
    }
    if (shouldSkipRow(fullRowText)) continue;
    const description = cells.description?.trim() ?? "";
    const debit = cells.debit !== void 0 ? parseEuropeanNumber(cells.debit) : null;
    const credit = cells.credit !== void 0 ? parseEuropeanNumber(cells.credit) : null;
    const balance = cells.balance !== void 0 ? parseEuropeanNumber(cells.balance) : null;
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
      rowIndex: row.rowIndex,
      ...inPendingSection && { pending: true }
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

// src/lib/extractStructuralControls.ts
var OPENING_PATTERNS = [
  /\balgsaldo\b/i,
  /\bopening balance\b/i,
  /\bstart balance\b/i,
  /\bbalance at period start\b/i
];
var CLOSING_PATTERNS = [
  /\blõppsaldo\b/i,
  /\bclosing balance\b/i,
  /\bend balance\b/i,
  /\bbalance at period end\b/i
];
var INCOME_PATTERNS = [
  /\blaekumised\b/i,
  /\bsissetulekud\b/i,
  /\bkrediidid kokku\b/i,
  /\btotal credits\b/i,
  /\btotal income\b/i,
  /\bincome total\b/i
];
var EXPENSE_PATTERNS = [
  /\bväljaminekud\b/i,
  /\bkulud kokku\b/i,
  /\bdeebetid kokku\b/i,
  /\bmaksed kokku\b/i,
  /\btotal debits\b/i,
  /\btotal expenses\b/i,
  /\bexpense total\b/i
];
function rowText(row) {
  return row.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
}
function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}
function numericCandidates(row) {
  const values = [];
  for (const item of row.items) {
    const raw = item.str.trim();
    if (!raw) continue;
    const parsed = parseEuropeanNumber(raw);
    if (parsed !== null) {
      values.push(parsed);
    }
  }
  return values;
}
function chooseRightmostNumericValue(row) {
  const candidates = row.items.map((item) => ({
    x: item.x + item.width / 2,
    value: parseEuropeanNumber(item.str.trim())
  })).filter(
    (entry) => entry.value !== null
  ).sort((a, b) => b.x - a.x);
  return candidates.length > 0 ? candidates[0].value : null;
}
function extractStructuralControls(rows) {
  const warnings = [];
  const controls = {
    openingBalance: null,
    closingBalance: null,
    printedIncomeTotal: null,
    printedExpenseTotal: null
  };
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      controls,
      warnings: ["No structural rows were provided."]
    };
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
  for (const row of orderedRows) {
    const text = rowText(row);
    if (!text) continue;
    let target = null;
    if (matchesAny(text, OPENING_PATTERNS)) {
      target = "openingBalance";
    } else if (matchesAny(text, CLOSING_PATTERNS)) {
      target = "closingBalance";
    } else if (matchesAny(text, INCOME_PATTERNS)) {
      target = "printedIncomeTotal";
    } else if (matchesAny(text, EXPENSE_PATTERNS)) {
      target = "printedExpenseTotal";
    }
    if (!target) continue;
    const values = numericCandidates(row);
    if (values.length === 0) {
      warnings.push(
        `Control label found but no numeric value on page ${row.pageNumber}, row ${row.rowIndex}`
      );
      continue;
    }
    const value = chooseRightmostNumericValue(row);
    if (value === null) {
      warnings.push(
        `Control value could not be parsed on page ${row.pageNumber}, row ${row.rowIndex}`
      );
      continue;
    }
    if (controls[target] !== null) {
      if (Math.abs(controls[target] - value) > 0.02) {
        warnings.push(
          `Conflicting ${target} values found on page ${row.pageNumber}, row ${row.rowIndex}`
        );
      }
      continue;
    }
    controls[target] = value;
  }
  return {
    controls,
    warnings
  };
}

// src/lib/reconcileStructuralTransactions.ts
var TOLERANCE = 0.01;
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
function differs(a, b) {
  return roundMoney(Math.abs(a - b)) > TOLERANCE;
}
function reconcileStructuralTransactions(transactions, controls = {}) {
  const posted = transactions.filter((tx) => !tx.pending);
  const calculatedIncomeTotal = roundMoney(
    posted.reduce((sum, tx) => sum + (tx.credit ?? 0), 0)
  );
  const calculatedExpenseTotal = roundMoney(
    posted.reduce((sum, tx) => sum + (tx.debit ?? 0), 0)
  );
  const printedTotalErrors = [];
  if (typeof controls.printedIncomeTotal === "number" && differs(calculatedIncomeTotal, controls.printedIncomeTotal)) {
    printedTotalErrors.push(
      `Income total mismatch: calculated ${calculatedIncomeTotal.toFixed(
        2
      )}, printed ${controls.printedIncomeTotal.toFixed(2)}`
    );
  }
  if (typeof controls.printedExpenseTotal === "number" && differs(calculatedExpenseTotal, controls.printedExpenseTotal)) {
    printedTotalErrors.push(
      `Expense total mismatch: calculated ${calculatedExpenseTotal.toFixed(
        2
      )}, printed ${controls.printedExpenseTotal.toFixed(2)}`
    );
  }
  let calculatedClosingBalance = null;
  const openingClosingErrors = [];
  if (typeof controls.openingBalance === "number") {
    calculatedClosingBalance = roundMoney(
      controls.openingBalance + calculatedIncomeTotal - calculatedExpenseTotal
    );
    if (typeof controls.closingBalance === "number" && differs(calculatedClosingBalance, controls.closingBalance)) {
      openingClosingErrors.push(
        `Closing balance mismatch: calculated ${calculatedClosingBalance.toFixed(
          2
        )}, printed ${controls.closingBalance.toFixed(2)}`
      );
    }
  }
  let runningBalanceChecks = 0;
  let runningBalanceFailures = 0;
  const mismatchedRows = [];
  const runningBalanceErrors = [];
  let previousBalance = typeof controls.openingBalance === "number" ? controls.openingBalance : null;
  for (const tx of posted) {
    if (tx.balance === null) {
      if (previousBalance !== null) {
        previousBalance = roundMoney(
          previousBalance + (tx.credit ?? 0) - (tx.debit ?? 0)
        );
      }
      continue;
    }
    if (previousBalance !== null) {
      const expectedBalance = roundMoney(
        previousBalance + (tx.credit ?? 0) - (tx.debit ?? 0)
      );
      runningBalanceChecks++;
      if (differs(expectedBalance, tx.balance)) {
        runningBalanceFailures++;
        mismatchedRows.push({
          pageNumber: tx.pageNumber,
          rowIndex: tx.rowIndex
        });
        runningBalanceErrors.push(
          `Running balance mismatch on page ${tx.pageNumber}, row ${tx.rowIndex}`
        );
      }
    }
    previousBalance = tx.balance;
  }
  if (typeof controls.closingBalance === "number" && previousBalance !== null && differs(previousBalance, controls.closingBalance)) {
    const alreadyHasClosingError = openingClosingErrors.some(
      (e) => e.startsWith("Closing balance mismatch:")
    );
    if (!alreadyHasClosingError) {
      openingClosingErrors.push(
        "Final running balance does not match closing balance."
      );
    }
  }
  const chainFullyValid = runningBalanceChecks > 0 && runningBalanceFailures === 0;
  const hasOpeningClosingError = openingClosingErrors.length > 0;
  const errors = chainFullyValid && !hasOpeningClosingError ? [...openingClosingErrors, ...runningBalanceErrors] : [...printedTotalErrors, ...openingClosingErrors, ...runningBalanceErrors];
  return {
    ok: errors.length === 0,
    calculatedIncomeTotal,
    calculatedExpenseTotal,
    calculatedClosingBalance,
    runningBalanceChecks,
    runningBalanceFailures,
    errors,
    mismatchedRows
  };
}

// src/lib/extractStructuralPdfBuffer.ts
function emptyControls() {
  return {
    openingBalance: null,
    closingBalance: null,
    printedIncomeTotal: null,
    printedExpenseTotal: null
  };
}
function parseDateForSort(dateStr) {
  const ddmm = dateStr.trim().match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
  return dateStr;
}
function sortTransactionsChronologically(txs) {
  const reversed = [...txs].reverse();
  return reversed.sort((a, b) => {
    const da = parseDateForSort(a.date);
    const db = parseDateForSort(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}
async function extractStructuralPdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const controls = emptyControls();
    return {
      rows: [],
      columnMap: null,
      transactions: [],
      warnings: ["PDF buffer is empty."],
      success: false,
      controls,
      reconciliation: reconcileStructuralTransactions([], controls)
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
      reconciliation: reconcileStructuralTransactions([], controls)
    };
  }
  const structural = extractStructuralFromItems(items);
  const controlResult = extractStructuralControls(structural.rows);
  const chronological = sortTransactionsChronologically(structural.transactions);
  const reconciliation = reconcileStructuralTransactions(
    chronological,
    controlResult.controls
  );
  const warnings = [...structural.warnings, ...controlResult.warnings];
  const hasBalanceControl = controlResult.controls.openingBalance !== null && controlResult.controls.closingBalance !== null;
  const hasPrintedTotalsControl = controlResult.controls.printedIncomeTotal !== null || controlResult.controls.printedExpenseTotal !== null;
  const hasIndependentControl = hasBalanceControl || hasPrintedTotalsControl;
  if (!hasIndependentControl) {
    warnings.push(
      "No independent statement control values were found; structural extraction is not safe for import."
    );
  }
  return {
    ...structural,
    // Override with the chronologically sorted array (spread puts structural's
    // transactions first; the explicit key wins because it appears last).
    transactions: chronological,
    warnings,
    controls: controlResult.controls,
    reconciliation,
    success: structural.success && hasIndependentControl && reconciliation.ok
  };
}

// src/lib/extractStructuralPdfBuffer.test.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
async function buildSyntheticPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y) => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font
    });
  };
  draw("Opening Balance", 50, 810);
  draw("500,00", 530, 810);
  draw("Total Credits", 50, 795);
  draw("100,00", 530, 795);
  draw("Total Debits", 50, 780);
  draw("25,50", 530, 780);
  draw("Closing Balance", 50, 765);
  draw("574,50", 530, 765);
  draw("Date", 50, 730);
  draw("Description", 150, 730);
  draw("Debit", 350, 730);
  draw("Credit", 450, 730);
  draw("Balance", 530, 730);
  draw("01.08.2026", 50, 710);
  draw("Synthetic Expense", 150, 710);
  draw("25,50", 350, 710);
  draw("474,50", 530, 710);
  draw("02.08.2026", 50, 690);
  draw("Synthetic Income", 150, 690);
  draw("100,00", 450, 690);
  draw("574,50", 530, 690);
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
async function buildPdfWithoutIndependentControls() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y) => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font
    });
  };
  draw("Date", 50, 780);
  draw("Description", 150, 780);
  draw("Debit", 350, 780);
  draw("Credit", 450, 780);
  draw("Balance", 530, 780);
  draw("01.08.2026", 50, 760);
  draw("Synthetic Expense", 150, 760);
  draw("25,50", 350, 760);
  draw("474,50", 530, 760);
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
async function buildNewestFirstPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y) => {
    page.drawText(text, {
      x,
      y,
      size: 10,
      font
    });
  };
  draw("Opening Balance", 50, 810);
  draw("500,00", 530, 810);
  draw("Total Credits", 50, 795);
  draw("100,00", 530, 795);
  draw("Total Debits", 50, 780);
  draw("25,50", 530, 780);
  draw("Closing Balance", 50, 765);
  draw("574,50", 530, 765);
  draw("Date", 50, 730);
  draw("Description", 150, 730);
  draw("Debit", 350, 730);
  draw("Credit", 450, 730);
  draw("Balance", 530, 730);
  draw("02.08.2026", 50, 710);
  draw("Newest-First Income", 150, 710);
  draw("100,00", 450, 710);
  draw("574,50", 530, 710);
  draw("01.08.2026", 50, 690);
  draw("Newest-First Expense", 150, 690);
  draw("25,50", 350, 690);
  draw("474,50", 530, 690);
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
async function run() {
  let passed = 0;
  {
    const result = await extractStructuralPdfBuffer(Buffer.alloc(0));
    assert(result.success === false, "Empty buffer must fail");
    assert(
      result.transactions.length === 0,
      "Empty buffer returned transactions"
    );
    passed++;
  }
  {
    const buffer = await buildSyntheticPdf();
    const result = await extractStructuralPdfBuffer(buffer);
    assert(result.columnMap !== null, "Column map missing");
    assert(result.transactions.length === 2, "Expected 2 transactions");
    assert(result.controls.openingBalance === 500, "Opening balance incorrect");
    assert(
      result.controls.closingBalance === 574.5,
      "Closing balance incorrect"
    );
    assert(
      result.controls.printedIncomeTotal === 100,
      "Income control incorrect"
    );
    assert(
      result.controls.printedExpenseTotal === 25.5,
      "Expense control incorrect"
    );
    assert(result.reconciliation.ok === true, "Reconciliation should pass");
    assert(
      result.reconciliation.calculatedIncomeTotal === 100,
      "Calculated income incorrect"
    );
    assert(
      result.reconciliation.calculatedExpenseTotal === 25.5,
      "Calculated expense incorrect"
    );
    assert(
      result.reconciliation.calculatedClosingBalance === 574.5,
      "Calculated closing incorrect"
    );
    assert(
      result.success === true,
      "Fully reconciled structural extraction should succeed"
    );
    passed++;
  }
  {
    const buffer = await buildSyntheticPdf();
    const a = await extractStructuralPdfBuffer(buffer);
    const b = await extractStructuralPdfBuffer(buffer);
    assert(
      JSON.stringify(a) === JSON.stringify(b),
      "Same PDF buffer must produce identical full structural result"
    );
    passed++;
  }
  {
    const buffer = await buildPdfWithoutIndependentControls();
    const result = await extractStructuralPdfBuffer(buffer);
    assert(
      result.transactions.length === 1,
      "Transaction should still be structurally extracted"
    );
    assert(
      result.controls.openingBalance === null,
      "Opening balance should be absent"
    );
    assert(
      result.controls.closingBalance === null,
      "Closing balance should be absent"
    );
    assert(
      result.controls.printedIncomeTotal === null,
      "Printed income total should be absent"
    );
    assert(
      result.controls.printedExpenseTotal === null,
      "Printed expense total should be absent"
    );
    assert(
      result.success === false,
      "Import must fail closed when no independent controls are present"
    );
    assert(
      result.warnings.some(
        (warning) => warning.includes("No independent statement control values")
      ),
      "Missing independent-control warning expected"
    );
    passed++;
  }
  {
    const buffer = await buildSyntheticPdf();
    const originalByteLength = buffer.byteLength;
    assert(originalByteLength > 0, "Synthetic PDF must be non-empty");
    const structuralBuffer = Buffer.from(buffer);
    await extractStructuralPdfBuffer(structuralBuffer);
    assert(
      buffer.byteLength === originalByteLength,
      `Original buffer was zeroed by pdfjs transfer: expected ${originalByteLength} bytes, got ${buffer.byteLength}`
    );
    assert(
      Buffer.isBuffer(buffer) && buffer.length > 0,
      "Original buffer must remain a non-empty Buffer after structural extraction"
    );
    passed++;
  }
  {
    const buffer = await buildNewestFirstPdf();
    const result = await extractStructuralPdfBuffer(buffer);
    assert(
      result.transactions.length === 2,
      "Expected 2 transactions from newest-first PDF"
    );
    const firstDate = result.transactions[0].date;
    const secondDate = result.transactions[1].date;
    assert(
      firstDate < secondDate || firstDate.includes("01"),
      `First transaction must be the older date; got "${firstDate}" before "${secondDate}"`
    );
    assert(
      result.reconciliation.ok === true,
      "Running-balance chain must validate after chronological sort of newest-first input"
    );
    assert(
      result.success === true,
      "Fully reconciled extraction from newest-first PDF must succeed"
    );
    passed++;
  }
  console.log(`extractStructuralPdfBuffer: ${passed} passed, 0 failed`);
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
