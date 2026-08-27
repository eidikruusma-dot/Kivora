/**
 * Zone mail-relay HTTPS client — replaces the previous nodemailer/SMTP
 * transporter.
 *
 * Render's free tier blocks outbound traffic on SMTP ports 25, 465, and
 * 587, so direct SMTP from Render to any mailbox (including our own Zone
 * mailboxes) cannot work at all. Instead, this posts structured form data
 * over HTTPS to a small PHP relay hosted on the existing Zone webhosting
 * (see /zone-mail-relay in the repo root), which delivers locally via
 * Zone's own sendmail — no third-party email service involved.
 *
 * This module intentionally sends only the raw, per-type form fields
 * (name/email/subject/message/uid/mayContact/feedbackType) — never a `to`,
 * `from`, or `replyTo`. The relay is the single source of truth for
 * recipient/sender/reply-to; anything this module might send there would
 * be ignored server-side regardless, by design (defense in depth against a
 * compromised or misconfigured Render deployment).
 *
 * Uses the platform's native fetch/AbortController — no new dependency.
 *
 * MAIL_RELAY_URL/MAIL_RELAY_SECRET are read lazily, inside sendMail(),
 * rather than once at module load — same reasoning as getFirebaseAdminAuth()
 * in lib/firebaseAdmin.ts: a missing/misconfigured value fails the specific
 * request that needed it instead of being baked in permanently at import
 * time, and it's what makes every state directly unit-testable (see
 * mailer.test.ts) within a single process.
 */

const REQUEST_TIMEOUT_MS = 10_000;

// The required secret format: exactly 64 lowercase hex characters — a
// 32-byte / 256-bit secret generated with `openssl rand -hex 32`. Must
// match zone-mail-relay/relay.php's MAIL_RELAY_SECRET_FORMAT_REGEX exactly.
const SECRET_FORMAT = /^[a-f0-9]{64}$/;

if (!process.env["MAIL_RELAY_URL"]) {
  console.warn(
    "[mailer] MAIL_RELAY_URL is not set — email sending will fail at runtime.",
  );
}
if (!process.env["MAIL_RELAY_SECRET"]) {
  console.warn(
    "[mailer] MAIL_RELAY_SECRET is not set — email sending will fail at runtime.",
  );
}

export type MailType = "contact" | "support" | "feedback";

export interface MailMessage {
  type: MailType;
  /** contact only */
  name?: string;
  /** contact (required); feedback (optional) */
  email?: string;
  subject?: string;
  message: string;
  /** support/feedback only */
  uid?: string;
  /** feedback only — gates whether the relay sets Reply-To to `email` */
  mayContact?: boolean;
  /** feedback's own category (bug/idea/...), distinct from the top-level `type` discriminator */
  feedbackType?: string;
}

/**
 * `fetchImpl` and `timeoutMs` default to the real global fetch and the real
 * 10s timeout, and are only ever overridden in tests — production call
 * sites always call sendMail with just `message`, so production behavior
 * is untouched. `timeoutMs` is injectable so the timeout path itself can be
 * tested in milliseconds instead of actually waiting out 10 real seconds.
 */
async function sendMail(
  message: MailMessage,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<void> {
  const relayUrl = process.env["MAIL_RELAY_URL"];
  const secret = process.env["MAIL_RELAY_SECRET"];

  if (!relayUrl) {
    throw new Error("MAIL_RELAY_URL is not configured");
  }
  if (!secret) {
    throw new Error("MAIL_RELAY_SECRET is not configured");
  }
  if (!SECRET_FORMAT.test(secret)) {
    // Never include the actual value here — only the fact that it's invalid.
    throw new Error("MAIL_RELAY_SECRET is not in the required format (64 lowercase hex characters)");
  }
  if (!relayUrl.startsWith("https://")) {
    throw new Error("MAIL_RELAY_URL must use HTTPS");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(relayUrl, {
      method: "POST",
      // The Authorization header must never be replayed against a
      // redirect target the relay didn't choose — fail instead of following.
      redirect: "error",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Mail relay request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mail relay error ${res.status}: ${body}`);
  }
}

const mailer = { sendMail };
export default mailer;

export { sendMail, REQUEST_TIMEOUT_MS };
