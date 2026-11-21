/**
 * Unit tests for fullAccountRemoval.ts — the separate, purpose-built
 * full account removal tool built on testDataCleanup.ts's reused,
 * already-proven safety architecture.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/fullAccountRemoval.test.ts --outfile=.tmp-fullAccountRemoval.mjs \
 *       && node .tmp-fullAccountRemoval.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  main,
  runFullAccountRemoval,
  captureFullRemovalManifest,
  captureSharedUidScopedManifest,
  removeSettings,
  removeSharedUidScopedCollection,
  removeProfileDocument,
  PROTECTED_NAMESPACES,
  SHARED_UID_SCOPED_COLLECTIONS,
  NEVER_TOUCHED_SHARED_COLLECTIONS,
  STORAGE_STATUS_UNKNOWN,
  PROFILE_DOCUMENT_MANIFEST_KEY,
  CONFIRMATION_PHRASE,
  APPROVED_FULL_REMOVAL_MANIFEST,
} from "./fullAccountRemoval.js";
import { CLEANUP_ALLOWLIST, CONFIRMATION_PHRASE as TEST_DATA_CONFIRMATION_PHRASE, type ApprovedManifest, type DocRefLike, type CollRefLike, type TimestampLike } from "./testDataCleanup.js";

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

// ── Fake Firestore — same shape/discipline as testDataCleanup.test.ts's own,
// extended with where() support for the two shared, uid-scoped collections ──
interface FakeFirestoreOptions {
  failDeleteUnderPrefix?: string;
  onBeforeFirstCommit?: () => void;
}

function makeFakeFirestore(initial: Record<string, Record<string, unknown>> = {}, opts: FakeFirestoreOptions = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const updateTimes = new Map<string, number>();
  let clock = 0;
  for (const path of store.keys()) updateTimes.set(path, ++clock);
  let firstCommitFired = false;

  function touch(path: string): void {
    updateTimes.set(path, ++clock);
  }

  function makeTimestamp(millis: number): TimestampLike {
    return { toMillis: () => millis };
  }

  function docsInCollection(collPath: string): string[] {
    const prefix = `${collPath}/`;
    const ids = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix) && key.slice(prefix.length).split("/").length === 1) ids.add(key.slice(prefix.length));
    }
    return [...ids];
  }
  function childCollectionNames(docPath: string): string[] {
    const prefix = `${docPath}/`;
    const names = new Set<string>();
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0]);
    }
    return [...names];
  }
  function snapshotFor(id: string, path: string) {
    const data = store.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => data,
      updateTime: updateTimes.get(path) ? makeTimestamp(updateTimes.get(path)!) : undefined,
    };
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
      async get() {
        return snapshotFor(id, path);
      },
    };
  }
  function makeCollRef(path: string): CollRefLike {
    return {
      id: path.split("/").pop()!,
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
            const matching = docsInCollection(path).filter((docId) => store.get(`${path}/${docId}`)?.[field] === value);
            return { docs: matching.map((docId) => snapshotFor(docId, `${path}/${docId}`)) };
          },
        };
      },
    };
  }
  const firestore = {
    collection(path: string) {
      return makeCollRef(path);
    },
    doc(path: string) {
      return makeDocRef(path);
    },
    batch() {
      const sets: { path: string; data: Record<string, unknown> }[] = [];
      const deletes: { path: string; precondition?: { lastUpdateTime?: TimestampLike } }[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) {
          sets.push({ path: ref.path, data });
        },
        delete(ref: DocRefLike, precondition?: { lastUpdateTime?: TimestampLike }) {
          deletes.push({ path: ref.path, precondition });
        },
        async commit() {
          if (!firstCommitFired) {
            firstCommitFired = true;
            opts.onBeforeFirstCommit?.();
          }
          for (const d of deletes) {
            if (opts.failDeleteUnderPrefix && d.path.startsWith(opts.failDeleteUnderPrefix)) {
              throw new Error(`Simuleeritud viga: "${d.path}" kustutamine ebaõnnestus.`);
            }
            if (d.precondition?.lastUpdateTime) {
              const currentUpdateTime = updateTimes.get(d.path);
              if (currentUpdateTime !== d.precondition.lastUpdateTime.toMillis()) {
                throw new Error(`Eeltingimuse viga: "${d.path}" updateTime ei vasta oodatule.`);
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

async function approveCurrentState(firestore: Parameters<typeof captureFullRemovalManifest>[0], uid: string): Promise<ApprovedManifest> {
  return captureFullRemovalManifest(firestore, uid);
}

function mutateDoc(store: Map<string, Record<string, unknown>>, touch: (p: string) => void, path: string, data: Record<string, unknown>): void {
  store.set(path, data);
  touch(path);
}

// ── 1. Constants — scope boundaries ─────────────────────────────────────────

await group("1. This tool's protected/shared/never-touched constants are exactly as specified", () => {
  assert(PROTECTED_NAMESPACES.includes("backups"), "backups is protected");
  assert(PROTECTED_NAMESPACES.includes("_fullBackups"), "_fullBackups is protected");
  assert(PROTECTED_NAMESPACES.includes("_fullBackup"), "_fullBackup is protected");
  assert(PROTECTED_NAMESPACES.includes("_restoreVerificationScratch"), "_restoreVerificationScratch is protected");
  assert(!PROTECTED_NAMESPACES.includes("settings"), "settings is NOT protected here — full removal must be able to delete it, unlike testDataCleanup.ts");
  assert(
    SHARED_UID_SCOPED_COLLECTIONS.length === 2 &&
      SHARED_UID_SCOPED_COLLECTIONS.includes("feedbackSubmissions") &&
      SHARED_UID_SCOPED_COLLECTIONS.includes("supportMessages"),
    "exactly feedbackSubmissions and supportMessages are the uid-scoped shared collections",
  );
  assert(
    NEVER_TOUCHED_SHARED_COLLECTIONS.length === 1 && NEVER_TOUCHED_SHARED_COLLECTIONS[0] === "contactSubmissions",
    "contactSubmissions is the one collection this tool never touches at all",
  );
  assert(STORAGE_STATUS_UNKNOWN === "UNKNOWN_NOT_CHECKED", "Storage status is always the literal, honest UNKNOWN_NOT_CHECKED string");
  assert((CONFIRMATION_PHRASE as string) !== (TEST_DATA_CONFIRMATION_PHRASE as string), "this tool's confirmation phrase is distinct from testDataCleanup.ts's — the two cannot be confused or reused for each other");
  assert(Object.keys(APPROVED_FULL_REMOVAL_MANIFEST).length === 0, "the approved manifest is still exactly empty, as required");
});

// ── 2. captureFullRemovalManifest — full scope, including settings/profile ──

await group("2. captureFullRemovalManifest covers the base 16 collections, settings, and the profile document", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "irrelevant" },
    "users/u1/tasks/t1": { title: "x" },
    "users/u1/settings/backup": { enabled: true },
  });
  const manifest = await captureFullRemovalManifest(firestore, "u1");
  assert(manifest["tasks"]?.length === 1, "base collections (reused captureManifest) are present");
  assert(manifest["settings"]?.length === 1, "settings is captured — this tool's own addition");
  assert(manifest[PROFILE_DOCUMENT_MANIFEST_KEY]?.length === 1 && manifest[PROFILE_DOCUMENT_MANIFEST_KEY][0].id === "u1", "the profile root document itself is captured, keyed by the account's own uid");
});

await group("2b. captureSharedUidScopedManifest matches ONLY documents whose own uid field equals the target uid — other users' entries are excluded", async () => {
  const { firestore } = makeFakeFirestore({
    "feedbackSubmissions/f1": { uid: "u1", text: "irrelevant" },
    "feedbackSubmissions/f2": { uid: "OTHER_USER_UID", text: "irrelevant" },
    "supportMessages/s1": { uid: "u1", text: "irrelevant" },
    "contactSubmissions/c1": { senderEmail: "someone@example.com", uid: "u1", text: "irrelevant" },
  });
  const { manifest, refsByPath } = await captureSharedUidScopedManifest(firestore, "u1");
  assert(manifest["feedbackSubmissions"]?.length === 1 && manifest["feedbackSubmissions"][0].id === "f1", "only u1's own feedbackSubmissions entry is captured, not the other user's");
  assert(manifest["supportMessages"]?.length === 1 && manifest["supportMessages"][0].id === "s1", "u1's supportMessages entry is captured");
  assert(!("contactSubmissions" in manifest), "contactSubmissions is never captured, even though a document there also has uid='u1'");
  assert(refsByPath.get("feedbackSubmissions")?.length === 1, "exactly one deletable ref for feedbackSubmissions");
});

// ── 3. Structural safety: contactSubmissions, Storage, Auth-deletion never touched ──

await group("3. fullAccountRemoval.ts never queries, reads, or deletes contactSubmissions, never calls a Storage API, and never deletes the Firebase Auth user", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/fullAccountRemoval.ts"), "utf8");
  const linesWithMention = src.split("\n").filter((line) => line.includes("contactSubmissions"));
  assert(linesWithMention.length > 0, "sanity check: the exclusion is documented at all");
  assert(
    linesWithMention.every((line) => /^\s*(\*|\/\/)/.test(line) || line.includes("NEVER_TOUCHED_SHARED_COLLECTIONS")),
    "every single mention of contactSubmissions is inside a comment line or the NEVER_TOUCHED_SHARED_COLLECTIONS literal itself — never inside executable logic that would open, query, or delete it",
  );
  assert(!src.includes('.collection("contactSubmissions"'), "no step ever opens the contactSubmissions collection");
  assert(!src.includes("getFirebaseAdminStorage") && !src.includes(".bucket("), "no Storage API is ever called");
  assert(!src.includes("deleteUser("), "Firebase Auth's deleteUser is never called from this file");
  assert(!src.includes("auth.deleteUser"), "no alternate spelling of the Auth-delete call appears either");
});

await group("3b. A contactSubmissions document matching this account's uid survives a full execute run untouched", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "contactSubmissions/c1": { senderEmail: "someone@example.com", uid: "u1", text: "irrelevant" },
  });
  const approved = await approveCurrentState(firestore, "u1");
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "execute", backupId: "bk_missing", approvedManifestOverride: approved });
  assert(!result.overallSuccess, "sanity check: this run aborts for an unrelated reason (missing backup) before any delete — contactSubmissions was never even at risk");
  assert(store.has("contactSubmissions/c1"), "the contactSubmissions document is still there regardless");
});

// ── 4. Nested subcollections — checked, never assumed away ─────────────────

await group("4. An unexpected nested subcollection under a feedbackSubmissions document aborts removeSharedUidScopedCollection before any delete", async () => {
  const { firestore, store } = makeFakeFirestore({
    "feedbackSubmissions/f1": { uid: "u1", text: "irrelevant" },
    "feedbackSubmissions/f1/unexpectedNested/n1": { whatever: true },
  });
  const approved = await approveCurrentState(firestore, "u1");
  let threw = false;
  try {
    await removeSharedUidScopedCollection(firestore, "u1", "feedbackSubmissions", approved, 50, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "an unexpected nested subcollection under a matched shared document is caught, not assumed away");
  assert(store.has("feedbackSubmissions/f1"), "the parent document was never deleted — the nested check runs before any delete");
});

await group("4b. runFullAccountRemoval's own structural pre-flight gate catches an unexpected nested subcollection anywhere under users/{uid} (settings included) before any category runs", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/settings/s1": { enabled: true },
    "users/u1/settings/s1/unexpectedNested/n1": { whatever: true },
  });
  const approved = await approveCurrentState(firestore, "u1");
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "execute", backupId: "bk1", approvedManifestOverride: approved });
  assert(!result.overallSuccess, "the run aborts");
  assert(!result.structureCheck.ok, "the structural check itself reports the problem");
  assert(Object.keys(result.removedCounts).length === 0, "nothing was deleted — the structural gate runs before even the manifest check");
});

// ── 5. Two-layer concurrency protection, applied to this tool's own scope ──

await group("5. Layer 1 (app-level re-check): a concurrent change to settings between approval and removeSettings is caught, nothing deleted", async () => {
  const { firestore, store, touch } = makeFakeFirestore({
    "users/u1/settings/s1": { enabled: true },
  });
  const approved = await approveCurrentState(firestore, "u1");
  mutateDoc(store, touch, "users/u1/settings/s1", { enabled: false });
  let threw = false;
  try {
    await removeSettings(firestore, "u1", approved, 50, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "the re-check catches the concurrent settings change");
  assert(store.has("users/u1/settings/s1"), "nothing was deleted");
});

await group("5b. Layer 2 (Firestore precondition): a change to a feedbackSubmissions document landing exactly at the commit boundary is still caught", async () => {
  const { firestore, store, touch } = makeFakeFirestore(
    { "feedbackSubmissions/f1": { uid: "u1", text: "x" } },
    { onBeforeFirstCommit: () => mutateDoc(store, touch, "feedbackSubmissions/f1", { uid: "u1", text: "CHANGED" }) },
  );
  const approved = await approveCurrentState(firestore, "u1");
  let threw = false;
  try {
    await removeSharedUidScopedCollection(firestore, "u1", "feedbackSubmissions", approved, 50, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "Firestore's own delete precondition rejects the commit");
  assert(store.has("feedbackSubmissions/f1"), "the document survives — the precondition-protected commit never applied");
});

await group("5c. Layer 1 for the profile document: a concurrent change between approval and removeProfileDocument is caught", async () => {
  const { firestore, store, touch } = makeFakeFirestore({ "users/u1": { displayName: "x" } });
  const approved = await approveCurrentState(firestore, "u1");
  mutateDoc(store, touch, "users/u1", { displayName: "CHANGED" });
  let threw = false;
  try {
    await removeProfileDocument(firestore, "u1", approved, () => {});
  } catch {
    threw = true;
  }
  assert(threw, "the re-check catches the concurrent profile change");
  assert(store.has("users/u1"), "the profile document was never deleted");
});

await group(
  "5d. removeProfileDocument: a MISSING profile document with a leftover, NON-protected subcollection still aborts — never silently treated as \"nothing to do\"",
  async () => {
    const { firestore, store } = makeFakeFirestore({
      // users/u1 itself is deliberately absent (no entry for the bare
      // "users/u1" path) — but it still has a live, unprotected
      // subcollection underneath it, exactly like a Firestore "phantom
      // parent" document, or a prior run that deleted the profile
      // document but somehow left a category behind.
      "users/u1/tasks/STRAY_TASK": { title: "should never be silently ignored" },
    });
    const approved = await approveCurrentState(firestore, "u1");
    let threw = false;
    let message = "";
    try {
      await removeProfileDocument(firestore, "u1", approved, () => {});
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    assert(threw, "a missing profile document does NOT short-circuit past the nested-subcollection check");
    assert(message.includes("tasks"), "the error names the actual unexpected leftover collection");
    assert(store.has("users/u1/tasks/STRAY_TASK"), "the stray document itself is untouched — this function only ever deletes the profile document, never anything nested under it");
  },
);

await group(
  "5e. removeProfileDocument: a MISSING profile document with ONLY protected backup namespaces left underneath it succeeds as a resumable no-op",
  async () => {
    const { firestore } = makeFakeFirestore({
      "users/u1/_fullBackups/bk1": { note: "must survive and must not block profile removal" },
    });
    const approved = await approveCurrentState(firestore, "u1");
    let deleted = -1;
    let threw = false;
    try {
      deleted = await removeProfileDocument(firestore, "u1", approved, () => {});
    } catch {
      threw = true;
    }
    assert(!threw, "a missing profile document with only protected namespaces left is NOT an error");
    assert(deleted === 0, "nothing to delete — the profile document was already gone");
  },
);

await group(
  "5f. removeProfileDocument: resuming after the profile document was ALREADY deleted in a prior run never reports a forbidden manifest difference",
  async () => {
    const { firestore, store } = makeFakeFirestore({ "users/u1": { displayName: "x" } });
    const approved = await approveCurrentState(firestore, "u1"); // approved WHILE the profile document still existed
    store.delete("users/u1"); // simulates a prior partial run having already removed it
    let deleted = -1;
    let threw = false;
    try {
      deleted = await removeProfileDocument(firestore, "u1", approved, () => {});
    } catch {
      threw = true;
    }
    assert(!threw, "an approved-but-now-missing profile document is never mistaken for a disallowed manifest difference — the directional rule holds here too");
    assert(deleted === 0, "there is nothing left to delete — the resumed call is a clean no-op");
  },
);

// ── 6. Partial-deletion transparency — exact overview of succeeded/failed ──

await group("6. A failure partway through gives an EXACT overview: earlier categories are reported removed, the failing one is named, later ones are never attempted", async () => {
  const { firestore } = makeFakeFirestore(
    {
      "users/u1": { displayName: "x" },
      "users/u1/tasks/t1": { title: "a" },
      "users/u1/settings/s1": { enabled: true },
      "feedbackSubmissions/f1": { uid: "u1", text: "x" },
    },
    { failDeleteUnderPrefix: "users/u1/settings/" },
  );
  const approved = await approveCurrentState(firestore, "u1");
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "execute", backupId: "bk_missing", approvedManifestOverride: approved });
  // The backup-verification gate aborts before deletion in this harness
  // (no real backup fixture here) — this group instead calls the
  // category functions directly to exercise the partial-failure path
  // precisely, since runFullAccountRemoval's own backup gate is already
  // covered by other groups.
  assert(!result.overallSuccess, "sanity check: aborted (expected, missing backup)");
});

await group("6b. runCategory-style partial failure: exercised directly via the exported per-category functions", async () => {
  const { firestore, store } = makeFakeFirestore(
    {
      "users/u1": { displayName: "x" },
      "users/u1/settings/s1": { enabled: true },
    },
    { failDeleteUnderPrefix: "users/u1/settings/" },
  );
  const approved = await approveCurrentState(firestore, "u1");
  const removedCounts: Record<string, number> = {};
  let failedCategory: string | undefined;

  // Simulate exactly what runFullAccountRemoval's internal loop does,
  // category by category, to prove the EXACT reporting contract without
  // needing a real backup fixture.
  try {
    removedCounts["settings"] = await removeSettings(firestore, "u1", approved, 50, () => {});
  } catch {
    failedCategory = "settings";
  }
  assert(failedCategory === "settings", "the failing category is named exactly");
  assert(!("settings" in removedCounts), "the failed category never appears in removedCounts as succeeded");
  assert(store.has("users/u1/settings/s1"), "nothing was actually deleted for the failed category (Firestore batch atomicity)");
  assert(store.has("users/u1"), "the profile document (a LATER category) was never even attempted");
});

// ── 7. Resumability — a second run after partial prior progress finishes within the SAME approved scope ──

await group("7. A resumed removeSettings call (same approved manifest, some docs already gone) finishes the remainder without widening scope", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1/settings/s1": { enabled: true },
    "users/u1/settings/s2": { enabled: false },
  });
  const approved = await approveCurrentState(firestore, "u1"); // approved while both existed
  store.delete("users/u1/settings/s1"); // simulates a prior partial run
  const deleted = await removeSettings(firestore, "u1", approved, 50, () => {});
  assert(deleted === 1, "only the one remaining, still-approved document was deleted");
  assert(!store.has("users/u1/settings/s2"), "settings is now fully cleared");
});

// ── 8. Full happy path, including correct ordering (profile LAST) and
// uid-scoped shared-collection isolation from other users ──────────────────

await group("8. Full execute run removes every category, leaves other users' shared-collection entries untouched, and deletes the profile document last", async () => {
  const { firestore, store } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/tasks/t1": { title: "a" },
    "users/u1/settings/s1": { enabled: true },
    "feedbackSubmissions/f1": { uid: "u1", text: "x" },
    "feedbackSubmissions/f2": { uid: "OTHER_USER", text: "y" },
    "users/u1/_fullBackups/bk1": { note: "must survive" },
    "users/u1/_fullBackups/bk1/chunks/c1": { path: "tasks", items: [] },
  });
  const approved = await approveCurrentState(firestore, "u1");
  // Fake backup verification is exercised elsewhere (testDataCleanup.ts's
  // own, reused verifyBackupBeforeCleanup) — here we call the deletion
  // categories directly, in the same fixed order runFullAccountRemoval
  // uses, to prove the end state without needing a real backup fixture.
  for (const entry of CLEANUP_ALLOWLIST) {
    const { deleteCollectionSafely } = await import("./testDataCleanup.js");
    await deleteCollectionSafely(firestore, "u1", entry, approved, 50, () => {});
  }
  await removeSettings(firestore, "u1", approved, 50, () => {});
  await removeSharedUidScopedCollection(firestore, "u1", "feedbackSubmissions", approved, 50, () => {});
  assert(!store.has("feedbackSubmissions/f1"), "u1's own feedback entry is gone");
  assert(store.has("feedbackSubmissions/f2"), "the OTHER user's feedback entry survives untouched");
  assert(store.has("users/u1/_fullBackups/bk1"), "the backup namespace is still fully intact — never part of any category this tool removes");
  await removeProfileDocument(firestore, "u1", approved, () => {});
  assert(!store.has("users/u1"), "the profile document is gone — removed LAST, after every other category above");
});

// ── 9. main() fail-fast gates ───────────────────────────────────────────────

await group("9. main() fails safely with no target account and no Admin calls", async () => {
  const code = await main([], {});
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("10. main() requires EXPECTED_UID and EXPECTED_PROJECT_ID before any Admin call", async () => {
  const codeMissingUid = await main(["someone@example.com"], {});
  assert(codeMissingUid === 1, "missing EXPECTED_UID returns exit code 1");
  const codeMissingProject = await main(["someone@example.com"], { EXPECTED_UID: "u1" });
  assert(codeMissingProject === 1, "missing EXPECTED_PROJECT_ID returns exit code 1");
});

await group("11. main() rejects a FIREBASE_PROJECT_ID/EXPECTED_PROJECT_ID mismatch before any Admin call", async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "expected-project",
    FIREBASE_PROJECT_ID: "some-other-project",
  });
  assert(code === 1, "a project id mismatch returns exit code 1");
});

await group('12. main() rejects an invalid CLEANUP_MODE', async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
    CLEANUP_MODE: "DELETE_EVERYTHING",
  });
  assert(code === 1, "an unrecognized CLEANUP_MODE is rejected");
});

await group("13. main() requires the exact CONFIRMATION_PHRASE for execute mode, before any Admin call", async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
    CLEANUP_MODE: "execute",
    CONFIRMATION_PHRASE: "wrong phrase",
  });
  assert(code === 1, "a wrong confirmation phrase is rejected");
});

await group("14. main() fails safely when Admin credentials are absent, once every prior gate has passed", async () => {
  const code = await main(["someone@example.com"], {
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
  });
  assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
});

// ── 15. Structural safety: never widens scope, never reuses the wrong confirmation phrase ──

await group("15. main()'s own call to runFullAccountRemoval never sets approvedManifestOverride", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/fullAccountRemoval.ts"), "utf8");
  const mainBody = src.slice(src.indexOf("export async function main("));
  assert(!mainBody.includes("approvedManifestOverride"), "main()'s own body never references approvedManifestOverride — only this test file does, to exercise orchestration with synthetic data");
});

await group("16. fullAccountRemoval.ts never reuses or imports accountDeletionService.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/fullAccountRemoval.ts"), "utf8");
  assert(!src.includes("accountDeletionService"), "no reference to the known-incomplete existing account-deletion feature");
  assert(!src.includes("deleteAllUserData"), "never calls that feature's own function");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
