/**
 * fullAccountBackup.ts — core logic for the Kivora full-account-backup
 * tool (see the "Kivora andmete puhastamisplaan" and subsequent backup
 * planning turns for the full design discussion this implements).
 *
 * ── What this backs up ───────────────────────────────────────────────────
 * Every users/{uid} subcollection, discovered RECURSIVELY via Firestore
 * Admin's own listCollections() — never only the pre-built
 * SIMPLE_SUBCOLLECTION_PLAN/ROOT_COLLECTION_PLAN list from
 * dataCleanupDryRun.ts (reused here only to CLASSIFY a collection once
 * found, not to decide what exists). A collection discovered that isn't
 * in that list is still backed up — just labeled "UNKNOWN" rather than
 * guessed at. The same recursion applies to every document, at every
 * depth, so an unanticipated nested subcollection (e.g. a legacy
 * aiConversations/{id}/messages left over from an earlier data model) is
 * found and backed up without needing to be named in advance.
 *
 * Plus the three public root-level collections (contactSubmissions/
 * supportMessages/feedbackSubmissions), scoped to this account exactly as
 * dataCleanupDryRun.ts already does (uid for two of them, senderEmail for
 * contactSubmissions, which never carries a uid).
 *
 * ── Two independent destinations ─────────────────────────────────────────
 * 1. A Firestore-side copy, written under users/{uid}/_fullBackups/{id}/
 *    chunks/{...} — deliberately not the existing, separate backups
 *    collection the Settings → Varundus page already shows (see
 *    fullAccountBackup.test.ts's source-scan test: this file never
 *    references that existing collection's path at all), so it never
 *    appears in that list and never touches the two existing backups
 *    there. Written via sanitizeForFirestoreWrite()
 *    (firestoreValueCodec.ts), never the existing (type-unsafe)
 *    sanitizeForFirestore() — Timestamp/GeoPoint/DocumentReference/Bytes
 *    values stay as their real Firestore types, not downgraded to plain
 *    objects.
 * 2. An encryptable, independent export (buildExportPayload() below) —
 *    everything Firestore-side PLUS copied Storage file bytes, as one
 *    JSON-safe structure (via encodeForJson()) ready for
 *    backupEncryption.ts to encrypt and for a GitHub Actions artifact
 *    upload — see runFullAccountBackup.ts. This is the destination that
 *    survives even a Firestore-wide mistake, because it never has to live
 *    inside the Firestore project being protected.
 *
 * Both must succeed for the overall backup to count as successful — see
 * BackupOutcome.overallSuccess.
 *
 * ── What this file NEVER does ───────────────────────────────────────────
 * Never deletes anything. Never references the existing users/{uid}/
 * backups collection (the two backups there are left completely alone).
 * Never calls sanitizeForFirestore() (the type-unsafe existing helper).
 * Does not change any existing store, route, or UI behavior — this is a
 * new, standalone script, not a modification to backupService.ts or any
 * other file the running app uses.
 */

import {
  sanitizeForFirestoreWrite,
  encodeForJson,
  type DocRefResolver,
} from "./firestoreValueCodec.js";
import {
  SIMPLE_SUBCOLLECTION_PLAN,
  ROOT_COLLECTION_PLAN,
  type Classification,
  type RootCollectionPlanEntry,
} from "./dataCleanupDryRun.js";

// ── Narrow, structural interfaces (Firestore + Storage) ────────────────────
//
// Same philosophy as dataCleanupDryRun.ts: list only the methods this file
// actually calls, so a real Admin SDK instance satisfies these
// automatically, and a hand-written fake with no delete method on it is a
// structural guarantee this code cannot call one.

