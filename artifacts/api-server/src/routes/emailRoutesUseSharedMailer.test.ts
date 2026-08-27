/**
 * Regression tests for the Zone mail-relay migration's cross-cutting
 * requirements: contact.ts/support.ts/feedback.ts must all send through
 * the SAME relay client (no per-route recipient/SMTP special-casing), must
 * never build or forward a caller-controlled to/from/replyTo, and a failed
 * relay call must never look like — or cause the loss of — a successful
 * submission.
 *
 * Two halves:
 *   1. Structural checks (source-level) that contact/support/feedback all
 *      import the one shared lib/mailer.js, never reference the removed
 *      CONTACT_RECIPIENT/SUPPORT_RECIPIENT/SMTP_* variables, and never
 *      build their own to/from/replyTo (that's now entirely the relay's
 *      responsibility — see mailer.test.ts and zone-mail-relay/tests).
 *   2. A live Express request proving a real relay failure (MAIL_RELAY_URL/
 *      MAIL_RELAY_SECRET unconfigured) surfaces as a normal JSON 500 from
 *      the route — not a false 200, not a hang — which is exactly what
 *      lets Contact.tsx's existing (unmodified) persist-before-send /
 *      best-effort-status-update flow mark the already-saved Firestore
 *      submission "failed" instead of losing it.
 *
 * Compile and run (also available as `pnpm run test:emailRoutesSharedMailer`):
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm \
 *       --external:express --external:cors --external:pino-http --external:pino \
 *       --external:pino-pretty --external:firebase-admin --external:firebase-admin/* \
 *       --external:openai --external:web-push --external:multer \
 *       --external:pdf-lib --external:pdf-parse --external:pdfjs-dist --external:xlsx \
 *       --external:mammoth --external:@napi-rs/canvas \
 *       src/routes/emailRoutesUseSharedMailer.test.ts \
 *       --outfile=.tmp-emailRoutesSharedMailer.mjs && node .tmp-emailRoutesSharedMailer.mjs
 */

export {};

process.env["OPENAI_API_KEY"] ??= "sk-test-placeholder-not-a-real-key";
// Deliberately NOT set: MAIL_RELAY_URL, MAIL_RELAY_SECRET — proves the
// "failed send" path below without needing a real Zone relay.
// Deliberately NOT set either: CONTACT_RECIPIENT, SUPPORT_RECIPIENT —
// these are no longer read anywhere; the relay is the single source of
// truth for recipient mapping.

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

// ── 1. Structural: same shared mailer, no caller-controlled to/from/replyTo ──

const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");

const CONTACT_SRC = readFileSync(resolve(process.cwd(), "src/routes/contact.ts"), "utf8");
const SUPPORT_SRC = readFileSync(resolve(process.cwd(), "src/routes/support.ts"), "utf8");
const FEEDBACK_SRC = readFileSync(resolve(process.cwd(), "src/routes/feedback.ts"), "utf8");

