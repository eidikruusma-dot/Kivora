/**
 * Regression tests for the SMTP → Resend migration's cross-cutting
 * requirements: contact.ts/support.ts/feedback.ts must all send through the
 * SAME mailer client (no per-route SMTP special-casing reintroduced), and a
 * failed send must never look like — or cause the loss of — a successful
 * submission.
 *
 * Two halves:
 *   1. Structural checks (source-level) that contact/support/feedback all
 *      import the one shared lib/mailer.js and no longer build their own
 *      per-route `from` address (that's now centralized in mailer.ts via
 *      EMAIL_FROM — see mailer.test.ts for the mailer's own unit tests).
 *   2. A live Express request proving a real mailer failure (Resend
 *      unconfigured, e.g. RESEND_API_KEY missing) surfaces as a normal
 *      JSON 500 from the route — not a false 200, not a hang — which is
 *      exactly what lets Contact.tsx's existing (unmodified) persist-before-
 *      send / best-effort-status-update flow mark the already-saved
 *      Firestore submission "failed" instead of losing it.
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
// Deliberately NOT set: RESEND_API_KEY, EMAIL_FROM — proves the "failed
// send" path below without needing a real Resend account.
process.env["CONTACT_RECIPIENT"] ??= "info@kivora.ee";
process.env["SUPPORT_RECIPIENT"] ??= "support@kivora.ee";

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

// ── 1. Structural: same shared mailer, no reintroduced per-route SMTP `from` ──

const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");

const CONTACT_SRC = readFileSync(resolve(process.cwd(), "src/routes/contact.ts"), "utf8");
const SUPPORT_SRC = readFileSync(resolve(process.cwd(), "src/routes/support.ts"), "utf8");
const FEEDBACK_SRC = readFileSync(resolve(process.cwd(), "src/routes/feedback.ts"), "utf8");

await group("contact/support/feedback all import the same lib/mailer.js client", () => {
  for (const [name, src] of [["contact.ts", CONTACT_SRC], ["support.ts", SUPPORT_SRC], ["feedback.ts", FEEDBACK_SRC]] as const) {
    assert(/import\s+transporter\s+from\s+["']\.\.\/lib\/mailer\.js["']/.test(src), `${name} imports transporter from ../lib/mailer.js`);
    assert(/transporter\.sendMail\(/.test(src), `${name} calls transporter.sendMail(...)`);
  }
});

await group("none of the three routes build their own per-route `from` address anymore (centralized in mailer.ts via EMAIL_FROM)", () => {
  for (const [name, src] of [["contact.ts", CONTACT_SRC], ["support.ts", SUPPORT_SRC], ["feedback.ts", FEEDBACK_SRC]] as const) {
    assert(!/from:\s*`/.test(src), `${name} no longer constructs a from: string`);
    assert(!src.includes("SMTP_USER"), `${name} no longer references SMTP_USER`);
  }
});

await group("contact.ts still sets replyTo to the submitting user's own name/email", () => {
  assert(/replyTo:\s*`"\$\{name\}"\s*<\$\{email\}>`/.test(CONTACT_SRC), "contact.ts's replyTo is built from the form's name+email");
});

// ── 2. Live: a real mailer failure surfaces as a clean 500, never a hang/false-200 ──

const { default: app } = await import("../app.js");

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Expected server.address() to return an AddressInfo object");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await group("a real send failure (RESEND_API_KEY unset) returns a clean JSON 500 promptly — never a hang, never a false 200", async () => {
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
    assert(res.status === 500, `POST /api/contact with a broken mailer returns 500 (got ${res.status})`);
    assert((json as { ok?: boolean } | undefined)?.ok === false, "response body reports ok:false, never ok:true on a failed send");
    assert(elapsedMs < 5_000, `resolves promptly (took ${elapsedMs}ms) — proves the route doesn't hang waiting on a broken mailer`);
  });

  await group("support and feedback fail the same clean way through the same shared mailer", async () => {
    const support = await fetch(`${baseUrl}/api/support`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "shared-mailer regression test" }),
    });
    assert(support.status === 500, `POST /api/support with a broken mailer returns 500 (got ${support.status})`);

    const feedback = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "shared-mailer regression test" }),
    });
    assert(feedback.status === 500, `POST /api/feedback with a broken mailer returns 500 (got ${feedback.status})`);
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
