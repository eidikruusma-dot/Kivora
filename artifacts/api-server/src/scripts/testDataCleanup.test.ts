/**
 * Unit + integration tests for testDataCleanup.ts — the safety-first
 * Kivora 2.0 test-data cleanup tool.
 *
 * No real Firebase credentials/network. Every Firestore call is tested
 * against a hand-written, delete-capable fake (flat path-keyed store,
 * same design as fullBackupRestoreChain.test.ts's and
 * firestoreOnlyBackup.test.ts's fakes) so verifyRestorability() —
 * reused here unchanged — works correctly against it.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/testDataCleanup.test.ts --outfile=.tmp-testDataCleanup.mjs \
 *       && node .tmp-testDataCleanup.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLEANUP_ALLOWLIST,
  PROTECTED_NAMES,
  APPROVED_SNAPSHOT_2026_11_20,
  APPROVED_MANIFEST_2026_11_20,
  CONFIRMATION_PHRASE,
  SMALL_BATCH_SIZE,
  assertCollectionIsAllowlisted,
  getLiveCounts,
  verifySnapshotMatch,
  checkForUnexpectedStructure,
  reconstructFlatFromFullBackup,
  verifyBackupBeforeCleanup,
  categoryNeedsConfirmation,
  captureManifest,
  verifyManifestMatch,
  deleteCollectionSafely,
  runCleanup,
  main,
  type FirestoreLike,
  type DocRefLike,
  type CollRefLike,
  type DocSnapshotLike,
  type WriteBatchLike,
  type ApprovedManifest,
  type DeletePrecondition,
} from "./testDataCleanup.js";

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

// ── Fake, delete-capable Firestore (flat path-keyed store) ─────────────────

/**
 * Tracks a logical "updateTime" (a monotonic counter) per document path,
 * so captureManifest()'s real updateTime comparisons and
 * deleteCollectionSafely()'s real Firestore delete-precondition
 * semantics (lastUpdateTime) can be tested meaningfully, not just typed.
 * Every initial seed document gets its own tick; every subsequent
 * batch.set() re-ticks that path, simulating a real content change.
 * A batch commit() that includes a delete with a lastUpdateTime
 * precondition checks it against the CURRENT tick for that path and —
 * matching real Firestore's documented all-or-nothing precondition
 * behavior — fails the WHOLE commit (applies nothing) if any precondition
 * in it is violated.
 */
