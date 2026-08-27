import { Router } from "express";
import mailer from "../lib/mailer.js";

const router = Router();

router.post("/contact", async (req, res) => {
  const name    = String(req.body?.name    ?? "").trim();
  const email   = String(req.body?.email   ?? "").trim();
  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!name || !email || !message) {
    res.status(400).json({ ok: false, error: "Missing required fields: name, email, message" });
    return;
  }

  try {
    await mailer.sendMail({
      type: "contact",
      name,
      email,
      ...(subject ? { subject } : {}),
      message,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[contact] mail relay error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
