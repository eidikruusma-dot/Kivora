/**
 * Live-request regression coverage proving POST /api/ai/onboarding/chat and
 * POST /api/ai/onboarding/summary sit behind the exact same
 * requireFirebaseAuth boundary as the existing /api/ai/chat and
 * /api/ai/upload* routes — same technique as
 * routes/index.contactAuthBoundary.test.ts and
 * routes/aiChatQuotaEnforcement.test.ts's live-boundary group.
 *
 * This boots the REAL production Express app (app.ts, unmodified) and
 * issues real HTTP requests over a live loopback socket. Every request
 * below omits the Authorization header, so requireFirebaseAuth rejects
 * with 401 before the route handler — including validateOnboardingRequest,
 * enforceAiQuota, or any OpenAI call — ever runs. No real Firebase/OpenAI
 * credentials or network access are used anywhere in this file.
 *
 * enforceAiQuota's own decision logic (allowed/denied/owner-bypass/
 * backend-failure) is already exhaustively covered, generically, by
 * aiQuotaGate.ts's own tests (see aiChatQuotaEnforcement.test.ts) — both
 * new routes below call that exact same shared function with no
 * modification, so that coverage already applies here; this file's job is
 * only to prove the new routes are correctly wired into the auth boundary,
 * not to re-prove the gate's logic a third time.
 *
 * Compile and run (also available as `pnpm run test:aiOnboardingAuthBoundary`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm \
 *       --external:express --external:cors --external:pino-http --external:pino \
 *       --external:pino-pretty --external:firebase-admin --external:firebase-admin/* \
 *       --external:openai --external:web-push --external:multer \
 *       --external:pdf-lib --external:pdf-parse --external:pdfjs-dist --external:xlsx \
 *       --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/aiOnboardingAuthBoundary.test.ts \
 *       --outfile=.tmp-aiOnboardingAuthBoundary.mjs && node .tmp-aiOnboardingAuthBoundary.mjs
 */

export {};

process.env["OPENAI_API_KEY"] ??= "sk-test-placeholder-not-a-real-key";

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

const { default: app } = await import("../app.js");
const { createServer } = await import("node:http");
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  await group("1. unauthenticated POST /api/ai/onboarding/chat -> 401, before validation/quota/OpenAI ever run", async () => {
    const res = await fetch(`${baseUrl}/api/ai/onboarding/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A payload that would otherwise fail onboarding validation too
      // (missing startedAt) — proves auth is checked first, independent of
      // body shape, exactly like the general /api/ai/chat boundary.
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const body = (await res.json()) as { error?: string; code?: string };
    assert(res.status === 401, `-> 401 (got ${res.status})`);
    assert(body.code === "AUTH_REQUIRED", `code is AUTH_REQUIRED (got ${JSON.stringify(body)})`);
    assert(
      res.headers.get("content-type")?.includes("application/json") ?? false,
      "response is JSON, not an SSE stream — the 401 is written before Content-Type ever switches to text/event-stream",
    );
  });

  await group("2. unauthenticated POST /api/ai/onboarding/summary -> 401, before validation/quota/OpenAI ever run", async () => {
    const res = await fetch(`${baseUrl}/api/ai/onboarding/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const body = (await res.json()) as { error?: string; code?: string };
    assert(res.status === 401, `-> 401 (got ${res.status})`);
    assert(body.code === "AUTH_REQUIRED", `code is AUTH_REQUIRED (got ${JSON.stringify(body)})`);
  });

  await group("3. an invalid (malformed) Authorization header is also rejected with 401, not a 500 from somewhere downstream", async () => {
    const res = await fetch(`${baseUrl}/api/ai/onboarding/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], startedAt: new Date().toISOString() }),
    });
    assert(res.status === 401, `-> 401 for a malformed token (got ${res.status})`);
  });
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log(`\n${"═".repeat(48)}`);
console.log(`  aiOnboardingAuthBoundary: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
