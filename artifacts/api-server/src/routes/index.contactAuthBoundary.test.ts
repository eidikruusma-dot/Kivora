/**
 * Live-request regression test for the /api/contact 401 production
 * incident: requireFirebaseAuth, mounted via `aiBoundary.use(requireFirebaseAuth)`
 * with no path argument, applied to every request reaching the router —
 * not just /api/ai/* — because aiBoundary itself was mounted ahead of
 * contactRouter/supportRouter/feedbackRouter/pushRouter with no path
 * restriction either. Every non-AI POST was rejected with 401 before its
 * handler ever ran.
 *
 * The fix scopes the mount to the "/ai" path only:
 *   aiBoundary.use("/ai", requireFirebaseAuth)
 *
 * This boots the REAL production Express app (app.ts, unmodified) and
 * issues real HTTP requests over a live loopback socket — a source-text
 * regex (see routes/index.test.ts) cannot observe Express's actual
 * per-request path matching, which is exactly what let this regression
 * ship. No Authorization header is ever sent, proving the boundary itself
 * (not any per-route check) is what gates /api/ai/*.
 *
 * No real Firebase/OpenAI credentials are used or required:
 *   - OPENAI_API_KEY is set to a syntactically-valid placeholder only so
 *     `new OpenAI(...)` doesn't throw at module import time in ai.ts/
 *     aiUpload.ts — no OpenAI call is ever reached in this test, because
 *     requireFirebaseAuth (correctly) rejects every AI request here before
 *     any handler runs.
 *   - FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY are deliberately left
 *     UNSET. Every AI request below omits the Authorization header, so
 *     requireFirebaseAuth's extractBearerToken() short-circuits with 401
 *     AUTH_REQUIRED before ever calling getFirebaseAdminAuth() — real
 *     Firebase credentials are never needed to prove the boundary works.
 *
 * Compile and run (also available as `pnpm run test:contactAuthBoundary`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm \
 *       --external:express --external:cors --external:pino-http --external:pino \
 *       --external:pino-pretty --external:firebase-admin --external:firebase-admin/* \
 *       --external:openai --external:web-push --external:multer \
 *       --external:pdf-lib --external:pdf-parse --external:pdfjs-dist --external:xlsx \
 *       --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/index.contactAuthBoundary.test.ts \
 *       --outfile=.tmp-contactAuthBoundary.mjs && node .tmp-contactAuthBoundary.mjs
 *
 * Unlike the other test:* scripts, this one cannot use --packages=external:
 * booting the real app.ts pulls in @workspace/api-zod (via routes/health.ts),
 * a workspace TypeScript source package with no compiled output on disk —
 * Node's ESM loader cannot execute it directly. Real npm dependencies are
 * listed explicitly as --external so they resolve normally from
 * node_modules; @workspace/api-zod and @workspace/db are deliberately left
 * out of that list so esbuild bundles and transpiles them inline instead.
 */

// Forces this file to be treated as an ES module rather than a global
// script — required for top-level await, and to keep its `passed`/`failed`
// counters from colliding with any other non-module test file's
// identically-named top-level `let`s under a whole-program `tsc --noEmit`.
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

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Expected server.address() to return an AddressInfo object");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

interface FetchResult {
  status: number;
  body: unknown;
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<FetchResult> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => undefined);
  return { status: res.status, body: json };
}

function isAuthRejection(result: FetchResult): boolean {
  if (result.status !== 401) return false;
  const code = (result.body as { code?: string } | undefined)?.code;
  return code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
}

