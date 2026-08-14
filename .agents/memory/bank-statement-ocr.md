---
name: Bank statement OCR pipeline
description: Two-track bank statement extraction (structural positional Track A, AI fallback Track B); shared postProcessBankTransactions pipeline for both paths.
---

## Current production architecture — two-track extraction

**Track A (structural/positional):** `extractStructuralPdfBuffer(buffer)` → `RawTransactionRow[]`
- Positional column detection using pdfjs-dist item coordinates.
- Requires independent printed controls (opening/closing balance or turnover totals).
- Returns `success: true` only when both extraction and reconciliation pass.

**Track B (AI fallback):** OpenAI Responses API with `input_file` + strict JSON schema.
- Used when structural extraction returns `success: false` or `transactions.length === 0`.
- `normalizeBankTransaction(row, idx, aiDoc)` — pure fn, converts model row → BankTransaction.

**Both paths feed into the same shared function after normalization:**
```
postProcessBankTransactions(transactions, controls)
```
See `artifacts/api-server/src/lib/postProcessBankTransactions.ts`.

## extractStructuralControls — printed total extraction rules

**Root cause of 937.90 bug:** bare `/\blaekumised\b/i` matched a per-day summary row ("Laekumised 937,90") that appeared before any statement-wide total. The code takes the first match and discards later ones.

**Fix (two layers of defence):**

1. `INCOME_PATTERNS` and `EXPENSE_PATTERNS` now require an **explicit scope qualifier**: every pattern must contain "kokku", "total", or an unambiguous English multi-word phrase. Bare words "laekumised", "sissetulekud", "väljaminekud" were removed.
2. `DAILY_SCOPE_EXCLUSION_PATTERNS` — belt-and-suspenders filter applied only to printed income/expense totals (not opening/closing). If a matching row also contains "päeva", "kreeditkäive", "deebetkäive", "daily", "subtotal", "vahesumma", "pending", or "reserveeritud", it is skipped with a warning.

Opening/closing balance patterns are inherently statement-level and do NOT need the daily exclusion filter.

**Rule summary:**
- `printedIncomeTotal` set only when label unambiguously = whole-statement period total
- `printedExpenseTotal` same
- Per-day / per-page / intermediate rows → `null` (control unavailable, not failure)
- Missing printed totals never block import; running-balance chain and opening→closing are the primary validation

**Tests:** `test:extractStructuralControls` now has 21 tests (was 10).

## postProcessBankTransactions (shared pipeline)

Steps performed for BOTH tracks:
1. **Chronological sort**: reverses input (PDF is newest-first), then stable-sorts by date ISO. Handles same-day within-day ordering correctly.
2. **Canonical reconciliation**: calls `reconcileStructuralTransactions()` — tolerance 0.01, running-balance chain with pending exclusion, chain-over-printed-total priority hierarchy.
3. **Mismatch flagging**: adds `needsReview: true` + Estonian reason string to individual failing rows.
4. **Posted totals**: excludes `pending` and `needsReview` rows from `incomeCount/expenseCount/calculatedIncomeTotal/calculatedExpenseTotal`.
5. **Import decision**: `importAllowed = reconciliation.ok && reviewCount === 0`.
6. **validationStatus**: `review_required` | `verified` (controls present + passed) | `unverified` (no controls).

## Key design principles

- **No bank-specific profiles.** No hardcoded labels, expected totals, or bank names in prompts.
- **Direction is always deterministic application code only**: `credit > 0` → income, `debit > 0` → expense. Never from LLM.
- **Computed totals always in application code**: never taken from model output.
- **Pending rows**: server excludes from totals; both client write loops (`FinancePage.runImport`, `AIAssistantPage.confirmMoneyImport`) also skip `pending` rows as a fail-safe.

## validationStatus (three-state gate)

| Status | Condition |
|---|---|
| `review_required` | Any `needsReview` row, OR reconciliation failure |
| `verified` | No review rows AND at least one passing control check |
| `unverified` | No review rows AND no control checks available |

`importAllowed = validationStatus !== "review_required"` — both `verified` and `unverified` allow import.

## Canonical BankMeta fields

`statementId`, `bank`, `accountNumber`, `period`, `openingBalance`, `closingBalance`, `summaryIncome`, `summaryExpenses`, `pagesTotal`, `pagesProcessed`, `incomeCount`, `expenseCount`, `calculatedIncomeTotal`, `calculatedExpenseTotal`, `validationStatus`, `importAllowed`, `validationErrors[]`

Legacy optional fields still present for backward compat: `reconciliationOk`, `reconciliationNote`, `extractionComplete`, `totalIncome`, `totalExpenses`, `needsReviewCount`.

## Canonical BankTransaction fields

`id`, `page`, `rowIndex`, `date`, `description`, `debit`, `credit`, `balance`, `amount`, `direction`, `currency`, `needsReview?`, `reviewReason?`, `pending?`

## Client pending guard (both write loops)

In `FinancePage.tsx runImport()` and `AIAssistantPage.tsx confirmMoneyImport()`, immediately after the `needsReview` skip:
```typescript
if (item.pending) { skipped++; continue; }
```
The two functions must remain identical in their write-loop guards.

## Frontend gate (AIAssistantPage.tsx)

`canImport = bankMeta.importAllowed === true && needsReview.length === 0 && reconciliationOk !== false && extractionComplete !== false`

The last two clauses exist only for backward compat with old pipeline responses.

## canonicalBankDataRef pattern (IMPORTANT — unchanged)

The canonical transaction array must be stored in a React ref, not read from `attachedFiles` state, because:
- `setAttachedFiles([])` is called synchronously before async callbacks run
- React stale closures mean the `.then()` callback may see old or new state unpredictably
- A ref always gives the current value regardless of re-renders

Pattern: snapshot into ref in `sendMessage` BEFORE `setAttachedFiles([])`, then read from ref in all async callbacks.

## Buffer ownership fix (critical)

pdfjs-dist transfers `Uint8Array` to its worker via structured clone, zeroing the source buffer.
Fix: `Uint8Array.from(buffer)` (independent copy) in both `extractAllPdfTextItems` and `probePdfTextExtraction` in `pdfTextProbe.ts`.
In the route: `originalPdfBuffer = Buffer.from(file.buffer)` preserved BEFORE Track A; Track A gets `Buffer.from(originalPdfBuffer)`; Track B gets `originalPdfBuffer`.

## Unit tests

| Script | File | Count |
|---|---|---|
| `test:postProcessBankTransactions` | `src/lib/postProcessBankTransactions.test.ts` | 8 |
| `test:reconcileStructuralTransactions` | `src/lib/reconcileStructuralTransactions.test.ts` | 17 |
| `test:extractStructuralPdfBuffer` | `src/lib/extractStructuralPdfBuffer.test.ts` | 6 |
| `test:extraction` | `src/routes/bankExtraction.test.ts` | 36 |

All run via `npx esbuild --bundle --platform=node --format=cjs <file> | node`.

## Legacy pipeline (UNREACHABLE from production)

`extractBankStatementOCR()`, `buildPagePrompt()`, `buildMetadataPrompt()`, `callVision()`, `applyRunningBalanceValidation()` are all still in `aiUpload.ts` marked LEGACY. Safe to ignore.
