/**
 * Live-request regression test for a production incident: POST
 * /api/ai/chat returned a bare HTTP 400 with no assistant response and no
 * task created, for a perfectly valid, authenticated create-task request.
 *
 * Root cause: express.json() in app.ts had no `limit` configured, so it
 * defaulted to the body-parser/raw-body default of 100kb. POST /api/ai/chat
 * sends `context` (aiContextBuilder.ts's CURRENT_KIVORA_STATE — Tasks +
 * Plans + Goals + Notes + Habits + Calendar + School + Finance +
 * Notifications, none of which cap their own size) as a plain top-level
 * JSON field, entirely separate from and unbounded by
 * validateChatRequest.ts's `messages`-only limits. An active account with
 * real data (the incident report specifically named "substantially more
 * real School/Task data") trivially exceeds 100kb, so the request body was
 * rejected by body-parser itself — BEFORE validateChatRequest, BEFORE
 * requireFirebaseAuth, before the route handler ever ran. With no
 * app-level error-handling middleware registered, that rejection fell
 * through to Express's built-in handler, which returns an HTML page, not
 * JSON — so the client's `body.error` extraction (fetchAIReply) got
 * nothing usable.
 *
 * Fix: app.ts raises express.json()'s limit to 2mb (comfortably covering
 * every module's realistic maximum size) and registers a final JSON
 * error-handling middleware so ANY error Express itself throws before a
 * route runs — oversized body, malformed body, or anything else — always
 * comes back as `{ error: string }` JSON. validateChatRequest.ts
 * additionally validates `context`'s own size/type explicitly, so a
 * still-oversized context (larger than any real account should ever
 * produce, but smaller than the raw 2mb ceiling) fails with a specific,
 * own error code instead of silently relying on the raw body limit.
 *
 * This boots the REAL production Express app (app.ts, unmodified) and
 * issues real HTTP requests over a live loopback socket, following the
 * same pattern as index.contactAuthBoundary.test.ts — no real Firebase/
 * OpenAI credentials are used or required. Every AI request below either
 * omits the Authorization header or sends an invalid one, so
 * requireFirebaseAuth correctly rejects with 401 AFTER body-parsing
 * succeeds — proving body size, not auth, is what's under test: a request
 * that fails at the body-parser stage never reaches auth at all (a
 * different status/shape), while one that successfully parses always
 * reaches the 401 check.
 *
 * Compile and run (also available as `pnpm run test:aiChatRequestSizeLimit`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm \
 *       --external:express --external:cors --external:pino-http --external:pino \
 *       --external:pino-pretty --external:firebase-admin --external:firebase-admin/* \
 *       --external:openai --external:web-push --external:multer \
 *       --external:pdf-lib --external:pdf-parse --external:pdfjs-dist --external:xlsx \
 *       --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/aiChatRequestSizeLimit.test.ts \
 *       --outfile=.tmp-aiChatRequestSizeLimit.mjs && node .tmp-aiChatRequestSizeLimit.mjs
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

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Expected server.address() to return an AddressInfo object");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

interface FetchResult {
  status: number;
  contentType: string | null;
  body: unknown;
}

async function postRaw(path: string, bodyString: string): Promise<FetchResult> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyString,
  });
  const contentType = res.headers.get("content-type");
  const body = await res.json().catch(async () => ({ RAW_TEXT: (await res.text()).slice(0, 200) }));
  return { status: res.status, contentType, body };
}

/**
 * A realistic reconstruction of what aiContextBuilder.ts's buildAIContext()
 * produces for an active account with real School/Task/Plan data — many
 * subjects with homework and exam entries (School routinely being the
 * heaviest section), plus a meaningful number of tasks, plans, and notes.
 * Not a tiny fixture: sized to comfortably exceed the OLD 100kb default
 * while staying well under the new limits, exactly like a real account.
 */
