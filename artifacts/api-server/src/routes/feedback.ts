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

router.post("/feedback", async (req, res) => {
  const type       = String(req.body?.type    ?? "").trim();
  const subject    = String(req.body?.subject ?? "").trim();
  const message    = String(req.body?.message ?? "").trim();
  const email      = String(req.body?.email   ?? "").trim();
  const mayContact = Boolean(req.body?.mayContact);
  const uid        = String(req.body?.uid     ?? "").trim();

  if (!message) {
    res.status(400).json({ ok: false, error: "Missing required field: message" });
    return;
  }

  const recipient = process.env.SUPPORT_RECIPIENT;
  if (!recipient) {
    res.status(500).json({ ok: false, error: "SUPPORT_RECIPIENT is not configured" });
    return;
  }

  const typeLabel = type
    ? type.charAt(0).toUpperCase() + type.slice(1)
    : "Feedback";

  const mailSubject = subject
    ? `[Feedback/${typeLabel}] ${subject}`
    : `[Feedback/${typeLabel}] New submission`;

  const textLines = [
    `Type:        ${typeLabel}`,
    subject    ? `Subject:     ${subject}`          : null,
    email      ? `Email:       ${email}`             : null,
    uid        ? `User UID:    ${uid}`               : null,
    mayContact ? `May contact: Yes`                  : null,
    "",
    message,
  ].filter((l) => l !== null).join("\n");

  const htmlBody = `
    <p><strong>Type:</strong> ${esc(typeLabel)}</p>
    ${subject    ? `<p><strong>Subject:</strong> ${esc(subject)}</p>` : ""}
    ${email      ? `<p><strong>Email:</strong> ${esc(email)}</p>` : ""}
    ${uid        ? `<p><strong>User UID:</strong> <code>${esc(uid)}</code></p>` : ""}
    ${mayContact ? `<p><strong>May contact:</strong> Yes</p>` : ""}
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <p style="white-space:pre-wrap">${esc(message)}</p>
  `;

  try {
    await transporter.sendMail({
      from:    `"Kivora Feedback" <${process.env.SMTP_USER}>`,
      to:      recipient,
      ...(email && mayContact ? { replyTo: email } : {}),
      subject: mailSubject,
      text:    textLines,
      html:    htmlBody,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[feedback] SMTP error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
