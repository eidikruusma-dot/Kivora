/**
 * Regression coverage for wiring the shared enforceAiQuota() gate
 * (lib/aiQuotaGate.ts) into aiUpload.ts's three cost-generating routes:
 * POST /ai/upload, POST /ai/bank-import, POST /ai/upload-direct-test.
 * POST /ai/bank-import/revalidate is deliberately excluded (it never
 * calls OpenAI — see postProcessBankTransactions/buildBankMeta, pure
 * local reconciliation math) and this file proves it stays that way.
 *
 * The gate function's own decision logic (owner bypass, exhaustion,
 * backend-failure fail-closed, no-req-parameter) is already exhaustively
 * proven generically in aiChatQuotaEnforcement.test.ts — this file does
 * NOT duplicate that. It proves, per route, exactly what's specific to
 * THIS wiring:
 *
 *   1. Structural: each of the three routes' source calls
 *      enforceAiQuota(res, "ai/...") textually BEFORE that same route's
 *      first OpenAI/provider-calling line — i.e. quota is checked before
 *      any cost can be incurred, not after. /ai/bank-import/revalidate's
 *      handler source contains no reference to enforceAiQuota at all.
 *
 *   2. Behavioral, against the REAL registered route handlers (extracted
 *      directly from the real aiUpload.ts Router's internal stack — see
 *      getRouteHandler below — bypassing the need for a live HTTP
 *      listener or multer's real multipart parsing): an authenticated,
 *      non-owner request naturally fails closed in THIS test environment,
 *      because no real Firebase Admin credentials are configured here —
 *      checkAndConsumeAiQuota's getDb() throws, enforceAiQuota resolves
 *      allowed:false, and the route responds 429 QUOTA_EXCEEDED WITHOUT
 *      ever reaching its extraction/OpenAI code. This is exercised
 *      against the real, unmodified handler functions — not a stand-in —
 *      and is exactly the "quota backend failure fails closed before any
 *      provider call" behavior for these three specific routes. (The
 *      exhaustion case itself — used >= limit — is already proven at the
 *      gate level in aiChatQuotaEnforcement.test.ts; since these routes
 *      call the identical shared function, the structural proof in (1)
 *      is what carries that guarantee over to these routes specifically.)
 *      A real multi-batch OpenAI call, real Firestore, or the owner-bypass
 *      path continuing into real extraction code is deliberately never
 *      exercised here — doing so would require either real credentials
 *      this sandbox does not have, or letting real extraction/network
 *      code run uncontrolled, neither of which is safe or necessary: the
 *      owner-bypass and under-limit-proceed behaviors are already proven
 *      at the gate level, and (1) proves these routes reach that gate
 *      before any cost-generating call.
 *
 *   3. Live boundary (same technique as index.contactAuthBoundary.test.ts):
 *      an unauthenticated direct HTTP request to each of the three gated
 *      routes still gets 401 before the quota gate or any provider call
 *      ever runs — proving a direct API call has no path around either
 *      auth or quota.
 *
 * No real Firebase/Firestore/OpenAI credentials or network access are
 * used anywhere in this file. Existing upload/bank-import extraction,
 * parsing, and reconciliation logic is not modified or exercised beyond
 * the quota gate's own short-circuit.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --external:express \
 *       --external:cors --external:pino-http --external:pino --external:pino-pretty \
 *       --external:firebase-admin --external:firebase-admin/* --external:openai \
 *       --external:web-push --external:multer --external:pdf-lib --external:pdf-parse \
 *       --external:pdfjs-dist --external:xlsx --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/aiUploadQuotaEnforcement.test.ts --outfile=.tmp-aiUploadQuotaEnforcement.mjs \
 *       && node .tmp-aiUploadQuotaEnforcement.mjs
 */

export {};

// Must be set before ai(Upload).js is ever imported/evaluated — its
// module scope constructs `new OpenAI({...})`, which throws immediately
// with no API key configured. See aiChatQuotaEnforcement.test.ts for the
// same technique.
process.env["OPENAI_API_KEY"] ??= "sk-test-placeholder-not-a-real-key";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response, IRouter } from "express";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

