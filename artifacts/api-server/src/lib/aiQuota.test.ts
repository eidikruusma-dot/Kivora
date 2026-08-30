/**
 * Unit tests for aiQuota.ts — the atomic AI usage quota check-and-consume
 * function, now wired into POST /api/ai/chat (see routes/ai.ts and
 * aiChatQuotaEnforcement.test.ts for the route-level coverage). These
 * tests exercise checkAndConsumeAiQuota() directly, independent of Express.
 *
 * No real Firestore project/emulator is used or required. `getDb` is
 * injected with a small hand-written in-memory fake (see makeFakeFirestore
 * below) that implements exactly the surface aiQuota.ts calls:
 * collection(name).doc(id), and runTransaction(fn).
 *
 * Faithfulness of the fake's concurrency model (the one thing worth being
 * explicit about): real Firestore serializes transactions that touch the
 * SAME document via optimistic concurrency control with automatic retry —
 * of two racing transactions, one commits first and the other is retried
 * against the now-updated document. This fake instead uses a single
 * process-wide async lock so that no two runTransaction() callbacks ever
 * execute concurrently, full stop. The externally OBSERVABLE guarantee
 * this test cares about — "two concurrent calls racing for the same final
 * slot never both succeed" — is identical either way; the fake is simply a
 * strictly stronger (never-interleaved-at-all, no retries) special case of
 * Firestore's real per-document serialization, which is a safe and honest
 * simplification for a hand-written test double with no real network
 * access available in this sandbox.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/lib/aiQuota.test.ts --outfile=.tmp-aiQuota.mjs && node .tmp-aiQuota.mjs
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  checkAndConsumeAiQuota,
  dailyBucketKeyUtc,
  nextUtcMidnight,
  AI_DAILY_REQUEST_LIMIT_FREE,
} from "./aiQuota.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

async function group(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Fake Firestore ───────────────────────────────────────────────────────

interface FakeDocRef {
  key: string;
}

interface FakeTransaction {
  get(ref: FakeDocRef): Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set(ref: FakeDocRef, data: Record<string, unknown>, opts?: { merge?: boolean }): void;
}

function makeFakeFirestore(readDelayMs = 5) {
  const store = new Map<string, Record<string, unknown>>();
  // Chains every runTransaction call onto this promise so callbacks never
  // interleave — see the file header for why this is a faithful enough
  // model of Firestore's real per-document transaction serialization.
  let lock: Promise<unknown> = Promise.resolve();
  let transactionCount = 0;

  const fakeDb = {
    collection(name: string) {
      return {
        doc(id: string): FakeDocRef {
          return { key: `${name}/${id}` };
        },
      };
    },
    async runTransaction<T>(updateFn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
      transactionCount++;
      const run = lock.then(async () => {
        const tx: FakeTransaction = {
          async get(ref) {
            // A small artificial delay so a "concurrent" pair of calls has
            // a real window in which a buggy (non-serializing) transaction
            // implementation could observe the pre-increment count twice.
            await wait(readDelayMs);
            const data = store.get(ref.key);
            return { exists: data !== undefined, data: () => data };
          },
          set(ref, data, opts) {
            const existing = opts?.merge ? (store.get(ref.key) ?? {}) : {};
            store.set(ref.key, { ...existing, ...data });
          },
        };
        return updateFn(tx);
      });
      // One transaction throwing must never wedge the lock for the next one.
      lock = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    _store: store,
    _transactionCount: () => transactionCount,
  };

  return fakeDb as unknown as Firestore & {
    _store: Map<string, Record<string, unknown>>;
    _transactionCount: () => number;
  };
}

function seedUsage(
  db: ReturnType<typeof makeFakeFirestore>,
  uid: string,
  bucket: string,
  count: number,
): void {
  db._store.set(`aiUsage/${uid}_${bucket}`, { uid, date: bucket, count });
}

const FIXED_NOW = new Date("2026-08-30T12:00:00.000Z");
const FIXED_BUCKET = "2026-08-30";

// ── Tests ────────────────────────────────────────────────────────────────

await group("1. first request for a user with no usage doc: allowed, starts from zero, increments to 1", async () => {
  const db = makeFakeFirestore();
  const result = await checkAndConsumeAiQuota({
    uid: "u-first",
    owner: false,
    limit: 5,
    now: FIXED_NOW,
    getDb: () => db,
  });
  assert(result.allowed === true, "allowed");
  assert(result.reason === "under_limit", 'reason is "under_limit"');
  assert(result.used === 1, "used is 1 (started from zero, incremented once)");
  assert(result.remaining === 4, "remaining is limit - 1");
  assert(result.bucket === FIXED_BUCKET, "bucket matches the fixed date");
  assert(
    db._store.get(`aiUsage/u-first_${FIXED_BUCKET}`)?.["count"] === 1,
    "the usage doc was actually written with count 1",
  );
});

await group("2. under-limit request increments an existing usage doc", async () => {
  const db = makeFakeFirestore();
  seedUsage(db, "u-second", FIXED_BUCKET, 3);
  const result = await checkAndConsumeAiQuota({
    uid: "u-second",
    owner: false,
    limit: 5,
    now: FIXED_NOW,
    getDb: () => db,
  });
  assert(result.allowed === true, "allowed");
  assert(result.used === 4, "used is 4 (3 already used, incremented once)");
  assert(result.remaining === 1, "remaining is 1");
  assert(db._store.get(`aiUsage/u-second_${FIXED_BUCKET}`)?.["count"] === 4, "the doc was updated to count 4");
});

await group("3. a user exactly at the limit is denied, without incrementing", async () => {
  const db = makeFakeFirestore();
  seedUsage(db, "u-at-limit", FIXED_BUCKET, 5);
  const result = await checkAndConsumeAiQuota({
    uid: "u-at-limit",
    owner: false,
    limit: 5,
    now: FIXED_NOW,
    getDb: () => db,
  });
  assert(result.allowed === false, "denied");
  assert(result.reason === "limit_reached", 'reason is "limit_reached"');
  assert(result.used === 5, "used is reported as the current count, unchanged");
  assert(result.remaining === 0, "remaining is 0");
  assert(db._store.get(`aiUsage/u-at-limit_${FIXED_BUCKET}`)?.["count"] === 5, "the stored count was NOT incremented");
});

await group("4. a user already over the limit (e.g. after a limit was lowered) is denied, without incrementing", async () => {
  const db = makeFakeFirestore();
  seedUsage(db, "u-over-limit", FIXED_BUCKET, 9);
  const result = await checkAndConsumeAiQuota({
    uid: "u-over-limit",
    owner: false,
    limit: 5,
    now: FIXED_NOW,
    getDb: () => db,
  });
  assert(result.allowed === false, "denied");
  assert(result.reason === "limit_reached", 'reason is "limit_reached"');
  assert(result.used === 9, "used reflects the actual (over-limit) stored count");
  assert(result.remaining === 0, "remaining is 0, never negative");
  assert(db._store.get(`aiUsage/u-over-limit_${FIXED_BUCKET}`)?.["count"] === 9, "the stored count was NOT incremented further");
});

await group("5. owner bypass: allowed with no Firestore access at all", async () => {
  let getDbCalled = false;
  const result = await checkAndConsumeAiQuota({
    uid: "u-owner",
    owner: true,
    limit: 5,
    now: FIXED_NOW,
    getDb: () => {
      getDbCalled = true;
      throw new Error("getDb must never be called for an owner — Firestore must not be touched at all");
    },
  });
  assert(result.allowed === true, "allowed");
  assert(result.reason === "owner_bypass", 'reason is "owner_bypass"');
  assert(!getDbCalled, "getDb() was never called — no Firestore read or write for an owner");
  assert(result.limit === Number.POSITIVE_INFINITY, "limit reported as unlimited");
  assert(result.remaining === Number.POSITIVE_INFINITY, "remaining reported as unlimited");
});

await group("6. Firestore/transaction failure fails closed — denied, never unlimited", async () => {
  await group("  6a. getDb() itself throwing (e.g. missing Admin credentials)", async () => {
    const result = await checkAndConsumeAiQuota({
      uid: "u-config-error",
      owner: false,
      limit: 5,
      now: FIXED_NOW,
      getDb: () => {
        throw new Error("Firebase Admin configuration error: missing required environment variable");
      },
    });
    assert(result.allowed === false, "denied");
    assert(result.reason === "quota_lookup_failed", 'reason is "quota_lookup_failed"');
    assert(result.remaining === 0, "remaining reported as 0, never unlimited");
  });

  await group("  6b. the transaction itself throwing", async () => {
    const db = makeFakeFirestore();
    const throwingDb = {
      ...db,
      runTransaction: async () => {
        throw new Error("simulated Firestore transaction failure");
      },
    } as unknown as Firestore;
    const result = await checkAndConsumeAiQuota({
      uid: "u-txn-error",
      owner: false,
      limit: 5,
      now: FIXED_NOW,
      getDb: () => throwingDb,
    });
    assert(result.allowed === false, "denied");
    assert(result.reason === "quota_lookup_failed", 'reason is "quota_lookup_failed"');
  });
});

await group("7. deterministic daily bucket, explicit UTC semantics", () => {
  assert(dailyBucketKeyUtc(new Date("2026-08-30T00:00:00.000Z")) === "2026-08-30", "UTC midnight");
  assert(dailyBucketKeyUtc(new Date("2026-08-30T23:59:59.999Z")) === "2026-08-30", "one millisecond before UTC midnight rollover");
  assert(dailyBucketKeyUtc(new Date("2026-08-31T00:00:00.000Z")) === "2026-08-31", "rolls over exactly at UTC midnight");

  // Same instant, computed two different ways, must bucket identically —
  // the function only ever looks at the UTC calendar date, never a local
  // timezone offset.
  const sameInstantA = new Date("2026-08-30T12:00:00.000Z");
  const sameInstantB = new Date(Date.UTC(2026, 7, 30, 12, 0, 0));
  assert(dailyBucketKeyUtc(sameInstantA) === dailyBucketKeyUtc(sameInstantB), "identical UTC instant buckets identically regardless of how the Date was constructed");

  // Two calls made a few real seconds apart on the same UTC day must land
  // in the same bucket (this is what makes repeat requests within a day
  // accumulate against one counter instead of a new one each time).
  const t1 = new Date("2026-08-30T09:00:00.000Z");
  const t2 = new Date("2026-08-30T21:59:59.000Z");
  assert(dailyBucketKeyUtc(t1) === dailyBucketKeyUtc(t2), "two times on the same UTC calendar day share one bucket");

  const reset = nextUtcMidnight(new Date("2026-08-30T15:30:00.000Z"));
  assert(reset.toISOString() === "2026-08-31T00:00:00.000Z", "resetAt is the next UTC midnight strictly after `now`");
});

await group("8. concurrency: two requests racing for the last remaining slot — exactly one is allowed", async () => {
  const db = makeFakeFirestore(15);
  seedUsage(db, "u-race", FIXED_BUCKET, 4); // limit 5 -> exactly one slot left

  const [resultA, resultB] = await Promise.all([
    checkAndConsumeAiQuota({ uid: "u-race", owner: false, limit: 5, now: FIXED_NOW, getDb: () => db }),
    checkAndConsumeAiQuota({ uid: "u-race", owner: false, limit: 5, now: FIXED_NOW, getDb: () => db }),
  ]);

  const allowedCount = [resultA, resultB].filter((r) => r.allowed).length;
  const deniedCount = [resultA, resultB].filter((r) => !r.allowed).length;

  assert(allowedCount === 1, "exactly one of the two concurrent requests was allowed");
  assert(deniedCount === 1, "exactly one of the two concurrent requests was denied");
  assert(
    db._store.get(`aiUsage/u-race_${FIXED_BUCKET}`)?.["count"] === 5,
    "the stored count ends at exactly 5 (incremented once, not twice, not zero times)",
  );
  assert(db._transactionCount() === 2, "both calls actually went through a transaction (the race was real, not skipped)");
});

await group("9. concurrency: many requests racing for a handful of remaining slots — successes never exceed the limit", async () => {
  const db = makeFakeFirestore(2);
  const limit = 5;
  seedUsage(db, "u-race-many", FIXED_BUCKET, limit - 2); // exactly 2 slots left

  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      checkAndConsumeAiQuota({ uid: "u-race-many", owner: false, limit, now: FIXED_NOW, getDb: () => db }),
    ),
  );

  const allowedCount = results.filter((r) => r.allowed).length;
  assert(allowedCount === 2, "exactly the 2 remaining slots were granted, out of 6 simultaneous requests");
  assert(
    db._store.get(`aiUsage/u-race-many_${FIXED_BUCKET}`)?.["count"] === limit,
    "the stored count ends exactly at the limit, never above it",
  );
});

await group("Sanity: the exported V1 Free-tier limit is the agreed 20 requests/day", () => {
  assert(AI_DAILY_REQUEST_LIMIT_FREE === 20, "AI_DAILY_REQUEST_LIMIT_FREE is exactly 20");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  aiQuota: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
