/**
 * captureFullAccountRemovalManifestEncrypted.ts — a SEPARATE, read-only
 * entry point that runs fullAccountRemoval.ts's existing
 * "capture-manifest" mode and writes its result ONLY as an AES-256-GCM-
 * encrypted artifact, never as plaintext anywhere (disk, stdout, or
 * GitHub Actions logs). The same relationship, and largely the same
 * design, as captureManifestEncrypted.ts has to testDataCleanup.ts —
 * duplicated here independently (not imported) so this file carries no
 * dependency on that sibling tool's own internals, and a future change
 * to either can never silently affect the other.
 *
 * ── An extra safety gate this file adds on top of runFullAccountRemoval() ──
 * fullAccountRemoval.ts's own "capture-manifest" mode deliberately never
 * gates on structureCheck.ok — by design, its whole purpose there is to
 * report the CURRENT state for a human to look at directly, including a
 * state with an unexpected finding (see that file's own doc comment).
 * That is the right behavior for a human running it by hand, but wrong
 * for an automated, encrypted export meant to become the reviewed
 * source of truth: an unexpected nested subcollection would simply never
 * appear in captureFullRemovalManifest()'s output at all (it only walks
 * KNOWN categories), so the exported manifest would look complete while
 * silently omitting exactly the data a human most needs to see. This
 * file checks the returned structureCheck.ok itself, right after calling
 * runFullAccountRemoval(), and refuses to build, encrypt, or write
 * anything at all if it is false — never a "best effort" partial export.
 *
 * ── Structurally incapable of entering execute mode ──────────────────────
 * This file never reads any mode-selecting environment variable at all —
 * the literal string "capture-manifest" is the ONLY mode value this file
 * ever passes to runFullAccountRemoval(), hardcoded. It also never
 * references the delete-confirmation phrase or the backup-id gate
 * anywhere this fullAccountRemoval module's execute path uses.
 *
 * ── What gets encrypted, and what never does ─────────────────────────────
 * Encrypted payload (AES-256-GCM via backupEncryption.ts's already-tested
 * encryptBackup(), reused unchanged): every category in
 * fullAccountRemoval.ts's own removal scope — the 16 base collections,
 * aiConversations' own nested messages, settings, the profile document,
 * and the two uid-verified shared collections — each entry as
 * {id, path, updateTimeMillis}, never field content. Storage's status
 * (always the honest "UNKNOWN_NOT_CHECKED") is included as metadata;
 * Storage itself is never read. An unexpected-structure finding is
 * reduced to COUNTS only, same as captureManifestEncrypted.ts.
 *
 * Never written anywhere, including into the encrypted payload: any
 * document's own field content, the account's email, or the specific
 * names/ids of an unexpected-structure finding.
 *
 * This file only DEFINES and EXPORTS main() — it never calls it itself.
 * The CLI entry point is the separate
 * runCaptureFullAccountRemovalManifestEncryptedCli.ts.
 */

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import type { FirestoreLike } from "./testDataCleanup.js";
import {
  runFullAccountRemoval,
  SHARED_UID_SCOPED_COLLECTIONS,
  PROFILE_DOCUMENT_MANIFEST_KEY,
  type FullAccountRemovalResult,
} from "./fullAccountRemoval.js";
import { encryptBackup } from "./backupEncryption.js";

