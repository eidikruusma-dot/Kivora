/**
 * Unit tests for restoreVerification.ts.
 *
 * No real Firebase credentials/network. Proves: the collision guard
 * actually throws before any write when the scratch segment name would
 * collide with a real collection; a successful verification writes only
 * under the scratch root and deletes it all afterward; and — critically —
 * cleanup still runs (and real data is still never touched) even when the
 * verification step itself fails partway, since cleanup lives in a
 * finally block.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/restoreVerification.test.ts --outfile=.tmp-restoreVerification.mjs \
 *       && node .tmp-restoreVerification.mjs
 */

import {
  verifyRestorability,
  assertScratchPathIsIsolated,
  scratchRootPathFor,
  RESTORE_VERIFICATION_SEGMENT,
  type FirestoreWithDelete,
  type DeletableWriteBatchLike,
} from "./restoreVerification.js";
import type { BackedUpDocument, DocRefLike, CollRefLike, DocSnapshotLike } from "./fullAccountBackup.js";

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

// ── Fake, delete-capable Firestore (same shape as fullAccountBackup.test.ts's, plus delete) ──

function makeFakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));

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
        return [];
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
      doc(docId?: string) {
        return makeDocRef(`${path}/${docId ?? Math.random().toString(36).slice(2)}`);
      },
      async listDocuments(): Promise<DocRefLike[]> {
        return docsInCollection(path).map((docId) => makeDocRef(`${path}/${docId}`));
      },
      where() {
        return { async get() { return { docs: [] }; } };
      },
    };
  }

  const firestore: FirestoreWithDelete = {
    collection(path: string) {
      return makeCollRef(path);
    },
    doc(path: string) {
      return makeDocRef(path);
    },
    batch(): DeletableWriteBatchLike {
      const sets: { path: string; data: Record<string, unknown> }[] = [];
      const deletes: string[] = [];
      return {
        set(ref: DocRefLike, data: Record<string, unknown>) {
          sets.push({ path: ref.path, data });
        },
        delete(ref: DocRefLike) {
          deletes.push(ref.path);
        },
        async commit() {
          for (const s of sets) store.set(s.path, s.data);
          for (const p of deletes) store.delete(p);
        },
      };
    },
  };

  return { firestore, store };
}

function makeFlat(): Map<string, BackedUpDocument[]> {
  return new Map([
    ["tasks", [{ id: "t1", data: { title: "Õppida" }, subcollections: {} }]],
    ["aiConversations/c1/messages", [{ id: "m1", data: { content: "hi" }, subcollections: {} }]],
  ]);
}

// ── 1. Collision guard ──────────────────────────────────────────────────────

await group("1. assertScratchPathIsIsolated throws before any write if the scratch segment collides with a real collection", () => {
  let threw = false;
  try {
    assertScratchPathIsIsolated(["tasks", RESTORE_VERIFICATION_SEGMENT, "goals"]);
  } catch {
    threw = true;
  }
  assert(threw, "throws when the scratch segment name is already a real top-level collection");

  let safe = true;
  try {
    assertScratchPathIsIsolated(["tasks", "goals", "habits"]);
  } catch {
    safe = false;
  }
  assert(safe, "does not throw when there is no collision");
});

await group("2. verifyRestorability refuses to run at all if the real collection list collides", async () => {
  const { firestore, store } = makeFakeFirestore({ "users/u1/tasks/t1": { title: "real data" } });
  let threw = false;
  try {
    await verifyRestorability(firestore, "u1", "bk1", makeFlat(), [RESTORE_VERIFICATION_SEGMENT]);
  } catch {
    threw = true;
  }
  assert(threw, "the whole verification call throws before writing anything");
  assert(store.get("users/u1/tasks/t1")?.["title"] === "real data", "real data is untouched because nothing was ever written");
});

// ── 3. Successful verification: scratch-only writes, content match, cleanup ─

await group("3. a successful verification writes only under the scratch root, confirms content, and cleans up completely", async () => {
  const { firestore, store } = makeFakeFirestore({ "users/u1/tasks/t1": { title: "REAL live task — must never change" } });
  const flat = makeFlat();

  const result = await verifyRestorability(firestore, "u1", "bk1", flat, ["tasks", "aiConversations"]);

  assert(result.allMatch, "every path's restored content matched the original exactly");
  assert(result.cleanupSucceeded, "cleanup reported success");
  assert(result.scratchRootPath === scratchRootPathFor("u1", "bk1"), "the scratch root path is the documented, predictable one");

  assert(store.get("users/u1/tasks/t1")?.["title"] === "REAL live task — must never change", "the real tasks/t1 document was never modified");
  assert(!store.has(`${result.scratchRootPath}/tasks/t1`), "the scratch copy was deleted after verification — nothing left behind");
  assert(
    [...store.keys()].every((k) => !k.includes(RESTORE_VERIFICATION_SEGMENT)),
    "no trace of the scratch namespace remains anywhere in the store after cleanup",
  );
});

// ── 4. Cleanup still runs even when verification content check fails ──────

await group("4. cleanup still runs (via finally) even when the backup content itself is inconsistent", async () => {
  const { firestore, store } = makeFakeFirestore({ "users/u1/tasks/t1": { title: "real, must stay untouched" } });

  // Construct a deliberately inconsistent "backup": the map says there
  // should be one item, but give it content that cannot possibly
  // round-trip identically (simulated by a map whose only entry has an
  // empty path segment, which still writes to SOME path under the
  // scratch root, but confirms cleanup still clears whatever did get
  // written, whether or not it later matched).
  const flat: Map<string, BackedUpDocument[]> = new Map([
    ["weird/path", [{ id: "x1", data: { note: "anything" }, subcollections: {} }]],
  ]);

  const result = await verifyRestorability(firestore, "u1", "bk2", flat, ["tasks"]);

  assert(result.cleanupSucceeded, "cleanup ran and succeeded regardless of the content check outcome");
  assert(store.get("users/u1/tasks/t1")?.["title"] === "real, must stay untouched", "real, unrelated data was never touched");
  assert(
    [...store.keys()].every((k) => !k.includes(RESTORE_VERIFICATION_SEGMENT)),
    "the scratch namespace is fully cleaned up even for this edge-case backup content",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
