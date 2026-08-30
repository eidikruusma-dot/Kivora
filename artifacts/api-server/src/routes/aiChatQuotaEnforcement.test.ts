/**
 * Regression coverage for checkAndConsumeAiQuota()'s shared
 * enforceAiQuota() gate (lib/aiQuotaGate.ts) as wired into
 * POST /api/ai/chat — the first route it shipped on. The same gate is
 * also wired into aiUpload.ts's /ai/upload, /ai/bank-import, and
 * /ai/upload-direct-test — see aiUploadQuotaEnforcement.test.ts for that
 * route-specific wiring proof; this file focuses on the gate's own
 * decision logic and doesn't duplicate it there.
 *
 * Two layers, matching this codebase's existing split (see
 * requireFirebaseAuth.ts/.test.ts for the same pattern):
 *
 *   1. enforceAiQuota() itself — a pure-enough function taking a fake
 *      res and an injected checkQuota — proves the gate's decision logic
 *      exactly, including that it never even reads req (so it cannot
 *      consult a client-supplied owner/quota value even by accident), and
 *      that a denied/absent-auth outcome writes the correct response and
 *      signals `proceed: false` so the caller can never reach the OpenAI
 *      call. The owner-bypass and quota-failure cases use the REAL
 *      checkAndConsumeAiQuota (not a fake) — the owner path never touches
 *      Firestore at all (see aiQuota.test.ts group 5), and the failure
 *      path is exercised by giving it a getDb that throws, exactly as
 *      aiQuota.test.ts already does — so this also proves the real
 *      production function, not just a stand-in.
 *
 *   2. A live boot of the real app.ts (same technique as
 *      routes/index.contactAuthBoundary.test.ts) proving the boundary
 *      itself is unaffected by this change: an unauthenticated direct
 *      HTTP request to /api/ai/chat still gets 401 before anything in
 *      ai.ts — including the new quota gate — ever runs. This is also
 *      the proof that "a direct API call cannot bypass quota": the quota
 *      gate lives entirely server-side, inside the handler, behind an
 *      auth boundary a caller cannot get past without a real Firebase ID
 *      token — there is no alternate path to the OpenAI call.
 *
 * No real Firebase/Firestore/OpenAI credentials or network access are
 * used anywhere in this file.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --external:express \
 *       --external:cors --external:pino-http --external:pino --external:pino-pretty \
 *       --external:firebase-admin --external:firebase-admin/* --external:openai \
 *       --external:web-push --external:multer --external:pdf-lib --external:pdf-parse \
 *       --external:pdfjs-dist --external:xlsx --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/aiChatQuotaEnforcement.test.ts --outfile=.tmp-aiChatQuotaEnforcement.mjs \
 *       && node .tmp-aiChatQuotaEnforcement.mjs
 */

// Forces this file to be treated as an ES module rather than a global
// script, and keeps this file's top-level `let`s from colliding with any
// other non-module test file's identically-named ones under a
// whole-program `tsc --noEmit` — same convention as
// index.contactAuthBoundary.test.ts.
export {};

// Must be set BEFORE ai.js is ever imported/evaluated — its module scope
// constructs `new OpenAI({...})`, which throws immediately if no API key
// is configured. Static imports are hoisted and evaluate before any
// top-level statement in this file, so ai.js is imported dynamically,
// below, only after this line has run — same technique
// index.contactAuthBoundary.test.ts already uses for app.js.
process.env["OPENAI_API_KEY"] ??= "sk-test-placeholder-not-a-real-key";

import type { Response } from "express";
import { checkAndConsumeAiQuota, type AiQuotaResult } from "../lib/aiQuota.js";
import { enforceAiQuota } from "../lib/aiQuotaGate.js";

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

// ── Fake res ─────────────────────────────────────────────────────────────