function makeFakeFirestore(
  initial: Record<string, Record<string, unknown>> = {},
  opts: { failDeleteUnderPrefix?: string; onBeforeFirstCommit?: () => void } = {},
) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const updateTimes = new Map<string, number>();
  let clock = 0;
  for (const path of store.keys()) updateTimes.set(path, ++clock);

  function touch(path: string): void {
    updateTimes.set(path, ++clock);
  }

  let firstCommitHookFired = false;

  function snapshotFor(id: string, path: string): DocSnapshotLike {
    const data = store.get(path);
    const t = updateTimes.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => data,
      updateTime: t !== undefined ? { toMillis: () => t } : undefined,
    };
  }

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
      collection(sub: string) {
        return makeCollRef(`${path}/${sub}`);
      },
      async listCollections(): Promise<CollRefLike[]> {
        return childCollectionNames(path).map((name) => makeCollRef(`${path}/${name}`));
      },
      async get(): Promise<DocSnapshotLike> {
        return snapshotFor(id, path);
      },
    };
  }
  function makeCollRef(path: string): CollRefLike {
    return {
      id: path.split("/").pop() ?? "",
      doc(docId?: string) {
        return makeDocRef(`${path}/${docId ?? Math.random().toString(36).slice(2)}`);
      },
      async listDocuments(): Promise<DocRefLike[]> {
        return docsInCollection(path).map((docId) => makeDocRef(`${path}/${docId}`));
      },
      async get() {
        return { docs: docsInCollection(path).map((docId) => snapshotFor(docId, `${path}/${docId}`)) };
      },
      where(field: string, _op: "==", value: unknown) {
        return {
          async get() {
            const docs: DocSnapshotLike[] = [];
            for (const docId of docsInCollection(path)) {
              const data = store.get(`${path}/${docId}`);
              if (data && data[field] === value) docs.push(snapshotFor(docId, `${path}/${docId}`));
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
    batch(): WriteBatchLike {
      const sets: { path: string; data: Record<string, unknown> }[] = [];
      const deletes: { path: string; precondition?: DeletePrecondition }[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) {
          sets.push({ path: ref.path, data });
        },
        delete(ref: DocRefLike, precondition?: DeletePrecondition) {
          deletes.push({ path: ref.path, precondition });
        },
        async commit() {
          if (opts.onBeforeFirstCommit && !firstCommitHookFired) {
            firstCommitHookFired = true;
            opts.onBeforeFirstCommit();
          }
          if (opts.failDeleteUnderPrefix && deletes.some((d) => d.path.startsWith(opts.failDeleteUnderPrefix!))) {
            throw new Error(`Simuleeritud viga: kustutamine "${opts.failDeleteUnderPrefix}" alt ebaõnnestus`);
          }
          // Real Firestore: a precondition failure anywhere in a batch
          // fails the WHOLE commit — nothing in it is applied.
          for (const d of deletes) {
            if (d.precondition?.lastUpdateTime) {
              const current = updateTimes.get(d.path);
              if (current === undefined || current !== d.precondition.lastUpdateTime.toMillis()) {
                throw new Error(
                  `Firestore'i eeltingimuse (lastUpdateTime) rikkumine: "${d.path}" on muutunud pärast heakskiitmist — kogu partii lükatakse tagasi.`,
                );
              }
            }
          }
          for (const s of sets) {
            store.set(s.path, s.data);
            touch(s.path);
          }
          for (const d of deletes) {
            store.delete(d.path);
            updateTimes.delete(d.path);
          }
        },
      };
    },
  };
  return { firestore, store, touch };
}

/** Simulates an external, concurrent write to one document — sets new content AND advances its updateTime, exactly like a real write would. */
function mutateDoc(
  store: Map<string, Record<string, unknown>>,
  touch: (path: string) => void,
  path: string,
  data: Record<string, unknown>,
): void {
  store.set(path, data);
  touch(path);
}

/** Builds an approved manifest covering exactly the documents currently live for the given uid — the "capture, then later approve" step, done once in a test. */
async function approveCurrentState(firestore: FirestoreLike, uid: string): Promise<ApprovedManifest> {
  return captureManifest(firestore, uid);
}

/**
 * Seeds `count` trivial documents under users/{uid}/{path}, each going
 * through touch() exactly like a real Firestore write would — every real
 * document always has an updateTime from the moment it is first written,
 * so a seeded test document must too, or captureManifest() correctly (by
 * design) excludes it from the manifest entirely.
 */
function seedDocs(
  store: Map<string, Record<string, unknown>>,
  touch: (path: string) => void,
  uid: string,
  path: string,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const docPath = `users/${uid}/${path}/d${i}`;
    store.set(docPath, { n: i });
    touch(docPath);
  }
}

/** Seeds a realistic, self-consistent _fullBackups entry: metadata + one chunk per path. */
function seedFullBackup(
  store: Map<string, Record<string, unknown>>,
  uid: string,
  backupId: string,
  content: Record<string, { id: string; data: Record<string, unknown> }[]>,
): void {
  const collectionPaths = Object.keys(content);
  let chunksWritten = 0;
  for (const [path, items] of Object.entries(content)) {
    store.set(`users/${uid}/_fullBackups/${backupId}/chunks/${path}_0`, {
      path,
      chunkIndex: 0,
      totalChunks: 1,
      items: items.map((it) => ({ id: it.id, data: it.data, subcollections: {} })),
    });
    chunksWritten++;
  }
  store.set(`users/${uid}/_fullBackups/${backupId}`, { createdAt: "2026-11-20", collectionPaths, chunksWritten, itemCounts: {} });
}

// ── 1. assertCollectionIsAllowlisted (safety properties 5, 9) ──────────────

await group("1. assertCollectionIsAllowlisted enforces the explicit allowlist and protected names", () => {
  for (const entry of CLEANUP_ALLOWLIST) {
    let threw = false;
    try {
      assertCollectionIsAllowlisted(entry.path);
    } catch {
      threw = true;
    }
    assert(!threw, `"${entry.path}" (on the allowlist) does not throw`);
  }
  for (const protectedName of PROTECTED_NAMES) {
    let threw = false;
    try {
      assertCollectionIsAllowlisted(protectedName);
    } catch {
      threw = true;
    }
    assert(threw, `"${protectedName}" (protected) throws — this is the exact "attempt to target a protected collection" case`);
  }
  let threw = false;
  try {
    assertCollectionIsAllowlisted("someRandomUnknownCollection");
  } catch {
    threw = true;
  }
  assert(threw, "an unknown, non-allowlisted name also throws — never deleted automatically");
});

await group("1b. CLEANUP_ALLOWLIST itself never contains a protected name", () => {
  for (const entry of CLEANUP_ALLOWLIST) {
    assert(!PROTECTED_NAMES.includes(entry.path), `"${entry.path}" is not one of PROTECTED_NAMES`);
  }
  assert(!CLEANUP_ALLOWLIST.some((e) => e.path === "settings"), "settings is never in the cleanup allowlist");
});

// ── 2. verifySnapshotMatch — directional, resumption-aware rule (properties 7, 11) ──

await group("2. verifySnapshotMatch: live <= approved is always accepted (resumability)", () => {
  const liveCounts = { ...APPROVED_SNAPSHOT_2026_11_20, tasks: 10 }; // fewer than approved 35 — simulates a prior partial run
  const result = verifySnapshotMatch(liveCounts, APPROVED_SNAPSHOT_2026_11_20);
  assert(result.ok, "a lower-than-approved live count is accepted, not treated as a mismatch");

  const exact = verifySnapshotMatch(APPROVED_SNAPSHOT_2026_11_20, APPROVED_SNAPSHOT_2026_11_20);
  assert(exact.ok, "an exact match is accepted");

  const allZero = verifySnapshotMatch(
    Object.fromEntries(Object.keys(APPROVED_SNAPSHOT_2026_11_20).map((k) => [k, 0])),
    APPROVED_SNAPSHOT_2026_11_20,
  );
  assert(allZero.ok, "everything already deleted (all live counts at 0) is still accepted — the fully-resumed end state");
});

await group("2b. verifySnapshotMatch: live > approved ALWAYS aborts (unexpected new data)", () => {
  const liveCounts = { ...APPROVED_SNAPSHOT_2026_11_20, tasks: 36 }; // one more than approved 35
  const result = verifySnapshotMatch(liveCounts, APPROVED_SNAPSHOT_2026_11_20);
  assert(!result.ok, "a higher-than-approved live count is rejected");
  assert(result.mismatches.some((m) => m.path === "tasks" && m.reason === "unexpected_new_data"), "the mismatch is reported with the correct reason");
});

await group("2c. verifySnapshotMatch: a previously-empty collection going nonzero ALWAYS aborts, zero tolerance", () => {
  const liveCounts = { ...APPROVED_SNAPSHOT_2026_11_20, transactions: 1 }; // approved snapshot says 0
  const result = verifySnapshotMatch(liveCounts, APPROVED_SNAPSHOT_2026_11_20);
  assert(!result.ok, "even a single unexpected document in a previously-empty category aborts");
  assert(
    result.mismatches.some((m) => m.path === "transactions" && m.reason === "previously_empty_now_nonzero"),
    "the mismatch is reported with the correct reason",
  );
});

// ── 3. checkForUnexpectedStructure (safety property 6) ─────────────────────

await group("3. checkForUnexpectedStructure finds unknown/nested collections and excludes backup namespaces", async () => {
  const fakes = makeFakeFirestore({
    "users/u1/tasks/t1": { title: "x" },
    "users/u1/someMysteryCollection/m1": { x: 1 },
    "users/u1/backups/existing-1": { note: "must never be flagged" },
    "users/u1/_fullBackups/bk_1": { note: "must never be flagged" },
  });
  const result = await checkForUnexpectedStructure(fakes.firestore, "u1");
  assert(!result.ok, "an unknown top-level collection makes the structure check fail");
  assert(result.unknownTopLevelCollections.includes("someMysteryCollection"), "the unknown collection is named");
  assert(
    !result.unknownTopLevelCollections.includes("backups") && !result.unknownTopLevelCollections.includes("_fullBackups"),
    "backup namespaces are NEVER reported as unexpected structure",
  );

  const cleanFakes = makeFakeFirestore({ "users/u1/tasks/t1": { title: "x" } });
  const cleanResult = await checkForUnexpectedStructure(cleanFakes.firestore, "u1");
  assert(cleanResult.ok, "a clean account with only known collections passes the structure check");
});

// ── 4. Backup re-verification (safety property 8) ───────────────────────────

await group("4. verifyBackupBeforeCleanup refuses a missing or empty/partial backup", async () => {
  const { firestore } = makeFakeFirestore({ "users/u1/tasks/t1": { title: "x" } });
  const missing = await verifyBackupBeforeCleanup(firestore as never, "u1", "bk_does_not_exist", ["tasks"]);
  assert(!missing.exists, "a backup id that does not exist is reported as not existing");

  const { firestore: withEmptyMeta, store: storeEmpty } = makeFakeFirestore({ "users/u1/tasks/t1": { title: "x" } });
  storeEmpty.set("users/u1/_fullBackups/bk_empty", { createdAt: "2026-11-20", collectionPaths: [], chunksWritten: 0 });
  const empty = await verifyBackupBeforeCleanup(withEmptyMeta as never, "u1", "bk_empty", ["tasks"]);
  assert(empty.exists && empty.metadataFound, "metadata exists for the partial backup");
  assert(!empty.hasContent, "a backup with metadata but zero reconstructable content is never treated as having content");
  assert(!empty.restorabilityAllMatch && !empty.cleanupSucceeded, "a partial/empty backup is never sufficient, regardless of metadata existing");
});

await group("4b. verifyBackupBeforeCleanup passes for a real, self-consistent backup, via a genuine fresh restorability re-check", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1/tasks/t1": { title: "real task" },
  });
  seedFullBackup(store, "u1", "bk_good", {
    tasks: [{ id: "t1", data: { title: "real task" } }],
  });
  const result = await verifyBackupBeforeCleanup(firestore as never, "u1", "bk_good", ["tasks"]);
  assert(result.exists && result.metadataFound && result.hasContent, "the backup is found with real content");
  assert(result.restorabilityAllMatch, "a genuine, fresh restorability check (via verifyRestorability) passes");
  assert(result.cleanupSucceeded, "the scratch copy used for the fresh check is cleaned up afterward");
  assert(store.has("users/u1/tasks/t1"), "the real, live task document was never touched by this verification");
});

