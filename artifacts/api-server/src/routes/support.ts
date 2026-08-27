import { Router } from "express";
import mailer from "../lib/mailer.js";

const router = Router();

router.post("/support", async (req, res) => {
  const message   = String(req.body?.message   ?? "").trim();
  const senderUid = String(req.body?.uid       ?? "").trim();

  if (!message) {
    res.status(400).json({ ok: false, error: "Missing required field: message" });
    return;
  }

  try {
    await mailer.sendMail({
      type: "support",
      message,
      ...(senderUid ? { uid: senderUid } : {}),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[support] mail relay error:", err);
    res.status(500).json({ ok: false, error: "Email delivery failed" });
  }
});

export default router;
