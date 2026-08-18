/**
 * pdfModelOutputTruncation.test.ts
 *
 * Regression test for the OCR/AI-fallback truncation-detection defect in
 * extractBankStatementViaOpenAI() (routes/aiUpload.ts).
 *
 * Root cause (see PR diagnosis): the OpenAI Responses API's `output_text`
 * convenience field is built by concatenating whatever output_text content
 * parts exist in the response, REGARDLESS of `status`. When a response is
 * cut off mid-generation (status: "incomplete", most commonly
 * incomplete_details.reason: "max_output_tokens"), `output_text` can still
 * be a syntactically valid, parseable JSON object — with a SHORT
 * transactions[] array, because the small, fixed-cost `document` block
 * (bank name, period, opening/closing balance, printed totals) is emitted
 * before the large `transactions` array in the JSON schema. The old code
 * only checked "is output_text empty?" and "does it parse?" — never
 * `response.status` / `response.incomplete_details` — so a truncated-but-
 * valid response was silently accepted as a complete result. This is what
 * produced "small subset of transactions" + "income-total mismatch" on the
 * live Money PDF import.
 *
 * This file inlines the exact decision logic added to
 * extractBankStatementViaOpenAI() (self-contained — no Express, no OpenAI
 * SDK import — matching the convention already used by bankExtraction.test.ts)
 * and proves:
 *   1. A response with status "incomplete" is rejected BEFORE its JSON is
 *      ever parsed, even when that JSON is well-formed.
 *   2. A normal, complete response is unaffected.
 *   3. The pre-fix logic (status ignored) would have silently accepted the
 *      exact same truncated response the fix now rejects.
 *
 * All data (dates, amounts, descriptions) is entirely synthetic/invented —
 * no real bank statement, account, or personal data is used anywhere.
 *
 * Run:
 *   npx esbuild --bundle --platform=node --format=cjs \
 *     src/lib/pdfModelOutputTruncation.test.ts | node
 */

// Makes this file an ES module (rather than a global script) so its
// top-level declarations don't collide with same-named declarations in
// other self-contained test files (e.g. bankExtraction.test.ts also
// declares a top-level `assert`).
export {};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Minimal shape mirroring the fields read from the OpenAI Responses API ──
interface OpenAIResponseLike {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

type Classification =
  | { kind: "truncated"; reason: string | null }
  | { kind: "empty" }
  | { kind: "parse_error" }
  | { kind: "ok"; transactionCount: number };

// ── 1:1 mirror of the FIXED control flow in extractBankStatementViaOpenAI ──
// (status/incomplete_details checked BEFORE the empty-text check, which is
// checked before JSON.parse — same order as the real function).
function classifyResponseFixed(response: OpenAIResponseLike): Classification {
  const outputText = response.output_text?.trim() ?? "";
  const status = response.status ?? "unknown";
  const incompleteReason = response.incomplete_details?.reason ?? null;

  if (status === "incomplete") {
    return { kind: "truncated", reason: incompleteReason };
  }
  if (!outputText) {
    return { kind: "empty" };
  }
  try {
    const parsed = JSON.parse(outputText) as { transactions?: unknown[] };
    return { kind: "ok", transactionCount: parsed.transactions?.length ?? 0 };
  } catch {
    return { kind: "parse_error" };
  }
}

// ── Mirror of the PRE-FIX control flow — status/incomplete_details never
// read, exactly as the live (buggy) code behaved. Used only to prove the
// defect this fix addresses actually reproduces.
function classifyResponsePreFix(response: OpenAIResponseLike): Classification {
  const outputText = response.output_text?.trim() ?? "";
  if (!outputText) {
    return { kind: "empty" };
  }
  try {
    const parsed = JSON.parse(outputText) as { transactions?: unknown[] };
    return { kind: "ok", transactionCount: parsed.transactions?.length ?? 0 };
  } catch {
    return { kind: "parse_error" };
  }
}

/**
 * Builds a syntactically VALID, complete JSON bank-statement response body
 * whose transactions[] array has been cut short — simulating exactly what a
 * max_output_tokens cutoff produces when it lands after the small `document`
 * block but partway through the (much larger) `transactions` array: the
 * model/SDK still closes out a well-formed JSON object, it just contains
 * fewer rows than the real statement. Entirely synthetic data.
 */
function buildTruncatedButValidJson(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    date: `2031-05-${String(i + 1).padStart(2, "0")}`,
    description: `Synthetic Row ${i + 1}`,
    debit: i % 2 === 0 ? 10 + i : null,
    credit: i % 2 === 0 ? null : 10 + i,
    balance: 1000 + i,
    currency: "EUR",
    sourcePage: Math.floor(i / 5) + 1,
    confidence: "high",
  }));
  return JSON.stringify({
    document: {
      isBankStatement: true,
      bankName: "Synthetic Test Bank",
      accountNumber: "SY00 0000 0000 0000",
      currency: "EUR",
      periodFrom: "2031-05-01",
      periodTo: "2031-05-30",
      openingBalance: 1000,
      // The document block (small, fixed cost) is emitted first and is
      // still fully correct even though the transaction list was cut short —
      // this is exactly what produces a totals mismatch downstream instead
      // of a hard parse failure.
      closingBalance: 1990,
      printedIncomeTotal: 500,
      printedExpenseTotal: 350,
    },
    transactions: rows,
    warnings: [],
  });
}