// ── 5. categoryNeedsConfirmation (finance/documents gates, tested in isolation) ──

await group("5. categoryNeedsConfirmation detects nonzero finance/documents independent of today's hardcoded snapshot", () => {
  assert(categoryNeedsConfirmation("finance", { transactions: 1 }), "a single nonzero finance collection requires confirmation");
  assert(!categoryNeedsConfirmation("finance", { transactions: 0, bills: 0, monthlyBudgets: 0 }), "all-zero finance needs no confirmation");
  assert(categoryNeedsConfirmation("documents", { documents: 3 }), "nonzero documents requires confirmation");
  assert(!categoryNeedsConfirmation("general", {}), "an empty counts object never spuriously requires confirmation");
});

// ── 6. captureManifest / verifyManifestMatch — the exact document+version gate ──
// (the actual fix for "counts alone cannot prove the same documents")

await group("6. captureManifest captures exactly each document's id and updateTime, nothing else", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/tasks/t1": { title: "secret personal content — must never appear in the manifest" },
    "users/u1/tasks/t2": { title: "more content" },
  });
  const manifest = await captureManifest(firestore, "u1");
  assert(manifest["tasks"]?.length === 2, "captures both documents");
  assert(manifest["tasks"]!.every((e) => typeof e.id === "string" && typeof e.updateTime.toMillis() === "number"), "every entry has only an id and a numeric-backed updateTime");
  assert(JSON.stringify(manifest).includes("secret personal content") === false, "field content never leaks into the captured manifest");
  assert(manifest["habits"]?.length === 0, "an empty collection captures as an empty array, not undefined");
});

