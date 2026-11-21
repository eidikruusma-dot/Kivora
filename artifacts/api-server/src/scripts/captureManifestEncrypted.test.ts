/**
 * Unit tests for captureManifestEncrypted.ts — the read-only, encrypted
 * manifest-capture entry point approved for a manually-triggered GitHub
 * Actions workflow.
 *
 * Same testing philosophy as runFullAccountBackup.test.ts /
 * runTestDataCleanupCli.test.ts: main()'s fail-fast gates that need no
 * real Firebase credentials are exercised directly; everything else main()
 * does (resolve the account, call runCleanup(), build the safe export,
 * encrypt, write) is exercised here through the SAME exported, pure
 * functions main() itself calls — runCleanup() (already fully tested in
 * testDataCleanup.test.ts, reused unmodified here), buildSafeManifestExport(),
 * encryptBackup()/decryptBackup() (already tested in
 * backupEncryption.test.ts, reused unmodified here), and printSafeSummary().
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/captureManifestEncrypted.test.ts --outfile=.tmp-captureManifestEncrypted.mjs \
 *       && node .tmp-captureManifestEncrypted.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  main,
  buildSafeManifestExport,
  printSafeSummary,
  formatSafeError,
  ErrorCode,
  type CaptureManifestEncryptedSummary,
} from "./captureManifestEncrypted.js";
import { runCleanup, type FirestoreLike, type DocRefLike, type CollRefLike, type TimestampLike } from "./testDataCleanup.js";
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

// ── Fake Firestore — same shape as testDataCleanup.test.ts's own fake ──────
function makeFakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
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
        const data = store.get(path);
        return { id, exists: data !== undefined, data: () => data, updateTime: updateTimes.get(path) ? makeTimestamp(updateTimes.get(path)!) : undefined };
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
        return { docs: [] };
      },
      where() {
        return { async get() { return { docs: [] }; } };
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

await group("1. main() fails safely with no target account and no Admin calls", async () => {
  const code = await main([], { MANIFEST_ENCRYPTION_PASSPHRASE: "irrelevant-here" });
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("2. main() requires EXPECTED_UID before any Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  try {
    const code = await main(["someone@example.com"], {});
    assert(code === 1, "returns exit code 1 when EXPECTED_UID is missing");
    assert(messages.some((m) => m.includes("EXPECTED_UID")), "the specific, named error mentions EXPECTED_UID");
    assert(messages.some((m) => m.includes(ErrorCode.MISSING_EXPECTED_UID)), "the sanitized error carries the predefined error code, not a raw exception message");
  } finally {
    console.error = originalError;
  }
});

await group("3. main() requires EXPECTED_PROJECT_ID before any Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  try {
    const code = await main(["someone@example.com"], { EXPECTED_UID: "u1" });
    assert(code === 1, "returns exit code 1 when EXPECTED_PROJECT_ID is missing");
    assert(messages.some((m) => m.includes("EXPECTED_PROJECT_ID")), "the specific, named error mentions EXPECTED_PROJECT_ID");
    assert(
      messages.some((m) => m.includes(ErrorCode.MISSING_EXPECTED_PROJECT_ID)),
      "the sanitized error carries the predefined error code, not a raw exception message",
    );
  } finally {
    console.error = originalError;
  }
});

await group("4. main() rejects a FIREBASE_PROJECT_ID/EXPECTED_PROJECT_ID mismatch before any Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  try {
    const code = await main(["someone@example.com"], {
      EXPECTED_UID: "u1",
      EXPECTED_PROJECT_ID: "expected-project",
      FIREBASE_PROJECT_ID: "some-other-project",
    });
    assert(code === 1, "returns exit code 1 on a project id mismatch");
    assert(messages.some((m) => m.includes(ErrorCode.PROJECT_ID_MISMATCH)), "the mismatch is named by its predefined error code");
    assert(
      !messages.some((m) => m.includes("expected-project") || m.includes("some-other-project")),
      "neither actual project id VALUE is echoed into the log — only the fact that they differ",
    );
  } finally {
    console.error = originalError;
  }
});

await group("5. main() requires MANIFEST_ENCRYPTION_PASSPHRASE before any Admin call", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  try {
    const code = await main(["someone@example.com"], {
      EXPECTED_UID: "u1",
      EXPECTED_PROJECT_ID: "p1",
      FIREBASE_PROJECT_ID: "p1",
    });
    assert(code === 1, "returns exit code 1 when the passphrase is missing");
    assert(messages.some((m) => m.includes("MANIFEST_ENCRYPTION_PASSPHRASE")), "the specific, named error mentions the passphrase variable");
    assert(
      messages.some((m) => m.includes(ErrorCode.MISSING_PASSPHRASE)),
      "the sanitized error carries the predefined error code, not a raw exception message",
    );
  } finally {
    console.error = originalError;
  }
});

await group("6. main() fails safely when Admin credentials are absent, once every prior gate has passed", async () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => {
    messages.push(String(msg));
  };
  let code: number;
  try {
    code = await main(["someone@example.com"], {
      EXPECTED_UID: "u1",
      EXPECTED_PROJECT_ID: "p1",
      FIREBASE_PROJECT_ID: "p1",
      MANIFEST_ENCRYPTION_PASSPHRASE: "a-passphrase",
    });
  } finally {
    console.error = originalError;
  }
  assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
  assert(messages.some((m) => m.includes(ErrorCode.ADMIN_INIT_FAILED)), "the sanitized error carries the predefined ADMIN_INIT_FAILED code");
  assert(
    !messages.some((m) => /missing required environment variable|FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL/.test(m)),
    "the real firebaseAdmin.ts exception text (env var names, config detail) is never echoed into this file's own log output — only the predefined code and category are",
  );
});

// ── 7. Structural proof: this file cannot enter execute mode, cannot
// reference deletion-confirmation variables, and never falls back to a
// plaintext write ──────────────────────────────────────────────────────────

await group("7. captureManifestEncrypted.ts is structurally incapable of entering execute mode or deleting anything", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  assert(!src.includes('"execute"'), 'the literal mode value "execute" never appears anywhere in this file');
  assert(!src.includes("CLEANUP_MODE"), "this file never reads a CLEANUP_MODE environment variable at all — there is nothing to override");
  assert(!src.includes("CONFIRMATION_PHRASE"), "never references the deletion confirmation phrase");
  assert(!src.includes("BACKUP_ID"), "never references BACKUP_ID — this tool is not gated by, and does not need, a backup");
  assert(!src.includes("CONFIRM_FINANCE_DELETION") && !src.includes("CONFIRM_DOCUMENTS_DELETION"), "never references either deletion-confirmation variable");
  assert(src.includes('mode: "capture-manifest"'), 'the ONE mode value it ever passes to runCleanup() is the literal "capture-manifest"');
  assert(!src.includes(".delete("), "this file itself never calls delete — it only ever reads, via the already-tested runCleanup()");
});

await group("8. captureManifestEncrypted.ts writes the encrypted buffer to disk, never a plaintext fallback", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  const writeFileSyncCalls = src.match(/writeFileSync\([^)]*\)/g) ?? [];
  assert(writeFileSyncCalls.length === 1, "there is exactly one writeFileSync call in the whole file");
  assert(
    writeFileSyncCalls.length === 1 && writeFileSyncCalls[0].includes("encryptedBuffer"),
    "that one write call writes encryptedBuffer, never the plaintext JSON or the safe-export object directly",
  );
  assert(
    !src.includes("writeFileSync(artifactPath, Buffer.from(JSON.stringify"),
    "there is no inline plaintext-write code path alongside the encrypted one",
  );
});

await group("9. captureManifestEncrypted.ts never logs the passphrase or raw manifest data", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  const consoleCalls = src.match(/console\.(log|error)\([^;]*\);/gs) ?? [];
  assert(consoleCalls.length > 0, "sanity check: console calls are found at all");
  for (const call of consoleCalls) {
    assert(!call.includes("passphrase"), `a console call never embeds the passphrase variable: ${call.slice(0, 40)}...`);
    assert(!call.includes("capturedManifest"), `a console call never embeds the raw captured manifest: ${call.slice(0, 40)}...`);
    assert(!call.includes("safeExport.manifest"), `a console call never embeds the safe-export's manifest field directly: ${call.slice(0, 40)}...`);
  }
});

await group("9b. captureManifestEncrypted.ts no longer logs a raw exception's .message or String(err) anywhere", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  assert(!src.includes("err.message"), "err.message is never read anywhere in this file — see formatSafeError()'s own doc comment");
  assert(!src.includes("String(err)"), "String(err) is never used as a fallback anywhere in this file either");
  assert(!src.includes("err.stack"), "err.stack is never read");
  assert(!src.includes("err.code"), "err.code (a Firebase-SDK-controlled string) is never read");
  assert(src.includes("formatSafeError("), "every error path routes through the single, sanitized formatter instead");
});

await group("9c. runCaptureManifestEncryptedCli.ts's own catch-all backstop is sanitized the same way", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/runCaptureManifestEncryptedCli.ts"), "utf8");
  assert(!src.includes("err.message"), "the CLI entry point's own .catch() never reads err.message either");
  assert(!src.includes("String(err)"), "nor does it fall back to String(err)");
  assert(src.includes("formatSafeError(ErrorCode.UNEXPECTED_CLI_FAILURE"), "it reports any unexpected async failure through the same sanitized formatter, with its own predefined code");
});

await group(
  "9d. formatSafeError NEVER echoes deliberately sensitive, fabricated error content — fake emails, Firestore paths, document ids, and credential-shaped strings — for ANY defined error code",
  () => {
    const maliciousMessages = [
      "There is no user record corresponding to the identifier: evil.user@example.com",
      "Permission denied on resource: projects/kivora-f1281/databases/(default)/documents/users/REAL_UID_98765/aiConversations/SECRET_CONV_ID/messages/SECRET_MSG_ID",
      "Invalid API key: AIzaSyFAKEKEY1234567890ABCDEFGHIJKLMNOPQ",
      "Failed to parse private key: -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n-----END PRIVATE KEY-----",
      "client_email mismatch for firebase-adminsdk-abc123@kivora-f1281.iam.gserviceaccount.com",
    ];

    class FakeErrorWithSensitiveStackAndCode extends Error {
      code = "auth/user-not-found: evil.user@example.com";
      constructor(message: string) {
        super(message);
        // A fabricated stack deliberately containing a Firestore path and
        // an email, standing in for whatever a real third-party SDK or
        // Node's own runtime might someday put there.
        this.stack = `${this.name}: ${message}\n    at users/REAL_UID_12345/tasks/SECRET_TASK_ID (leaked.stack:1:1)\n    for account leaked@example.com`;
      }
    }

    const sensitiveFragments = [
      "evil.user@example.com",
      "REAL_UID_98765",
      "SECRET_CONV_ID",
      "SECRET_MSG_ID",
      "AIzaSyFAKEKEY1234567890ABCDEFGHIJKLMNOPQ",
      "BEGIN PRIVATE KEY",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
      "firebase-adminsdk-abc123@kivora-f1281.iam.gserviceaccount.com",
      "REAL_UID_12345",
      "SECRET_TASK_ID",
      "leaked@example.com",
      "auth/user-not-found",
    ];

    for (const code of Object.values(ErrorCode)) {
      for (const maliciousMessage of maliciousMessages) {
        const formatted = formatSafeError(code, new Error(maliciousMessage));
        for (const fragment of sensitiveFragments.filter((f) => maliciousMessage.includes(f))) {
          assert(!formatted.includes(fragment), `formatSafeError(${code}) never echoes "${fragment}" from a plain Error's message`);
        }
      }

      const fakeErr = new FakeErrorWithSensitiveStackAndCode("Lookup failed for leaked@example.com");
      const formattedFromFakeErr = formatSafeError(code, fakeErr);
      for (const fragment of sensitiveFragments) {
        assert(
          !formattedFromFakeErr.includes(fragment),
          `formatSafeError(${code}) never echoes "${fragment}" even from an exception whose .code and .stack are deliberately poisoned with sensitive content`,
        );
      }
      assert(
        !formattedFromFakeErr.includes("auth/user-not-found: evil.user@example.com"),
        `formatSafeError(${code}) never reads the exception's .code property at all`,
      );
    }

    // No err argument at all (the plain validation-gate call sites) is
    // just as safe, trivially — confirmed for completeness.
    for (const code of Object.values(ErrorCode)) {
      const formatted = formatSafeError(code);
      for (const fragment of sensitiveFragments) {
        assert(!formatted.includes(fragment), `formatSafeError(${code}) with no exception argument still never contains "${fragment}"`);
      }
    }
  },
);

await group("9e. formatSafeError's output is fully predictable: fixed code, fixed category, and only an allowlisted exception-class name", () => {
  for (const code of Object.values(ErrorCode)) {
    const withoutErr = formatSafeError(code);
    assert(withoutErr.startsWith(`VIGA [${code}] [`), `formatSafeError(${code}) always starts with the code itself, verbatim`);

    const withPlainError = formatSafeError(code, new Error("anything"));
    assert(withPlainError.includes("(erindi liik: Error)"), `a plain Error's allowlisted constructor name ("Error") is surfaced for ${code}`);

    class SomeExoticUnrecognizedErrorClass extends Error {}
    const withExoticError = formatSafeError(code, new SomeExoticUnrecognizedErrorClass("anything"));
    assert(
      withExoticError.includes("(erindi liik: Unknown)") && !withExoticError.includes("SomeExoticUnrecognizedErrorClass"),
      `an exception class NOT on the safe allowlist is reported as "Unknown" for ${code}, never by its real (unreviewed) class name`,
    );

    const withNonErrorThrow = formatSafeError(code, "a plain string throw, not even an Error instance");
    assert(
      withNonErrorThrow.includes("(erindi liik: Unknown)") && !withNonErrorThrow.includes("a plain string throw"),
      `a non-Error thrown value is also reported as "Unknown" for ${code}, never by its own content`,
    );
  }
});

// ── 10. buildSafeManifestExport() — the pure conversion this file's encrypted
// payload is built from ─────────────────────────────────────────────────────

function makeTimestamp(millis: number): TimestampLike {
  return { toMillis: () => millis };
}

await group("10. buildSafeManifestExport converts manifest entries to plain {id, updateTimeMillis}, including nested compound keys", () => {
  const result = {
    mode: "capture-manifest" as const,
    liveCounts: { tasks: 2, aiConversations: 1 },
    snapshotCheck: { ok: true, mismatches: [] },
    structureCheck: { ok: true, unknownTopLevelCollections: [], unexpectedNestedSubcollections: [] },
    manifestCheck: { ok: true, mismatches: [] },
    deletedCounts: {},
    overallSuccess: true,
    capturedManifest: {
      tasks: [
        { id: "SECRET_TASK_ID_1", updateTime: makeTimestamp(1000) },
        { id: "SECRET_TASK_ID_2", updateTime: makeTimestamp(2000) },
      ],
      aiConversations: [{ id: "SECRET_CONV_ID_1", updateTime: makeTimestamp(3000) }],
      "aiConversations/SECRET_CONV_ID_1/messages": [{ id: "SECRET_MSG_ID_1", updateTime: makeTimestamp(4000) }],
    },
  };
  const safeExport = buildSafeManifestExport("u1", result);
  assert(safeExport.manifest["tasks"]?.length === 2, "top-level tasks entries are present");
  assert(safeExport.manifest["tasks"]?.[0].id === "SECRET_TASK_ID_1", "document ids are preserved (they are needed for the human review step)");
  assert(safeExport.manifest["tasks"]?.[0].updateTimeMillis === 1000, "updateTime is converted to a plain number, not a TimestampLike object");
  assert(
    safeExport.manifest["aiConversations/SECRET_CONV_ID_1/messages"]?.[0].id === "SECRET_MSG_ID_1",
    "the nested aiConversations/{id}/messages compound key is carried through unchanged",
  );
  assert(typeof JSON.stringify(safeExport) === "string", "the whole export is plain-JSON-serializable (no class instances, no TimestampLike methods)");
});

await group("10b. buildSafeManifestExport never exposes the specific ids/paths of an UNEXPECTED structure finding — only counts", () => {
  const result = {
    mode: "capture-manifest" as const,
    liveCounts: {},
    snapshotCheck: { ok: true, mismatches: [] },
    structureCheck: {
      ok: false,
      unknownTopLevelCollections: ["SECRET_UNKNOWN_COLLECTION_NAME"],
      unexpectedNestedSubcollections: ["aiConversations/SECRET_CONV_ID/weirdSubcollection"],
    },
    manifestCheck: { ok: true, mismatches: [] },
    deletedCounts: {},
    overallSuccess: true,
    capturedManifest: {},
  };
  const safeExport = buildSafeManifestExport("u1", result);
  const serialized = JSON.stringify(safeExport);
  assert(safeExport.structureCheck.ok === false, "an unexpected finding is still reflected as ok: false");
  assert(safeExport.structureCheck.unknownTopLevelCollectionsCount === 1, "only the COUNT of unknown top-level collections is exported");
  assert(safeExport.structureCheck.unexpectedNestedSubcollectionsCount === 1, "only the COUNT of unexpected nested subcollections is exported");
  assert(!serialized.includes("SECRET_UNKNOWN_COLLECTION_NAME"), "the specific unknown collection name never reaches the export");
  assert(!serialized.includes("SECRET_CONV_ID"), "the specific unexpected-nested finding's document id never reaches the export");
});

// ── 11. Full round trip: fake Firestore -> runCleanup (reused, unmodified)
// -> buildSafeManifestExport -> encryptBackup -> decryptBackup ──────────────

await group("11. Full round trip: the encrypted artifact is genuinely ciphertext, and decrypts back to the exact captured manifest", async () => {
  const { firestore } = makeFakeFirestore({
    "users/u1/tasks/SECRET_TASK_ID": { title: "irrelevant" },
    "users/u1/aiConversations/SECRET_CONV_ID": { title: "irrelevant" },
    "users/u1/aiConversations/SECRET_CONV_ID/messages/SECRET_MSG_ID": { role: "user" },
  });
  const result = await runCleanup(firestore, "u1", { mode: "capture-manifest" });
  const safeExport = buildSafeManifestExport("u1", result);
  const passphrase = "correct-horse-battery-staple";

  const plaintext = Buffer.from(JSON.stringify(safeExport), "utf8");
  const encrypted = encryptBackup(plaintext, passphrase);

  assert(encrypted.length > 0, "the encrypted buffer is non-empty");
  let parsedDirectly = false;
  try {
    JSON.parse(encrypted.toString("utf8"));
    parsedDirectly = true;
  } catch {
    parsedDirectly = false;
  }
  assert(!parsedDirectly, "the raw written bytes are NOT valid JSON — this is genuinely ciphertext, not a plaintext fallback");

  const decrypted = decryptBackup(encrypted, passphrase);
  const roundTripped = JSON.parse(decrypted.toString("utf8"));
  assert(JSON.stringify(roundTripped) === JSON.stringify(safeExport), "decrypting with the correct passphrase recovers the EXACT original export");
  assert(
    roundTripped.manifest["aiConversations/SECRET_CONV_ID/messages"]?.[0]?.id === "SECRET_MSG_ID",
    "the recovered export still carries the nested AI-conversation message manifest entry",
  );

  let wrongPassphraseThrew = false;
  try {
    decryptBackup(encrypted, "wrong-passphrase");
  } catch (err) {
    wrongPassphraseThrew = err instanceof BackupDecryptionError;
  }
  assert(wrongPassphraseThrew, "decrypting with the WRONG passphrase throws BackupDecryptionError — the passphrase is genuinely required, not decorative");
});

await group("12. printSafeSummary never logs anything beyond its own aggregate fields — no document id can reach it even if one were smuggled in", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (msg: unknown) => {
    lines.push(String(msg));
  };
  const summary: CaptureManifestEncryptedSummary = {
    uid: "u1",
    exportId: "mf_test_1",
    collectionsCaptured: 3,
    totalDocumentsCaptured: 7,
    structureOk: true,
    encryptedArtifact: { path: "kivora-manifest-mf_test_1.enc", sizeBytes: 123 },
    overallSuccess: true,
  };
  try {
    printSafeSummary(summary);
  } finally {
    console.log = originalLog;
  }
  const joined = lines.join("\n");
  assert(joined.includes("mf_test_1"), "the export id (not sensitive — a local file-naming id, not a document id) is printed");
  assert(joined.includes("u1"), "the account uid itself is printed, consistent with every other tool in this project");
  assert(
    !/SECRET_|updateTimeMillis|updateTime/.test(joined),
    "nothing resembling a captured document id or a raw manifest timestamp field ever appears in the printed summary — the summary type structurally cannot carry them",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
