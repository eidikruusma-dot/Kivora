/**
 * aiQuota.ts — server-side AI usage quota check-and-consume.
 *
 * Step 3 of the AI quota architecture: one reusable, atomic function that
 * a future route (not yet wired — see routes/ai.ts, routes/aiUpload.ts)
 * will call BEFORE making any OpenAI request. Not called from anywhere in
 * production yet.
 *
 * ── Trust boundary ───────────────────────────────────────────────────────
 * The only inputs this function trusts are `uid` and `owner` as already
 * resolved by requireFirebaseAuth from a verified Firebase ID token (see
 * middleware/requireFirebaseAuth.ts) — never anything read from a request
 * body, query string, or client-supplied header. This module has no
 * knowledge of Express at all; it does not read `req` itself, which makes
 * it structurally impossible for it to consult a client-supplied
 * owner/quota/usage value even by accident.
 *
 * ── Storage ──────────────────────────────────────────────────────────────
 * One document per user per UTC calendar day, in a top-level collection
 * (AI_USAGE_COLLECTION) that is NOT nested under the client-writable
 * `users/{uid}` profile document — see the module-level rationale in
 * firebaseAdmin.ts and the AI-quota architecture writeup: a client-writable
 * document's Firestore rules are one create-then-recreate away from a user
 * smuggling in an arbitrary extra field, so usage/role data must live
 * somewhere the client can never write to at all (Firestore rules for this
 * collection are a LATER step — not yet added — but this module already
 * only ever reads/writes via the Admin SDK, which is unaffected by rules
 * either way).
 *
 * Document id: `${uid}_${bucket}` where `bucket` is the UTC calendar date
 * (see dailyBucketKeyUtc below). Fields: { uid, date, count, updatedAt }.
 *
 * ── Timezone semantics (explicit, by design) ────────────────────────────
 * The daily bucket is the UTC calendar date of the SERVER'S clock at the
 * moment of the request — never the caller's local date. Two things this
 * deliberately avoids:
 *   1. Trusting a client-supplied "local date"/timezone for anything that
 *      affects quota — exactly the kind of client-controlled input a quota
 *      check must never depend on (a caller could just claim a timezone
 *      that keeps handing them a fresh bucket).
 *   2. Depending on the server process's OS/deployment timezone, which can
 *      differ across environments and is not guaranteed stable — UTC is
 *      the one calendar that is identical everywhere this code runs.
 * The practical effect: the daily reset happens at 00:00 UTC, not at
 * midnight in any particular user's timezone. This is a known, accepted V1
 * simplification, not an oversight.
 *
 * ── Concurrency ──────────────────────────────────────────────────────────
 * The read (current count) and the write (incremented count) happen inside
 * a single Firestore transaction (runTransaction). Firestore serializes
 * transactions that touch the same document — of two concurrent calls
 * racing for the same final remaining slot, exactly one observes the
 * pre-increment count and commits; Firestore retries the other against the
 * now-updated document, so it observes the post-increment count and is
 * correctly denied. A bare `FieldValue.increment()` write with no prior
 * read-and-check would NOT provide this guarantee (it always succeeds
 * unconditionally) — the explicit tx.get() → check → tx.set() sequence
 * inside the transaction body is what makes this safe.
 *
 * ── Fail-closed ──────────────────────────────────────────────────────────
 * Any failure — Firestore Admin credentials unavailable, the transaction
 * itself throwing for any reason — resolves to `allowed: false`. There is
 * no path in this module that returns `allowed: true` without either an
 * explicit owner bypass or a successfully committed increment inside a
 * transaction.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "./firebaseAdmin.js";

// ── V1 limit — NOT a final product decision ─────────────────────────────
// A placeholder so this module compiles and is testable before product
// picks the real per-day request limit. Flag for product decision before
// this quota check is ever wired into a route — do not ship this number
// as-is.
export const TEMP_DEFAULT_AI_DAILY_REQUEST_LIMIT = 20;

/** Top-level Firestore collection holding one doc per user per UTC day. */
export const AI_USAGE_COLLECTION = "aiUsage";

export type AiQuotaReason =
  | "owner_bypass"
  | "under_limit"
  | "limit_reached"
  | "quota_lookup_failed";