await group("contact/support/feedback all import the same lib/mailer.js client", () => {
  for (const [name, src] of [["contact.ts", CONTACT_SRC], ["support.ts", SUPPORT_SRC], ["feedback.ts", FEEDBACK_SRC]] as const) {
    assert(/import\s+mailer\s+from\s+["']\.\.\/lib\/mailer\.js["']/.test(src), `${name} imports mailer from ../lib/mailer.js`);
    assert(/mailer\.sendMail\(/.test(src), `${name} calls mailer.sendMail(...)`);
  }
});

await group("none of the three routes reference the removed SMTP/recipient env vars", () => {
  for (const [name, src] of [["contact.ts", CONTACT_SRC], ["support.ts", SUPPORT_SRC], ["feedback.ts", FEEDBACK_SRC]] as const) {
    for (const deadVar of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_RECIPIENT", "SUPPORT_RECIPIENT"]) {
      assert(!src.includes(deadVar), `${name} no longer references ${deadVar}`);
    }
  }
});

await group("none of the three routes build their own to/from/replyTo — that is entirely the relay's responsibility", () => {
  for (const [name, src] of [["contact.ts", CONTACT_SRC], ["support.ts", SUPPORT_SRC], ["feedback.ts", FEEDBACK_SRC]] as const) {
    assert(!/\bto:\s*/.test(src), `${name} does not set a "to" field`);
    assert(!/\bfrom:\s*/.test(src), `${name} does not set a "from" field`);
    assert(!/\breplyTo:\s*/.test(src), `${name} does not set a "replyTo" field`);
  }
});

await group("contact.ts sends type:\"contact\" with name/email/subject/message — every legitimate field preserved", () => {
  assert(/type:\s*["']contact["']/.test(CONTACT_SRC), 'contact.ts sends type: "contact"');
  for (const field of ["name", "email", "subject", "message"]) {
    assert(CONTACT_SRC.includes(field), `contact.ts still references ${field}`);
  }
});

await group("feedback.ts sends type:\"feedback\" plus feedbackType (distinct from the relay discriminator), mayContact, email, uid", () => {
  assert(/type:\s*["']feedback["']/.test(FEEDBACK_SRC), 'feedback.ts sends type: "feedback"');
  assert(FEEDBACK_SRC.includes("feedbackType"), "feedback.ts forwards its own category as feedbackType, not as the top-level type");
  assert(FEEDBACK_SRC.includes("mayContact"), "feedback.ts still forwards mayContact");
});

// ── 2. Live: a real relay failure surfaces as a clean 500, never a hang/false-200 ──

const { default: app } = await import("../app.js");

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Expected server.address() to return an AddressInfo object");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await group("a real send failure (MAIL_RELAY_URL/SECRET unset) returns a clean JSON 500 promptly — never a hang, never a false 200", async () => {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        subject: "Hello",
        message: "This is a shared-mailer regression test message.",
      }),
    });
    const elapsedMs = Date.now() - start;
    const json = await res.json().catch(() => undefined);
    assert(res.status === 500, `POST /api/contact with an unconfigured relay returns 500 (got ${res.status})`);
    assert((json as { ok?: boolean } | undefined)?.ok === false, "response body reports ok:false, never ok:true on a failed send");
    assert(elapsedMs < 5_000, `resolves promptly (took ${elapsedMs}ms) — proves the route doesn't hang waiting on an unconfigured relay`);
  });

  await group("support and feedback fail the same clean way through the same shared mailer", async () => {
    const support = await fetch(`${baseUrl}/api/support`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "shared-mailer regression test" }),
    });
    assert(support.status === 500, `POST /api/support with an unconfigured relay returns 500 (got ${support.status})`);

    const feedback = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "shared-mailer regression test" }),
    });
    assert(feedback.status === 500, `POST /api/feedback with an unconfigured relay returns 500 (got ${feedback.status})`);
  });

  await group("contact still requires name/email/message before ever reaching the mailer (unchanged validation contract)", async () => {
    const missingFields = await fetch(`${baseUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A", email: "a@example.com" }),
    });
    assert(missingFields.status === 400, `POST /api/contact with a missing required field returns 400 (got ${missingFields.status})`);
  });
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

// ── 3. Structural: the frontend's persist-before-send flow (which is what
//    actually keeps a failed submission from being lost) is unmodified ──

const CONTACT_PAGE_SRC = readFileSync(
  resolve(process.cwd(), "../planner-app/src/views/Contact.tsx"),
  "utf8",
);

await group("Contact.tsx's Firestore persist-before-send flow is unchanged — a failed email send never loses the saved submission", () => {
  const addDocIdx = CONTACT_PAGE_SRC.indexOf("await addDoc(");
  const fetchIdx = CONTACT_PAGE_SRC.indexOf("fetch('/api/contact'");
  assert(addDocIdx !== -1 && fetchIdx !== -1, "found both the Firestore write and the /api/contact call");
  assert(addDocIdx < fetchIdx, "the Firestore write happens BEFORE the email attempt, not after");
  assert(CONTACT_PAGE_SRC.includes("emailDeliveryStatus: 'pending'"), "the submission is saved with emailDeliveryStatus: 'pending' up front");
  assert(CONTACT_PAGE_SRC.includes("emailDeliveryStatus: emailOk ? 'sent' : 'failed'"), "a failed send updates the status to 'failed', never deletes the document");
  assert(!CONTACT_PAGE_SRC.includes("deleteDoc"), "Contact.tsx never deletes a submission on any path");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  shared mailer / no-lost-submission: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