function buildRealisticContext(): string {
  const sections: string[] = [];

  const taskLines = Array.from({ length: 400 }, (_, i) =>
    `  - Ülesanne number ${i} — kirjeldus ja lisainfo selle ülesande kohta, tähtaeg ja kategooria (prioriteet: keskmine) (kategooria: Kodu)`,
  );
  sections.push(`### Ülesanded (tegemata 400/400)\n${taskLines.join("\n")}`);

  const subjectCount = 12;
  const schoolLines: string[] = [];
  for (let s = 0; s < subjectCount; s++) {
    schoolLines.push(`  - Õppeaine ${s} — õpetaja Õpetaja Nimi ${s}, ruum ${100 + s}`);
  }
  for (let s = 0; s < subjectCount; s++) {
    for (let h = 0; h < 40; h++) {
      schoolLines.push(
        `  - Õppeaine ${s}: Kodutöö ${h} (kodutöö) — tähtaeg: 2026-0${(h % 9) + 1}-15, edenemine: ${h * 5}%, staatus: tegemata`,
      );
    }
    for (let e = 0; e < 15; e++) {
      schoolLines.push(`  - Õppeaine ${s}: Kontrolltöö ${e} — 2026-09-0${e + 1}, tüüp: kontrolltöö, staatus: ootel, ${e} päeva pärast`);
    }
  }
  sections.push(`### Kool\n${schoolLines.join("\n")}`);

  const planLines = Array.from({ length: 60 }, (_, i) =>
    `- Plaan ${i} (workout) — edenemine: ${i}/10 (${i * 4}%)`,
  );
  sections.push(`### Plaanid (60)\n${planLines.join("\n")}`);

  const noteLines = Array.from({ length: 200 }, (_, i) =>
    `- Märge ${i} (kaust: Isiklik) — "Selle märkme sisu eelvaade, mis annab aimu, mida märge sisaldab."`,
  );
  sections.push(`### Märkmed (200)\n${noteLines.join("\n")}`);

  return sections.join("\n\n");
}

try {
  await group("1. a realistic large CURRENT_KIVORA_STATE context (well over the old 100kb default) is no longer rejected by the raw body parser", async () => {
    const context = buildRealisticContext();
    const bodyString = JSON.stringify({
      messages: [{ role: "user", content: "Millised ülesanded mul on?" }],
      context,
      lang: "et",
    });
    const sizeBytes = Buffer.byteLength(bodyString, "utf8");
    assert(sizeBytes > 100_000, `test context is realistically large (${sizeBytes} bytes > 100,000)`);

    const result = await postRaw("/api/ai/chat", bodyString);
    // No Authorization header was sent — a request that successfully
    // cleared body-parsing reaches requireFirebaseAuth and gets 401
    // AUTH_REQUIRED. A request rejected at the body-parser stage would
    // instead get 413 (too large) or 400 (malformed) and never reach auth.
    assert(result.status === 401, `reaches auth (401), not rejected by body-parser (got ${result.status}, body=${JSON.stringify(result.body).slice(0, 200)})`);
    assert(
      (result.body as { code?: string } | undefined)?.code === "AUTH_REQUIRED",
      `the 401 is specifically AUTH_REQUIRED — proving the body parsed successfully and reached the auth boundary (got ${JSON.stringify(result.body)})`,
    );
  });

  await group("2. a genuinely oversized body (over the new 2mb raw limit) is rejected with clean JSON, never an HTML error page", async () => {
    const massiveContext = "x".repeat(3_000_000);
    const bodyString = JSON.stringify({
      messages: [{ role: "user", content: "hi" }],
      context: massiveContext,
      lang: "et",
    });
    const result = await postRaw("/api/ai/chat", bodyString);
    assert(result.status === 413, `oversized body → 413 (got ${result.status})`);
    assert(
      result.contentType?.includes("application/json") ?? false,
      `error response Content-Type is application/json, not text/html (got ${result.contentType})`,
    );
    assert(
      typeof (result.body as { error?: unknown } | undefined)?.error === "string",
      `error response body has a usable string \`error\` field (got ${JSON.stringify(result.body)})`,
    );
  });

  await group("3. a malformed/truncated JSON body is also rejected with clean JSON, never an HTML error page", async () => {
    const result = await postRaw("/api/ai/chat", '{"messages": [ this is not valid JSON');
    assert(result.status === 400, `malformed JSON body → 400 (got ${result.status})`);
    assert(
      result.contentType?.includes("application/json") ?? false,
      `error response Content-Type is application/json, not text/html (got ${result.contentType})`,
    );
    assert(
      typeof (result.body as { error?: unknown } | undefined)?.error === "string",
      `error response body has a usable string \`error\` field (got ${JSON.stringify(result.body)})`,
    );
  });
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log(`\n${"═".repeat(48)}`);
console.log(`  ai/chat request size limit (live): ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