try {
  await group("a) /api/contact is never intercepted by requireFirebaseAuth", async () => {
    // A body that fails contact.ts's own validation (missing message) still
    // must reach contact.ts's handler and get contact.ts's own 400 — not an
    // auth 401 — proving the request passed straight through the boundary.
    const missingFields = await call("POST", "/api/contact", { name: "A", email: "a@example.com" });
    assert(!isAuthRejection(missingFields), `/api/contact (invalid body) is not auth-rejected (got ${missingFields.status})`);
    assert(missingFields.status === 400, `/api/contact with a missing required field returns contact.ts's own 400 (got ${missingFields.status})`);

    // A fully valid body reaches the mail relay client's own config check
    // (500, since MAIL_RELAY_URL/MAIL_RELAY_SECRET are unset in this test
    // env) — either way, never a 401 from requireFirebaseAuth.
    const validBody = await call("POST", "/api/contact", {
      name: "Test User",
      email: "test@example.com",
      subject: "Hello",
      message: "This is a regression test message.",
    });
    assert(!isAuthRejection(validBody), `/api/contact (valid body) is not auth-rejected (got ${validBody.status})`);
  });

  await group("b) /api/support, /api/feedback, /api/healthz, and /api/push remain public", async () => {
    const support = await call("POST", "/api/support", { message: "test support message" });
    assert(!isAuthRejection(support), `/api/support is not auth-rejected (got ${support.status})`);

    const feedback = await call("POST", "/api/feedback", { message: "test feedback message" });
    assert(!isAuthRejection(feedback), `/api/feedback is not auth-rejected (got ${feedback.status})`);

    const health = await call("GET", "/api/healthz");
    assert(!isAuthRejection(health), `/api/healthz is not auth-rejected (got ${health.status})`);
    assert(health.status === 200, `/api/healthz returns 200 (got ${health.status})`);

    const vapid = await call("GET", "/api/push/vapid-key");
    assert(!isAuthRejection(vapid), `/api/push/vapid-key is not auth-rejected (got ${vapid.status})`);
    assert(vapid.status === 200, `/api/push/vapid-key returns 200 (got ${vapid.status})`);

    const notify = await call("POST", "/api/push/notify", { subscriptions: [], notification: { title: "t", body: "b" } });
    assert(!isAuthRejection(notify), `/api/push/notify is not auth-rejected (got ${notify.status})`);
  });

  await group(
    "c) + d) every /api/ai/* route still requires Firebase auth — unauthenticated requests get 401 before their handlers run",
    async () => {
      const aiRoutes: { method: "GET" | "POST"; path: string }[] = [
        { method: "POST", path: "/api/ai/chat" },
        { method: "POST", path: "/api/ai/upload" },
        { method: "POST", path: "/api/ai/bank-import" },
        { method: "POST", path: "/api/ai/bank-import/revalidate" },
        { method: "POST", path: "/api/ai/upload-direct-test" },
      ];

      for (const { method, path } of aiRoutes) {
        // No Authorization header at all — deliberately no body/file either,
        // so if the route handler (or multer) ran instead of being blocked,
        // it would fail differently (400 "no file", 400 bad JSON, etc.),
        // not 401 AUTH_REQUIRED. Getting exactly 401 AUTH_REQUIRED here is
        // proof the handler never ran.
        const result = await call(method, path);
        assert(result.status === 401, `${method} ${path} (no auth header) → 401 (got ${result.status})`);
        assert(
          (result.body as { code?: string } | undefined)?.code === "AUTH_REQUIRED",
          `${method} ${path} (no auth header) → code AUTH_REQUIRED (got ${JSON.stringify(result.body)})`,
        );
      }

      // A malformed bearer token also never reaches a handler — proves the
      // boundary, not just "no header", still gates real-looking requests.
      const badToken = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ message: "hi" }),
      });
      const badTokenBody = await badToken.json().catch(() => undefined);
      assert(badToken.status === 401, `POST /api/ai/chat with an invalid bearer token → 401 (got ${badToken.status})`);
      assert(
        (badTokenBody as { code?: string } | undefined)?.code === "AUTH_INVALID",
        `POST /api/ai/chat with an invalid bearer token → code AUTH_INVALID (got ${JSON.stringify(badTokenBody)})`,
      );
    },
  );

  await group("AI route URLs are unchanged by the fix (still exactly /api/ai/...)", async () => {
    // A request to what the URL would be WITHOUT the "/ai" segment (i.e. if
    // the fix had accidentally re-mounted the routers instead of just
    // scoping the middleware) must 404, not succeed and not 401 — proving
    // the real route path is still the full "/api/ai/chat", unchanged.
    const wrongPath = await call("POST", "/api/chat");
    assert(wrongPath.status === 404, `POST /api/chat (the URL without "/ai") is 404, not a valid route (got ${wrongPath.status})`);
  });
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log(`\n${"═".repeat(48)}`);
console.log(`  contact auth boundary (live): ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