await group("6b. verifyManifestMatch: resumability — approved ids absent from live are fine; only UNAPPROVED live ids are flagged", async () => {
  const t = (n: number) => ({ toMillis: () => n });
  const approved: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(1) }, { id: "b", updateTime: t(2) }] };
  const liveSubset: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(1) }] }; // "b" already deleted in a prior run
  assert(verifyManifestMatch(liveSubset, approved).ok, "a live subset of the approved manifest (prior partial deletion) is accepted");

  const liveEmpty: ApprovedManifest = { tasks: [] };
  assert(verifyManifestMatch(liveEmpty, approved).ok, "fully resumed (nothing left live) is still accepted");
});

await group("6c. verifyManifestMatch catches document REPLACEMENT — same count, different id (the exact bug this change fixes)", () => {
  const t = (n: number) => ({ toMillis: () => n });
  const approved: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(1) }, { id: "b", updateTime: t(2) }] };
  const liveReplaced: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(1) }, { id: "c", updateTime: t(3) }] }; // "b" replaced by "c" — SAME COUNT
  const result = verifyManifestMatch(liveReplaced, approved);
  assert(!result.ok, "a same-count document replacement is caught — a count-only check would have missed this entirely");
  assert(result.mismatches.some((m) => m.id === "c" && m.reason === "not_in_approved_manifest"), "the new, unapproved id is named with the correct reason");
});

await group("6d. verifyManifestMatch catches CONTENT change on the same id — same count, changed updateTime", () => {
  const t = (n: number) => ({ toMillis: () => n });
  const approved: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(1) }] };
  const liveChanged: ApprovedManifest = { tasks: [{ id: "a", updateTime: t(99) }] }; // same id, content changed after approval
  const result = verifyManifestMatch(liveChanged, approved);
  assert(!result.ok, "a content change on an otherwise-approved document is caught");
  assert(result.mismatches.some((m) => m.id === "a" && m.reason === "updateTime_changed"), "reported with the correct reason, distinct from a brand-new document");
});

// ── 7. deleteCollectionSafely — small batches, nested-aware, allowlist-guarded, manifest-gated ──

await group("7. deleteCollectionSafely refuses to touch a protected collection even if directly invoked", async () => {
  const { firestore, store } = makeFakeFirestore({ "users/u1/backups/existing-1": { note: "must survive" } });
  let threw = false;
  try {
    await deleteCollectionSafely(firestore, "u1", { path: "backups", label: "x", category: "general" }, {}, 50, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "attempting to delete 'backups' directly throws before touching anything");
  assert(store.has("users/u1/backups/existing-1"), "the protected document is completely untouched");
});

await group("8. deleteCollectionSafely deletes in small batches (well under Firestore's 500-op limit), using the approved manifest as delete preconditions", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 120);
  const approved = await approveCurrentState(firestore, "u1");
  const logs: string[] = [];
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "tasks")!;
  const result = await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, (m) => logs.push(m));
  assert(result.deleted === 120, "all 120 documents were deleted");
  assert(
    [...store.keys()].every((k) => !k.startsWith("users/u1/tasks/")),
    "every task document is actually gone from the store",
  );
  assert(logs.length === Math.ceil(120 / SMALL_BATCH_SIZE), `batched into ${Math.ceil(120 / SMALL_BATCH_SIZE)} small commits, not one giant batch`);
  assert(logs.every((l) => !l.includes("n:")), "log lines never contain document field content, only counts");
});

await group("9. deleteCollectionSafely deletes aiConversations' nested messages before the parent, generically", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    "users/u1/aiConversations/c1/messages/m2": { role: "assistant" },
  });
  const approved = await approveCurrentState(firestore, "u1");
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "aiConversations")!;
  const result = await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  assert(result.deleted === 1, "the one conversation document was deleted");
  assert(result.nestedDeleted === 2, "both nested message documents were deleted");
  assert(
    [...store.keys()].every((k) => !k.startsWith("users/u1/aiConversations/")),
    "nothing is left behind under aiConversations, parent or nested",
  );
});

