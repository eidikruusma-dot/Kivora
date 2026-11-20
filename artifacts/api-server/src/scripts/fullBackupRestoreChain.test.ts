/**
 * fullBackupRestoreChain.test.ts — the explicit end-to-end chain test:
 *
 *   backup creation → encryption → decryption → data decoding →
 *   restoration simulation
 *
 * covering, in one connected run: an unknown (not-in-the-plan)
 * collection, a nested subcollection two levels deep, Firestore's special
 * value types (Timestamp/GeoPoint/Buffer) surviving the WHOLE chain (not
 * just the codec in isolation — firestoreValueCodec.test.ts already
 * covers that; this proves the same fidelity holds end to end through
 * JSON + encryption too), a push-subscription-shaped item whose data has
 * no `id` field (proving restoreFromBackup's id-handling fix actually
 * works in the full chain, not just in isolation), a Storage file's bytes
 * surviving the same round trip, and — the other explicit requirement —
 * that the two pre-existing backups are never read, written, or deleted
 * anywhere in this entire chain.
 *
 * Every step uses a hand-written fake (no real Firebase project, no
 * network) except the encryption step, which uses the real node:crypto
 * implementation in backupEncryption.ts — there is nothing to fake there.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/fullBackupRestoreChain.test.ts --outfile=.tmp-fullBackupRestoreChain.mjs \
 *       && node .tmp-fullBackupRestoreChain.mjs
 */

import { Timestamp, GeoPoint } from "firebase-admin/firestore";
import {
  discoverAndReadAllUserCollections,
  flattenBackup,
  buildExportPayload,
  downloadStorageFileForExport,
  deepEqualIgnoringKeyOrder,
  type FirestoreLike,
  type DocRefLike,
  type CollRefLike,
  type DocSnapshotLike,
  type BucketLike,
  type StorageFileLike,
  type ExportPayload,
} from "./fullAccountBackup.js";
import { restoreFromBackup } from "./restoreFromBackup.js";
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

// ── Fake Firestore (same design as the other test files in this tool) ────

function makeFakeFirestore(initial: Record<string, Record<string, unknown>>) {
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
  const firestore: FirestoreLike = {
    collection(path: string) { return makeCollRef(path); },
    doc(path: string) { return makeDocRef(path); },
    batch() {
      const pending: { path: string; data: Record<string, unknown> }[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) { pending.push({ path: ref.path, data }); },
        async commit() { for (const op of pending) store.set(op.path, op.data); },
      };
    },
  };
  return { firestore, store };
}

function makeFakeStorageFile(path: string, content: Buffer, md5: string): StorageFileLike {
  return {
    name: path,
    async getMetadata() { return [{ size: content.length, md5Hash: md5 }]; },
    async copy() { /* not exercised in this chain test */ },
    async download() { return [content]; },
  };
}

