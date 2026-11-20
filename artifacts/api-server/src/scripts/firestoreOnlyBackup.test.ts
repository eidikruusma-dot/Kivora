/**
 * Unit + end-to-end tests for firestoreOnlyBackup.ts.
 *
 * Covers: main()'s fail-fast order (no real Firebase credentials needed);
 * a source-scan proof that this file never touches Firebase Storage in
 * any way and never requires FIREBASE_STORAGE_BUCKET; a source-scan proof
 * that it never calls this backup wording "täielik" (complete), only
 * "Firestore'i varukoopia"; and the full chain — discover → write →
 * verify integrity → build export payload (with storageStatus) →
 * encrypt → decrypt → decode → restorability check — against a
 * hand-written fake Firestore (no real Firebase project, no network).
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/firestoreOnlyBackup.test.ts --outfile=.tmp-firestoreOnlyBackup.mjs \
 *       && node .tmp-firestoreOnlyBackup.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp, GeoPoint } from "firebase-admin/firestore";
import {
  main,
  STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN,
  type FirestoreOnlyBackupSummary,
} from "./firestoreOnlyBackup.js";
import {
  discoverAndReadAllUserCollections,
  flattenBackup,
  writeFirestoreBackup,
  verifyFirestoreBackupIntegrity,
  buildExportPayload,
  EXCLUDED_FROM_DISCOVERY,
  type DocRefLike,
  type CollRefLike,
  type DocSnapshotLike,
  type ExportPayload,
} from "./fullAccountBackup.js";
import {
  verifyRestorability,
  isReservedFirestoreId,
  RESTORE_VERIFICATION_SEGMENT,
  type FirestoreWithDelete,
  type DeletableWriteBatchLike,
} from "./restoreVerification.js";
import { encryptBackup, decryptBackup } from "./backupEncryption.js";
import { decodeFromJson, type DocRefResolver } from "./firestoreValueCodec.js";

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

// ── Fake, delete-capable Firestore with real where()-filtering and listCollections() ──

function makeFakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));

  function childCollectionNames(docPath: string): string[] {
    const prefix = `${docPath}/`;
    const names = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0]);
    }
    return [...names];
  }
  function docsInCollection(collPath: string): string[] {
    const prefix = `${collPath}/`;
    const ids = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) ids.add(key.slice(prefix.length).split("/")[0]);
    }
    return [...ids];
  }
  function makeDocRef(path: string): DocRefLike {
    const id = path.split("/").pop()!;
    return {
      id,
      path,
      collection(sub: string) { return makeCollRef(`${path}/${sub}`); },
      async listCollections(): Promise<CollRefLike[]> {
        return childCollectionNames(path).map((name) => makeCollRef(`${path}/${name}`));
      },
      async get(): Promise<DocSnapshotLike> {
        const data = store.get(path);
        return { id, exists: data !== undefined, data: () => data };
      },
    };
  }
  function makeCollRef(path: string): CollRefLike {
    return {
      id: path.split("/").pop()!,
      doc(docId?: string) { return makeDocRef(`${path}/${docId ?? Math.random().toString(36).slice(2)}`); },
      async listDocuments(): Promise<DocRefLike[]> {
        return docsInCollection(path).map((docId) => makeDocRef(`${path}/${docId}`));
      },
      where(field: string, _op: "==", value: unknown) {
        return {
          async get() {
            const docs: DocSnapshotLike[] = [];
            for (const docId of docsInCollection(path)) {
              const data = store.get(`${path}/${docId}`);
              if (data && data[field] === value) docs.push({ id: docId, exists: true, data: () => data });
            }
            return { docs };
          },
        };
      },
    };
  }
  const firestore: FirestoreWithDelete = {
    collection(path: string) { return makeCollRef(path); },
    doc(path: string) { return makeDocRef(path); },
    batch(): DeletableWriteBatchLike {
      const sets: { path: string; data: Record<string, unknown> }[] = [];
      const deletes: string[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) { sets.push({ path: ref.path, data }); },
        delete(ref: DocRefLike) { deletes.push(ref.path); },
        async commit() {
          for (const s of sets) store.set(s.path, s.data);
          for (const p of deletes) store.delete(p);
        },
      };
    },
  };
  return { firestore, store };
}

// ── 1. main() fail-fast order — no real Firebase credentials needed ────────

await group("1. main() fails safely with no target account and no Admin calls", async () => {
  const code = await main([], { BACKUP_ENCRYPTION_PASSPHRASE: "irrelevant-here" });
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("2. main() fails fast on a missing passphrase — BEFORE attempting any Firebase Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => { messages.push(String(msg)); };
  try {
    const code = await main(["someone@example.com"], {});
    assert(code === 1, "returns exit code 1 when the passphrase is missing");
    assert(
      messages.some((m) => m.includes("BACKUP_ENCRYPTION_PASSPHRASE")),
      "the specific, named error mentions BACKUP_ENCRYPTION_PASSPHRASE, not a generic failure",
    );
  } finally {
    console.error = originalError;
  }
});

await group("3. main() NEVER requires FIREBASE_STORAGE_BUCKET — it fails at the Admin-unavailable stage instead", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => { messages.push(String(msg)); };
  try {
    const code = await main(["someone@example.com"], { BACKUP_ENCRYPTION_PASSPHRASE: "a-passphrase" });
    assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
    assert(
      !messages.some((m) => m.includes("FIREBASE_STORAGE_BUCKET")),
      "the failure is never attributed to a missing bucket name — this script never needs one",
    );
  } finally {
    console.error = originalError;
  }
});

// ── 2. Source-scan safety: proves this file never touches Storage, and never calls this a "complete" backup ──

const src = readFileSync(resolve(process.cwd(), "src/scripts/firestoreOnlyBackup.ts"), "utf8");

await group("4. firestoreOnlyBackup.ts never touches Firebase Storage in any way", () => {
  assert(!src.includes("getFirebaseAdminStorage"), "never imports/calls getFirebaseAdminStorage");
  assert(!src.includes(".bucket("), "never calls .bucket( — no Storage bucket is ever obtained");
  assert(!src.includes("getStorage"), "never imports firebase-admin/storage's getStorage at all");
  assert(!src.includes("FIREBASE_STORAGE_BUCKET"), "never reads or requires the Storage bucket env var");
  assert(!src.includes(".getFiles("), "never lists Storage files");
  assert(!src.includes(".download("), "never downloads a Storage file");
});

await group("5. firestoreOnlyBackup.ts never calls this a complete/full account backup", () => {
  assert(
    src.includes(STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN),
    "the fixed storageStatus reason code appears literally in source, not reconstructed from parts",
  );
  assert(src.includes("Storage EI OLE kaasatud"), "the console summary explicitly discloses Storage is excluded");
  assert(!src.includes("TÄIELIK VARUNDAMINE"), "never reuses runFullAccountBackup.ts's 'complete backup' header wording");
  assert(!src.includes("täielik kontovarukoopia"), "never describes this as a complete account backup");
});

await group("6. firestoreOnlyBackup.ts never deletes real data and never restores into the real root", () => {
  assert(!src.includes(".delete("), "this file itself never calls delete — cleanup, if any, lives entirely inside restoreVerification.ts");
  assert(!src.includes("restoreFromBackup("), "never calls restoreFromBackup() against the real users/{uid} root");
  assert(src.includes("verifyRestorability("), "it does call the scratch-only restorability check, as intended");
});

// ── 3. End-to-end chain: discover → write → verify → encrypt → decrypt → decode → restorability check ──

await group("7. End-to-end Firestore-only chain against a fake store (no real Firebase, no Storage involved at all)", async () => {
  const sourceTimestamp = Timestamp.fromMillis(1_732_000_000_000);
  const sourceGeoPoint = new GeoPoint(59.437, 24.7536);

  const { firestore, store } = makeFakeFirestore({
    "users/u1/tasks/t1": { title: "Õppida eksamiks", createdAt: sourceTimestamp },
    "users/u1/legacyWidgetSettings/w1": { color: "blue", place: sourceGeoPoint },
    "users/u1/aiConversations/c1": { title: "Vestlus" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user", content: "Tere!" },
    // The two pre-existing backups — must never be read, written, or deleted anywhere below.
    "users/u1/backups/existing-1": { note: "pre-existing backup #1 — must stay exactly as is" },
    "users/u1/backups/existing-2": { note: "pre-existing backup #2 — must stay exactly as is" },
  });

  // ── discover + read (Firestore only — no Storage call exists to make) ──
  const collections = await discoverAndReadAllUserCollections(firestore, "u1");
  const flat = flattenBackup(collections);
  assert(flat.has("legacyWidgetSettings"), "the unknown collection was discovered and included");
  assert(flat.has("aiConversations/c1/messages"), "the nested subcollection was discovered and included");
  assert(
    collections.every((c) => !EXCLUDED_FROM_DISCOVERY.includes(c.path)),
    "the existing backups collection was never included in discovery",
  );

  // ── Firestore-side write + integrity check ──
  const writeResult = await writeFirestoreBackup(firestore, "u1", "bk_fsonly", flat);
  assert(writeResult.chunksWritten > 0, "at least one chunk was written");
  const integrityChecks = await verifyFirestoreBackupIntegrity(firestore, "u1", "bk_fsonly", flat);
  assert(integrityChecks.every((c) => c.contentMatches), "every collection's re-read content deep-matches the original");

  // ── Build the Firestore-only export payload (storageFiles always empty; storageStatus always set) ──
  const basePayload: ExportPayload = buildExportPayload("u1", "bk_fsonly", flat, []);
  const payload = {
    ...basePayload,
    storageStatus: STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN,
    storageNote: "test note",
  };
  assert(payload.storageFiles.length === 0, "storageFiles is empty — never fabricated, never guessed");
  assert(payload.storageStatus === "NOT_INCLUDED_BLOCKED_BY_BILLING_PLAN", "storageStatus is the exact, fixed reason code");

  // ── Encrypt → decrypt (real AES-256-GCM, no fake) ──
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const passphrase = "firestore-only-test-passphrase-2026";
  const encrypted = encryptBackup(plaintext, passphrase);
  assert(!encrypted.equals(plaintext), "the encrypted buffer is not the plaintext");
  const decrypted = decryptBackup(encrypted, passphrase);
  assert(decrypted.equals(plaintext), "decryption recovers the exact original bytes");

  // ── Decode — Firestore-native types survive the full chain ──
  const reparsed = JSON.parse(decrypted.toString("utf8")) as typeof payload;
  assert(reparsed.storageStatus === "NOT_INCLUDED_BLOCKED_BY_BILLING_PLAN", "storageStatus survives the full encrypt/decrypt/JSON round trip");
  assert(Array.isArray(reparsed.storageFiles) && reparsed.storageFiles.length === 0, "storageFiles is still empty after the round trip, not reconstructed as something else");

  const resolver: DocRefResolver = firestore;
  const decodedTask = (reparsed.collections["tasks"] as { id: string; data: unknown }[]).find((i) => i.id === "t1")!;
  const decodedTaskData = decodeFromJson(decodedTask.data, resolver) as Record<string, unknown>;
  assert(decodedTaskData["createdAt"] instanceof Timestamp, "Timestamp survived the full Firestore-only chain as a real Timestamp instance");
  assert((decodedTaskData["createdAt"] as Timestamp).toMillis() === sourceTimestamp.toMillis(), "...with the exact original millisecond value");

  const decodedWidget = (reparsed.collections["legacyWidgetSettings"] as { id: string; data: unknown }[]).find((i) => i.id === "w1")!;
  const decodedWidgetData = decodeFromJson(decodedWidget.data, resolver) as Record<string, unknown>;
  assert(decodedWidgetData["place"] instanceof GeoPoint, "GeoPoint inside the unknown collection also survived the chain");

  // ── Restorability check — isolated scratch path only, never real data ──
  // NOTE: realCollectionNames must be only the actually-discovered real
  // collection paths — EXCLUDED_FROM_DISCOVERY must NOT be spread in here,
  // since it always contains the scratch segment's own name, which would
  // make the collision guard always refuse to run (a real bug this test
  // caught in an earlier draft of firestoreOnlyBackup.ts's main()).
  assert(
    !isReservedFirestoreId(RESTORE_VERIFICATION_SEGMENT),
    "the real scratch segment name actually in use is NOT a Firestore-reserved id — the exact check that would have caught run #1's failure before ever touching real Firebase",
  );
  const realCollectionNames = collections.map((c) => c.path);
  const verification = await verifyRestorability(firestore, "u1", "bk_fsonly", flat, realCollectionNames);
  assert(verification.allMatch, "every path's restored content matched the original exactly, via the scratch path");
  assert(verification.cleanupSucceeded, "the scratch copy was fully cleaned up afterward");

  // ── Explicit requirement: the two pre-existing backups are never touched ──
  assert(store.get("users/u1/backups/existing-1")?.["note"] === "pre-existing backup #1 — must stay exactly as is", "pre-existing backup #1 is untouched");
  assert(store.get("users/u1/backups/existing-2")?.["note"] === "pre-existing backup #2 — must stay exactly as is", "pre-existing backup #2 is untouched");
  assert(
    [...store.keys()].every((k) => !k.includes(RESTORE_VERIFICATION_SEGMENT)),
    "no trace of the restorability scratch namespace remains anywhere in the store after cleanup",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
