---
name: pdf-parse v2 API
description: pdf-parse was upgraded to v2 (completely different API from v1); using v1 call pattern silently fails.
---

## Rule
`pdf-parse@^2` exports a `PDFParse` **class**, not a callable function. Using the v1 pattern `pdfParse(buffer)` throws `TypeError: pdfParse is not a function` at runtime.

**Correct v2 usage in aiUpload.ts (via globalThis.require CJS external):**
```ts
const { PDFParse } = (globalThis as any).require("pdf-parse");
const parser = new PDFParse({ data: buffer, verbosity: 0 });
const result = await parser.getText();
await parser.destroy();
const text = (result.text as string).trim();
```

**Why:** Package was at v2.4.5 but code was written for v1. Catch block swallowed the TypeError and re-threw a generic "PDF could not be parsed" message, making every PDF upload fail with no actionable log.

**How to apply:** Any time pdf-parse is called in the API server, use the class pattern above. `verbosity: 0` suppresses internal pdfjs logging. Always `await parser.destroy()` after use. For scanned/image-only PDFs, `result.text` is an empty string — check and throw `"PDF_NO_TEXT"` so the client can show a localized message.

## Client-side PDF_NO_TEXT code
Server throws `new Error("PDF_NO_TEXT")` for empty text extractions (scanned PDFs). Client maps this code to the localized string:
- ET: "PDF ei sisalda loetavat teksti. Proovi tekstipõhist PDF-i."
- EN: "The PDF does not contain readable text. Try a text-based PDF."