function run(): void {
  let passed = 0;

  // ── 1. Incomplete response rejected BEFORE parsing, even with valid JSON ──
  {
    const response: OpenAIResponseLike = {
      output_text: buildTruncatedButValidJson(4), // well-formed JSON, just short
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      usage: { input_tokens: 42000, output_tokens: 16384, total_tokens: 58384 },
    };

    const result = classifyResponseFixed(response);

    assert(
      result.kind === "truncated",
      `Fixed logic must classify an incomplete response as truncated before parsing; got ${result.kind}`,
    );
    assert(
      result.kind === "truncated" && result.reason === "max_output_tokens",
      "Truncation reason must be surfaced from incomplete_details.reason",
    );

    passed++;
  }

  // ── 2. Incomplete response with no reason reported still rejected ─────────
  {
    const response: OpenAIResponseLike = {
      output_text: buildTruncatedButValidJson(2),
      status: "incomplete",
      incomplete_details: null,
    };

    const result = classifyResponseFixed(response);
    assert(
      result.kind === "truncated" && result.reason === null,
      `Must still classify as truncated even when incomplete_details is null; got ${JSON.stringify(result)}`,
    );

    passed++;
  }

  // ── 3. Complete response is unaffected ─────────────────────────────────────
  {
    const response: OpenAIResponseLike = {
      output_text: buildTruncatedButValidJson(12),
      status: "completed",
      incomplete_details: null,
      usage: { input_tokens: 20000, output_tokens: 3000, total_tokens: 23000 },
    };

    const result = classifyResponseFixed(response);
    assert(
      result.kind === "ok" && result.transactionCount === 12,
      `Complete response must parse normally; got ${JSON.stringify(result)}`,
    );

    passed++;
  }

  // ── 4. Missing status field (defensive default) behaves like "completed" ──
  {
    const response: OpenAIResponseLike = {
      output_text: buildTruncatedButValidJson(3),
    };

    const result = classifyResponseFixed(response);
    assert(
      result.kind === "ok" && result.transactionCount === 3,
      `Missing status must not be treated as truncated; got ${JSON.stringify(result)}`,
    );

    passed++;
  }

  // ── 5. Empty output text still reported as empty, not truncated ───────────
  {
    const response: OpenAIResponseLike = {
      output_text: "",
      status: "completed",
    };

    const result = classifyResponseFixed(response);
    assert(
      result.kind === "empty",
      `Empty output on a completed response must be 'empty', not 'truncated'; got ${result.kind}`,
    );

    passed++;
  }

  // ── 6. Regression proof: pre-fix logic silently accepts the exact same
  //       truncated response the fix now rejects ───────────────────────────
  {
    const response: OpenAIResponseLike = {
      output_text: buildTruncatedButValidJson(4),
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    };

    const buggyResult = classifyResponsePreFix(response);
    const fixedResult = classifyResponseFixed(response);

    assert(
      buggyResult.kind === "ok" && buggyResult.transactionCount === 4,
      `Pre-fix logic must reproduce the defect: silently accept a truncated ` +
        `response as a complete 4-transaction result; got ${JSON.stringify(buggyResult)}`,
    );
    assert(
      fixedResult.kind === "truncated",
      "Fixed logic must reject the identical response",
    );

    passed++;
  }

  console.log(`pdfModelOutputTruncation: ${passed} passed, 0 failed`);
}

run();