await group("End-to-end: create → encrypt → decrypt → decode → restore simulation", async () => {
  const sourceTimestamp = Timestamp.fromMillis(1_732_000_000_000);
  const sourceGeoPoint = new GeoPoint(59.437, 24.7536);

  const { firestore: sourceFirestore, store: sourceStore } = makeFakeFirestore({
    // Known collection.
    "users/u1/tasks/t1": { title: "Õppida eksamiks", createdAt: sourceTimestamp },
    // A collection NOT in the classification plan at all.
    "users/u1/legacyWidgetSettings/w1": { color: "blue", place: sourceGeoPoint },
    // Nested subcollection, two segments deep — must be found without being named anywhere.
    "users/u1/aiConversations/c1": { title: "Vestlus" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user", content: "Tere!" },
    // A push-subscription-shaped item: NO "id" field at all, only "subId" —
    // this is exactly the shape that broke the OLD restoreBackup(). Its
    // real Firestore document id ("ps1") is what restoreFromBackup must
    // use — never a field inside the data.
    "users/u1/pushSubscriptions/ps1": { subId: "ps1", endpoint: "https://push.example/abc" },
    // The two pre-existing backups — must never be touched anywhere below.
    "users/u1/backups/existing-1": { note: "pre-existing backup #1 — must stay exactly as is" },
    "users/u1/backups/existing-2": { note: "pre-existing backup #2 — must stay exactly as is" },
  });

  const storageFile = makeFakeStorageFile("users/u1/profile/avatar-1.jpg", Buffer.from("fake-jpeg-bytes-ü"), "md5-abc");
  const bucket: BucketLike = {
    async getFiles() { return [[storageFile]]; },
    file() { return storageFile; },
  };

  // ── Step 1: backup creation (discovery + read, Firestore + Storage) ──────
  const collections = await discoverAndReadAllUserCollections(sourceFirestore, "u1");
  const flat = flattenBackup(collections);
  const storageExport = await downloadStorageFileForExport(bucket, storageFile.name);

  assert(flat.has("legacyWidgetSettings"), "the unknown collection was discovered and included in the backup");
  assert(flat.has("aiConversations/c1/messages"), "the nested subcollection was discovered and included");
  assert(flat.get("pushSubscriptions")![0].id === "ps1", "the pushSubscriptions item's REAL document id (ps1) was captured, not guessed from its data");

  const payload: ExportPayload = buildExportPayload("u1", "bk_chain", flat, [
    { path: storageExport.path, content: storageExport.content, md5Hash: storageExport.md5Hash },
  ]);

  // ── Step 2: encryption ─────────────────────────────────────────────────
  const plaintextBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const passphrase = "correct-horse-battery-staple-2026";
  const encrypted = encryptBackup(plaintextBytes, passphrase);
  assert(!encrypted.equals(plaintextBytes), "the encrypted buffer is not the plaintext");

  // ── Step 3: decryption ─────────────────────────────────────────────────
  const decryptedBytes = decryptBackup(encrypted, passphrase);
  assert(decryptedBytes.equals(plaintextBytes), "decryption recovers the exact original bytes");

  // ── Step 4: data decoding ──────────────────────────────────────────────
  const reparsedPayload = JSON.parse(decryptedBytes.toString("utf8")) as ExportPayload;

  // The restore TARGET is a brand-new, separate fake Firestore — modeling
  // "a fresh environment with nothing in it yet" for the resolver +
  // simulation below. This is never the same object as sourceFirestore.
  const { firestore: targetFirestore, store: targetStore } = makeFakeFirestore({});
  const resolver: DocRefResolver = targetFirestore;

  const decodedFlat = new Map<string, { id: string; data: Record<string, unknown>; subcollections: Record<string, never> }[]>();
  for (const [path, items] of Object.entries(reparsedPayload.collections)) {
    decodedFlat.set(
      path,
      (items as { id: string; data: unknown }[]).map((item) => ({
        id: item.id,
        data: decodeFromJson(item.data, resolver) as Record<string, unknown>,
        subcollections: {},
      })),
    );
  }

  const decodedTask = decodedFlat.get("tasks")!.find((i) => i.id === "t1")!;
  assert(decodedTask.data["createdAt"] instanceof Timestamp, "Timestamp survived the full chain (JSON + AES-256-GCM) as a real Timestamp instance");
  assert((decodedTask.data["createdAt"] as Timestamp).toMillis() === sourceTimestamp.toMillis(), "...with the exact original millisecond value");

  const decodedWidget = decodedFlat.get("legacyWidgetSettings")!.find((i) => i.id === "w1")!;
  assert(decodedWidget.data["place"] instanceof GeoPoint, "GeoPoint inside the UNKNOWN collection also survived the full chain");
  assert((decodedWidget.data["place"] as GeoPoint).latitude === sourceGeoPoint.latitude, "...with the exact original coordinates");

  const decodedStorageFile = reparsedPayload.storageFiles[0];
  assert(
    Buffer.from(decodedStorageFile.base64, "base64").equals(storageExport.content),
    "the Storage file's bytes survived the full chain byte-for-byte",
  );

  // ── Step 5: restoration simulation (into the separate target, never the source) ──
  const restoreResult = await restoreFromBackup(targetFirestore, "users/u1", decodedFlat);
  assert(restoreResult.pathsWritten.includes("aiConversations/c1/messages"), "the nested path was restored");
  assert(restoreResult.pathsWritten.includes("legacyWidgetSettings"), "the previously-unknown collection was restored too — it was never silently dropped for being unrecognized");

  assert(targetStore.get("users/u1/tasks/t1")?.["title"] === "Õppida eksamiks", "restored task content matches the original");
  assert(
    deepEqualIgnoringKeyOrder(
      targetStore.get("users/u1/aiConversations/c1/messages/m1"),
      sourceStore.get("users/u1/aiConversations/c1/messages/m1"),
    ),
    "the nested message document restored with identical content to the original",
  );
  assert(
    targetStore.get("users/u1/pushSubscriptions/ps1")?.["subId"] === "ps1",
    "the pushSubscriptions item restored to the correct document id (ps1) despite having no 'id' field in its data — the exact case that broke the old restoreBackup()",
  );

  // ── Explicit requirement: the two pre-existing backups are never touched ──
  assert(sourceStore.get("users/u1/backups/existing-1")?.["note"] === "pre-existing backup #1 — must stay exactly as is", "pre-existing backup #1 is untouched in the SOURCE store");
  assert(sourceStore.get("users/u1/backups/existing-2")?.["note"] === "pre-existing backup #2 — must stay exactly as is", "pre-existing backup #2 is untouched in the SOURCE store");
  assert(!targetStore.has("users/u1/backups/existing-1"), "the existing backups were never copied into the restore target either");
  assert(
    [...targetStore.keys()].every((k) => !k.startsWith("users/u1/backups/")),
    "nothing under the existing backups collection exists in the restore target at all — restoration never touches it in either direction",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