export interface DocSnapshotLike {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRefLike {
  id: string;
  path: string;
  collection(path: string): CollRefLike;
  listCollections(): Promise<CollRefLike[]>;
  get(): Promise<DocSnapshotLike>;
}

export interface CollRefLike {
  id: string;
  doc(id?: string): DocRefLike;
  listDocuments(): Promise<DocRefLike[]>;
  where(field: string, op: "==", value: unknown): { get(): Promise<{ docs: DocSnapshotLike[] }> };
}

export interface WriteBatchLike {
  set(ref: DocRefLike, data: Record<string, unknown>): void;
  /** Real Admin SDK WriteBatch.commit() resolves to WriteResult[]; nothing here ever reads that value. */
  commit(): Promise<unknown>;
}

export interface FirestoreLike extends DocRefResolver {
  collection(path: string): CollRefLike;
  doc(path: string): DocRefLike;
  batch(): WriteBatchLike;
}

export interface StorageFileLike {
  name: string;
  getMetadata(): Promise<[{ size?: string | number; md5Hash?: string }, ...unknown[]]>;
  copy(destination: string): Promise<unknown>;
  download(): Promise<[Buffer]>;
}

export interface BucketLike {
  getFiles(opts: { prefix: string }): Promise<[StorageFileLike[], ...unknown[]]>;
  file(path: string): StorageFileLike;
}

export interface StorageLike {
  bucket(name?: string): BucketLike;
}

// ── Recursive document/collection reading ───────────────────────────────────

export interface BackedUpDocument {
  id: string;
  data: Record<string, unknown>;
  /** Keyed by subcollection name; empty object if none were found. */
  subcollections: Record<string, BackedUpDocument[]>;
}

export interface BackedUpCollection {
  /** Path relative to users/{uid}, e.g. "tasks" — never includes "users/{uid}/" itself. */
  path: string;
  classification: Classification | "UNKNOWN";
  documents: BackedUpDocument[];
}

/**
 * Reads one document's own data plus every subcollection nested under it,
 * at any depth — this is the mechanism that finds an unanticipated nested
 * subcollection (e.g. aiConversations/{id}/messages) without needing it
 * named anywhere in advance.
 */
export async function readDocumentRecursively(docRef: DocRefLike): Promise<BackedUpDocument> {
  const snap = await docRef.get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const nestedCollections = await docRef.listCollections();
  const subcollections: Record<string, BackedUpDocument[]> = {};
  for (const coll of nestedCollections) {
    const refs = await coll.listDocuments();
    const docs: BackedUpDocument[] = [];
    for (const ref of refs) docs.push(await readDocumentRecursively(ref));
    subcollections[coll.id] = docs;
  }
  return { id: docRef.id, data, subcollections };
}

/** Classifies a discovered users/{uid} collection name against the known plan, or "UNKNOWN" if not listed there. */
export function classifyCollection(path: string): Classification | "UNKNOWN" {
  const known = SIMPLE_SUBCOLLECTION_PLAN.find((e) => e.path === path);
  return known ? known.classification : "UNKNOWN";
}

/**
 * Collections this backup tool must never read, write, or recurse into —
 * not because they are unrecognized (an UNKNOWN collection is still
 * backed up, see classifyCollection above), but because each one is
 * either the existing, separate backup system this tool is deliberately
 * independent from ("backups" — the two pre-existing backups there must
 * never be touched by this tool in either direction), or this tool's own
 * infrastructure namespaces, which would otherwise recurse into
 * themselves (a backup of its own backups, or a restore-verification
 * scratch area containing a backup of itself). Checked by exact
 * top-level name, so a genuine user collection would need this exact
 * name to be affected — none of this app's real collections do.
 */
export const EXCLUDED_FROM_DISCOVERY: readonly string[] = [
  "backups",
  "_fullBackups",
  "_fullBackup",
  "__restoreVerification__",
];

/**
 * Discovers every users/{uid} subcollection that actually has at least one
 * document, via Firestore's own listCollections() — not the hardcoded
 * plan array. Unknown collections are included, classified "UNKNOWN", not
 * skipped. The exact, small set of names in EXCLUDED_FROM_DISCOVERY is the
 * one deliberate exception — see its own comment for why.
 */
export async function discoverAndReadAllUserCollections(
  firestore: FirestoreLike,
  uid: string,
): Promise<BackedUpCollection[]> {
  const userDoc = firestore.doc(`users/${uid}`);
  const topLevel = await userDoc.listCollections();
  const result: BackedUpCollection[] = [];
  for (const coll of topLevel) {
    if (EXCLUDED_FROM_DISCOVERY.includes(coll.id)) continue;
    const refs = await coll.listDocuments();
    const documents: BackedUpDocument[] = [];
    for (const ref of refs) documents.push(await readDocumentRecursively(ref));
    result.push({ path: coll.id, classification: classifyCollection(coll.id), documents });
  }
  return result;
}

/**
 * Reads the three public root-level collections, scoped to this account
 * exactly as dataCleanupDryRun.ts's checkRootCollection does (uid for two
 * of them, senderEmail for contactSubmissions, which never carries a
 * uid). Deliberately not recursive — these are simple, flat,
 * low-value submission records; see the implementation report for why
 * recursing into them was judged unnecessary for this version.
 */
export async function readRootCollections(
  firestore: FirestoreLike,
  uid: string,
  email: string | undefined,
): Promise<BackedUpCollection[]> {
  const result: BackedUpCollection[] = [];
  for (const entry of ROOT_COLLECTION_PLAN as RootCollectionPlanEntry[]) {
    const scopeValue = entry.scopeField === "uid" ? uid : (email ?? "");
    const documents: BackedUpDocument[] = [];
    if (scopeValue) {
      const snap = await firestore.collection(entry.path).where(entry.scopeField, "==", scopeValue).get();
      for (const d of snap.docs) {
        documents.push({ id: d.id, data: d.exists ? d.data() ?? {} : {}, subcollections: {} });
      }
    }
    result.push({ path: entry.path, classification: entry.classification, documents });
  }
  return result;
}

// ── Flattening — turns the recursive tree into {fullPath: items[]} ─────────

/**
 * Flattens the recursive collection/document/subcollection tree into a
 * flat map keyed by the full path relative to users/{uid} (e.g.
 * "aiConversations" and, separately, "aiConversations/c1/messages" as
 * their own independent entries) — this is what gets chunked and written,
 * and is also exactly the shape restoreFromBackup.ts consumes to write
 * each group back to the right place.
 */
export function flattenBackup(collections: BackedUpCollection[]): Map<string, BackedUpDocument[]> {
  const flat = new Map<string, BackedUpDocument[]>();

  function walk(path: string, docs: BackedUpDocument[]): void {
    flat.set(
      path,
      docs.map((d) => ({ id: d.id, data: d.data, subcollections: {} })),
    );
    for (const doc of docs) {
      for (const [subName, subDocs] of Object.entries(doc.subcollections)) {
        walk(`${path}/${doc.id}/${subName}`, subDocs);
      }
    }
  }

  for (const coll of collections) {
    walk(coll.path, coll.documents);
  }
  return flat;
}

/** Firestore document IDs cannot contain "/" — this is the one reversible mapping used for chunk doc IDs. */
export function sanitizePathAsDocId(path: string): string {
  return path.replace(/\//g, "__");
}

// ── Storage: copy + checksum verification ───────────────────────────────────

export interface StorageFileBackupResult {
  sourcePath: string;
  destPath: string;
  sizeBytes: number;
  sourceChecksum: string | undefined;
  destChecksum: string | undefined;
  checksumsMatch: boolean;
}

/**
 * Server-side-copies one Storage object to `destPath` within the same
 * bucket (the original is never read into this process's memory, and
 * never modified or deleted), then compares the source and destination
 * md5Hash metadata — a cryptographic check, not just a size comparison —
 * to confirm the copy is byte-for-byte identical.
 */
export async function copyStorageFileWithVerification(
  bucket: BucketLike,
  sourcePath: string,
  destPath: string,
): Promise<StorageFileBackupResult> {
  const sourceFile = bucket.file(sourcePath);
  const [sourceMeta] = await sourceFile.getMetadata();
  await sourceFile.copy(destPath);
  const destFile = bucket.file(destPath);
  const [destMeta] = await destFile.getMetadata();

  return {
    sourcePath,
    destPath,
    sizeBytes: Number(sourceMeta.size ?? 0),
    sourceChecksum: sourceMeta.md5Hash,
    destChecksum: destMeta.md5Hash,
    checksumsMatch: sourceMeta.md5Hash !== undefined && sourceMeta.md5Hash === destMeta.md5Hash,
  };
}

/** The only two Storage prefixes planner-app ever uploads to (profilePhoto.ts, documentsStore.ts). */
export function storagePrefixesFor(uid: string): { prefix: string; label: string }[] {
  return [
    { prefix: `users/${uid}/profile/`, label: "Profiilipildid" },
    { prefix: `users/${uid}/documents/`, label: "Dokumendimooduli failid" },
  ];
}

export interface StorageFileExportResult {
  path: string;
  content: Buffer;
  md5Hash: string | undefined;
}

/**
 * Downloads a Storage file's actual bytes into memory for the independent
 * (GitHub Actions artifact) export path — distinct from
 * copyStorageFileWithVerification() above, which never downloads content
 * and only makes a server-side copy for the Firestore-side destination.
 * Both run against the SAME source file; downloading never mutates it.
 */
export async function downloadStorageFileForExport(
  bucket: BucketLike,
  path: string,
): Promise<StorageFileExportResult> {
  const file = bucket.file(path);
  const [content] = await file.download();
  const [meta] = await file.getMetadata();
  return { path, content, md5Hash: meta.md5Hash };
}

export async function backupStoragePrefix(
  bucket: BucketLike,
  prefix: string,
  backupId: string,
  uid: string,
): Promise<StorageFileBackupResult[]> {
  const [files] = await bucket.getFiles({ prefix });
  const results: StorageFileBackupResult[] = [];
  for (const file of files) {
    const relative = file.name.slice(`users/${uid}/`.length);
    const destPath = `users/${uid}/_fullBackup/${backupId}/${relative}`;
    results.push(await copyStorageFileWithVerification(bucket, file.name, destPath));
  }
  return results;
}

// ── Firestore-side write (destination 1) + integrity re-read ───────────────

const FIRESTORE_BATCH_LIMIT = 450;
/** Conservative chunk size — stays well under Firestore's 1 MiB document limit. */
const CHUNK_BYTE_LIMIT = 700_000;

function estimateByteSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    // Some special types stringify unusually (e.g. Buffer → a much larger
    // {"type":"Buffer","data":[...]} form); an overestimate only makes
    // chunking more conservative, never risks exceeding the real limit.
    return CHUNK_BYTE_LIMIT;
  }
}

