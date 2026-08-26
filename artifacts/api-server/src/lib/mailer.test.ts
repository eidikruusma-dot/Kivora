/**
 * Unit tests for the Resend HTTPS API mailer (replaces the previous
 * nodemailer/SMTP transporter — see mailer.ts for why: Render Free blocks
 * outbound SMTP ports 25/465/587, so every send hung for minutes until
 * nodemailer's own connection-timeout before failing ETIMEDOUT/CONN).
 *
 * No real network calls or credentials are used — fetch is always a
 * hand-written fake, injected via sendMail's optional 2nd parameter
 * (production call sites always call sendMail(message) with just one
 * argument, so real code always uses the real global fetch).
 *
 * Compile and run (also available as `pnpm run test:mailer`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/lib/mailer.test.ts --outfile=.tmp-mailer.mjs && node .tmp-mailer.mjs
 */

import { sendMail, buildResendBody, RESEND_API_URL, REQUEST_TIMEOUT_MS, type MailMessage } from "./mailer.js";

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

const SAMPLE_MESSAGE: MailMessage = {
  to: "recipient@example.com",
  replyTo: "sender@example.com",
  subject: "Test subject",
  text: "Plain text body",
  html: "<p>HTML body</p>",
};

function fakeFetchResolving(status: number, body = ""): { fetchImpl: typeof fetch; calls: RequestInit[]; urls: string[] } {
  const calls: RequestInit[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    calls.push(init ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, urls };
}

function fakeFetchAborting(): typeof fetch {
  return (async (_url: string | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  }) as unknown as typeof fetch;
}

// ── buildResendBody: exact from/to/reply_to shape ───────────────────────────

await group("buildResendBody: exact request body shape sent to Resend", () => {
  const body = buildResendBody(SAMPLE_MESSAGE, "Kivora <noreply@kivora.ee>");
  assert(body.from === "Kivora <noreply@kivora.ee>", "from is the exact configured EMAIL_FROM value");
  assert(Array.isArray(body.to) && body.to.length === 1 && body.to[0] === "recipient@example.com", "to is [recipient] (Resend's array form)");
  assert(body.reply_to === "sender@example.com", "reply_to carries the submitter's address (snake_case, Resend's field name)");
  assert(body.subject === "Test subject", "subject carried through unchanged");
  assert(body.text === "Plain text body", "text carried through unchanged");
  assert(body.html === "<p>HTML body</p>", "html carried through unchanged");
});

await group("buildResendBody: reply_to is omitted entirely (not sent as undefined/empty) when the message has none", () => {
  const { replyTo: _replyTo, ...withoutReplyTo } = SAMPLE_MESSAGE;
  const body = buildResendBody(withoutReplyTo as MailMessage, "Kivora <noreply@kivora.ee>");
  assert(!("reply_to" in body), "reply_to key is absent, not set to undefined");
});

// ── sendMail: successful Resend response ────────────────────────────────────

await group("sendMail: a 200 response from Resend resolves without throwing", async () => {
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  process.env["EMAIL_FROM"] = "Kivora <noreply@kivora.ee>";
  const { fetchImpl, calls, urls } = fakeFetchResolving(200, JSON.stringify({ id: "resend-msg-1" }));
  let threw = false;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl);
  } catch {
    threw = true;
  }
  assert(!threw, "sendMail resolves (does not throw) on a 200 response");
  assert(urls[0] === RESEND_API_URL, "posts to https://api.resend.com/emails");
  assert(calls[0]?.method === "POST", "uses POST");
  const headers = calls[0]?.headers as Record<string, string>;
  assert(headers?.Authorization === "Bearer re_test_key_123", "sends the configured RESEND_API_KEY as a Bearer token");
  assert(headers?.["Content-Type"] === "application/json", "sends Content-Type: application/json");
  const sentBody = JSON.parse(String(calls[0]?.body));
  assert(sentBody.from === "Kivora <noreply@kivora.ee>", "the actual HTTP request body's from matches EMAIL_FROM");
  assert(JSON.stringify(sentBody.to) === JSON.stringify(["recipient@example.com"]), "the actual HTTP request body's to matches the message recipient");
  assert(sentBody.reply_to === "sender@example.com", "the actual HTTP request body's reply_to matches the message's replyTo");
});

// ── sendMail: Resend API 4xx/5xx ────────────────────────────────────────────