await group("9b. captureManifest covers each conversation's nested messages under their own exact compound key", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    "users/u1/aiConversations/c2": { title: "y" }, // a second conversation with NO messages at all
  });
  const manifest = await captureManifest(firestore, "u1");
  assert(manifest["aiConversations"]?.length === 2, "both conversation documents are captured at the top level");
  assert(manifest["aiConversations/c1/messages"]?.length === 1, "c1's own messages are captured under its own compound key");
  assert(manifest["aiConversations/c2/messages"]?.length === 0, "c2's empty messages subcollection is still an explicit empty entry, not missing entirely");
});

await group("9c. verifyManifestMatch catches a NEWLY ADDED message under an otherwise-approved conversation", async () => {
  const { firestore, store, touch } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
  });
  const approved = await captureManifest(firestore, "u1");
  mutateDoc(store, touch, "users/u1/aiConversations/c1/messages/mNEW", { role: "assistant" }); // added after approval
  const live = await captureManifest(firestore, "u1");
  const result = verifyManifestMatch(live, approved);
  assert(!result.ok, "a brand-new message under an already-approved conversation is caught");
  assert(
    result.mismatches.some((m) => m.path === "aiConversations/c1/messages" && m.id === "mNEW" && m.reason === "not_in_approved_manifest"),
    "reported under the nested compound key, with the correct reason",
  );
});

await group("9d. verifyManifestMatch catches a same-count message REPLACEMENT inside a conversation", async () => {
  const { firestore, store, touch } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    "users/u1/aiConversations/c1/messages/m2": { role: "assistant" },
  });
  const approved = await captureManifest(firestore, "u1");
  store.delete("users/u1/aiConversations/c1/messages/m2");
  mutateDoc(store, touch, "users/u1/aiConversations/c1/messages/m3", { role: "assistant" }); // same count (still 2), different id
  const live = await captureManifest(firestore, "u1");
  const result = verifyManifestMatch(live, approved);
  assert(!result.ok, "a same-count message replacement is caught — this is exactly the bug class this whole change targets, now also inside nested conversations");
});

await group("9e. deleteCollectionSafely: a concurrent write to a NESTED message is caught — parent conversation is NOT deleted either (requirement 7)", async () => {
  const { firestore, store, touch } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
  });
  const approved = await approveCurrentState(firestore, "u1");
  mutateDoc(store, touch, "users/u1/aiConversations/c1/messages/m1", { role: "EDITED" }); // concurrent change to the message only
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "aiConversations")!;
  let threw = false;
  try {
    await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "the nested re-check catches the concurrent message change before any delete");
  assert(store.has("users/u1/aiConversations/c1"), "the PARENT conversation document was never deleted — it cannot bypass protection for its own nested messages");
  assert(store.has("users/u1/aiConversations/c1/messages/m1"), "the message itself was never deleted either");
});

await group("9f. deleteCollectionSafely: Firestore's delete precondition catches a nested message changed exactly at the commit boundary (layer 2)", async () => {
  const { firestore, store, touch } = makeFakeFirestore(
    {
      "users/u1/aiConversations/c1": { title: "x" },
      "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    },
    { onBeforeFirstCommit: () => mutateDoc(store, touch, "users/u1/aiConversations/c1/messages/m1", { role: "EDITED" }) },
  );
  const approved = await approveCurrentState(firestore, "u1");
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "aiConversations")!;
  let threw = false;
  let message = "";
  try {
    await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assert(threw, "the first commit this function makes is the nested message delete — Firestore's own precondition rejects it");
  assert(message.includes("eeltingimuse"), "the real precondition-violation error is surfaced");
  assert(store.has("users/u1/aiConversations/c1"), "the parent conversation survives — its delete never even runs, since the nested commit failed first");
});

await group("9g. deleteCollectionSafely: safe resumption for nested messages — already-deleted messages are accepted, the rest + the parent are deleted", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    "users/u1/aiConversations/c1/messages/m2": { role: "assistant" },
  });
  const approved = await approveCurrentState(firestore, "u1"); // approved while BOTH messages still existed
  store.delete("users/u1/aiConversations/c1/messages/m1"); // simulates a prior partial run having already removed one message
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "aiConversations")!;
  const result = await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  assert(result.nestedDeleted === 1, "only the one remaining (still-approved) message was deleted this time");
  assert(result.deleted === 1, "the parent conversation was deleted too, once its messages were safely cleared");
  assert(
    [...store.keys()].every((k) => !k.startsWith("users/u1/aiConversations/")),
    "nothing is left behind — the resumed run finishes the job completely",
  );
});

// ── 10. Concurrency protection — the two independent layers, each tested directly ──

await group("10. Layer 1 (application-level re-check): a concurrent write BEFORE deleteCollectionSafely is even called is caught", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 5);
  const approved = await approveCurrentState(firestore, "u1"); // the "earlier, global" approval
  mutateDoc(store, touch, "users/u1/tasks/d2", { n: 999 }); // a concurrent write after approval, before deletion
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "tasks")!;
  let threw = false;
  try {
    await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "the per-collection re-check catches the concurrent change before building any batch");
  assert(store.size === 5, "nothing was deleted — caught before any write");
});