async function group(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

// ── 1. Structural: quota gate positioned before each route's cost call ─────

const SRC = readFileSync(resolve(process.cwd(), "src/routes/aiUpload.ts"), "utf8");

function extractRouteBlock(src: string, routeStart: RegExp): string {
  const startMatch = src.match(routeStart);
  if (!startMatch || startMatch.index === undefined) return "";
  const rest = src.slice(startMatch.index);
  // Bounded by the next top-level `router.post(`/`router.get(` after this one.
  const nextRouteMatch = rest.slice(1).match(/\nrouter\.(post|get)\(/);
  return nextRouteMatch && nextRouteMatch.index !== undefined
    ? rest.slice(0, nextRouteMatch.index + 1)
    : rest;
}

await group("1. structural: enforceAiQuota is called, and appears BEFORE the cost-generating call, in each gated route", () => {
  const uploadBlock = extractRouteBlock(SRC, /router\.post\("\/ai\/upload", upload\.single/);
  const quotaIdxUpload = uploadBlock.indexOf('enforceAiQuota(res, "ai/upload")');
  const costIdxUpload = uploadBlock.indexOf("processBankPdfBuffer(file.buffer");
  assert(quotaIdxUpload !== -1, '/ai/upload calls enforceAiQuota(res, "ai/upload")');
  assert(costIdxUpload !== -1, "/ai/upload calls processBankPdfBuffer (its cost-generating call)");
  assert(quotaIdxUpload < costIdxUpload, "/ai/upload: quota gate appears BEFORE the cost-generating call");

  const bankImportBlock = extractRouteBlock(SRC, /router\.post\("\/ai\/bank-import", upload\.single/);
  const quotaIdxBankImport = bankImportBlock.indexOf('enforceAiQuota(res, "ai/bank-import")');
  const costIdxBankImport = bankImportBlock.indexOf("processBankPdfBuffer(file.buffer");
  assert(quotaIdxBankImport !== -1, '/ai/bank-import calls enforceAiQuota(res, "ai/bank-import")');
  assert(costIdxBankImport !== -1, "/ai/bank-import calls processBankPdfBuffer (its cost-generating call)");
  assert(quotaIdxBankImport < costIdxBankImport, "/ai/bank-import: quota gate appears BEFORE the cost-generating call");

  const directTestBlock = extractRouteBlock(SRC, /router\.post\(\s*"\/ai\/upload-direct-test"/);
  const quotaIdxDirectTest = directTestBlock.indexOf('enforceAiQuota(res, "ai/upload-direct-test")');
  const costIdxDirectTest = directTestBlock.indexOf("openai.responses.create");
  assert(quotaIdxDirectTest !== -1, '/ai/upload-direct-test calls enforceAiQuota(res, "ai/upload-direct-test")');
  assert(costIdxDirectTest !== -1, "/ai/upload-direct-test calls openai.responses.create (its cost-generating call)");
  assert(quotaIdxDirectTest < costIdxDirectTest, "/ai/upload-direct-test: quota gate appears BEFORE the cost-generating call");
});

await group("2. structural: /ai/bank-import/revalidate stays completely unmetered", () => {
  const revalidateBlock = extractRouteBlock(SRC, /router\.post\("\/ai\/bank-import\/revalidate"/);
  assert(revalidateBlock.length > 0, "found the revalidate route block");
  assert(!revalidateBlock.includes("enforceAiQuota"), "revalidate's handler never references enforceAiQuota");
});

// ── 2. Behavioral: real route handlers fail closed with no real credentials ──

function fakeRes() {
  const res = {
    locals: { authUser: { uid: "u-real-handler-test", owner: false } } as Record<string, unknown>,
    statusCode: undefined as number | undefined,
    jsonBody: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.jsonBody = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; jsonBody?: unknown };
}

function fakeFileReq(originalname: string, mimetype: string): Request {
  return {
    file: {
      originalname,
      mimetype,
      buffer: Buffer.from("not a real file — the quota gate must short-circuit before this is ever read"),
    },
  } as unknown as Request;
}

function getRouteHandler(
  router: IRouter,
  path: string,
): (req: Request, res: Response) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (router as any).stack as Array<{
    route?: { path: string; stack: Array<{ handle: (...args: unknown[]) => unknown }> };
  }>;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route not found: ${path}`);
  // Last handler in the route's own stack is the real async route
  // handler (multer's upload.single("file") middleware, when present,
  // is registered before it).
  const lastHandler = layer.route.stack[layer.route.stack.length - 1]?.handle;
  if (!lastHandler) throw new Error(`no handler found for route: ${path}`);
  return lastHandler as (req: Request, res: Response) => Promise<void>;
}

await group("3. /ai/upload: authenticated non-owner request fails closed (no real Admin credentials here) — 429, never reaches extraction", async () => {
  const { default: aiUploadRouter } = await import("./aiUpload.js");
  const handler = getRouteHandler(aiUploadRouter, "/ai/upload");
  const req = fakeFileReq("statement.pdf", "application/pdf");
  const res = fakeRes();
  await handler(req, res);
  assert(res.statusCode === 429, `responded 429 (got ${res.statusCode})`);
  assert((res.jsonBody as { code?: string })?.code === "QUOTA_EXCEEDED", "code is QUOTA_EXCEEDED");
});

await group("4. /ai/bank-import: authenticated non-owner request fails closed — 429, never reaches extraction", async () => {
  const { default: aiUploadRouter } = await import("./aiUpload.js");
  const handler = getRouteHandler(aiUploadRouter, "/ai/bank-import");
  const req = fakeFileReq("statement.pdf", "application/pdf");
  const res = fakeRes();
  await handler(req, res);
  assert(res.statusCode === 429, `responded 429 (got ${res.statusCode})`);
  assert((res.jsonBody as { code?: string })?.code === "QUOTA_EXCEEDED", "code is QUOTA_EXCEEDED");
});

await group("5. /ai/upload-direct-test: authenticated non-owner request fails closed — 429, never reaches extraction", async () => {
  const { default: aiUploadRouter } = await import("./aiUpload.js");
  const handler = getRouteHandler(aiUploadRouter, "/ai/upload-direct-test");
  const req = fakeFileReq("statement.pdf", "application/pdf");
  const res = fakeRes();
  await handler(req, res);
  assert(res.statusCode === 429, `responded 429 (got ${res.statusCode})`);
  assert((res.jsonBody as { code?: string })?.code === "QUOTA_EXCEEDED", "code is QUOTA_EXCEEDED");
});

await group("6. /ai/bank-import/revalidate: unaffected — still runs its own real validation, not the quota gate", async () => {
  const { default: aiUploadRouter } = await import("./aiUpload.js");
  const handler = getRouteHandler(aiUploadRouter, "/ai/bank-import/revalidate");
  const res = fakeRes();
  // No transactions/bankMeta in the body — revalidate's OWN existing
  // validation should reject this with its own 400, proving the handler
  // ran its real logic rather than being intercepted by any quota gate
  // (which would have produced 429 QUOTA_EXCEEDED, not 400).
  const req = { body: {} } as unknown as Request;
  await handler(req, res);
  assert(res.statusCode === 400, `revalidate's own validation still runs (got ${res.statusCode}, expected 400)`);
  assert(res.statusCode !== 429, "revalidate is never quota-gated — no 429 is possible from it");
});

// ── 3. Live boundary: unauthenticated direct calls still 401 ───────────────

async function postMultipart(port: number, path: string): Promise<{ status: number; body: { error?: string; code?: string } }> {
  const boundary = "----kivoraTestBoundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n` +
    `Content-Type: application/pdf\r\n\r\n` +
    `%PDF-1.4 not a real pdf\r\n` +
    `--${boundary}--\r\n`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  return { status: res.status, body: json };
}

await group("7. live app.ts: unauthenticated direct calls to all three gated routes are still 401, before the quota gate or any provider call ever run", async () => {
  const { default: app } = await import("../app.js");
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    for (const path of ["/api/ai/upload", "/api/ai/bank-import", "/api/ai/upload-direct-test"]) {
      const { status, body } = await postMultipart(port, path);
      assert(status === 401, `direct unauthenticated POST ${path} -> 401 (got ${status})`);
      assert(body.code === "AUTH_REQUIRED", `${path}: code is AUTH_REQUIRED (got ${JSON.stringify(body)})`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  aiUploadQuotaEnforcement: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
