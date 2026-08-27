import { Router } from "express";
import mailer from "../lib/mailer.js";

const router = Router();

router.post("/feedback", async (req, res) => {
  const feedbackType = String(req.body?.type    ?? "").trim();
  const subject      = String(req.body?.subject ?? "").trim();
  const message      = String(req.body?.message ?? "").trim();
  const email        = String(req.body?.email   ?? "").trim();
  const mayContact   = Boolean(req.body?.mayContact);
  const uid          = String(req.body?.uid     ?? "").trim();

  if (!message) {
    res.status(400).json({ ok: false, error: "Missing required field: message" });
    return;
  }

  try {
    await mailer.sendMail({
      type: "feedback",
      message,
      ...(feedbackType ? { feedbackType } : {}),
      ...(subject ? { subject } : {}),
      ...(email ? { email } : {}),
      ...(uid ? { uid } : {}),
      mayContact,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[feedback] mail relay error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