await group("11. Layer 2 (Firestore delete precondition): a write landing exactly at the commit boundary is still caught", async () => {
  // onBeforeFirstCommit fires AFTER deleteCollectionSafely's own re-check
  // has already passed (it only runs inside commit()) — this is
  // precisely the race layer 1 cannot see, proving layer 2 is a real,
  // independent backstop, not a duplicate of layer 1.
  const { firestore, store, touch } = makeFakeFirestore({}, {
    onBeforeFirstCommit: () => mutateDoc(store, touch, "users/u1/tasks/d0", { n: 999 }),
  });
  seedDocs(store, touch, "u1", "tasks", 3);
  const approved = await approveCurrentState(firestore, "u1");
  const entry = CLEANUP_ALLOWLIST.find((e) => e.path === "tasks")!;
  let threw = false;
  let message = "";
  try {
    await deleteCollectionSafely(firestore, "u1", entry, approved, SMALL_BATCH_SIZE, () => {});
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assert(threw, "Firestore's own delete precondition rejects the commit when the document changed after the re-check passed");
  assert(message.includes("eeltingimuse"), "the real underlying precondition-violation error is surfaced, not a generic failure");
  assert(store.size === 3, "the WHOLE batch was rejected — real Firestore precondition semantics apply to every op in it, not just the changed one");
});

// ── 12. runCleanup — full orchestration ─────────────────────────────────────

await group("12. runCleanup in dry-run mode never deletes anything, even when every other gate would pass", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 5);
  const approved = await approveCurrentState(firestore, "u1");
  const sizeBefore = store.size;
  const result = await runCleanup(firestore, "u1", { mode: "dry-run", approvedManifestOverride: approved });
  assert(result.overallSuccess, "dry-run reports success when all checks (including the manifest check) pass");
  assert(Object.keys(result.deletedCounts).length === 0, "deletedCounts is empty in dry-run");
  assert(store.size === sizeBefore, "the store is completely unchanged after a dry-run");
});

await group("12b. runCleanup in execute mode aborts on a snapshot mismatch, deleting nothing", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 999); // far more than the approved 35
  const sizeBefore = store.size;
  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_whatever" });
  assert(!result.overallSuccess, "execute mode aborts");
  assert(result.abortReason?.includes("momentvõttest") ?? false, "the abort reason names the snapshot mismatch");
  assert(store.size === sizeBefore, "nothing was deleted — the mismatch is caught before any write");
});

await group("12c. runCleanup in execute mode aborts on unexpected structure, deleting nothing", async () => {
  const { firestore, store } = makeFakeFirestore({});
  store.set("users/u1/someMysteryCollection/m1", { x: 1 });
  const sizeBefore = store.size;
  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_whatever" });
  assert(!result.overallSuccess, "execute mode aborts");
  assert(result.abortReason?.includes("struktuur") ?? false, "the abort reason names the structural finding");
  assert(store.size === sizeBefore, "nothing was deleted");
});

await group("12d. runCleanup: TODAY's real, empty APPROVED_MANIFEST_2026_11_20 correctly blocks execute mode against any live data", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 1);
  // Deliberately NOT passing approvedManifestOverride — this exercises
  // the REAL hardcoded (currently empty) APPROVED_MANIFEST_2026_11_20,
  // exactly as main() would use it today.
  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_whatever" });
  assert(!result.overallSuccess, "execute mode against the real, empty approved manifest always aborts today — this is correct, not a bug");
  assert(result.abortReason?.includes("manifestist") ?? false, "the abort reason names the manifest check specifically");
  assert(store.size === 1, "nothing was deleted");
});

await group("13. runCleanup in execute mode requires a backupId and a verifiable backup", async () => {
  const { firestore: noBackupIdFirestore } = makeFakeFirestore({});
  const noBackupId = await runCleanup(noBackupIdFirestore, "u1", { mode: "execute" });
  assert(!noBackupId.overallSuccess, "missing backupId aborts execute mode");

  const { firestore, store } = makeFakeFirestore({});
  const unverifiable = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_missing" });
  assert(!unverifiable.overallSuccess, "a backupId that cannot be verified aborts execute mode");
  assert(unverifiable.abortReason?.includes("Varukoopia") ?? false, "the abort reason names the backup verification failure");
  assert(store.size === 0, "nothing was deleted when the backup could not be verified");
});

await group("14. runCleanup: full happy path — verified backup, matching snapshot AND manifest, clean structure — actually deletes per the allowlist", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1");
  seedFullBackup(store, "u1", "bk_real", {
    tasks: Array.from({ length: 35 }, (_, i) => ({ id: `d${i}`, data: { n: i } })),
  });

  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  assert(result.overallSuccess, `execute mode succeeds end to end (abortReason: ${result.abortReason})`);
  assert(result.deletedCounts["tasks"] === 35, "all 35 tasks were deleted");
  assert(result.deletedCounts["entityLinks"] === 17, "all 17 entity links were deleted");
  assert(result.deletedCounts["notifications"] === 35, "all 35 notifications were deleted");
  assert(
    [...store.keys()].filter((k) => k.startsWith("users/u1/") && !k.includes("_fullBackups")).length === 0,
    "every allowlisted collection's documents are gone; only the (preserved) backup namespace remains",
  );
  assert(store.has("users/u1/_fullBackups/bk_real"), "the backup itself is still completely intact after cleanup");
});

