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

router.post("/support", async (req, res) => {
  const message   = String(req.body?.message   ?? "").trim();
  const senderUid = String(req.body?.uid       ?? "").trim();

  if (!message) {
    res.status(400).json({ ok: false, error: "Missing required field: message" });
    return;
  }

  const recipient = process.env.SUPPORT_RECIPIENT;
  if (!recipient) {
    res.status(500).json({ ok: false, error: "SUPPORT_RECIPIENT is not configured" });
    return;
  }

  const textBody = [
    senderUid ? `User UID: ${senderUid}` : null,
    "",
    message,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const htmlBody = `
    ${senderUid ? `<p><strong>User UID:</strong> <code>${esc(senderUid)}</code></p>` : ""}
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <p style="white-space:pre-wrap">${esc(message)}</p>
  `;

  try {
    await transporter.sendMail({
      from:    `"Kivora Support" <${process.env.SMTP_USER}>`,
      to:      recipient,
      subject: "[Support] New message from Help & Support",
      text:    textBody,
      html:    htmlBody,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[support] SMTP error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
