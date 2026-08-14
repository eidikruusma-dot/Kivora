/**
 * parseEuropeanNumber.ts
 *
 * Deterministic parser for European financial number formats.
 * Pure function — no I/O, no locale-dependent runtime parsing, no AI.
 *
 * Supported formats:
 *   "1 234,56"          space-thousands, comma-decimal
 *   "12 345,67"         space-thousands, comma-decimal
 *   "1.234,56"          period-thousands, comma-decimal
 *   "1.234.567,89"      multi-period-thousands, comma-decimal
 *   "1234,56"           no thousands, comma-decimal (2 digits → unambiguous)
 *   "1234.56"           no thousands, period-decimal (≠3 decimal digits → unambiguous)
 *   "1 234.56"          space-thousands, period-decimal
 *   "1,234.56"          comma-thousands, period-decimal
 *   "1,234,567.89"      multi-comma-thousands, period-decimal
 *   "1 234 567"         space-thousands, integer
 *   "+100,50"           with leading plus
 *   "-1 234,56"         with leading minus
 *   "€ 1 234,56"        with currency symbol prefix (safely stripped)
 *   "1 234,56 EUR"      with currency code suffix (safely stripped)
 *
 * Rejects (returns null):
 *   - "1,234" or "1.234": single separator with exactly 3 trailing digits → ambiguous
 *   - Malformed multi-separator patterns (e.g., "1.234.56", "1,2,3")
 *   - Non-numeric or empty input
 *   - Three distinct separator types simultaneously
 *
 * Design principle: when in doubt, return null rather than silently misparse.
 */

// ── Currency stripping ────────────────────────────────────────────────────────
//
// Used with String.prototype.replace() only — safe to use as module-level
// constants because .replace() does not mutate lastIndex.

/** Currency symbols that may appear as a prefix or suffix. */
const CURRENCY_SYMBOLS_RE = /^[€$£¥₩₽]\s*|\s*[€$£¥₩₽]$/g;

/** ISO currency codes that may appear at the start, separated by whitespace. */
const CURRENCY_CODE_START_RE =
  /^(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|HRK|kr|Kč|zł)\s+/i;

/** ISO currency codes that may appear at the end, separated by whitespace. */
const CURRENCY_CODE_END_RE =
  /\s+(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|HRK|kr|Kč|zł)$/i;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a European financial number string into a JavaScript number.
 *
 * Handles common European formats (comma decimal, space/period thousands) as
 * well as UK/US comma-thousands with period-decimal. Strips leading/trailing
 * whitespace, optional sign characters, and common currency symbols/codes.
 *
 * @param raw  The raw string to parse (e.g., "1 234,56" or "€ -1.234,56 EUR").
 * @returns    The parsed number, or `null` if the format is invalid or ambiguous.
 */
export function parseEuropeanNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;

  // 1. Strip outer whitespace
  let text = raw.trim();
  if (!text) return null;

  // 2. Strip currency symbols/codes from prefix and suffix (in three passes to
  //    handle combinations like "€ EUR 1234,56" gracefully, though unusual)
  text = text
    .replace(CURRENCY_SYMBOLS_RE, "")
    .replace(CURRENCY_CODE_START_RE, "")
    .replace(CURRENCY_CODE_END_RE, "")
    .trim();

  if (!text) return null;

  // 3. Extract optional leading sign
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }

  if (!text) return null;

  // 4. Parse the unsigned numeric string
  const value = parseCore(text);
  if (value === null) return null;
  if (!isFinite(value)) return null;

  // Preserve -0 as 0 (edge case: "-0,00")
  if (value === 0) return 0;

  return negative ? -value : value;
}

// ── Core parsing (unsigned, no sign, no currency) ─────────────────────────────

/**
 * Parse the stripped numeric core.
 *
 * Determines the separator roles (thousands / decimal) from context:
 * - Both comma and period present: the LAST one is the decimal separator.
 * - Mixed space+comma or space+period: space=thousands, other=decimal.
 * - Single separator type: 3 trailing digits → ambiguous (null); otherwise decimal.
 *   Multiple of the same separator: must form valid 3-digit thousands groups.
 * - Only spaces: integer with space-thousands grouping.
 * - No separators: plain integer.
 */