await group("15. runCleanup: document REPLACEMENT between approval and execution aborts the whole run, deleting nothing", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1");
  seedFullBackup(store, "u1", "bk_real", { tasks: [{ id: "d0", data: { n: 0 } }] });

  // Same COUNT as approved (still 35 tasks) — but one task was deleted and
  // a brand-new one (same id reused is not even needed here) was added.
  store.delete("users/u1/tasks/d0");
  mutateDoc(store, touch, "users/u1/tasks/dNEW", { n: 12345 });

  const sizeBefore = store.size;
  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  assert(!result.overallSuccess, "the run aborts — a count-only check would have missed this (35 before, 35 after)");
  assert(result.abortReason?.includes("manifestist") ?? false, "the abort reason names the manifest mismatch");
  assert(store.size === sizeBefore, "nothing was deleted anywhere — a document replacement in ONE collection halts the ENTIRE run");
});

await group("16. runCleanup: CONTENT change (same id, same count) between approval and execution aborts the whole run", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1");
  seedFullBackup(store, "u1", "bk_real", { tasks: [{ id: "d0", data: { n: 0 } }] });

  mutateDoc(store, touch, "users/u1/tasks/d0", { n: 999999 }); // same id, same count — content changed after approval

  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  assert(!result.overallSuccess, "a same-count, same-id content change still aborts the run");
  assert(
    result.manifestCheck.mismatches.some((m) => m.id === "d0" && m.reason === "updateTime_changed"),
    "the specific document and the correct reason are reported",
  );
});

await group("17. runCleanup: resumability — a second run after partial prior deletion finishes the job without aborting", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1"); // approved BEFORE any deletion
  seedFullBackup(store, "u1", "bk_real", { tasks: [{ id: "d0", data: { n: 0 } }] });

  // Simulate a PRIOR partial run having already deleted some tasks and all notifications.
  for (let i = 0; i < 20; i++) store.delete(`users/u1/tasks/d${i}`);
  for (let i = 0; i < 35; i++) store.delete(`users/u1/notifications/d${i}`);

  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  assert(result.overallSuccess, `the resumed run is NOT aborted by the already-deleted documents being absent (abortReason: ${result.abortReason})`);
  assert(result.deletedCounts["tasks"] === 15, "only the 15 remaining (still-approved) tasks were deleted this time");
  assert(result.deletedCounts["notifications"] === 0, "an already-fully-cleared collection reports zero deletions this run, without error");
});

await group("18. runCleanup: a simulated mid-cleanup failure stops cleanly, with prior progress intact and nothing silently swallowed", async () => {
  // "tasks" is processed before "plans" in CLEANUP_ALLOWLIST's order — this
  // targets the failure at deletes under users/u1/plans/ specifically, so
  // it cannot accidentally land inside backup verification's OWN internal
  // scratch-path writes/cleanup (those live under _restoreVerificationScratch,
  // never under users/u1/plans/), regardless of how many commits that phase makes.
  const { firestore, store, touch } = makeFakeFirestore({}, { failDeleteUnderPrefix: "users/u1/plans/" });
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1");
  seedFullBackup(store, "u1", "bk_real", { tasks: [{ id: "d0", data: { n: 0 } }] });

  let threw = false;
  let caughtMessage = "";
  try {
    await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  } catch (err) {
    threw = true;
    caughtMessage = err instanceof Error ? err.message : String(err);
  }
  assert(threw, "a mid-cleanup commit failure propagates as a real error, never silently swallowed");
  assert(caughtMessage.includes("Simuleeritud viga"), "the real underlying error is preserved, not replaced with something generic");
  assert(
    [...store.keys()].every((k) => !k.startsWith("users/u1/tasks/")),
    "the collection processed BEFORE the failure (tasks) is still fully deleted — real, durable progress",
  );
  assert(
    [...store.keys()].some((k) => k.startsWith("users/u1/plans/")),
    "the collection where the failure occurred (plans) still has its documents — the failed batch applied nothing, matching real Firestore batch atomicity",
  );
  assert(
    [...store.keys()].some((k) => k.startsWith("users/u1/calendars/")),
    "collections not yet reached when the failure occurred (later in allowlist order) are still intact, ready for a later resumed run",
  );
});

