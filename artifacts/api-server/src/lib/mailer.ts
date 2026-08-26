/**
 * Resend HTTPS API email client — replaces the previous nodemailer/SMTP
 * transporter.
 *
 * Render's free tier blocks outbound traffic on SMTP ports 25, 465, and
 * 587. Every send previously hung until nodemailer's internal
 * connection-timeout default (2 minutes) before finally failing with
 * ETIMEDOUT on the CONN step — the request never even reached
 * authentication. Resend is a plain HTTPS POST to api.resend.com:443,
 * unaffected by that port block, and bounded here by an explicit
 * REQUEST_TIMEOUT_MS AbortController timeout so a request can never hang
 * for minutes regardless of network conditions.
 *
 * Same sendMail({to, replyTo?, subject, text, html}) call shape as the
 * previous transporter (minus `from`, now centrally fixed via EMAIL_FROM
 * below — every route sends from the same configured address), so
 * contact.ts/support.ts/feedback.ts needed no structural changes.
 *
 * Uses the platform's native fetch/AbortController — no new dependency.
 *
 * RESEND_API_KEY/EMAIL_FROM are read lazily, inside sendMail(), rather than
 * once at module load — same reasoning as getFirebaseAdminAuth() in
 * lib/firebaseAdmin.ts: a missing/misconfigured value fails the specific
 * request that needed it instead of being baked in permanently at import
 * time, and it's what makes both states directly unit-testable (see
 * mailer.test.ts) within a single process.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

if (!process.env["RESEND_API_KEY"]) {
  console.warn(
    "[mailer] RESEND_API_KEY is not set — email sending will fail at runtime.",
  );
}
if (!process.env["EMAIL_FROM"]) {
  console.warn(
    "[mailer] EMAIL_FROM is not set — email sending will fail at runtime.",
  );
}

export interface MailMessage {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

interface ResendRequestBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  reply_to?: string;
}

/** Pure — builds the exact JSON body sent to Resend. Directly unit-testable. */
export function buildResendBody(message: MailMessage, from: string): ResendRequestBody {
  return {
    from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  };
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
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildResendBody(message, from)),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Resend request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

const mailer = { sendMail };
export default mailer;

export { sendMail, RESEND_API_URL, REQUEST_TIMEOUT_MS };