function splitIntoChunks(items: BackedUpDocument[]): BackedUpDocument[][] {
  const result: BackedUpDocument[][] = [];
  let current: BackedUpDocument[] = [];
  let currentBytes = 2;
  for (const item of items) {
    const size = estimateByteSize(item.data) + 64;
    if (currentBytes + size > CHUNK_BYTE_LIMIT && current.length > 0) {
      result.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += size;
  }
  if (current.length > 0 || result.length === 0) result.push(current);
  return result;
}

export interface FirestoreBackupWriteResult {
  backupId: string;
  chunksWritten: number;
  itemCounts: Record<string, number>;
}

/**
 * Writes the flattened backup into users/{uid}/_fullBackups/{backupId}/
 * chunks/{sanitizedPath}_{chunkIndex}, then a metadata doc last (same
 * ordering discipline as the existing createBackup() — a backup is only
 * "complete" once its metadata doc exists). Every value goes through
 * sanitizeForFirestoreWrite(), never sanitizeForFirestore().
 */
export async function writeFirestoreBackup(
  firestore: FirestoreLike,
  uid: string,
  backupId: string,
  flat: Map<string, BackedUpDocument[]>,
): Promise<FirestoreBackupWriteResult> {
  const itemCounts: Record<string, number> = {};
  let chunksWritten = 0;

  for (const [path, items] of flat.entries()) {
    itemCounts[path] = items.length;
    const chunkGroups = splitIntoChunks(items);
    const chunksCol = firestore.collection(`users/${uid}/_fullBackups/${backupId}/chunks`);
    for (let i = 0; i < chunkGroups.length; i++) {
      const docId = `${sanitizePathAsDocId(path)}_${i}`;
      const batch = firestore.batch();
      batch.set(chunksCol.doc(docId), sanitizeForFirestoreWrite({
        path,
        chunkIndex: i,
        totalChunks: chunkGroups.length,
        items: chunkGroups[i],
      }) as Record<string, unknown>);
      await batch.commit();
      chunksWritten++;
    }
  }

  const metaBatch = firestore.batch();
  metaBatch.set(firestore.doc(`users/${uid}/_fullBackups/${backupId}`), {
    createdAt: new Date().toISOString(),
    collectionPaths: [...flat.keys()],
    itemCounts,
    chunksWritten,
  });
  await metaBatch.commit();

  return { backupId, chunksWritten, itemCounts };
}

/**
 * Re-reads every chunk just written and deep-compares its content against
 * the original in-memory data — not just a count, the full item content —
 * plus a basic shape check (every item still carries its own `id`). This
 * is the "content and type" half of the integrity check; see
 * firestoreValueCodec.test.ts for type-fidelity coverage and
 * restoreVerification.ts for the separate scratch-path write test.
 */
export interface IntegrityCheckResult {
  path: string;
  expectedCount: number;
  actualCount: number;
  contentMatches: boolean;
}

export async function verifyFirestoreBackupIntegrity(
  firestore: FirestoreLike,
  uid: string,
  backupId: string,
  original: Map<string, BackedUpDocument[]>,
): Promise<IntegrityCheckResult[]> {
  const results: IntegrityCheckResult[] = [];
  const chunksCol = firestore.collection(`users/${uid}/_fullBackups/${backupId}/chunks`);

  for (const [path, originalItems] of original.entries()) {
    const chunkRefs = await chunksCol.where("path", "==", path).get();
    const rebuilt: BackedUpDocument[] = [];
    for (const chunkDoc of chunkRefs.docs) {
      const chunkData = chunkDoc.data() as { items?: BackedUpDocument[] } | undefined;
      rebuilt.push(...(chunkData?.items ?? []));
    }
    const contentMatches =
      rebuilt.length === originalItems.length &&
      rebuilt.every((item) => {
        const match = originalItems.find((o) => o.id === item.id);
        return match !== undefined && deepEqualIgnoringKeyOrder(item.data, match.data);
      });
    results.push({ path, expectedCount: originalItems.length, actualCount: rebuilt.length, contentMatches });
  }
  return results;
}

export function deepEqualIgnoringKeyOrder(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualIgnoringKeyOrder(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqualIgnoringKeyOrder(aObj[k], bObj[k]));
  }
  return false;
}

// ── Destination 2: the encryptable export payload ──────────────────────────

export interface ExportPayload {
  uid: string;
  backupId: string;
  generatedAt: string;
  /** encodeForJson()-safe — Timestamp/GeoPoint/DocumentReference/Bytes are all tagged, see firestoreValueCodec.ts. */
  collections: Record<string, unknown[]>;
  storageFiles: { path: string; base64: string; sizeBytes: number; md5Hash: string | undefined }[];
}

export function buildExportPayload(
  uid: string,
  backupId: string,
  flat: Map<string, BackedUpDocument[]>,
  storageFiles: { path: string; content: Buffer; md5Hash: string | undefined }[],
): ExportPayload {
  const collections: Record<string, unknown[]> = {};
  for (const [path, items] of flat.entries()) {
    collections[path] = items.map((item) => encodeForJson({ id: item.id, data: item.data }));
  }
  return {
    uid,
    backupId,
    generatedAt: new Date().toISOString(),
    collections,
    storageFiles: storageFiles.map((f) => ({
      path: f.path,
      base64: f.content.toString("base64"),
      sizeBytes: f.content.length,
      md5Hash: f.md5Hash,
    })),
  };
}
