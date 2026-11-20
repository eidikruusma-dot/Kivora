/**
 * Unit tests for firestoreValueCodec.ts.
 *
 * Proves, with real firebase-admin Timestamp/GeoPoint/DocumentReference
 * instances and a real Node Buffer (no live Firebase project needed for
 * any of this — these are plain value classes, constructible offline),
 * that:
 *   1. sanitizeForFirestoreWrite() leaves every special type untouched
 *      while still stripping `undefined`.
 *   2. encodeForJson() + decodeFromJson() round-trip every special type
 *      exactly, including nested inside arrays and maps.
 *   3. The specific bug in the existing sanitizeForFirestore() (which this
 *      file deliberately does not reuse) is real — demonstrated here so a
 *      future reader doesn't have to take the doc comment's word for it.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/firestoreValueCodec.test.ts --outfile=.tmp-firestoreValueCodec.mjs \
 *       && node .tmp-firestoreValueCodec.mjs
 */

import { Timestamp, GeoPoint, DocumentReference, Firestore } from "firebase-admin/firestore";
import {
  sanitizeForFirestoreWrite,
  encodeForJson,
  decodeFromJson,
  isFirestoreSpecialValue,
  type DocRefResolver,
} from "./firestoreValueCodec.js";

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

// A minimal fake "DocumentReference" good enough for `instanceof` to fail
// against the real class but still exercise encode's generic-object path —
// not used directly; the real tests below construct real Timestamp/
// GeoPoint instances, which the Admin SDK allows offline.

const fakeDocResolver: DocRefResolver = {
  doc(path: string) {
    return { __fakeDocRef: true, path };
  },
};

await group("1. sanitizeForFirestoreWrite leaves special types untouched", () => {
  const ts = Timestamp.fromMillis(1_700_000_000_000);
  const gp = new GeoPoint(59.437, 24.7536);
  const buf = Buffer.from("hello kivora", "utf8");

  const input = {
    title: "test",
    createdAt: ts,
    location: gp,
    attachment: buf,
    dropped: undefined,
    nested: { also: undefined, kept: "yes", when: ts },
    list: [ts, gp, buf, undefined],
  };

  const out = sanitizeForFirestoreWrite(input) as Record<string, unknown>;

  assert(out["createdAt"] === ts, "Timestamp instance is returned as the exact same object, not rebuilt");
  assert(out["location"] === gp, "GeoPoint instance is preserved");
  assert(out["attachment"] === buf, "Buffer (Bytes) instance is preserved");
  assert(!("dropped" in out), "undefined top-level key is stripped");
  assert((out["nested"] as Record<string, unknown>)["when"] === ts, "Timestamp nested inside a map survives");
  assert(!("also" in (out["nested"] as Record<string, unknown>)), "undefined nested key is stripped");
  const list = out["list"] as unknown[];
  assert(list[0] === ts && list[1] === gp && list[2] === buf, "special types survive inside an array");
  assert(list.length === 4 && list[3] === undefined, "array elements are mapped positionally, not filtered (Firestore arrays can't have holes removed by position)");
});

