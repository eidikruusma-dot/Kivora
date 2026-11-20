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
  checkRootCollection,
  runDryRun,
  formatReport,
  main,
  SIMPLE_SUBCOLLECTION_PLAN,
  ROOT_COLLECTION_PLAN,
  type FirestoreLike,
  type DocRefLike,
  type DocSnapshotLike,
} from "./dataCleanupDryRun.js";

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
      return makeFakeCollection(docs);
    },
    async get(): Promise<DocSnapshotLike> {
      return { id: doc.id, data: () => doc.data };
    },
  };
}

function makeFakeCollection(docs: FakeDoc[]) {
  return {
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
      return makeFakeCollection(collections[path] ?? []);
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
    contactSubmissions: [],
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

  const formatted = formatReport(report);
  assert(formatted.includes("KIVORA ANDMETE DRY-RUN"), "formatted report has the expected header");
  assert(formatted.includes("Midagi ei kustutatud"), "formatted report ends with the no-deletion reassurance");
  assert(!formatted.includes("undefined"), "formatted report never leaks a raw 'undefined' into the text");
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
