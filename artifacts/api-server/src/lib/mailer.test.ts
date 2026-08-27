/**
 * Unit tests for the Zone mail-relay HTTPS client (replaces the previous
 * nodemailer/SMTP transporter — see mailer.ts for why: Render Free blocks
 * outbound SMTP ports 25/465/587, so direct SMTP can never work there).
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

import { sendMail, REQUEST_TIMEOUT_MS, type MailMessage } from "./mailer.js";

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
  type: "contact",
  name: "Test User",
  email: "sender@example.com",
  subject: "Test subject",
  message: "Plain text body",
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

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

// A deliberately obvious, fixed test pattern — NOT generated with
// `openssl rand -hex 32`, and never used anywhere outside this test file.
// It only needs to satisfy the required format (64 lowercase hex
// characters) so the rest of the suite can exercise real request
// behavior; it must never be mistaken for, or reused as, a real
// production secret. Matches zone-mail-relay/tests/relay.test.php's
// $VALID_TEST_SECRET exactly, for consistency across both test suites.
const VALID_TEST_SECRET = "a1".repeat(32);

const VALID_ENV = {
  MAIL_RELAY_URL: "https://relay.kivora.ee/relay.php",
  MAIL_RELAY_SECRET: VALID_TEST_SECRET,
};

// ── sendMail: request shape (no to/from/replyTo; structured form data only) ──

await group("sendMail: posts structured form data to MAIL_RELAY_URL with no to/from/replyTo", async () => {
  await withEnv(VALID_ENV, async () => {
    const { fetchImpl, calls, urls } = fakeFetchResolving(200, JSON.stringify({ ok: true }));
    await sendMail(SAMPLE_MESSAGE, fetchImpl);

    assert(urls[0] === "https://relay.kivora.ee/relay.php", "posts to the exact configured MAIL_RELAY_URL");
    assert(calls[0]?.method === "POST", "uses POST");
    assert(calls[0]?.redirect === "error", 'redirect: "error" — the Authorization header must never follow a redirect');

    const headers = calls[0]?.headers as Record<string, string>;
    assert(headers?.Authorization === `Bearer ${VALID_TEST_SECRET}`, "sends the configured MAIL_RELAY_SECRET as a Bearer token");
    assert(headers?.["Content-Type"] === "application/json", "sends Content-Type: application/json");

    const sentBody = JSON.parse(String(calls[0]?.body));
    assert(sentBody.type === "contact", "the request body carries the type discriminator");
    assert(sentBody.name === "Test User", "the request body carries the raw form field (name)");
    assert(sentBody.email === "sender@example.com", "the request body carries the raw form field (email)");
    assert(sentBody.subject === "Test subject", "the request body carries the raw form field (subject)");
    assert(sentBody.message === "Plain text body", "the request body carries the raw form field (message)");
    assert(!("to" in sentBody), 'no "to" field is ever sent — the relay derives the recipient itself');
    assert(!("from" in sentBody), 'no "from" field is ever sent — the relay derives the sender itself');
    assert(!("replyTo" in sentBody), 'no "replyTo" field is ever sent — the relay derives Reply-To itself');
  });
});

await group("sendMail: a 200 response resolves without throwing", async () => {
  await withEnv(VALID_ENV, async () => {
    const { fetchImpl } = fakeFetchResolving(200, JSON.stringify({ ok: true }));
    let threw = false;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch {
      threw = true;
    }
    assert(!threw, "sendMail resolves (does not throw) on a 200 response");
  });
});

// ── sendMail: relay 4xx/5xx ─────────────────────────────────────────────────

await group("sendMail: a 4xx response from the relay rejects with the status and body in the error", async () => {
  await withEnv(VALID_ENV, async () => {
    const { fetchImpl } = fakeFetchResolving(401, JSON.stringify({ ok: false, error: "Unauthorized" }));
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects on a 401 response");
    assert(error?.message.includes("401") === true, "error message includes the HTTP status code");
    assert(error?.message.includes("Unauthorized") === true, "error message includes the response body for diagnosis");
  });
});

await group("sendMail: a 5xx response from the relay also rejects (server-side failure, not just client error)", async () => {
  await withEnv(VALID_ENV, async () => {
    const { fetchImpl } = fakeFetchResolving(502, "Delivery failed");
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects on a 502 response");
    assert(error?.message.includes("502") === true, "error message includes the HTTP status code");
  });
});

// ── sendMail: timeout ────────────────────────────────────────────────────────

await group("sendMail: production default timeout is exactly 10 seconds", () => {
  assert(REQUEST_TIMEOUT_MS === 10_000, "REQUEST_TIMEOUT_MS === 10_000");
});

await group("sendMail: an unresponsive relay request is aborted at the timeout, not left hanging", async () => {
  await withEnv(VALID_ENV, async () => {
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
});

// ── sendMail: missing configuration ─────────────────────────────────────────

await group("sendMail: missing MAIL_RELAY_URL rejects immediately, before any network call", async () => {
  await withEnv({ MAIL_RELAY_URL: undefined, MAIL_RELAY_SECRET: "x" }, async () => {
    const { fetchImpl, calls } = fakeFetchResolving(200);
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects when MAIL_RELAY_URL is unset");
    assert(error?.message.includes("MAIL_RELAY_URL") === true, "the error names the missing variable");
    assert(calls.length === 0, "fetch is never called");
  });
});

await group("sendMail: missing MAIL_RELAY_SECRET rejects immediately, before any network call", async () => {
  await withEnv({ MAIL_RELAY_URL: "https://relay.kivora.ee/relay.php", MAIL_RELAY_SECRET: undefined }, async () => {
    const { fetchImpl, calls } = fakeFetchResolving(200);
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects when MAIL_RELAY_SECRET is unset");
    assert(error?.message.includes("MAIL_RELAY_SECRET") === true, "the error names the missing variable");
    assert(calls.length === 0, "fetch is never called");
  });
});

await group("sendMail: a non-HTTPS MAIL_RELAY_URL is rejected immediately, before any network call", async () => {
  await withEnv({ MAIL_RELAY_URL: "http://relay.kivora.ee/relay.php", MAIL_RELAY_SECRET: VALID_TEST_SECRET }, async () => {
    const { fetchImpl, calls } = fakeFetchResolving(200);
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects a plain-http MAIL_RELAY_URL");
    assert(error?.message.toLowerCase().includes("https") === true, "the error explains HTTPS is required");
    assert(calls.length === 0, "fetch is never called for a non-HTTPS URL");
  });
});

// ── sendMail: MAIL_RELAY_SECRET format validation ───────────────────────────
// Must match zone-mail-relay/relay.php's MAIL_RELAY_SECRET_FORMAT_REGEX
// exactly: \A[a-f0-9]{64}\z. Fails before any network request, and never
// logs/returns the actual value.

await group("sendMail: the published secret.example.php placeholder is rejected, not accepted as a valid secret", async () => {
  await withEnv({ MAIL_RELAY_URL: "https://relay.kivora.ee/relay.php", MAIL_RELAY_SECRET: "REPLACE_WITH_A_REAL_HIGH_ENTROPY_SECRET" }, async () => {
    const { fetchImpl, calls } = fakeFetchResolving(200);
    let error: Error | null = null;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch (err) {
      error = err as Error;
    }
    assert(error !== null, "sendMail rejects the committed placeholder value");
    assert(calls.length === 0, "fetch is never called with the placeholder");
  });
});

await group("sendMail: MAIL_RELAY_SECRET must be exactly 64 lowercase hex characters — empty/short/long/uppercase/padded/non-hex all rejected", async () => {
  const badSecrets: Record<string, string> = {
    empty: "",
    short: "a".repeat(10),
    "long (65 chars)": "a".repeat(65),
    "uppercase hex": "A1".repeat(32),
    "whitespace-padded": ` ${VALID_TEST_SECRET} `,
    "non-hex characters": "g".repeat(64),
  };
  for (const [label, badSecret] of Object.entries(badSecrets)) {
    await withEnv({ MAIL_RELAY_URL: "https://relay.kivora.ee/relay.php", MAIL_RELAY_SECRET: badSecret }, async () => {
      const { fetchImpl, calls } = fakeFetchResolving(200);
      let error: Error | null = null;
      try {
        await sendMail(SAMPLE_MESSAGE, fetchImpl);
      } catch (err) {
        error = err as Error;
      }
      // An empty string hits the earlier "not configured" check (same
      // outcome — rejected before fetch — via a different, equally valid
      // message), so only assert the invalid-format wording for the
      // genuinely non-empty malformed cases.
      if (badSecret !== "") {
        assert(error?.message.includes("required format") === true, `a ${label} secret is rejected for not matching the required format`);
      } else {
        assert(error !== null, `an ${label} secret is rejected`);
      }
      assert(calls.length === 0, `fetch is never called for a ${label} secret`);
      assert(error?.message.includes(badSecret) !== true || badSecret === "", `the error message never echoes the invalid secret value back (${label})`);
    });
  }
});

await group("sendMail: a valid 64-character lowercase hex secret is accepted and the request succeeds", async () => {
  await withEnv(VALID_ENV, async () => {
    const { fetchImpl } = fakeFetchResolving(200, JSON.stringify({ ok: true }));
    let threw = false;
    try {
      await sendMail(SAMPLE_MESSAGE, fetchImpl);
    } catch {
      threw = true;
    }
    assert(!threw, "a valid 64-lowercase-hex MAIL_RELAY_SECRET is accepted");
  });
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  mailer (Zone relay): ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
