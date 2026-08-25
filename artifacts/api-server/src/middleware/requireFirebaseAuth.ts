/**
 * requireFirebaseAuth — protects every route under /api/ai by requiring a
 * valid Firebase ID token. Mounted exactly once, at the /api/ai boundary
 * (see routes/index.ts) — never duplicated inside individual route
 * handlers.
 *
 * Response contract:
 *   - No/malformed Authorization header → 401 { error: "Authentication required", code: "AUTH_REQUIRED" }
 *   - Any verification failure (invalid, expired, revoked, disabled user,
 *     or a missing/misconfigured Firebase Admin credential) →
 *     401 { error: "Invalid authentication token", code: "AUTH_INVALID" }
 *     These are intentionally indistinguishable to the caller — the
 *     response never reveals whether the token itself was bad or the
 *     server is misconfigured.
 *   - Valid token → next() is called exactly once; res.locals.authUser is
 *     set to { uid, email } — never the raw token, never the full decoded
 *     claim set.
 *
 * verifyIdToken(token, true) is used — the `true` checkRevoked argument
 * means a revoked token or a disabled user account is rejected too, not
 * just an expired or malformed one.
 *
 * Never logs the Authorization header, the token, or any decoded claim.
 */

import type { Request, Response, NextFunction } from "express";
import type { Auth } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

const BEARER_PREFIX = "Bearer ";

/** Pure — extracts the bearer token from a raw Authorization header value, or null if missing/malformed. */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

/**
 * Verifies a bearer token against the given Auth instance and returns a
 * result — never throws. Kept separate from the Express middleware below
 * so it (and the exact verifyIdToken(token, true) call) is directly
 * unit-testable against a hand-written fake Auth, without needing real
 * Firebase Admin credentials.
 */
export async function verifyBearerToken(
  auth: Pick<Auth, "verifyIdToken">,
  token: string,
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false }> {
  try {
    const decoded = await auth.verifyIdToken(token, true);
    return { ok: true, user: { uid: decoded.uid, email: decoded.email } };
  } catch {
    return { ok: false };
  }
}

/**
 * `getAuthFn` defaults to the real getFirebaseAdminAuth and is only ever
 * overridden in tests (Express always calls this with exactly 3
 * arguments, so production behavior is untouched).
 */
export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  getAuthFn: () => Pick<Auth, "verifyIdToken"> = getFirebaseAdminAuth,
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return;
  }

  let auth: Pick<Auth, "verifyIdToken">;
  try {
    auth = getAuthFn();
  } catch {
    // Missing/misconfigured Firebase Admin credentials — fail closed exactly
    // like an invalid token. Never fall back to letting the request through.
    res.status(401).json({ error: "Invalid authentication token", code: "AUTH_INVALID" });
    return;
  }

  const result = await verifyBearerToken(auth, token);
  if (!result.ok) {
    res.status(401).json({ error: "Invalid authentication token", code: "AUTH_INVALID" });
    return;
  }

  res.locals["authUser"] = result.user;
  next();
}