await group("sendMail: a 4xx response from Resend rejects with the status and body in the error", async () => {
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  process.env["EMAIL_FROM"] = "Kivora <noreply@kivora.ee>";
  const { fetchImpl } = fakeFetchResolving(422, JSON.stringify({ message: "Invalid `to` field" }));
  let error: Error | null = null;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl);
  } catch (err) {
    error = err as Error;
  }
  assert(error !== null, "sendMail rejects on a 422 response");
  assert(error?.message.includes("422") === true, "error message includes the HTTP status code");
  assert(error?.message.includes("Invalid `to` field") === true, "error message includes the response body for diagnosis");
});

await group("sendMail: a 5xx response from Resend also rejects (server-side failure, not just client error)", async () => {
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  process.env["EMAIL_FROM"] = "Kivora <noreply@kivora.ee>";
  const { fetchImpl } = fakeFetchResolving(500, "Internal Server Error");
  let error: Error | null = null;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl);
  } catch (err) {
    error = err as Error;
  }
  assert(error !== null, "sendMail rejects on a 500 response");
  assert(error?.message.includes("500") === true, "error message includes the HTTP status code");
});

// ── sendMail: timeout ────────────────────────────────────────────────────────

await group("sendMail: production default timeout is exactly 10 seconds (matches the ETIMEDOUT/CONN incident's requirement)", () => {
  assert(REQUEST_TIMEOUT_MS === 10_000, "REQUEST_TIMEOUT_MS === 10_000");
});

await group("sendMail: an unresponsive Resend request is aborted at the timeout, not left hanging", async () => {
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  process.env["EMAIL_FROM"] = "Kivora <noreply@kivora.ee>";

  // Injects a tiny timeoutMs (production always uses the real 10s default —
  // see sendMail's signature) so this test proves the abort-on-timeout
  // behavior deterministically, in milliseconds, without waiting out 10
  // real seconds.
  const TEST_TIMEOUT_MS = 20;
  const fetchImpl = fakeFetchAborting();
  const start = Date.now();
  let error: Error | null = null;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl, TEST_TIMEOUT_MS);
  } catch (err) {
    error = err as Error;
  }
  const elapsedMs = Date.now() - start;
  assert(error !== null, "sendMail rejects instead of hanging forever");
  assert(error?.message.toLowerCase().includes("timed out") === true, "the rejection clearly identifies itself as a timeout");
  assert(error?.message.includes(String(TEST_TIMEOUT_MS)) === true, "the error message names the actual timeout that fired");
  assert(elapsedMs < 5_000, `resolves promptly after the injected ${TEST_TIMEOUT_MS}ms timeout, not after the full 10s default (took ${elapsedMs}ms)`);
});

// ── sendMail: missing RESEND_API_KEY ────────────────────────────────────────

await group("sendMail: missing RESEND_API_KEY rejects immediately, before any network call", async () => {
  const originalKey = process.env["RESEND_API_KEY"];
  const originalFrom = process.env["EMAIL_FROM"];
  delete process.env["RESEND_API_KEY"];
  process.env["EMAIL_FROM"] = "Kivora <noreply@kivora.ee>";

  const { fetchImpl, calls } = fakeFetchResolving(200);
  let error: Error | null = null;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl);
  } catch (err) {
    error = err as Error;
  }
  assert(error !== null, "sendMail rejects when RESEND_API_KEY is unset");
  assert(error?.message.includes("RESEND_API_KEY") === true, "the error names the missing variable");
  assert(calls.length === 0, "fetch is never called — no request is sent with a missing/undefined API key");

  if (originalKey !== undefined) process.env["RESEND_API_KEY"] = originalKey;
  if (originalFrom !== undefined) process.env["EMAIL_FROM"] = originalFrom; else delete process.env["EMAIL_FROM"];
});

await group("sendMail: missing EMAIL_FROM also rejects immediately, before any network call", async () => {
  const originalKey = process.env["RESEND_API_KEY"];
  const originalFrom = process.env["EMAIL_FROM"];
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  delete process.env["EMAIL_FROM"];

  const { fetchImpl, calls } = fakeFetchResolving(200);
  let error: Error | null = null;
  try {
    await sendMail(SAMPLE_MESSAGE, fetchImpl);
  } catch (err) {
    error = err as Error;
  }
  assert(error !== null, "sendMail rejects when EMAIL_FROM is unset");
  assert(error?.message.includes("EMAIL_FROM") === true, "the error names the missing variable");
  assert(calls.length === 0, "fetch is never called");

  if (originalKey !== undefined) process.env["RESEND_API_KEY"] = originalKey;
  if (originalFrom !== undefined) process.env["EMAIL_FROM"] = originalFrom;
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  mailer (Resend): ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