export interface AiQuotaResult {
  /** The only field a route should branch on. */
  allowed: boolean;
  /** Why the decision was made — for logging/observability, not branching. */
  reason: AiQuotaReason;
  /** The limit that was checked against. Number.POSITIVE_INFINITY for an owner bypass. */
  limit: number;
  /** Requests already consumed in the current bucket, AFTER this call (if allowed). 0 for an owner bypass. */
  used: number;
  /** limit - used, floored at 0. Number.POSITIVE_INFINITY for an owner bypass. */
  remaining: number;
  /** The UTC calendar-date bucket key this decision was evaluated against (see dailyBucketKeyUtc). */
  bucket: string;
  /** ISO 8601 instant of the next UTC-midnight reset. */
  resetAt: string;
}

export interface CheckAiQuotaParams {
  /** Verified Firebase uid — from res.locals.authUser.uid, never client-supplied. */
  uid: string;
  /** Verified owner custom claim — from res.locals.authUser.owner, never client-supplied. */
  owner: boolean;
  /** Overrides TEMP_DEFAULT_AI_DAILY_REQUEST_LIMIT — for tests, or a future per-plan limit. */
  limit?: number;
  /** Overrides the current time — for deterministic tests only. */
  now?: Date;
  /** Overrides how the Firestore instance is obtained — for tests only. */
  getDb?: () => Firestore;
}

/** UTC calendar date, e.g. "2026-08-30" — see the module doc comment for why UTC. */
export function dailyBucketKeyUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The instant of the next UTC midnight strictly after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
}

function usageDocId(uid: string, bucket: string): string {
  return `${uid}_${bucket}`;
}

/**
 * Atomically checks and consumes one unit of a user's daily AI request
 * quota. See the module doc comment above for the full trust/storage/
 * timezone/concurrency/fail-closed contract.
 *
 * Never throws — every failure path resolves to `allowed: false` instead.
 */
export async function checkAndConsumeAiQuota(
  params: CheckAiQuotaParams,
): Promise<AiQuotaResult> {
  const {
    uid,
    owner,
    limit = TEMP_DEFAULT_AI_DAILY_REQUEST_LIMIT,
    now = new Date(),
    getDb = getFirebaseAdminFirestore,
  } = params;

  const bucket = dailyBucketKeyUtc(now);
  const resetAt = nextUtcMidnight(now).toISOString();

  // Owner bypass — resolved entirely from the already-verified claim.
  // Firestore is never touched: no read, no write, no usage consumed.
  if (owner) {
    return {
      allowed: true,
      reason: "owner_bypass",
      limit: Number.POSITIVE_INFINITY,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      bucket,
      resetAt,
    };
  }

  let db: Firestore;
  try {
    db = getDb();
  } catch {
    // Missing/misconfigured Admin credentials — fail closed exactly like
    // requireFirebaseAuth does for the same underlying failure. Never let
    // a configuration problem silently grant unlimited usage.
    return {
      allowed: false,
      reason: "quota_lookup_failed",
      limit,
      used: limit,
      remaining: 0,
      bucket,
      resetAt,
    };
  }

  const ref = db.collection(AI_USAGE_COLLECTION).doc(usageDocId(uid, bucket));

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const rawCount = data ? data["count"] : undefined;
      const used = typeof rawCount === "number" ? rawCount : 0;

      if (used >= limit) {
        return {
          allowed: false,
          reason: "limit_reached",
          limit,
          used,
          remaining: 0,
          bucket,
          resetAt,
        };
      }

      const nextUsed = used + 1;
      tx.set(
        ref,
        { uid, date: bucket, count: nextUsed, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

      return {
        allowed: true,
        reason: "under_limit",
        limit,
        used: nextUsed,
        remaining: limit - nextUsed,
        bucket,
        resetAt,
      };
    });
  } catch {
    // Any transaction failure (contention exhausted, Firestore unavailable,
    // etc.) fails closed — never falls back to allowing the request.
    return {
      allowed: false,
      reason: "quota_lookup_failed",
      limit,
      used: limit,
      remaining: 0,
      bucket,
      resetAt,
    };
  }
}