function fakeRes(authUser?: { uid: string; email?: string; owner: boolean }) {
  const res = {
    locals: (authUser ? { authUser } : {}) as Record<string, unknown>,
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

function fixedResult(overrides: Partial<AiQuotaResult>): AiQuotaResult {
  return {
    allowed: true,
    reason: "under_limit",
    limit: 20,
    used: 1,
    remaining: 19,
    bucket: "2026-08-30",
    resetAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

// ── 1. enforceAiQuota — pure gate logic ─────────────────────────────

await group("1. no authUser on res.locals -> 401, proceed: false, checkQuota never called", async () => {
  const res = fakeRes(undefined);
  let checkQuotaCalled = false;
  const result = await enforceAiQuota(res, "chat", async () => {
    checkQuotaCalled = true;
    return fixedResult({});
  });
  assert(result.proceed === false, "proceed is false");
  assert(res.statusCode === 401, "responded 401");
  assert(
    JSON.stringify(res.jsonBody) === JSON.stringify({ error: "Authentication required", code: "AUTH_REQUIRED" }),
    "exact AUTH_REQUIRED body",
  );
  assert(!checkQuotaCalled, "checkQuota was never called — no Firestore access for an unauthenticated request");
});

await group("2. authenticated user under quota -> proceed: true, no response written (caller continues to OpenAI)", async () => {
  const res = fakeRes({ uid: "u-under-limit", owner: false });
  const result = await enforceAiQuota(res, "chat", async (params) => {
    assert(params.uid === "u-under-limit" && params.owner === false, "checkQuota called with the exact authUser uid/owner");
    return fixedResult({ allowed: true, reason: "under_limit", used: 5, remaining: 15 });
  });
  assert(result.proceed === true, "proceed is true");
  assert(res.statusCode === undefined, "no error status was ever set");
  assert(res.jsonBody === undefined, "no response body was ever written — the route continues on to call OpenAI");
});

await group("3. exhausted user -> 429 QUOTA_EXCEEDED, proceed: false, before any OpenAI call", async () => {
  const res = fakeRes({ uid: "u-exhausted", owner: false });
  const result = await enforceAiQuota(res, "chat", async () =>
    fixedResult({ allowed: false, reason: "limit_reached", used: 20, remaining: 0 }),
  );
  assert(result.proceed === false, "proceed is false — the route must return immediately, never calling OpenAI");
  assert(res.statusCode === 429, "responded 429");
  const body = res.jsonBody as { error?: string; code?: string; limit?: number; remaining?: number };
  assert(body.code === "QUOTA_EXCEEDED", "code is QUOTA_EXCEEDED");
  assert(typeof body.error === "string" && body.error.length > 0, "has a human-readable error message");
  assert(body.limit === 20 && body.remaining === 0, "limit/remaining are passed through from the quota result");
});

await group("4. owner bypasses quota — using the REAL checkAndConsumeAiQuota, not a fake", async () => {
  const res = fakeRes({ uid: "u-owner", owner: true });
  // No fake checkQuota here: the real function's owner branch never
  // touches Firestore, so this exercises production code end to end.
  const result = await enforceAiQuota(res, "chat", checkAndConsumeAiQuota);
  assert(result.proceed === true, "proceed is true for an owner, via the real quota function");
  assert(res.statusCode === undefined, "no error response for an owner");
});

await group("5. quota backend failure fails closed — using the REAL checkAndConsumeAiQuota with a broken getDb", async () => {
  const res = fakeRes({ uid: "u-backend-down", owner: false });
  const result = await enforceAiQuota(res, "chat", (params) =>
    checkAndConsumeAiQuota({
      ...params,
      getDb: () => {
        throw new Error("simulated Firestore/Admin credential failure");
      },
    }),
  );
  assert(result.proceed === false, "proceed is false — a backend failure never falls back to allowing the request");
  assert(res.statusCode === 429, "responded 429 (fail closed, same response shape as a real limit hit)");
  assert((res.jsonBody as { code?: string })?.code === "QUOTA_EXCEEDED", "code is QUOTA_EXCEEDED even for a backend failure");
});

await group("6. no client-supplied field can influence the outcome — enforceAiQuota never reads req at all", async () => {
  // Structural guarantee, not just behavioral: the function's own
  // signature (res, mode, checkQuota) has no req parameter, so there is
  // no request body/query/header this function could consult even if it
  // wanted to — verified here by confirming its declared arity.
  assert(enforceAiQuota.length <= 3, "enforceAiQuota takes no req parameter");
});

// ── 2. Live boundary: unauthenticated direct calls still 401, before quota ──

await group("7. live app.ts: unauthenticated direct call to /api/ai/chat is still 401, before the quota gate or OpenAI ever run", async () => {
  const { default: app } = await import("../app.js");
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const body = (await res.json()) as { error?: string; code?: string };
    assert(res.status === 401, `direct unauthenticated POST /api/ai/chat -> 401 (got ${res.status})`);
    assert(body.code === "AUTH_REQUIRED", `code is AUTH_REQUIRED (got ${JSON.stringify(body)})`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  aiChatQuotaEnforcement: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
