---
name: Structural PDF parser
description: Phase 1B bank-statement extraction pipeline — pdfjs-dist environment setup, parseEuropeanNumber rules, groupIntoRows design decisions.
---

## pdfjs-dist in Node.js (api-server)

- Version confirmed: **5.4.296** — ESM-only (no CJS build).
- **DOMMatrix polyfill required**: Node.js v24 has no DOMMatrix. Use `@napi-rs/canvas` (pdfjs-dist's own optional dep); added as `optionalDependencies` in api-server/package.json.
- Polyfill must be applied to `globalThis` **before** the dynamic `import('pdfjs-dist')` — pdfjs runs `new DOMMatrix()` at module init time (line 9387 build/pdf.mjs).
- Worker: `import.meta.resolve('pdfjs-dist/build/pdf.worker.mjs')` → file:// URL → passed to `GlobalWorkerOptions.workerSrc`.
- Both `pdfjs-dist` and `@napi-rs/canvas` in build.mjs `external` list.
- Non-fatal warning "use the legacy build" is harmless for text-extraction path.
- Probe helper: `src/routes/pdfTextProbe.ts` — exports `probePdfTextExtraction(buffer)`.

## parseEuropeanNumber (src/lib/parseEuropeanNumber.ts)

**Ambiguity rule**: single separator + exactly 3 trailing digits → `null`.
- `"1,234"` → null; `"1.234"` → null (could be thousands OR decimal)
- `"1,234,567"` → 1234567 (multiple same-type separators, all groups 3 digits → integer)
- `"1,234.56"` → 1234.56 (two types present; LAST type = decimal)

**Separator detection priority**:
1. Both comma+period: last one wins as decimal
2. Space+comma → space=thousands, comma=decimal
3. Space+period → space=thousands, period=decimal
4. Single type only → ambiguity check on 3-digit rule
5. Three types simultaneously → null (too ambiguous)

**Why**: deterministic, locale-independent, never silently misparses.

**How to apply**: call before any numeric comparison; treat null as "needs human review".

## groupIntoRows (src/lib/groupIntoRows.ts)

**Cluster seed Y**: the Y of the first item (highest in cluster after descending sort). Does NOT update as items are added — provides a stable, non-drifting reference.

**Default tolerance derivation**: `max(0.5, medianHeight × 0.4)` using lower-median index `Math.floor((n-1)/2)`.
- **Why 40%**: within-line Y jitter is ≤1pt; between-line gap is ~1.2× font size. 40% sits safely between them.
- **Why lower median**: conservative — smaller tolerance → fewer false row merges.
- Data-derived, not bank-specific.

**Sort stability**: within-row sort by X then str; across-row sort by Y-desc then X then str. Ensures byte-identical output for identical input.

**rowY**: seed Y (topmost item in cluster). **rowIndex**: 0-based per-page. Pages in ascending order.

## Test infrastructure

- Test pattern: `npx esbuild --bundle --platform=node --format=cjs <test.ts> | node`
- Scripts added to api-server/package.json: `test`, `test:parseEuropeanNumber`, `test:groupIntoRows`, `test:extraction`
- 99 tests each for parseEuropeanNumber and groupIntoRows; all pass.

## Phase 1B implementation sequence (approved steps only)

- Step 1 (done): pdfjs-dist validated in Node.js environment
- Step 2 (done): parseEuropeanNumber — pure deterministic number parser
- Step 3 (done): groupIntoRows — pure deterministic row grouper
- Step 4+ (NOT YET APPROVED): column detection, transaction classification
