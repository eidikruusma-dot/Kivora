---
name: PDF page-by-page extraction
description: Why the bank statement OCR switched to per-page splitting with pdf-lib instead of sending the whole PDF in one call.
---

## The rule
Split every PDF into per-page buffers with `pdf-lib` before sending to GPT-4o.
Never send the entire multi-page PDF as one `input_file` call.

## Why
GPT-4o truncates JSON output at ~4 000 tokens even with `max_output_tokens:16000`.
A 4-page SEB statement with ~44 transactions reliably drops the last 5–10 rows.
Sending one page at a time (~10–30 rows/page) keeps each response well within limits.

## Architecture (implemented in aiUpload.ts)
1. `PDFDocument.load(buffer)` → get page count
2. `PDFDocument.create()` + `copyPages` per page → per-page Buffer[]
3. Parallel calls: metadata prompt on page 1 + transaction prompt on every page
4. Merge + dedup in application code (txnFingerprint)
5. If totals mismatch printed summary: parallel page retry (buildPageRetryPrompt)
6. `extractionComplete = false` blocks import until totals match within 2 cents

## How to apply
Any time a bank statement PDF is processed, the split must happen before any OpenAI call.
The `callVision` helper is reused for metadata, per-page, and retry calls.

## Prompts
- `BANK_METADATA_PROMPT` — only sent to page 1; extracts bank/account/period/balances/summaryTotals
- `buildPagePrompt(pageNum, totalPages)` — per-page transactions only
- `buildPageRetryPrompt(pageNum, totalPages, alreadyFound, missingAmount)` — targeted rescan
