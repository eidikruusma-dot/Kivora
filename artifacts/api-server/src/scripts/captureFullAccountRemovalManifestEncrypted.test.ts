/**
 * Unit tests for captureFullAccountRemovalManifestEncrypted.ts — the
 * read-only, encrypted manifest-capture entry point for the
 * fullAccountRemoval tool, approved for a manually-triggered GitHub
 * Actions workflow.
 *
 * Same testing philosophy as captureManifestEncrypted.test.ts: main()'s
 * fail-fast gates that need no real Firebase credentials are exercised
 * directly; everything else main() does is exercised through the SAME
 * exported, pure functions main() itself calls — runFullAccountRemoval()
 * (already fully tested in fullAccountRemoval.test.ts, reused unmodified
 * here), buildSafeFullRemovalManifestExport(), resolveEntryPath(),
 * encryptBackup()/decryptBackup(), and printSafeSummary().
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/captureFullAccountRemovalManifestEncrypted.test.ts --outfile=.tmp-cfarme.mjs \
 *       && node .tmp-cfarme.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  main,
  buildSafeFullRemovalManifestExport,
  resolveEntryPath,
  printSafeSummary,
  formatSafeError,
  ErrorCode,
  type CaptureFullRemovalManifestEncryptedSummary,
} from "./captureFullAccountRemovalManifestEncrypted.js";
import { runFullAccountRemoval, PROFILE_DOCUMENT_MANIFEST_KEY } from "./fullAccountRemoval.js";
import { CLEANUP_ALLOWLIST, type FirestoreLike, type DocRefLike, type CollRefLike, type TimestampLike } from "./testDataCleanup.js";
import { encryptBackup, decryptBackup, BackupDecryptionError } from "./backupEncryption.js";

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

// ── Fake Firestore — same shape as fullAccountRemoval.test.ts's own, with where() support ──
function makeFakeFirestore(initial: Record<string, Record<string, unknown>> = {}): { firestore: FirestoreLike; store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const updateTimes = new Map<string, number>();
  let clock = 0;
  for (const path of store.keys()) updateTimes.set(path, ++clock);

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
    return { id, exists: data !== undefined, data: () => data, updateTime: updateTimes.get(path) ? makeTimestamp(updateTimes.get(path)!) : undefined };
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
  const firestore: FirestoreLike = {
    collection(path: string) {
      return makeCollRef(path);
    },
    doc(path: string) {
      return makeDocRef(path);
    },
    batch() {
      return { set() {}, delete() {}, async commit() {} };
    },
  };
  return { firestore, store };
}

// ── 1. main() fail-fast gates — no real Firebase credentials needed ────────

await group("1. main() fails safely with no MANIFEST_OWNER_EMAIL (no target account resolvable)", async () => {
  const code = await main([], { MANIFEST_ENCRYPTION_PASSPHRASE: "irrelevant-here" });
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("2. main() requires MANIFEST_EXPECTED_UID (via EXPECTED_UID) before any Admin call", async () => {
  const code = await main([], { OWNER_EMAIL: "someone@example.com" });
  assert(code === 1, "returns exit code 1 when EXPECTED_UID is missing");
});

await group("3. main() requires EXPECTED_PROJECT_ID before any Admin call", async () => {
  const code = await main([], { OWNER_EMAIL: "someone@example.com", EXPECTED_UID: "u1" });
  assert(code === 1, "returns exit code 1 when EXPECTED_PROJECT_ID is missing");
});

await group("4. main() rejects a FIREBASE_PROJECT_ID/EXPECTED_PROJECT_ID mismatch before any Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  try {
    const code = await main([], {
      OWNER_EMAIL: "someone@example.com",
      EXPECTED_UID: "u1",
      EXPECTED_PROJECT_ID: "expected-project",
      FIREBASE_PROJECT_ID: "some-other-project",
    });
    assert(code === 1, "returns exit code 1 on a project id mismatch");
    assert(
      !messages.some((m) => m.includes("expected-project") || m.includes("some-other-project")),
      "neither actual project id VALUE is echoed into the log",
    );
  } finally {
    console.error = originalError;
  }
});

await group("5. main() requires MANIFEST_ENCRYPTION_PASSPHRASE before any Admin call", async () => {
  const code = await main([], {
    OWNER_EMAIL: "someone@example.com",
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
  });
  assert(code === 1, "returns exit code 1 when the passphrase is missing");
});

await group("6. main() fails safely when Admin credentials are absent, once every prior gate has passed", async () => {
  const code = await main([], {
    OWNER_EMAIL: "someone@example.com",
    EXPECTED_UID: "u1",
    EXPECTED_PROJECT_ID: "p1",
    FIREBASE_PROJECT_ID: "p1",
    MANIFEST_ENCRYPTION_PASSPHRASE: "a-passphrase",
  });
  assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
});

// ── 7. Structural proof: execute mode, deletion, and Storage/Auth are unreachable ──

await group("7. captureFullAccountRemovalManifestEncrypted.ts is structurally incapable of entering execute mode or deleting/touching Storage/Auth", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureFullAccountRemovalManifestEncrypted.ts"), "utf8");
  assert(!src.includes('"execute"'), 'the literal mode value "execute" never appears anywhere in this file');
  assert(!src.includes("CONFIRMATION_PHRASE"), "never references the deletion confirmation phrase");
  assert(!src.includes("BACKUP_ID"), "never references BACKUP_ID");
  assert(src.includes('mode: "capture-manifest"'), 'the ONE mode value it ever passes to runFullAccountRemoval() is the literal "capture-manifest"');
  assert(!src.includes(".delete("), "this file itself never calls delete");
  assert(!src.includes("getFirebaseAdminStorage") && !src.includes(".bucket("), "no Storage API is ever called");
  assert(!src.includes("deleteUser("), "Firebase Auth's deleteUser is never called");
});

await group("8. captureFullAccountRemovalManifestEncrypted.ts checks structureCheck.ok and aborts BEFORE building/encrypting/writing anything", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureFullAccountRemovalManifestEncrypted.ts"), "utf8");
  const checkIndex = src.indexOf("result.structureCheck.ok");
  const buildIndex = src.indexOf("buildSafeFullRemovalManifestExport(uid, result)");
  const encryptIndex = src.indexOf("encryptBackup(plaintext, passphrase)");
  const writeIndex = src.indexOf("writeFileSync(artifactPath, encryptedBuffer)");
  assert(checkIndex !== -1, "sanity check: the structure-check gate is present at all");
  assert(checkIndex < buildIndex, "the structure check happens BEFORE the safe export is built");
  assert(buildIndex < encryptIndex, "the safe export is built before encryption, as expected");
  assert(encryptIndex < writeIndex, "encryption happens before the write, as expected — no plaintext fallback");
});

await group("9. captureFullAccountRemovalManifestEncrypted.ts never logs a raw exception's .message, .stack, or .code anywhere", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureFullAccountRemovalManifestEncrypted.ts"), "utf8");
  assert(!src.includes("err.message"), "err.message is never read anywhere in this file");
  assert(!src.includes("String(err)"), "String(err) is never used as a fallback");
  assert(!src.includes("err.stack"), "err.stack is never read");
  assert(!src.includes("err.code"), "err.code is never read");
  assert(src.includes("formatSafeError("), "every error path routes through the single, sanitized formatter instead");
});

// ── 10. resolveEntryPath() — exact, unambiguous paths for every category class ──

await group("10. resolveEntryPath computes the exact Firestore path for every category class", () => {
  assert(resolveEntryPath("U1", PROFILE_DOCUMENT_MANIFEST_KEY, "U1") === "users/U1", "the profile document's own path is users/{uid}, not a child of it");
  assert(resolveEntryPath("U1", "feedbackSubmissions", "F1") === "feedbackSubmissions/F1", "a shared, uid-scoped collection's entry is root-level, never under users/{uid}");
  assert(resolveEntryPath("U1", "supportMessages", "S1") === "supportMessages/S1", "the same holds for supportMessages");
  assert(resolveEntryPath("U1", "tasks", "T1") === "users/U1/tasks/T1", "an ordinary base collection's entry is a direct child of users/{uid}");
  assert(resolveEntryPath("U1", "settings", "SET1") === "users/U1/settings/SET1", "settings (this tool's own addition) resolves the same way");
  assert(
    resolveEntryPath("U1", "aiConversations/C1/messages", "M1") === "users/U1/aiConversations/C1/messages/M1",
    "a nested compound key (aiConversations' own messages) resolves to the full, multi-segment nested path",
  );
});

// ── 11. buildSafeFullRemovalManifestExport — full scope, exact paths/versions, counts-only findings ──

await group("11. buildSafeFullRemovalManifestExport covers every category in fullAccountRemoval.ts's own removal scope, with exact paths and version timestamps", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/tasks/t1": { title: "a" },
    "users/u1/settings/s1": { enabled: true },
    "users/u1/aiConversations/c1": { title: "x" },
    "users/u1/aiConversations/c1/messages/m1": { role: "user" },
    "feedbackSubmissions/f1": { uid: "u1", text: "x" },
    "feedbackSubmissions/f2": { uid: "OTHER_USER", text: "y" },
    "supportMessages/sm1": { uid: "u1", text: "x" },
    "contactSubmissions/cs1": { senderEmail: "x@example.com", uid: "u1", text: "irrelevant" },
  });
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "capture-manifest" });
  assert(result.structureCheck.ok, "sanity check: no unexpected structure in this fixture");
  const safeExport = buildSafeFullRemovalManifestExport("u1", result);

  assert(safeExport.manifest["tasks"]?.[0]?.path === "users/u1/tasks/t1", "a base-collection entry carries its exact path");
  assert(typeof safeExport.manifest["tasks"]?.[0]?.updateTimeMillis === "number", "and a plain numeric version timestamp, not a TimestampLike object");
  assert(safeExport.manifest["settings"]?.[0]?.path === "users/u1/settings/s1", "settings is covered with its exact path");
  assert(safeExport.manifest[PROFILE_DOCUMENT_MANIFEST_KEY]?.[0]?.path === "users/u1", "the profile document is covered with its own exact path");
  assert(
    safeExport.manifest["aiConversations/c1/messages"]?.[0]?.path === "users/u1/aiConversations/c1/messages/m1",
    "the nested aiConversations messages compound key resolves to its full, exact nested path",
  );
  assert(safeExport.manifest["feedbackSubmissions"]?.length === 1 && safeExport.manifest["feedbackSubmissions"][0].path === "feedbackSubmissions/f1", "only u1's own feedbackSubmissions entry is present, with its exact (root-level) path");
  assert(safeExport.manifest["supportMessages"]?.[0]?.path === "supportMessages/sm1", "supportMessages is covered the same way");
  assert(!("contactSubmissions" in safeExport.manifest), "contactSubmissions never appears in the export at all, even though a matching-uid document exists for it");
  assert(safeExport.storageStatus === "UNKNOWN_NOT_CHECKED", "Storage's honest, unknown status is carried into the export as metadata");
});

await group("12. buildSafeFullRemovalManifestExport never exposes the specific ids/paths of an UNEXPECTED structure finding — only counts", () => {
  const result = {
    mode: "capture-manifest" as const,
    structureCheck: {
      ok: false,
      unknownTopLevelCollections: ["SECRET_UNKNOWN_COLLECTION_NAME"],
      unexpectedNestedSubcollections: ["tasks/SECRET_DOC_ID/weirdSubcollection"],
    },
    manifestCheck: { ok: true, mismatches: [] },
    storageStatus: "UNKNOWN_NOT_CHECKED" as const,
    removedCounts: {},
    overallSuccess: true,
    capturedManifest: {},
  };
  const safeExport = buildSafeFullRemovalManifestExport("u1", result);
  const serialized = JSON.stringify(safeExport);
  assert(safeExport.structureCheck.unknownTopLevelCollectionsCount === 1, "only the COUNT of unknown top-level collections is exported");
  assert(safeExport.structureCheck.unexpectedNestedSubcollectionsCount === 1, "only the COUNT of unexpected nested subcollections is exported");
  assert(!serialized.includes("SECRET_UNKNOWN_COLLECTION_NAME"), "the specific unknown collection name never reaches the export");
  assert(!serialized.includes("SECRET_DOC_ID"), "the specific unexpected-nested finding's document id never reaches the export");
});

await group("13. An unexpected nested subcollection anywhere under users/{uid} is reflected in structureCheck.ok=false, which main() checks before exporting anything", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/settings/s1": { enabled: true },
    "users/u1/settings/s1/unexpectedNested/n1": { whatever: true },
  });
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "capture-manifest" });
  assert(!result.structureCheck.ok, "the structural check reports the problem — this is exactly what main()'s own gate (test 8) checks before building or encrypting anything");
});

// ── 14. Backup namespaces never appear in the export ────────────────────────

await group("14. Protected backup namespaces never appear as a category in the export, even when present in the live account", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/_fullBackups/bk1": { note: "must never appear in any export" },
  });
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "capture-manifest" });
  const safeExport = buildSafeFullRemovalManifestExport("u1", result);
  assert(!("_fullBackups" in safeExport.manifest), "_fullBackups is never a category in the exported manifest");
  assert(!JSON.stringify(safeExport).includes("_fullBackups"), "the string itself never appears anywhere in the serialized export either");
});

// ── 15. Full round trip: genuinely ciphertext, decrypts back exactly ───────

await group("15. Full round trip: the encrypted artifact is genuinely ciphertext, and decrypts back to the exact captured manifest", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    "users/u1/tasks/SECRET_TASK_ID": { title: "irrelevant" },
    "feedbackSubmissions/SECRET_FEEDBACK_ID": { uid: "u1", text: "irrelevant" },
  });
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "capture-manifest" });
  const safeExport = buildSafeFullRemovalManifestExport("u1", result);
  const passphrase = "correct-horse-battery-staple-2";

  const plaintext = Buffer.from(JSON.stringify(safeExport), "utf8");
  const encrypted = encryptBackup(plaintext, passphrase);

  let parsedDirectly = false;
  try {
    JSON.parse(encrypted.toString("utf8"));
    parsedDirectly = true;
  } catch {
    parsedDirectly = false;
  }
  assert(!parsedDirectly, "the raw written bytes are NOT valid JSON — genuinely ciphertext");

  const decrypted = decryptBackup(encrypted, passphrase);
  const roundTripped = JSON.parse(decrypted.toString("utf8"));
  assert(JSON.stringify(roundTripped) === JSON.stringify(safeExport), "decrypting with the correct passphrase recovers the EXACT original export");
  assert(roundTripped.manifest["feedbackSubmissions"]?.[0]?.id === "SECRET_FEEDBACK_ID", "the recovered export still carries the uid-scoped shared-collection entry");

  let wrongPassphraseThrew = false;
  try {
    decryptBackup(encrypted, "wrong-passphrase");
  } catch (err) {
    wrongPassphraseThrew = err instanceof BackupDecryptionError;
  }
  assert(wrongPassphraseThrew, "decrypting with the WRONG passphrase throws BackupDecryptionError");
});

// ── 16. formatSafeError never echoes deliberately poisoned exception content ──

await group("16. formatSafeError never echoes deliberately sensitive, fabricated error content for ANY defined error code", () => {
  class PoisonedError extends Error {
    code = "auth/user-not-found: evil.user@example.com";
    constructor(message: string) {
      super(message);
      this.stack = `${this.name}: ${message}\n    at users/REAL_UID/tasks/SECRET_TASK_ID (leaked.stack:1:1)`;
    }
  }
  const sensitiveFragments = ["evil.user@example.com", "REAL_UID", "SECRET_TASK_ID", "auth/user-not-found"];
  for (const code of Object.values(ErrorCode)) {
    const formatted = formatSafeError(code, new PoisonedError("Lookup failed for evil.user@example.com"));
    for (const fragment of sensitiveFragments) {
      assert(!formatted.includes(fragment), `formatSafeError(${code}) never echoes "${fragment}" even from an exception whose .code and .stack are deliberately poisoned`);
    }
  }
});

// ── 17. printSafeSummary never logs the uid, even though it is a field on the summary object ──

await group("17. printSafeSummary never logs the account's own uid", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (msg: unknown) => {
    lines.push(String(msg));
  };
  const summary: CaptureFullRemovalManifestEncryptedSummary = {
    uid: "REAL_ACCOUNT_UID_abcdef",
    exportId: "mf_test_1",
    categoriesCaptured: 4,
    totalDocumentsCaptured: 10,
    structureOk: true,
    storageStatus: "UNKNOWN_NOT_CHECKED",
    encryptedArtifact: { path: "kivora-full-removal-manifest-mf_test_1.enc", sizeBytes: 123 },
    overallSuccess: true,
  };
  try {
    printSafeSummary(summary);
  } finally {
    console.log = originalLog;
  }
  const joined = lines.join("\n");
  assert(joined.includes("mf_test_1"), "the export id is printed");
  assert(!joined.includes("REAL_ACCOUNT_UID_abcdef"), "the account's own uid is never printed");
  assert(joined.includes("UNKNOWN_NOT_CHECKED"), "Storage's honest unknown status is printed");
});

// ── 18. Scope sanity: the exported manifest's category universe matches fullAccountRemoval.ts's own ──

await group("18. The category universe this file can export matches exactly fullAccountRemoval.ts's own removal scope (format compatibility)", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1": { displayName: "x" },
    ...Object.fromEntries(CLEANUP_ALLOWLIST.map((e) => [`users/u1/${e.path}/doc1`, { x: 1 }])),
    "users/u1/settings/s1": { x: 1 },
    "feedbackSubmissions/f1": { uid: "u1" },
    "supportMessages/sm1": { uid: "u1" },
  });
  const result = await runFullAccountRemoval(firestore, "u1", { mode: "capture-manifest" });
  const safeExport = buildSafeFullRemovalManifestExport("u1", result);
  for (const entry of CLEANUP_ALLOWLIST) {
    assert(entry.path in safeExport.manifest, `base category "${entry.path}" (from CLEANUP_ALLOWLIST) is present in the export`);
  }
  assert("settings" in safeExport.manifest, '"settings" is present');
  assert(PROFILE_DOCUMENT_MANIFEST_KEY in safeExport.manifest, "the profile document category is present");
  assert("feedbackSubmissions" in safeExport.manifest && "supportMessages" in safeExport.manifest, "both shared, uid-scoped collections are present");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
