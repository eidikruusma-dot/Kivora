/**
 * aiQuotaGate.ts — the shared auth-presence + quota check-and-consume gate
 * for every /api/ai/* route that can generate real provider cost.
 *
 * Extracted out of routes/ai.ts (where it first shipped, wired into
 * POST /api/ai/chat) so routes/aiUpload.ts's cost-generating routes
 * (/ai/upload, /ai/bank-import, /ai/upload-direct-test) reuse the exact
 * same gate rather than a second, parallel implementation. Same
 * pure-logic/Express-glue split already used by requireFirebaseAuth.ts's
 * verifyBearerToken vs the Express middleware itself.
 *
 * uid/owner come ONLY from res.locals.authUser (set by requireFirebaseAuth
 * from a verified Firebase ID token — see routes/index.ts's aiBoundary),
 * never from req.body/req.query/req.file — this function doesn't even
 * receive `req`, which makes it structurally impossible for it to consult
 * a client-supplied owner/quota value.
 *
 * Accounting model: exactly ONE quota unit per authenticated HTTP request
 * to a gated route — call this once, at the top of the route handler,
 * before any processing begins. This matters most for /ai/bank-import,
 * which can internally make several OpenAI calls for a single upload
 * (one per page batch — see aiUpload.ts's splitPdfIntoPageBatches/
 * callModelForPdfBatch): that entire request still consumes exactly one
 * unit, never one per internal batch. The alternative (metering every
 * internal provider call) would need weighted/token-based accounting,
 * which is explicitly out of scope for V1 — see aiQuota.ts's own doc
 * comment on why request-count, not token-count, is the V1 model.
 *
 * Returns { proceed: true } when the caller should continue to its
 * OpenAI/provider call. Otherwise a 401 or 429 has ALREADY been written to
 * `res` — the caller's only remaining job is to return immediately without
 * doing any further processing. authUser being absent here would mean
 * this handler somehow ran outside the requireFirebaseAuth boundary;
 * failing closed with 401 rather than assuming matches
 * requireFirebaseAuth's own philosophy.
 *
 * `checkQuota` defaults to the real checkAndConsumeAiQuota and is only
 * ever overridden in tests — every real call site uses 2 arguments.
 */

import type { Response } from "express";
import { checkAndConsumeAiQuota, type AiQuotaResult } from "./aiQuota.js";
import type { AuthenticatedUser } from "../middleware/requireFirebaseAuth.js";

export async function enforceAiQuota(
  res: Response,
  routeLabel: string,
  checkQuota: (params: { uid: string; owner: boolean }) => Promise<AiQuotaResult> = checkAndConsumeAiQuota,
): Promise<{ proceed: boolean }> {
  const authUser = res.locals["authUser"] as AuthenticatedUser | undefined;
  if (!authUser) {
    res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return { proceed: false };
  }

  const quota = await checkQuota({ uid: authUser.uid, owner: authUser.owner });
  if (!quota.allowed) {
    // Safe diagnostic logging only: route label and the quota decision's
    // reason — never uid, email, filename, or any request content.
    console.log(`[${routeLabel}] quota denied reason=${quota.reason}`);
    res.status(429).json({
      error: "Daily AI request limit reached. Try again tomorrow.",
      code: "QUOTA_EXCEEDED",
      limit: quota.limit,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
    return { proceed: false };
  }

  return { proceed: true };
}
