import { Router } from "express";
import transporter from "../lib/mailer.js";

const router = Router();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.post("/contact", async (req, res) => {
  const name    = String(req.body?.name    ?? "").trim();
  const email   = String(req.body?.email   ?? "").trim();
  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!name || !email || !message) {
    res.status(400).json({ ok: false, error: "Missing required fields: name, email, message" });
    return;
  }

  const recipient = process.env.CONTACT_RECIPIENT;
  if (!recipient) {
    res.status(500).json({ ok: false, error: "CONTACT_RECIPIENT is not configured" });
    return;
  }

  const mailSubject = subject ? `[Contact] ${subject}` : `[Contact] Message from ${name}`;

  const textBody = [
    `From:    ${name} <${email}>`,
    subject ? `Subject: ${subject}` : null,
    "",
    message,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const htmlBody = `
    <p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;</p>
    ${subject ? `<p><strong>Subject:</strong> ${esc(subject)}</p>` : ""}
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <p style="white-space:pre-wrap">${esc(message)}</p>
  `;

  try {
    await transporter.sendMail({
      to:      recipient,
      replyTo: `"${name}" <${email}>`,
      subject: mailSubject,
      text:    textBody,
      html:    htmlBody,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[contact] SMTP error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
