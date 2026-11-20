/**
 * Unit tests for dataCleanupDryRun.ts — the read-only reconnaissance script
 * for the Kivora data-cleanup project.
 *
 * No real Firebase credentials/network are used. Every Firestore call is
 * tested against a hand-written fake that implements exactly FirestoreLike
 * (listDocuments/get/where) and deliberately has NO delete/set/update
 * method at all — the same fake-object style as grantOwnerRole.test.ts's
 * fake Auth.
 *
 * The most important test in this file is the static source-text check:
 * it reads dataCleanupDryRun.ts's own source and asserts it contains none
 * of the write-method substrings a Firestore/Auth mutation would require.
 * This is a structural, automatically-enforced guarantee that the script
 * stays read-only — not just a comment's promise — so a future edit that
 * accidentally introduced a write call fails this test immediately.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/dataCleanupDryRun.test.ts --outfile=.tmp-dataCleanupDryRun.mjs \
 *       && node .tmp-dataCleanupDryRun.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  countSubcollection,
  checkAiConversations,
  checkBackups,
  checkFullBackups,
  checkDocumentsStorageReferences,
  discoverUnknownAndNestedCollections,
  checkRootCollection,
  runDryRun,
  formatReport,
  main,
  SIMPLE_SUBCOLLECTION_PLAN,
  ROOT_COLLECTION_PLAN,
  BACKUP_AND_SCRATCH_NAMESPACES,
  type FirestoreLike,
  type DocRefLike,
  type CollRefLike,
  type DocSnapshotLike,
} from "./dataCleanupDryRun.js";
import { EXCLUDED_FROM_DISCOVERY } from "./fullAccountBackup.js";
import { RESTORE_VERIFICATION_SEGMENT } from "./restoreVerification.js";

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

// ── Fake Firestore ───────────────────────────────────────────────────────────
//
// Implements exactly FirestoreLike — listDocuments/get/where/get — with NO
// delete, set, update, add, commit, or batch method anywhere. Backed by a
// plain in-memory map keyed by full path, so a fake "document" is just
// { id, data, subcollections }.

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
  subcollections?: Record<string, FakeDoc[]>;
}

function makeFakeDocRef(doc: FakeDoc): DocRefLike {
  return {
    id: doc.id,
    collection(path: string) {
      const docs = doc.subcollections?.[path] ?? [];
      return makeFakeCollection(docs, path);
    },
    async get(): Promise<DocSnapshotLike> {
      return { id: doc.id, data: () => doc.data };
    },
    async listCollections(): Promise<CollRefLike[]> {
      const names = Object.keys(doc.subcollections ?? {});
      return names.map((name) => makeFakeCollection(doc.subcollections![name], name));
    },
  };
}

function makeFakeCollection(docs: FakeDoc[], path = ""): CollRefLike {
  return {
    id: path.split("/").pop() ?? "",
    async listDocuments(): Promise<DocRefLike[]> {
      return docs.map(makeFakeDocRef);
    },
    async get() {
      return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
    },
    where(field: string, _op: "==", value: unknown) {
      return {
        async get() {
          return {
            docs: docs.filter((d) => d.data[field] === value).map((d) => ({ id: d.id, data: () => d.data })),
          };
        },
      };
    },
  };
}

function makeFakeFirestore(collections: Record<string, FakeDoc[]>): FirestoreLike {
  return {
    collection(path: string) {
      return makeFakeCollection(collections[path] ?? [], path);
    },
    doc(path: string): DocRefLike {
      return {
        id: path.split("/").pop() ?? "",
        collection(sub: string) {
          return makeFakeCollection(collections[`${path}/${sub}`] ?? [], `${path}/${sub}`);
        },
        async get(): Promise<DocSnapshotLike> {
          return { id: path.split("/").pop() ?? "", data: () => ({}) };
        },
        async listCollections(): Promise<CollRefLike[]> {
          const prefix = `${path}/`;
          const names = new Set<string>();
          for (const key of Object.keys(collections)) {
            if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0]);
          }
          return [...names].map((name) => makeFakeCollection(collections[`${path}/${name}`] ?? [], `${path}/${name}`));
        },
      };
    },
  };
}

// ── 1. countSubcollection ───────────────────────────────────────────────────

await group("1. countSubcollection", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/tasks": [{ id: "t1", data: {} }, { id: "t2", data: {} }],
  });
  const entry = SIMPLE_SUBCOLLECTION_PLAN.find((e) => e.path === "tasks")!;
  const result = await countSubcollection(firestore, "u1", entry);
  assert(result.documentCount === 2, "counts exactly the documents present");
  assert(result.classification === "DELETE_CANDIDATE", "tasks is classified DELETE_CANDIDATE");

  const empty = await countSubcollection(firestore, "u1", SIMPLE_SUBCOLLECTION_PLAN.find((e) => e.path === "goals")!);
  assert(empty.documentCount === 0, "an absent collection counts as zero, never throws");
});

// ── 2. checkAiConversations ─────────────────────────────────────────────────

await group("2. checkAiConversations detects nested messages subcollections", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/aiConversations": [
      { id: "c1", data: {}, subcollections: { messages: [{ id: "m1", data: {} }, { id: "m2", data: {} }] } },
      { id: "c2", data: {} }, // no messages subcollection at all
      { id: "c3", data: {}, subcollections: { messages: [] } }, // empty subcollection
    ],
  });
  const result = await checkAiConversations(firestore, "u1");
  assert(result.documentCount === 3, "counts all conversation documents");
  assert(result.conversationsWithMessagesSubcollection === 1, "only c1 has a non-empty messages subcollection");
  assert(result.totalNestedMessageDocs === 2, "totals the message docs across conversations");
});

// ── 3. checkBackups ──────────────────────────────────────────────────────────

await group("3. checkBackups reads metadata and chunk counts without reading chunk content", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/backups": [
      {
        id: "bk_1",
        data: { createdAt: "2026-01-01", totalItems: 42, collectionNames: ["tasks", "notes"] },
        subcollections: { chunks: [{ id: "tasks_0", data: {} }, { id: "notes_0", data: {} }] },
      },
    ],
  });
  const result = await checkBackups(firestore, "u1");
  assert(result.documentCount === 1, "finds the one backup");
  assert(result.backups[0].totalItems === 42, "reads the backup's own itemCount metadata");
  assert(result.backups[0].chunkCount === 2, "counts chunk documents without reading their item payload");
});

// ── 4. checkRootCollection — uid vs email scoping ──────────────────────────

await group("4. checkRootCollection scopes supportMessages/feedbackSubmissions by uid", async () => {
  const firestore = makeFakeFirestore({
    supportMessages: [
      { id: "s1", data: { uid: "u1" } },
      { id: "s2", data: { uid: "other-user" } },
    ],
  });
  const entry = ROOT_COLLECTION_PLAN.find((e) => e.path === "supportMessages")!;
  const result = await checkRootCollection(firestore, entry, "u1", "me@example.com");
  assert(result.totalDocumentCount === 2, "total count includes every submitter");
  assert(result.matchingDocumentCount === 1, "matching count is scoped to this uid only");
});

await group("5. checkRootCollection scopes contactSubmissions by email, never uid (always uid: null)", async () => {
  const firestore = makeFakeFirestore({
    contactSubmissions: [
      { id: "c1", data: { uid: null, senderEmail: "me@example.com" } },
      { id: "c2", data: { uid: null, senderEmail: "someone-else@example.com" } },
    ],
  });
  const entry = ROOT_COLLECTION_PLAN.find((e) => e.path === "contactSubmissions")!;
  const result = await checkRootCollection(firestore, entry, "u1", "me@example.com");
  assert(result.totalDocumentCount === 2, "total count includes every sender");
  assert(result.matchingDocumentCount === 1, "matching count is scoped to this account's email");

  const noEmail = await checkRootCollection(firestore, entry, "u1", undefined);
  assert(noEmail.matchingDocumentCount === 0, "with no known email, nothing is claimed as a match (never guesses)");
});

// ── 6. runDryRun — end-to-end report assembly and warnings ─────────────────

await group("6. runDryRun assembles a full report and raises the expected warnings", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/tasks": [{ id: "t1", data: {} }],
    "users/u1/aiConversations": [
      { id: "c1", data: {}, subcollections: { messages: [{ id: "m1", data: {} }] } },
    ],
    "users/u1/backups": [],
    "users/u1/_fullBackups": [
      { id: "bk_1", data: { createdAt: "2026-01-01", chunksWritten: 3, collectionPaths: ["tasks"] } },
    ],
    "users/u1/documents": [
      { id: "d1", data: { storagePath: "users/u1/documents/d1.pdf", downloadURL: "https://example/d1" } },
    ],
    "users/u1/legacyWidget": [{ id: "w1", data: {} }],
    contactSubmissions: [{ id: "c1", data: { uid: null, senderEmail: "me@example.com" } }],
    supportMessages: [],
    feedbackSubmissions: [],
  });

  const report = await runDryRun(firestore, "u1", "me@example.com");

  assert(report.uid === "u1", "report carries the resolved uid");
  assert(report.subcollections.length === SIMPLE_SUBCOLLECTION_PLAN.length, "every simple collection is reported");
  assert(
    report.warnings.some((w) => w.includes("messages")),
    "warns about the non-empty aiConversations messages subcollection",
  );
  assert(
    report.warnings.some((w) => w.includes("Ei leitud ühtegi dokumenti")),
    "warns when zero backups exist for this account",
  );
  assert(
    report.warnings.some((w) => w.includes("plans") && w.includes("transactions")),
    "always warns that existing backups do not cover plans/Money/etc, regardless of other findings",
  );
  assert(
    report.warnings.some((w) => w.includes("Storage")),
    "always discloses that Storage is out of scope for this version",
  );
  assert(report.fullBackups.documentCount === 1, "the new _fullBackups check is wired into the full report");
  assert(
    report.documentsStorageReferences.withStoragePathCount === 1,
    "the new documents Storage-reference check is wired into the full report",
  );
  assert(
    report.unknownOrNestedDiscovery.unknownTopLevelCollections.some((c) => c.path === "legacyWidget"),
    "the new unknown-collection discovery is wired into the full report",
  );
  assert(
    report.warnings.some((w) => w.includes("documents") && w.includes("storagePath")),
    "warns about documents module Storage references when any are found",
  );
  assert(
    report.warnings.some((w) => w.includes("legacyWidget")),
    "warns about the unknown top-level collection found",
  );
  assert(
    report.warnings.some((w) => w.includes("contactSubmissions") && w.includes("ei ole omandi tõend")),
    "the strengthened contactSubmissions warning is always present once an email is known, not just on mismatch",
  );

  const formatted = formatReport(report);
  assert(formatted.includes("KIVORA ANDMETE DRY-RUN"), "formatted report has the expected header");
  assert(formatted.includes("Midagi ei kustutatud"), "formatted report ends with the no-deletion reassurance");
  assert(formatted.includes("_fullBackups"), "formatted report includes the new _fullBackups section");
  assert(formatted.includes("Storage-viited"), "formatted report includes the new documents Storage-reference section");
  assert(formatted.includes("TUNDMATU KOGU: legacyWidget"), "formatted report lists the unknown collection by name");
  assert(!formatted.includes("undefined"), "formatted report never leaks a raw 'undefined' into the text");
});

// ── 6b. checkFullBackups — the new, separate _fullBackups namespace ───────

await group("6b. checkFullBackups reports _fullBackups metadata and restore-verification scratch leftovers", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/_fullBackups": [
      { id: "bk_1", data: { createdAt: "2026-02-01", chunksWritten: 5, collectionPaths: ["tasks", "notes"] } },
    ],
  });
  const result = await checkFullBackups(firestore, "u1");
  assert(result.documentCount === 1, "finds the one _fullBackups entry");
  assert(result.backups[0].chunksWritten === 5, "reads the backup's own chunksWritten metadata");
  assert(result.restoreVerificationScratchFound === false, "no scratch leftover reported when none exists");

  const firestoreWithLeftover = makeFakeFirestore({
    "users/u1/_fullBackups": [],
    "users/u1/_restoreVerificationScratch": [{ id: "bk_2", data: {} }],
  });
  const withLeftover = await checkFullBackups(firestoreWithLeftover, "u1");
  assert(withLeftover.restoreVerificationScratchFound === true, "detects leftover scratch data when present, without touching it");
});

// ── 6c. checkDocumentsStorageReferences — counts only, never logs values ──

await group("6c. checkDocumentsStorageReferences counts Storage-reference fields without ever exposing their values", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/documents": [
      { id: "d1", data: { storagePath: "users/u1/documents/d1.pdf", downloadURL: "https://example/d1" } },
      { id: "d2", data: { storagePath: "", downloadURL: "https://example/d2" } },
      { id: "d3", data: {} },
    ],
  });
  const result = await checkDocumentsStorageReferences(firestore, "u1");
  assert(result.documentCount === 3, "counts all documents");
  assert(result.withStoragePathCount === 1, "only non-empty storagePath values count — d2's empty string does not");
  assert(result.withDownloadUrlCount === 2, "counts both populated downloadURL values");

  const src = readFileSync(resolve(process.cwd(), "src/scripts/dataCleanupDryRun.ts"), "utf8");
  assert(!src.includes("${storagePath"), "the actual storagePath value is never interpolated into any string (log, warning, or otherwise)");
  assert(!src.includes("${downloadURL"), "the actual downloadURL value is never interpolated into any string");
});

// ── 6d. discoverUnknownAndNestedCollections — recursive, metadata-only, excludes backup namespaces ──

await group("6d. discoverUnknownAndNestedCollections finds unknown top-level and unexpected nested collections", async () => {
  const firestore = makeFakeFirestore({
    "users/u1/tasks": [{ id: "t1", data: {}, subcollections: { mysterySubcol: [{ id: "x1", data: {} }] } }],
    "users/u1/aiConversations": [
      { id: "c1", data: {}, subcollections: { messages: [{ id: "m1", data: {} }] } },
    ],
    "users/u1/someLegacyCollection": [{ id: "l1", data: {} }],
    "users/u1/backups": [{ id: "existing-1", data: {} }],
    "users/u1/_fullBackups": [{ id: "bk_1", data: {} }],
  });
  const result = await discoverUnknownAndNestedCollections(firestore, "u1");

  assert(
    result.unknownTopLevelCollections.some((c) => c.path === "someLegacyCollection" && c.documentCount === 1),
    "a genuinely unknown top-level collection is found and counted",
  );
  assert(
    !result.unknownTopLevelCollections.some((c) => c.path === "tasks" || c.path === "aiConversations"),
    "known collections (including aiConversations, which has its own dedicated check) are never flagged as unknown",
  );
  assert(
    !result.unknownTopLevelCollections.some((c) => BACKUP_AND_SCRATCH_NAMESPACES.includes(c.path)),
    "backup/scratch namespaces are NEVER reported as unknown collections — requirement: cannot accidentally include backup data in cleanup-candidate counts",
  );
  assert(
    result.unexpectedNestedSubcollections.some(
      (f) => f.parentPath === "tasks" && f.documentId === "t1" && f.nestedCollectionName === "mysterySubcol" && f.nestedDocumentCount === 1,
    ),
    "an unexpected nested subcollection under a KNOWN collection is found",
  );
  assert(
    !result.unexpectedNestedSubcollections.some((f) => f.nestedCollectionName === "messages"),
    "the one already-known nested case (aiConversations/{id}/messages) is never flagged as unexpected",
  );
});

// ── 6e. BACKUP_AND_SCRATCH_NAMESPACES stays in sync with the real constants it independently mirrors ──

await group("6e. BACKUP_AND_SCRATCH_NAMESPACES matches fullAccountBackup.ts's EXCLUDED_FROM_DISCOVERY and restoreVerification.ts's RESTORE_VERIFICATION_SEGMENT", () => {
  for (const name of EXCLUDED_FROM_DISCOVERY) {
    assert(BACKUP_AND_SCRATCH_NAMESPACES.includes(name), `BACKUP_AND_SCRATCH_NAMESPACES still contains "${name}" from EXCLUDED_FROM_DISCOVERY`);
  }
  assert(
    BACKUP_AND_SCRATCH_NAMESPACES.includes(RESTORE_VERIFICATION_SEGMENT),
    "BACKUP_AND_SCRATCH_NAMESPACES still contains the real, current RESTORE_VERIFICATION_SEGMENT value",
  );
  assert(
    BACKUP_AND_SCRATCH_NAMESPACES.length === EXCLUDED_FROM_DISCOVERY.length,
    "the two independent lists have the same length — no extra or missing entries on either side",
  );
});

// ── 7. main() — missing target never touches Firebase ─────────────────────

await group("7. main() fails safely with no target and no Admin calls", async () => {
  const code = await main([], {});
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("8. main() fails safely when Admin credentials are absent (as in this test process)", async () => {
  // No FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY in this test's env —
  // getFirebaseAdminAuth() throws before any network call is attempted.
  const code = await main(["someone@example.com"], {});
  assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
});

// ── 9. Structural safety guarantee: no write-capable calls in source ──────

await group("9. dataCleanupDryRun.ts source contains no Firestore/Auth write calls", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/dataCleanupDryRun.ts"), "utf8");
  const forbidden = [
    ".delete(",
    ".set(",
    ".update(",
    ".add(",
    ".commit(",
    "batch(",
    "setCustomUserClaims",
    "deleteUser(",
    "updateUser(",
    ".upload(",
    ".save(",
    "deleteFile",
    "createWriteStream",
  ];
  for (const token of forbidden) {
    assert(!src.includes(token), `source does not contain "${token}"`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
