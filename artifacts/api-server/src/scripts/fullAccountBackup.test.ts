/**
 * Unit tests for fullAccountBackup.ts.
 *
 * No real Firebase credentials/network are used. Firestore is a
 * hand-written in-memory fake (flat Map keyed by full document path) that
 * supports arbitrary-depth listCollections()/listDocuments() by scanning
 * its own keys — good enough to prove the RECURSIVE discovery logic finds
 * unknown and nested collections without being told about them in
 * advance. The fake's WriteBatchLike has no delete method at all, so this
 * file's "never deletes anything" guarantee is also checked structurally
 * (see test 8) and would fail to even compile against the fake if a
 * delete call were ever added here.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/fullAccountBackup.test.ts --outfile=.tmp-fullAccountBackup.mjs \
 *       && node .tmp-fullAccountBackup.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import {
  readDocumentRecursively,
  classifyCollection,
  discoverAndReadAllUserCollections,
  EXCLUDED_FROM_DISCOVERY,
  readRootCollections,
  flattenBackup,
  sanitizePathAsDocId,
  copyStorageFileWithVerification,
  downloadStorageFileForExport,
  storagePrefixesFor,
  writeFirestoreBackup,
  verifyFirestoreBackupIntegrity,
  buildExportPayload,
  deepEqualIgnoringKeyOrder,
  type FirestoreLike,
  type DocRefLike,
  type CollRefLike,
  type DocSnapshotLike,
  type BucketLike,
  type StorageFileLike,
} from "./fullAccountBackup.js";

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

// ── Fake Firestore: flat Map<fullDocPath, data>, arbitrary depth ───────────

function makeFakeFirestore(initial: Record<string, Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const commits: { path: string; data: Record<string, unknown> }[] = [];

  function childCollectionNames(docPath: string): string[] {
    const prefix = `${docPath}/`;
    const names = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const firstSegment = rest.split("/")[0];
        if (firstSegment) names.add(firstSegment);
      }
    }
    return [...names];
  }

  function docsInCollection(collPath: string): string[] {
    const prefix = `${collPath}/`;
    const ids = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const firstSegment = rest.split("/")[0];
        if (firstSegment) ids.add(firstSegment);
      }
    }
    return [...ids];
  }

  function makeDocRef(path: string): DocRefLike {
    const id = path.split("/").pop()!;
    return {
      id,
      path,
      collection(sub: string) {
        return makeCollRef(`${path}/${sub}`);
      },
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
    const id = path.split("/").pop()!;
    return {
      id,
      doc(docId?: string) {
        return makeDocRef(`${path}/${docId ?? Math.random().toString(36).slice(2)}`);
      },
      async listDocuments(): Promise<DocRefLike[]> {
        return docsInCollection(path).map((docId) => makeDocRef(`${path}/${docId}`));
      },
      where(field: string, _op: "==", value: unknown) {
        return {
          async get() {
            const docIds = docsInCollection(path);
            const docs: DocSnapshotLike[] = [];
            for (const docId of docIds) {
              const data = store.get(`${path}/${docId}`);
              if (data && data[field] === value) {
                docs.push({ id: docId, exists: true, data: () => data });
              }
            }
            return { docs };
          },
        };
      },
    };
  }

  const firestore: FirestoreLike = {
    collection(path: string) {
      return makeCollRef(path);
    },
    doc(path: string) {
      return makeDocRef(path);
    },
    batch() {
      const pending: { path: string; data: Record<string, unknown> }[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) {
          pending.push({ path: ref.path, data });
        },
        async commit() {
          for (const op of pending) {
            store.set(op.path, op.data);
            commits.push(op);
          }
        },
      };
    },
  };

  return { firestore, store, commits };
}

// ── 1. Recursive discovery finds unknown AND nested collections ───────────

await group("1. discoverAndReadAllUserCollections finds known, unknown, and nested collections", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/tasks/t1": { id: "t1", title: "known collection" },
    "users/u1/aLegacyThingNobodyDocumented/x1": { note: "totally unknown collection" },
    "users/u1/aiConversations/c1": { title: "chat" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user", content: "hei" },
    "users/u1/aiConversations/c1/messages/m2": { role: "assistant", content: "tere" },
  });

  const collections = await discoverAndReadAllUserCollections(firestore, "u1");

  const tasks = collections.find((c) => c.path === "tasks");
  assert(tasks !== undefined && tasks.classification === "DELETE_CANDIDATE", "a known collection (tasks) is classified from the existing plan");

  const unknown = collections.find((c) => c.path === "aLegacyThingNobodyDocumented");
  assert(unknown !== undefined && unknown.classification === "UNKNOWN", "a collection NOT in the plan is still discovered and found, classified UNKNOWN — never silently skipped");

  const convs = collections.find((c) => c.path === "aiConversations");
  assert(convs !== undefined, "aiConversations itself is found");
  const conv1 = convs!.documents.find((d) => d.id === "c1");
  assert(conv1 !== undefined, "the conversation document itself is read");
  assert(
    (conv1!.subcollections["messages"] ?? []).length === 2,
    "the nested messages subcollection is found recursively, without being named anywhere in the plan",
  );
});

// ── 2. readDocumentRecursively handles multiple levels of nesting ─────────

await group("2. readDocumentRecursively finds subcollections at arbitrary depth", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/a/doc1": { level: 1 },
    "users/u1/a/doc1/b/doc2": { level: 2 },
    "users/u1/a/doc1/b/doc2/c/doc3": { level: 3 },
  });
  const ref = firestore.doc("users/u1/a/doc1");
  const result = await readDocumentRecursively(ref);
  assert(result.data["level"] === 1, "top document's own data is read");
  const level2 = result.subcollections["b"]?.[0];
  assert(level2?.data["level"] === 2, "one level of nesting is found");
  const level3 = level2?.subcollections["c"]?.[0];
  assert(level3?.data["level"] === 3, "two levels of nesting are found — this is genuinely recursive, not hardcoded to one depth");
});

await group("2b. discoverAndReadAllUserCollections never includes the existing backups collection or this tool's own namespaces", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/tasks/t1": { title: "normal" },
    "users/u1/backups/existing-1": { note: "pre-existing backup — must never be discovered as backupable data" },
    "users/u1/_fullBackups/bk_old/chunks/x_0": { path: "tasks", items: [] },
    "users/u1/__restoreVerification__/bk_old/tasks/scratch1": { leftover: true },
  });
  const collections = await discoverAndReadAllUserCollections(firestore, "u1");
  const paths = collections.map((c) => c.path);
  for (const excluded of EXCLUDED_FROM_DISCOVERY) {
    assert(!paths.includes(excluded), `"${excluded}" is never included in discovery, by deliberate exclusion`);
  }
  assert(paths.includes("tasks"), "a normal collection alongside them is still discovered correctly");
});

// ── 3. classifyCollection ────────────────────────────────────────────────

await group("3. classifyCollection", () => {
  assert(classifyCollection("transactions") === "NEEDS_CONFIRMATION", "Money collections are classified NEEDS_CONFIRMATION");
  assert(classifyCollection("settings") === "KEEP", "settings is classified KEEP");
  assert(classifyCollection("somethingNew") === "UNKNOWN", "an unrecognized name is UNKNOWN, never guessed as safe");
});

// ── 4. readRootCollections scopes by uid/senderEmail ───────────────────────

await group("4. readRootCollections reads only this account's rows from the public collections", async () => {
  const { firestore } = makeFakeFirestore({
    "supportMessages/s1": { uid: "u1", message: "help" },
    "supportMessages/s2": { uid: "other", message: "not mine" },
    "contactSubmissions/c1": { uid: null, senderEmail: "me@example.com", message: "hi" },
    "contactSubmissions/c2": { uid: null, senderEmail: "someone-else@example.com", message: "hi" },
    "feedbackSubmissions/f1": { uid: "u1", message: "feedback" },
  });
  const result = await readRootCollections(firestore, "u1", "me@example.com");
  const support = result.find((r) => r.path === "supportMessages")!;
  assert(support.documents.length === 1 && support.documents[0].id === "s1", "supportMessages scoped by uid picks only this account's row");
  const contact = result.find((r) => r.path === "contactSubmissions")!;
  assert(contact.documents.length === 1 && contact.documents[0].id === "c1", "contactSubmissions scoped by senderEmail (never uid) picks only this account's row");
});

// ── 5. flattenBackup + sanitizePathAsDocId ─────────────────────────────────

await group("5. flattenBackup produces one entry per collection AND per nested subcollection path", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "chat" },
    "users/u1/aiConversations/c1/messages/m1": { content: "hi" },
  });
  const collections = await discoverAndReadAllUserCollections(firestore, "u1");
  const flat = flattenBackup(collections);
  assert(flat.has("aiConversations"), "top-level path is present");
  assert(flat.has("aiConversations/c1/messages"), "nested path is its own distinct flattened entry");
  assert(flat.get("aiConversations/c1/messages")![0].id === "m1", "nested entry carries the real document id");

  assert(sanitizePathAsDocId("aiConversations/c1/messages") === "aiConversations__c1__messages", "path-to-docId mapping replaces every slash");
});

// ── 6. Firestore-side write + integrity check (count, content, AND type) ──

await group("6. writeFirestoreBackup + verifyFirestoreBackupIntegrity: content and Firestore-native types survive the round trip", async () => {
  const { firestore } = makeFakeFirestore({});
  const ts = Timestamp.now();
  const flat = new Map([
    ["tasks", [
      { id: "t1", data: { title: "Õppida", createdAt: ts }, subcollections: {} },
      { id: "t2", data: { title: "Puhata" }, subcollections: {} },
    ]],
  ]);

  const writeResult = await writeFirestoreBackup(firestore, "u1", "bk_test", flat);
  assert(writeResult.itemCounts["tasks"] === 2, "metadata records the correct item count per collection");

  const checks = await verifyFirestoreBackupIntegrity(firestore, "u1", "bk_test", flat);
  const tasksCheck = checks.find((c) => c.path === "tasks")!;
  assert(tasksCheck.expectedCount === 2 && tasksCheck.actualCount === 2, "re-read count matches what was written");
  assert(tasksCheck.contentMatches, "re-read CONTENT deep-matches the original — not just a count");

  // Prove the Timestamp specifically survived as a real Timestamp, not a
  // plain {_seconds,_nanoseconds} object (the sanitizeForFirestore() bug
  // this tool avoids) — read the chunk back out directly.
  const chunkDocs = await firestore.collection("users/u1/_fullBackups/bk_test/chunks").where("path", "==", "tasks").get();
  const rebuiltItems = (chunkDocs.docs[0].data() as { items: { id: string; data: Record<string, unknown> }[] }).items;
  const t1 = rebuiltItems.find((i) => i.id === "t1")!;
  assert(t1.data["createdAt"] instanceof Timestamp, "the Timestamp field is still a real Timestamp instance after being written and read back — sanitizeForFirestoreWrite(), not sanitizeForFirestore(), was used");
});

await group("7. writeFirestoreBackup never touches the existing users/{uid}/backups collection", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1/backups/existing-1": { note: "one of the two pre-existing backups" },
  });
  const flat = new Map([["tasks", [{ id: "t1", data: { title: "x" }, subcollections: {} }]]]);
  await writeFirestoreBackup(firestore, "u1", "bk_new", flat);
  assert(store.has("users/u1/backups/existing-1"), "the pre-existing backup document is completely untouched");
  assert(!store.has("users/u1/backups/bk_new"), "the new backup is never written into the old backups collection");
  assert(store.has("users/u1/_fullBackups/bk_new"), "the new backup goes into the separate _fullBackups collection instead");
});

// ── 8. Structural safety: this file never deletes, never touches /backups ─

await group("8. fullAccountBackup.ts source contains no delete call and never references the existing backups collection", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/fullAccountBackup.ts"), "utf8");
  assert(!src.includes(".delete("), "source contains no .delete( call anywhere");
  assert(!src.includes("/backups`") && !src.includes("'/backups'") && !src.includes('"/backups"'), "source never references the existing users/{uid}/backups collection path");
  assert(src.includes("_fullBackups"), "source does target its own, separate _fullBackups collection");
});

// ── 9. Storage: checksum-verified copy, and byte-accurate export download ─

function makeFakeStorageFile(name: string, content: Buffer, md5: string): StorageFileLike {
  let copiedTo: string | null = null;
  const file: StorageFileLike = {
    name,
    async getMetadata() {
      return [{ size: content.length, md5Hash: copiedTo ? md5 : md5 }];
    },
    async copy(destination: string) {
      copiedTo = destination;
    },
    async download() {
      return [content];
    },
  };
  return file;
}

await group("9. copyStorageFileWithVerification confirms matching checksums after a copy", async () => {
  const content = Buffer.from("fake jpeg bytes");
  const file = makeFakeStorageFile("users/u1/profile/avatar-1.jpg", content, "abc123==");
  const bucket: BucketLike = {
    async getFiles() {
      return [[file]];
    },
    file(path: string) {
      return path === file.name ? file : makeFakeStorageFile(path, content, "abc123==");
    },
  };
  const result = await copyStorageFileWithVerification(bucket, file.name, "users/u1/_fullBackup/bk1/profile/avatar-1.jpg");
  assert(result.checksumsMatch, "source and destination md5Hash match after copy");
  assert(result.sizeBytes === content.length, "size is read from the source file's own metadata");
});

await group("10. copyStorageFileWithVerification flags a checksum mismatch rather than reporting success", async () => {
  const content = Buffer.from("original");
  const sourceFile = makeFakeStorageFile("users/u1/documents/d1/file.pdf", content, "same-hash");
  const corruptedDestFile = makeFakeStorageFile("users/u1/_fullBackup/bk1/documents/d1/file.pdf", content, "different-hash");
  const bucket: BucketLike = {
    async getFiles() {
      return [[sourceFile]];
    },
    file(path: string) {
      return path === sourceFile.name ? sourceFile : corruptedDestFile;
    },
  };
  const result = await copyStorageFileWithVerification(bucket, sourceFile.name, "users/u1/_fullBackup/bk1/documents/d1/file.pdf");
  assert(!result.checksumsMatch, "a checksum mismatch between source and destination is reported, not silently treated as success");
});

await group("11. downloadStorageFileForExport returns the exact original bytes, for the independent artifact", async () => {
  const content = Buffer.from("exact bytes for the encrypted export");
  const file = makeFakeStorageFile("users/u1/profile/avatar-1.jpg", content, "hash1");
  const bucket: BucketLike = {
    async getFiles() {
      return [[file]];
    },
    file() {
      return file;
    },
  };
  const result = await downloadStorageFileForExport(bucket, file.name);
  assert(result.content.equals(content), "downloaded content is byte-for-byte identical to the source");
});

await group("12. storagePrefixesFor lists exactly the two prefixes the app ever uploads to", () => {
  const prefixes = storagePrefixesFor("u1").map((p) => p.prefix);
  assert(prefixes.includes("users/u1/profile/") && prefixes.includes("users/u1/documents/") && prefixes.length === 2, "exactly profile and documents, nothing invented");
});

// ── 13. buildExportPayload encodes special types and embeds Storage bytes ─

await group("13. buildExportPayload produces a JSON-safe structure with Storage files embedded as base64", () => {
  const ts = Timestamp.now();
  const flat = new Map([["tasks", [{ id: "t1", data: { title: "x", createdAt: ts }, subcollections: {} }]]]);
  const storageFiles = [{ path: "users/u1/profile/avatar-1.jpg", content: Buffer.from("imgbytes"), md5Hash: "h1" }];
  const payload = buildExportPayload("u1", "bk1", flat, storageFiles);

  // Must survive an actual JSON.stringify/parse round trip without throwing.
  const roundTripped = JSON.parse(JSON.stringify(payload));
  assert(roundTripped.uid === "u1", "payload survives JSON serialization");
  assert(roundTripped.storageFiles[0].base64 === Buffer.from("imgbytes").toString("base64"), "Storage file content is embedded as base64");
  const encodedTask = roundTripped.collections["tasks"][0];
  assert(encodedTask.data.createdAt.__firestoreType === "timestamp", "Timestamp is tagged, not silently dropped, inside the export payload");
});

// ── 14. deepEqualIgnoringKeyOrder ───────────────────────────────────────────

await group("14. deepEqualIgnoringKeyOrder", () => {
  assert(deepEqualIgnoringKeyOrder({ a: 1, b: 2 }, { b: 2, a: 1 }), "same keys in different order are equal");
  assert(!deepEqualIgnoringKeyOrder({ a: 1 }, { a: 1, b: 2 }), "an extra key makes it unequal");
  assert(deepEqualIgnoringKeyOrder([1, [2, 3]], [1, [2, 3]]), "nested arrays compare correctly");
  assert(!deepEqualIgnoringKeyOrder([1, 2], [2, 1]), "array order matters");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