await group("2. encodeForJson / decodeFromJson round-trip every special type", () => {
  const ts = new Timestamp(1_700_000_000, 123_000_000);
  const gp = new GeoPoint(59.437, 24.7536);
  const buf = Buffer.from([0x4b, 0x69, 0x76, 0x6f, 0x72, 0x61]); // "Kivora"
  // A real DocumentReference, constructed the same offline way the Admin
  // SDK's own tests do: Firestore's constructor and .doc() never make a
  // network call (the gRPC channel is created lazily, only on an actual
  // read/write) — no live project or credentials are needed just to get a
  // reference object with a `.path`.
  const offlineFirestore = new Firestore({ projectId: "test-project" });
  const ref: DocumentReference = offlineFirestore.doc("users/u1/documents/doc1");

  const original = {
    when: ts,
    where: gp,
    file: buf,
    linkedDoc: ref,
    history: [ts, { deep: { gp } }],
  };

  const encoded = encodeForJson(original);
  const json = JSON.stringify(encoded);
  const reparsed = JSON.parse(json);
  const decoded = decodeFromJson(reparsed, fakeDocResolver) as Record<string, unknown>;

  const decodedTs = decoded["when"] as Timestamp;
  assert(decodedTs instanceof Timestamp, "Timestamp is reconstructed as a real Timestamp instance");
  assert(decodedTs.seconds === ts.seconds && decodedTs.nanoseconds === ts.nanoseconds, "Timestamp seconds/nanoseconds survive exactly");

  const decodedGp = decoded["where"] as GeoPoint;
  assert(decodedGp instanceof GeoPoint, "GeoPoint is reconstructed as a real GeoPoint instance");
  assert(decodedGp.latitude === gp.latitude && decodedGp.longitude === gp.longitude, "GeoPoint lat/lng survive exactly");

  const decodedBuf = decoded["file"] as Buffer;
  assert(Buffer.isBuffer(decodedBuf), "Bytes round-trips as a real Buffer");
  assert(decodedBuf.equals(buf), "Buffer content is byte-for-byte identical");

  const decodedRef = decoded["linkedDoc"] as { path?: string };
  assert(decodedRef.path === "users/u1/documents/doc1", "DocumentReference round-trips to the same path via the resolver");

  const history = decoded["history"] as unknown[];
  assert(history[0] instanceof Timestamp, "Timestamp nested inside an array round-trips");
  assert(
    ((history[1] as Record<string, unknown>)["deep"] as Record<string, unknown>)["gp"] instanceof GeoPoint,
    "GeoPoint nested two levels deep inside a map round-trips",
  );
});

await group("3. encodeForJson strips undefined, matching Firestore's own contract", () => {
  const encoded = encodeForJson({ a: 1, b: undefined, c: [1, undefined, 3] }) as Record<string, unknown>;
  assert(!("b" in encoded), "undefined-valued key is dropped");
  assert((encoded["c"] as unknown[]).length === 3, "array length is preserved even with an undefined element");
});

await group("4. isFirestoreSpecialValue correctly identifies each type and rejects plain values", () => {
  assert(isFirestoreSpecialValue(Timestamp.now()), "Timestamp is special");
  assert(isFirestoreSpecialValue(new GeoPoint(0, 0)), "GeoPoint is special");
  assert(isFirestoreSpecialValue(Buffer.from("x")), "Buffer is special");
  assert(!isFirestoreSpecialValue({ seconds: 1, nanoseconds: 1 }), "a plain object shaped like a Timestamp is NOT special");
  assert(!isFirestoreSpecialValue("plain string"), "a plain string is not special");
  assert(!isFirestoreSpecialValue(null), "null is not special");
});

await group("5. demonstrates the real bug this file avoids (Object.entries on a Timestamp)", () => {
  const ts = Timestamp.now();
  // This mirrors exactly what sanitizeForFirestore() (firestoreUtils.ts)
  // does for any object: `typeof value === 'object'` is true for a
  // Timestamp, so it falls into the generic branch and is rebuilt from
  // Object.entries(ts). Verified directly (not assumed): a Timestamp's
  // seconds/nanoseconds live on own, enumerable, underscore-prefixed
  // fields (`_seconds`/`_nanoseconds`), so Object.entries() does NOT
  // return {} — it returns a PLAIN object carrying those two numbers
  // under the wrong (private-looking) key names. Written back to
  // Firestore, that plain object becomes a map field with two numbers,
  // never a real Timestamp again — breaking `instanceof Timestamp` checks
  // and Firestore's native timestamp ordering/queries for anyone who
  // reads it back. Same severity as data loss, different shape than a
  // naive reader might expect.
  const naiveRebuild: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ts)) naiveRebuild[k] = v;
  assert(
    !(naiveRebuild instanceof Timestamp) &&
      naiveRebuild["_seconds"] === ts.seconds &&
      naiveRebuild["_nanoseconds"] === ts.nanoseconds &&
      naiveRebuild["seconds"] === undefined,
    "confirmed: naively walking a Timestamp via Object.entries() (sanitizeForFirestore()'s approach) silently downgrades it to a plain {_seconds, _nanoseconds} object under the wrong key names, no longer a Timestamp at all — this is exactly why this codec exists",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