function generateManifestExportId(): string {
  return `mf_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

// ── Sanitized error reporting — an independent duplicate of
// captureManifestEncrypted.ts's own mechanism (same reasoning: nothing
// below ever logs an exception's .message, .stack, or .code, since any
// of those may be worded by a third-party SDK this file does not
// control), plus ONE additional code (UNEXPECTED_STRUCTURE) this tool
// needs that the sibling tool's fixed enum does not define. ──────────────
export const ErrorCode = {
  TARGET_NOT_RESOLVED: "TARGET_NOT_RESOLVED",
  MISSING_EXPECTED_UID: "MISSING_EXPECTED_UID",
  MISSING_EXPECTED_PROJECT_ID: "MISSING_EXPECTED_PROJECT_ID",
  PROJECT_ID_MISMATCH: "PROJECT_ID_MISMATCH",
  MISSING_PASSPHRASE: "MISSING_PASSPHRASE",
  ADMIN_INIT_FAILED: "ADMIN_INIT_FAILED",
  USER_LOOKUP_FAILED: "USER_LOOKUP_FAILED",
  UID_MISMATCH: "UID_MISMATCH",
  UNEXPECTED_STRUCTURE: "UNEXPECTED_STRUCTURE",
  MANIFEST_CAPTURE_FAILED: "MANIFEST_CAPTURE_FAILED",
  ENCRYPTION_FAILED: "ENCRYPTION_FAILED",
  ARTIFACT_WRITE_FAILED: "ARTIFACT_WRITE_FAILED",
  UNEXPECTED_CLI_FAILURE: "UNEXPECTED_CLI_FAILURE",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorCategory = "configuration" | "authentication" | "data_access" | "cryptography" | "io" | "unknown";

const SAFE_ERROR_INFO: Record<ErrorCode, { category: ErrorCategory; safeMessage: string }> = {
  TARGET_NOT_RESOLVED: {
    category: "configuration",
    safeMessage:
      "Sihtkontot ei määratud. Üks järgnevast on vajalik: CLI argument, OWNER_EMAIL keskkonnamuutuja, " +
      "või OWNER_UID keskkonnamuutuja. Vaikekontot ei ole.",
  },
  MISSING_EXPECTED_UID: { category: "configuration", safeMessage: "Keskkonnamuutuja EXPECTED_UID on kohustuslik ja puudub." },
  MISSING_EXPECTED_PROJECT_ID: { category: "configuration", safeMessage: "Keskkonnamuutuja EXPECTED_PROJECT_ID on kohustuslik ja puudub." },
  PROJECT_ID_MISMATCH: { category: "configuration", safeMessage: "FIREBASE_PROJECT_ID ei vasta EXPECTED_PROJECT_ID väärtusele. Katkestan." },
  MISSING_PASSPHRASE: { category: "configuration", safeMessage: "Keskkonnamuutuja MANIFEST_ENCRYPTION_PASSPHRASE on kohustuslik ja puudub." },
  ADMIN_INIT_FAILED: { category: "authentication", safeMessage: "Firebase Admin SDK initsialiseerimine ebaõnnestus." },
  USER_LOOKUP_FAILED: { category: "authentication", safeMessage: "Sihtkasutaja otsimine Firebase Authenticationist ebaõnnestus." },
  UID_MISMATCH: { category: "authentication", safeMessage: "Lahendatud kasutaja UID ei vasta EXPECTED_UID väärtusele. Katkestan." },
  UNEXPECTED_STRUCTURE: {
    category: "data_access",
    safeMessage:
      "Struktuurikontroll leidis ootamatu kogu või pesastatud alamkogu — manifesti hõivamine katkestatud TÄIELIKULT, " +
      "et vältida puuduliku (näiliselt täieliku, aga tegelikult osalise) nimekirja krüpteerimist ja üleslaadimist.",
  },
  MANIFEST_CAPTURE_FAILED: { category: "data_access", safeMessage: "Manifesti hõivamine Firestore'ist ebaõnnestus." },
  ENCRYPTION_FAILED: { category: "cryptography", safeMessage: "Manifesti krüpteerimine ebaõnnestus — faili EI kirjutatud." },
  ARTIFACT_WRITE_FAILED: { category: "io", safeMessage: "Krüpteeritud faili kirjutamine kettale ebaõnnestus." },
  UNEXPECTED_CLI_FAILURE: { category: "unknown", safeMessage: "Ootamatu, käsitlemata viga CLI käivituse juures." },
};

const SAFE_ERROR_NAMES: ReadonlySet<string> = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "FirebaseAppError",
  "FirebaseAuthError",
  "BackupDecryptionError",
]);

function safeErrorName(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown";
  const name = err.constructor?.name ?? err.name;
  return name && SAFE_ERROR_NAMES.has(name) ? name : "Unknown";
}

/** Same chokepoint and guarantee as captureManifestEncrypted.ts's identically-named function — see that file's own comment and this file's own test suite's deliberately-poisoned-exception regression tests. */
export function formatSafeError(code: ErrorCode, err?: unknown): string {
  const info = SAFE_ERROR_INFO[code];
  const suffix = err !== undefined ? ` (erindi liik: ${safeErrorName(err)})` : "";
  return `VIGA [${code}] [${info.category}]: ${info.safeMessage}${suffix}`;
}

// ── The safe, encryptable export shape ──────────────────────────────────

export interface SafeFullRemovalManifestEntry {
  id: string;
  /** Fully-qualified Firestore path to this exact document, e.g. "users/U1/tasks/T1", "feedbackSubmissions/F1", or "users/U1" for the profile document itself. */
  path: string;
  updateTimeMillis: number;
}

export interface SafeFullRemovalManifestExport {
  formatVersion: 1;
  capturedAtIso: string;
  uid: string;
  storageStatus: string;
  structureCheck: {
    ok: boolean;
    unknownTopLevelCollectionsCount: number;
    unexpectedNestedSubcollectionsCount: number;
  };
  manifest: Record<string, SafeFullRemovalManifestEntry[]>;
}

/**
 * Computes the fully-qualified path for one manifest entry, given which
 * category key it came from — the one, auditable chokepoint for "every
 * entry's path is exact and unambiguous," per the approved plan's own
 * requirement. Mirrors exactly how fullAccountRemoval.ts itself builds
 * each category's documents: the profile document IS users/{uid} itself
 * (not a child of it), the two shared collections are root-level (never
 * under users/{uid}), and every other category (including a nested
 * compound key like "aiConversations/{id}/messages") is a direct or
 * nested child of users/{uid}.
 */
export function resolveEntryPath(uid: string, category: string, id: string): string {
  if (category === PROFILE_DOCUMENT_MANIFEST_KEY) return `users/${uid}`;
  if ((SHARED_UID_SCOPED_COLLECTIONS as readonly string[]).includes(category)) return `${category}/${id}`;
  return `users/${uid}/${category}/${id}`;
}

/**
 * Builds the safe, encryptable export from a capture-manifest
 * FullAccountRemovalResult. Deliberately drops the specific unknown-
 * collection paths / unexpected-nested-subcollection document ids an
 * unexpected finding may carry — only COUNTS are exported, even into
 * the encrypted artifact, for the same reason as
 * captureManifestEncrypted.ts's identically-named function.
 */
export function buildSafeFullRemovalManifestExport(uid: string, result: FullAccountRemovalResult): SafeFullRemovalManifestExport {
  const manifest: Record<string, SafeFullRemovalManifestEntry[]> = {};
  for (const [category, entries] of Object.entries(result.capturedManifest ?? {})) {
    manifest[category] = entries.map((e) => ({ id: e.id, path: resolveEntryPath(uid, category, e.id), updateTimeMillis: e.updateTime.toMillis() }));
  }
  return {
    formatVersion: 1,
    capturedAtIso: new Date().toISOString(),
    uid,
    storageStatus: result.storageStatus,
    structureCheck: {
      ok: result.structureCheck.ok,
      unknownTopLevelCollectionsCount: result.structureCheck.unknownTopLevelCollections.length,
      unexpectedNestedSubcollectionsCount: result.structureCheck.unexpectedNestedSubcollections.length,
    },
    manifest,
  };
}

export interface CaptureFullRemovalManifestEncryptedSummary {
  /** Kept on this type for callers that need it; deliberately NEVER printed below — same reasoning as captureManifestEncrypted.ts's own identically-shaped field. */
  uid: string;
  exportId: string;
  categoriesCaptured: number;
  totalDocumentsCaptured: number;
  structureOk: boolean;
  storageStatus: string;
  encryptedArtifact: { path: string; sizeBytes: number };
  overallSuccess: boolean;
}

export function printSafeSummary(summary: CaptureFullRemovalManifestEncryptedSummary): void {
  console.log("═".repeat(72));
  console.log("KIVORA VANA KONTO TÄIELIKU EEMALDAMISE MANIFESTI HÕIVAMINE (krüpteeritud, AINULT lugemine)");
  console.log("═".repeat(72));
  console.log(`Ekspordi ID:            ${summary.exportId}`);
  console.log("Sihtkonto:              kontrollitud ja EXPECTED_UID-le vastavaks kinnitatud");
  console.log(`Kategooriaid hõivatud:  ${summary.categoriesCaptured}`);
  console.log(`Dokumente kokku:        ${summary.totalDocumentsCaptured}`);
  console.log(`Struktuur OK:           ${summary.structureOk ? "JAH" : "EI"}`);
  console.log(`Firebase Storage:       ${summary.storageStatus} (ei puudutatud, ei eeldatud tühjaks)`);
  console.log(`Krüpteeritud fail:      ${summary.encryptedArtifact.path}`);
  console.log(`Faili suurus:           ${summary.encryptedArtifact.sizeBytes} baiti`);
  console.log("");
  console.log(
    "MIDAGI SELLEST KÄIVITUSEST EI OLE KUSTUTATUD EGA MUUDETUD. Dokumentide ID-sid, teid, ajatempleid " +
      "ega sisu ei ole sellesse logisse kunagi kirjutatud — need on ainult krüpteeritud failis.",
  );
  console.log("═".repeat(72));
  console.log(summary.overallSuccess ? "TULEMUS: ÕNNESTUS" : "TULEMUS: EBAÕNNESTUS");
  console.log("═".repeat(72));
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const target = resolveTargetIdentifier(argv, env);
  if (!target) {
    console.error(formatSafeError(ErrorCode.TARGET_NOT_RESOLVED));
    return 1;
  }

  const expectedUid = env["EXPECTED_UID"];
  if (!expectedUid) {
    console.error(formatSafeError(ErrorCode.MISSING_EXPECTED_UID));
    return 1;
  }

  const expectedProjectId = env["EXPECTED_PROJECT_ID"];
  if (!expectedProjectId) {
    console.error(formatSafeError(ErrorCode.MISSING_EXPECTED_PROJECT_ID));
    return 1;
  }
  if (env["FIREBASE_PROJECT_ID"] !== expectedProjectId) {
    console.error(formatSafeError(ErrorCode.PROJECT_ID_MISMATCH));
    return 1;
  }

  const passphrase = env["MANIFEST_ENCRYPTION_PASSPHRASE"];
  if (!passphrase) {
    console.error(formatSafeError(ErrorCode.MISSING_PASSPHRASE));
    return 1;
  }

  let auth: ReturnType<typeof getFirebaseAdminAuth>;
  let firestore: FirestoreLike;
  try {
    auth = getFirebaseAdminAuth();
    firestore = getFirebaseAdminFirestore();
  } catch (err) {
    console.error(formatSafeError(ErrorCode.ADMIN_INIT_FAILED, err));
    return 1;
  }

  let uid: string;
  try {
    const user = target.mode === "email" ? await auth.getUserByEmail(target.value) : await auth.getUser(target.value);
    uid = user.uid;
  } catch (err) {
    console.error(formatSafeError(ErrorCode.USER_LOOKUP_FAILED, err));
    return 1;
  }

  if (uid !== expectedUid) {
    console.error(formatSafeError(ErrorCode.UID_MISMATCH));
    return 1;
  }

  // ── The ONE, hardcoded mode this file ever runs. ────────────────────────
  let result: FullAccountRemovalResult;
  try {
    result = await runFullAccountRemoval(firestore, uid, { mode: "capture-manifest", log: (msg) => console.log(msg) });
  } catch (err) {
    console.error(formatSafeError(ErrorCode.MANIFEST_CAPTURE_FAILED, err));
    return 1;
  }

  // ── The extra gate this file adds on top of runFullAccountRemoval()'s
  // own capture-manifest mode — see this file's own doc comment. An
  // unexpected structure finding aborts HERE, before anything is built,
  // encrypted, or written — never a partial export. ───────────────────────
  if (!result.structureCheck.ok) {
    console.error(formatSafeError(ErrorCode.UNEXPECTED_STRUCTURE));
    return 1;
  }

  const safeExport = buildSafeFullRemovalManifestExport(uid, result);
  const exportId = generateManifestExportId();

  let encryptedBuffer: Buffer;
  try {
    const plaintext = Buffer.from(JSON.stringify(safeExport), "utf8");
    encryptedBuffer = encryptBackup(plaintext, passphrase);
  } catch (err) {
    console.error(formatSafeError(ErrorCode.ENCRYPTION_FAILED, err));
    return 1;
  }

  const artifactPath = `kivora-full-removal-manifest-${exportId}.enc`;
  try {
    writeFileSync(artifactPath, encryptedBuffer);
  } catch (err) {
    console.error(formatSafeError(ErrorCode.ARTIFACT_WRITE_FAILED, err));
    return 1;
  }

  const totalDocumentsCaptured = Object.values(safeExport.manifest).reduce((sum, entries) => sum + entries.length, 0);
  const summary: CaptureFullRemovalManifestEncryptedSummary = {
    uid,
    exportId,
    categoriesCaptured: Object.keys(safeExport.manifest).length,
    totalDocumentsCaptured,
    structureOk: safeExport.structureCheck.ok,
    storageStatus: safeExport.storageStatus,
    encryptedArtifact: { path: artifactPath, sizeBytes: encryptedBuffer.length },
    overallSuccess: result.overallSuccess && encryptedBuffer.length > 0,
  };
  printSafeSummary(summary);
  return summary.overallSuccess ? 0 : 1;
}