function parseCore(text: string): number | null {
  // Normalise various space variants to ASCII space
  text = text.replace(/[\u00a0\u202f\u2009\u2007]/g, " ");

  const hasComma  = text.includes(",");
  const hasPeriod = text.includes(".");
  const hasSpace  = text.includes(" ");

  // Three distinct separator types → not unambiguously parseable
  if (hasComma && hasPeriod && hasSpace) return null;

  // ── Case 1: Both comma and period present ───────────────────────────────────
  // The LAST separator determines the decimal position.
  if (hasComma && hasPeriod) {
    const lastCommaIdx  = text.lastIndexOf(",");
    const lastPeriodIdx = text.lastIndexOf(".");
    if (lastCommaIdx > lastPeriodIdx) {
      // comma is last → comma = decimal, period = thousands
      return parseDecimalWithThousands(text, ".", ",");
    } else {
      // period is last → period = decimal, comma = thousands
      return parseDecimalWithThousands(text, ",", ".");
    }
  }

  // ── Case 2: Space + comma → space = thousands, comma = decimal ─────────────
  if (hasSpace && hasComma) {
    return parseDecimalWithThousands(text, " ", ",");
  }

  // ── Case 3: Space + period → space = thousands, period = decimal ────────────
  if (hasSpace && hasPeriod) {
    return parseDecimalWithThousands(text, " ", ".");
  }

  // ── Case 4: Only commas ─────────────────────────────────────────────────────
  if (hasComma && !hasPeriod && !hasSpace) {
    return parseSingleSeparatorType(text, ",");
  }

  // ── Case 5: Only periods ────────────────────────────────────────────────────
  if (hasPeriod && !hasComma && !hasSpace) {
    return parseSingleSeparatorType(text, ".");
  }

  // ── Case 6: Only spaces → integer with space-thousands ─────────────────────
  if (hasSpace && !hasComma && !hasPeriod) {
    return parseSpaceOnlyInteger(text);
  }

  // ── Case 7: No separators → plain integer ──────────────────────────────────
  if (/^\d+$/.test(text)) return Number(text);

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a number where the decimal and thousands separators are already known.
 *
 * Algorithm:
 * 1. Find the last occurrence of `decimalSep` to split integer and decimal parts.
 * 2. The integer part is split by `thousandsSep` and validated as proper groups.
 * 3. The decimal part must be one or more digits.
 *
 * @param text         Raw numeric string (no sign, no currency).
 * @param thousandsSep Character used as the thousands separator.
 * @param decimalSep   Character used as the decimal separator.
 */
function parseDecimalWithThousands(
  text: string,
  thousandsSep: string,
  decimalSep: string,
): number | null {
  const decIdx = text.lastIndexOf(decimalSep);

  if (decIdx === -1) {
    // No decimal separator — treat as integer with thousands grouping only
    const groups = splitOnSep(text, thousandsSep);
    if (!groups) return null;
    if (!validateIntegerGroups(groups)) return null;
    const clean = groups.join("");
    if (!/^\d+$/.test(clean)) return null;
    return Number(clean);
  }

  const intPart = text.slice(0, decIdx);
  const decPart = text.slice(decIdx + 1);

  // Decimal part: must be non-empty, digits only
  if (!decPart || !/^\d+$/.test(decPart)) return null;

  // Integer part: must be non-empty, valid thousands groups
  if (!intPart) return null;

  const intGroups = splitOnSep(intPart, thousandsSep);
  if (!intGroups) return null;
  if (!validateIntegerGroups(intGroups)) return null;

  const intClean = intGroups.join("");
  if (!/^\d+$/.test(intClean)) return null;

  // parseFloat is safe here: intClean is pure digits, decPart is pure digits
  return parseFloat(`${intClean}.${decPart}`);
}

/**
 * Parse a string where ONLY ONE type of separator is present.
 *
 * Rules:
 * - Single occurrence, trailing group = 3 digits → **ambiguous** → null.
 *   (e.g., "1,234": could be 1234 [thousands] or 1.234 [decimal])
 * - Single occurrence, trailing group ≠ 3 digits → decimal separator.
 *   (e.g., "1234,56" → 1234.56; "1234,5" → 1234.5)
 * - Multiple occurrences → thousands separator; ALL groups except first
 *   must be exactly 3 digits, including the last.
 *   (e.g., "1,234,567" → 1234567; "1.234.567" → 1234567)
 *
 * @param text The numeric string.
 * @param sep  The separator character ("," or ".").
 */
function parseSingleSeparatorType(text: string, sep: string): number | null {
  const parts = text.split(sep);

  if (parts.length < 2) return null; // no separator (shouldn't happen)

  // Every part must consist only of digits
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  if (parts.length === 2) {
    const [intPart, fracPart] = parts;
    if (!intPart) return null; // leading separator, e.g. ",56"

    if (fracPart.length === 3) {
      // Exactly 3 digits after a single separator → ambiguous
      return null;
    }

    // Non-3 trailing digits → unambiguously a decimal separator
    return parseFloat(`${intPart}.${fracPart}`);
  }

  // Multiple separators of the same type → must be thousands groups
  if (!validateIntegerGroups(parts)) return null;

  // The last group must also be exactly 3 digits (no decimal interpretation)
  if (parts[parts.length - 1].length !== 3) return null;

  return Number(parts.join(""));
}

/**
 * Parse a string containing only space as separator (no comma/period).
 * Interpreted as an integer with space-thousands grouping.
 *
 * e.g., "1 234" → 1234, "1 234 567" → 1234567.
 * Rejects groups that don't conform to the 3-digit rule (e.g., "12 34" → null).
 */
function parseSpaceOnlyInteger(text: string): number | null {
  const groups = text.split(" ").filter((g) => g.length > 0);
  if (!validateIntegerGroups(groups)) return null;
  if (!groups.every((g) => /^\d+$/.test(g))) return null;
  return Number(groups.join(""));
}

/**
 * Split `text` on `sep`, returning `null` if any resulting segment is empty
 * (which would indicate a leading, trailing, or doubled separator).
 */
function splitOnSep(text: string, sep: string): string[] | null {
  const parts = text.split(sep);
  if (parts.some((p) => p === "")) return null;
  return parts;
}

/**
 * Validate that `groups` represent a well-formed thousands-separated integer:
 * - Single group: any digit count is fine (no thousands separator used).
 * - First group: 1–3 digits.
 * - All subsequent groups: exactly 3 digits.
 *
 * This ensures correct grouping like ["1","234","567"] but rejects
 * ["1","23","567"] (middle group wrong) or ["1234","567"] (first too long).
 */
function validateIntegerGroups(groups: string[]): boolean {
  if (groups.length === 0) return false;
  if (groups.length === 1) return /^\d+$/.test(groups[0]);

  // First group: 1–3 digits
  if (!/^\d{1,3}$/.test(groups[0])) return false;

  // Subsequent groups: exactly 3 digits each
  for (let i = 1; i < groups.length; i++) {
    if (!/^\d{3}$/.test(groups[i])) return false;
  }
  return true;
}
