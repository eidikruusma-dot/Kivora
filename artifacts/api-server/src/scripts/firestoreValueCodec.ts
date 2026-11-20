/**
 * firestoreValueCodec.ts — type-preserving handling of Firestore's special
 * value types for the Kivora full-account-backup tool.
 *
 * ── The bug this file exists to avoid ───────────────────────────────────
 * planner-app/src/lib/firestoreUtils.ts's sanitizeForFirestore() — used
 * throughout the live app, including the existing backupService.ts — walks
 * every object via `typeof value === 'object'` + `Object.entries(value)`,
 * with no exemption for Firestore's class-instance value types:
 * `Timestamp`, `GeoPoint`, `DocumentReference`, and `Buffer` (the Admin
 * SDK's representation of a Bytes field). Each of these keeps its real
 * data behind getters or internal fields, not plain enumerable own
 * properties, so `Object.entries()` on one returns `{}` or a broken,
 * meaningless shape — sanitizeForFirestore() would silently destroy any of
 * these values, not preserve them. This is a real, present risk, not a
 * hypothetical one: planner-app's userProfile.ts and profilePhoto.ts both
 * write `createdAt`/`updatedAt` via `serverTimestamp()`, which Firestore
 * resolves into a real `Timestamp` on read — so `users/{uid}` documents
 * already contain at least one of these types today.
 *
 * This file is this backup tool's own, deliberately separate replacement.
 * It does not modify or fix sanitizeForFirestore() itself — that function,
 * and every other write path in the live app that uses it, is unaffected
 * by anything here (see "Ära muuda olemasoleva Kivora rakenduse toimimist"
 * — this backup tool must not change the running app's behavior).
 *
 * ── Two separate needs ───────────────────────────────────────────────────
 * 1. sanitizeForFirestoreWrite(): for writing a backup copy straight back
 *    into Firestore via the Admin SDK — values stay as real Timestamp/
 *    GeoPoint/DocumentReference/Buffer instances; Firestore's own SDK
 *    serializes those correctly over the wire. The only transformation
 *    this applies is stripping `undefined`-valued keys (a genuine
 *    Firestore requirement — it rejects `undefined` outright — not a
 *    content change), recursing into plain objects/arrays only.
 * 2. encodeForJson() / decodeFromJson(): for the GitHub Actions artifact
 *    export, which must end up as a flat, encryptable byte stream (JSON).
 *    Plain `JSON.stringify`/`JSON.parse` cannot round-trip these types at
 *    all, so each one is tagged with an explicit `__firestoreType` marker
 *    before serializing, and reconstructed from that marker on the way
 *    back in. decodeFromJson() needs a Firestore instance only to resolve
 *    a `docref` marker back into a real DocumentReference (`firestore.doc(path)`).
 */

import { Timestamp, GeoPoint, DocumentReference, type Firestore } from "firebase-admin/firestore";

// ── Type detection ───────────────────────────────────────────────────────

export function isFirestoreSpecialValue(value: unknown): boolean {
  return (
    value instanceof Timestamp ||
    value instanceof GeoPoint ||
    value instanceof DocumentReference ||
    Buffer.isBuffer(value)
  );
}

// ── 1. Safe write-path sanitizer (Firestore-native output) ──────────────

/**
 * Recursively strips `undefined`-valued keys while leaving every
 * Firestore special value type completely untouched — see the file-level
 * comment for why this must not reuse sanitizeForFirestore().
 */
export function sanitizeForFirestoreWrite(value: unknown): unknown {
  if (isFirestoreSpecialValue(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestoreWrite);
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[key] = sanitizeForFirestoreWrite(v);
      }
    }
    return cleaned;
  }
  return value;
}

// ── 2. JSON-safe encode/decode (for the encrypted artifact export) ──────

interface EncodedTimestamp {
  __firestoreType: "timestamp";
  seconds: number;
  nanoseconds: number;
}
interface EncodedGeoPoint {
  __firestoreType: "geopoint";
  latitude: number;
  longitude: number;
}
interface EncodedDocRef {
  __firestoreType: "docref";
  path: string;
}
interface EncodedBytes {
  __firestoreType: "bytes";
  base64: string;
}

/**
 * Converts a value read from Firestore into a plain-JSON-safe shape,
 * tagging each special type so decodeFromJson() can reconstruct it
 * exactly. Recurses into arrays and plain objects (Firestore allows these
 * special types nested inside map/array fields, not only at the top
 * level of a document). `undefined` keys are dropped, matching Firestore's
 * own behavior (a value Firestore itself never returns), not a content
 * change on our part.
 */
export function encodeForJson(value: unknown): unknown {
  if (value instanceof Timestamp) {
    const encoded: EncodedTimestamp = {
      __firestoreType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
    return encoded;
  }
  if (value instanceof GeoPoint) {
    const encoded: EncodedGeoPoint = {
      __firestoreType: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
    return encoded;
  }
  if (value instanceof DocumentReference) {
    const encoded: EncodedDocRef = { __firestoreType: "docref", path: value.path };
    return encoded;
  }
  if (Buffer.isBuffer(value)) {
    const encoded: EncodedBytes = { __firestoreType: "bytes", base64: value.toString("base64") };
    return encoded;
  }
  if (Array.isArray(value)) {
    return value.map(encodeForJson);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[key] = encodeForJson(v);
    }
    return out;
  }
  return value;
}

/** The subset of Firestore needed to resolve a `docref` marker back into a real reference. */
export interface DocRefResolver {
  doc(path: string): unknown;
}

/**
 * Reverses encodeForJson() exactly: walks the same shape and reconstructs
 * real Timestamp/GeoPoint/DocumentReference/Buffer instances wherever a
 * `__firestoreType` marker is found, at any depth.
 */
export function decodeFromJson(value: unknown, resolver: DocRefResolver): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => decodeFromJson(v, resolver));
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const tag = obj["__firestoreType"];
    if (tag === "timestamp") {
      return new Timestamp(obj["seconds"] as number, obj["nanoseconds"] as number);
    }
    if (tag === "geopoint") {
      return new GeoPoint(obj["latitude"] as number, obj["longitude"] as number);
    }
    if (tag === "docref") {
      return resolver.doc(obj["path"] as string);
    }
    if (tag === "bytes") {
      return Buffer.from(obj["base64"] as string, "base64");
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      out[key] = decodeFromJson(v, resolver);
    }
    return out;
  }
  return value;
}

/** Narrows the real firebase-admin Firestore type down to DocRefResolver for callers that already have one. */
export function asDocRefResolver(firestore: Pick<Firestore, "doc">): DocRefResolver {
  return firestore;
}