await group("19. runCleanup: after the failure above, a second, resumed run (same approved manifest) finishes cleanly", async () => {
  const { firestore, store, touch } = makeFakeFirestore({}); // no injected failure this time
  for (const [path, count] of Object.entries(APPROVED_SNAPSHOT_2026_11_20)) {
    seedDocs(store, touch, "u1", path, count);
  }
  const approved = await approveCurrentState(firestore, "u1");
  seedFullBackup(store, "u1", "bk_real", { tasks: [{ id: "d0", data: { n: 0 } }] });

  // Simulate exactly test 18's post-failure state: tasks already gone, everything else still present.
  for (let i = 0; i < 35; i++) store.delete(`users/u1/tasks/d${i}`);

  const result = await runCleanup(firestore, "u1", { mode: "execute", backupId: "bk_real", approvedManifestOverride: approved });
  assert(result.overallSuccess, `the resumed run completes successfully (abortReason: ${result.abortReason})`);
  assert(result.deletedCounts["tasks"] === 0, "tasks (already gone from the earlier failed run) needed nothing further");
  assert(result.deletedCounts["plans"] === 2, "plans (never reached before the earlier failure) is now fully deleted");
  assert(
    [...store.keys()].filter((k) => k.startsWith("users/u1/") && !k.includes("_fullBackups")).length === 0,
    "the resumed run finishes the job completely, with no scope broadened beyond the original approval",
  );
});

// ── 20. runCleanup "capture-manifest" mode — read-only reconnaissance ──────

await group("20. runCleanup in capture-manifest mode is read-only and returns the exact manifest for human review", async () => {
  const { firestore, store, touch } = makeFakeFirestore({});
  seedDocs(store, touch, "u1", "tasks", 3);
  const sizeBefore = store.size;
  const result = await runCleanup(firestore, "u1", { mode: "capture-manifest" });
  assert(result.overallSuccess, "capture-manifest always reports success — it never deletes, so there is nothing to fail at");
  assert(result.capturedManifest?.["tasks"]?.length === 3, "the exact live documents are captured");
  assert(Object.keys(result.deletedCounts).length === 0, "nothing is ever deleted in this mode");
  assert(store.size === sizeBefore, "the store is completely unchanged");
});

// ── 21. main() — fail-fast order, no real Firebase credentials needed ──────

await group("21. main() fails safely with no target account and no Admin calls", async () => {
  const code = await main([], { EXPECTED_UID: "u1", EXPECTED_PROJECT_ID: "p1" });
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("22. main() requires EXPECTED_UID and EXPECTED_PROJECT_ID before any Admin call", async () => {
  const noUid = await main(["someone@example.com"], { EXPECTED_PROJECT_ID: "p1" });
  assert(noUid === 1, "missing EXPECTED_UID returns exit code 1");
  const noProject = await main(["someone@example.com"], { EXPECTED_UID: "u1" });
  assert(noProject === 1, "missing EXPECTED_PROJECT_ID returns exit code 1");
});

await group("23. main() rejects a FIREBASE_PROJECT_ID/EXPECTED_PROJECT_ID mismatch before any Admin call", async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "expected-project",
    FIREBASE_PROJECT_ID: "a-totally-different-project",
  });
  assert(code === 1, "a project id mismatch returns exit code 1");
});

await group("24. main() rejects an invalid CLEANUP_MODE (now including \"capture-manifest\" as a valid one)", async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
    CLEANUP_MODE: "DELETE_EVERYTHING_NOW",
  });
  assert(code === 1, "an unrecognized CLEANUP_MODE value is rejected, never silently treated as dry-run or execute");
});

await group("25. main() requires the exact CONFIRMATION_PHRASE for execute mode, before any Admin call", async () => {
  const wrongPhrase = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
    CLEANUP_MODE: "execute",
    CONFIRMATION_PHRASE: "delete please",
  });
  assert(wrongPhrase === 1, "a wrong/weak confirmation phrase is rejected");

  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => { messages.push(String(msg)); };
  try {
    await main(["someone@example.com"], {
      EXPECTED_UID: "u1",
      EXPECTED_PROJECT_ID: "p1",
      FIREBASE_PROJECT_ID: "p1",
      CLEANUP_MODE: "execute",
    });
    assert(messages.some((m) => m.includes(CONFIRMATION_PHRASE)), "the error names the exact required phrase");
  } finally {
    console.error = originalError;
  }
});

// ── 26. Structural safety: no Storage, no Auth mutation, no account-deletion reuse, no runtime manifest override ──

await group("26. testDataCleanup.ts never touches Storage, never mutates Auth, never reuses account deletion", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/testDataCleanup.ts"), "utf8");
  const forbidden = [
    "getFirebaseAdminStorage",
    ".bucket(",
    "getStorage",
    "setCustomUserClaims",
    "deleteUser(",
    "updateUser(",
    "accountDeletionService",
    "deleteAllUserData",
  ];
  for (const token of forbidden) {
    assert(!src.includes(token), `source does not contain "${token}"`);
  }
});

await group("27. main()'s own call to runCleanup() never sets approvedManifestOverride — the real CLI path can never override the reviewed manifest", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/testDataCleanup.ts"), "utf8");
  const mainStart = src.indexOf("export async function main(");
  assert(mainStart !== -1, "sanity check: main() is found in source");
  const mainBody = src.slice(mainStart);
  assert(
    !mainBody.includes("approvedManifestOverride"),
    "main()'s entire function body (to end of file) never references approvedManifestOverride — only testDataCleanup.test.ts does, to exercise the orchestration with synthetic data",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
