/**
 * captureManifestEncrypted.ts — a SEPARATE, read-only entry point that
 * runs testDataCleanup.ts's existing "capture-manifest" mode and writes
 * its result ONLY as an AES-256-GCM-encrypted artifact, never as
 * plaintext anywhere (disk, stdout, or GitHub Actions logs).
 *
 * ── Why this is a separate file from testDataCleanup.ts's own main() ────
 * testDataCleanup.ts's main()+printSummary() (used by the interactive CLI
 * and by runTestDataCleanupCli.ts) deliberately print the captured
 * manifest's document ids and updateTime values to the console for a
 * human operator running it by hand — see printSummary()'s own
 * "Hõivatud manifest" block. That is correct for a human at a terminal,
 * but WRONG for a GitHub Actions run, where stdout becomes a persistent,
 * potentially longer-lived log. This file calls the SAME, UNMODIFIED
 * runCleanup({ mode: "capture-manifest" }) testDataCleanup.ts already
 * exports and is already tested — nothing about the cleanup/manifest
 * logic itself is duplicated or changed here — but it NEVER calls
 * printSummary(), and it never logs a manifest entry's id or updateTime
 * itself. Only the encrypted bytes ever leave this process as a file.
 *
 * ── Structurally incapable of entering execute mode ──────────────────────
 * This file never reads any mode-selecting environment variable at all —
 * the literal string "capture-manifest" is the ONLY mode value this file
 * ever passes to runCleanup(), hardcoded, not sourced from any
 * environment variable, CLI flag, or secret. It also never references
 * the delete-confirmation phrase, the backup-id gate, or either finance/
 * documents deletion-confirmation variable anywhere this testDataCleanup
 * module's execute path uses — see captureManifestEncrypted.test.ts's
 * source-scan tests, which check this directly against this file's own
 * source text (by design, this very sentence avoids spelling out those
 * variables' exact names, so it cannot itself trigger a false positive
 * in that scan).
 *
 * ── What gets encrypted, and what never does ─────────────────────────────
 * Encrypted payload (AES-256-GCM via backupEncryption.ts's already-tested
 * encryptBackup(), reused unchanged — see that file's own doc comment for
 * the format and the authenticated-encryption guarantee): every
 * allowlisted collection's captured manifest entries (document id +
 * updateTime in milliseconds — never field content, exactly as
 * testDataCleanup.ts's own captureManifest() already guarantees), plus
 * safe metadata (uid, capture timestamp, live document counts per
 * collection, and WHETHER an unexpected structure was found).
 *
 * Deliberately excluded even from the encrypted payload: any document's
 * own field content (captureManifest() never reads it in the first
 * place), and the specific document ids of an unexpected-structure
 * finding (only counts of such findings are included — see
 * buildSafeManifestExport()'s own comment).
 *
 * This file only DEFINES and EXPORTS main() — it never calls it itself,
 * the same split as every other tool in this project. The CLI entry
 * point is the separate runCaptureManifestEncryptedCli.ts.
 */

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import { runCleanup, type FirestoreLike, type CleanupResult } from "./testDataCleanup.js";
import { encryptBackup } from "./backupEncryption.js";

function generateManifestExportId(): string {
  return `mf_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

/**
 * The exact shape written into the encrypted artifact. Every manifest
 * entry's `updateTime` (a TimestampLike, not JSON-serializable on its
 * own) is converted to a plain `updateTimeMillis` number here — this is
 * the ONLY place that conversion happens, so there is one, auditable
 * chokepoint for "never put a raw Timestamp-like object, and never put
 * field content, into the export".
 */
export interface SafeManifestExport {
  formatVersion: 1;
  capturedAtIso: string;
  uid: string;
  liveCounts: Record<string, number>;
  structureCheck: {
    ok: boolean;
    unknownTopLevelCollectionsCount: number;
    unexpectedNestedSubcollectionsCount: number;
  };
  manifest: Record<string, { id: string; updateTimeMillis: number }[]>;
}

/**
 * Builds the safe, encryptable export from a capture-manifest
 * CleanupResult. Deliberately drops the specific unknown-collection
 * paths / unexpected-nested-subcollection document ids that
 * StructureCheckResult may carry — only COUNTS of such findings are
 * exported, even into the encrypted artifact, since this tool's whole
 * purpose is reviewing the APPROVED, already-known collections, not
 * cataloguing anything unexpected by name. An unexpected finding still
 * makes `structureCheck.ok` false here, which is enough for a human
 * reviewer to know to go look directly at Firestore, without this
 * export itself becoming a second place unexpected names/ids are
 * recorded.
 */
export function buildSafeManifestExport(uid: string, result: CleanupResult): SafeManifestExport {
  const manifest: Record<string, { id: string; updateTimeMillis: number }[]> = {};
  for (const [path, entries] of Object.entries(result.capturedManifest ?? {})) {
    manifest[path] = entries.map((e) => ({ id: e.id, updateTimeMillis: e.updateTime.toMillis() }));
  }
  return {
    formatVersion: 1,
    capturedAtIso: new Date().toISOString(),
    uid,
    liveCounts: result.liveCounts,
    structureCheck: {
      ok: result.structureCheck.ok,
      unknownTopLevelCollectionsCount: result.structureCheck.unknownTopLevelCollections.length,
      unexpectedNestedSubcollectionsCount: result.structureCheck.unexpectedNestedSubcollections.length,
    },
    manifest,
  };
}

export interface CaptureManifestEncryptedSummary {
  uid: string;
  exportId: string;
  collectionsCaptured: number;
  totalDocumentsCaptured: number;
  structureOk: boolean;
  encryptedArtifact: { path: string; sizeBytes: number };
  overallSuccess: boolean;
}

export function printSafeSummary(summary: CaptureManifestEncryptedSummary): void {
  console.log("═".repeat(72));
  console.log("KIVORA MANIFESTI HÕIVAMINE (krüpteeritud, AINULT lugemine)");
  console.log("═".repeat(72));
  console.log(`Ekspordi ID:            ${summary.exportId}`);
  console.log(`Konto uid:              ${summary.uid}`);
  console.log(`Kogusid hõivatud:       ${summary.collectionsCaptured}`);
  console.log(`Dokumente kokku:        ${summary.totalDocumentsCaptured}`);
  console.log(`Struktuur OK:           ${summary.structureOk ? "JAH" : "EI (vt Firestore otse — vt auditi aruanne)"}`);
  console.log(`Krüpteeritud fail:      ${summary.encryptedArtifact.path}`);
  console.log(`Faili suurus:           ${summary.encryptedArtifact.sizeBytes} baiti`);
  console.log("");
  console.log(
    "MIDAGI SELLEST KÄIVITUSEST EI OLE KUSTUTATUD EGA MUUDETUD. Dokumentide ID-sid, ajatempleid " +
      "ega sisu ei ole sellesse logisse kunagi kirjutatud — need on ainult krüpteeritud failis.",
  );
  console.log("═".repeat(72));
  console.log(summary.overallSuccess ? "TULEMUS: ÕNNESTUS" : "TULEMUS: EBAÕNNESTUS");
  console.log("═".repeat(72));
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  // ── Fail fast on configuration problems, before touching Firebase at all ──
  const target = resolveTargetIdentifier(argv, env);
  if (!target) {
    console.error(
      "Sihtkontot ei määratud. Üks järgnevast on vajalik:\n" +
        "  - CLI argument: node runCaptureManifestEncrypted.mjs <e-post-või-uid>\n" +
        "  - OWNER_EMAIL keskkonnamuutuja\n" +
        "  - OWNER_UID keskkonnamuutuja\n" +
        "Ei arva vaikimisi kontot ära — vaikekontot ei ole.",
    );
    return 1;
  }

  const expectedUid = env["EXPECTED_UID"];
  if (!expectedUid) {
    console.error("Keskkonnamuutuja EXPECTED_UID on kohustuslik — täpne, selgesõnaline UID kontroll on vajalik enne mistahes toimingut.");
    return 1;
  }

  const expectedProjectId = env["EXPECTED_PROJECT_ID"];
  if (!expectedProjectId) {
    console.error("Keskkonnamuutuja EXPECTED_PROJECT_ID on kohustuslik — täpne projekti ID kontroll on vajalik enne mistahes toimingut.");
    return 1;
  }
  if (env["FIREBASE_PROJECT_ID"] !== expectedProjectId) {
    console.error(`Projekti ID lahknevus: FIREBASE_PROJECT_ID ei vasta EXPECTED_PROJECT_ID-le ("${expectedProjectId}"). Katkestan.`);
    return 1;
  }

  const passphrase = env["MANIFEST_ENCRYPTION_PASSPHRASE"];
  if (!passphrase) {
    console.error(
      "Keskkonnamuutuja MANIFEST_ENCRYPTION_PASSPHRASE on vajalik — see on konto omaniku enda valitud " +
        "parool, mida see skript ei genereeri ega salvesta. Ilma selleta ei krüpteerita midagi, nii et " +
        "manifesti hõivamist ei käivitata üldse.",
    );
    return 1;
  }

  let auth: ReturnType<typeof getFirebaseAdminAuth>;
  let firestore: FirestoreLike;
  try {
    auth = getFirebaseAdminAuth();
    firestore = getFirebaseAdminFirestore();
  } catch (err) {
    console.error(`Firebase Admin ei ole kättesaadav: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let uid: string;
  try {
    const user = target.mode === "email" ? await auth.getUserByEmail(target.value) : await auth.getUser(target.value);
    uid = user.uid;
  } catch (err) {
    console.error(`Kasutajat ei leitud (${target.mode}="${target.value}"): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (uid !== expectedUid) {
    console.error("UID lahknevus: lahendatud kasutaja ei vasta EXPECTED_UID-le. Katkestan enne mistahes toimingut.");
    return 1;
  }

  // ── The ONE, hardcoded mode this file ever runs. Not sourced from any
  // environment variable — see this file's own doc comment. ─────────────
  let result: CleanupResult;
  try {
    result = await runCleanup(firestore, uid, { mode: "capture-manifest", log: (msg) => console.log(msg) });
  } catch (err) {
    console.error(`Manifesti hõivamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const safeExport = buildSafeManifestExport(uid, result);
  const exportId = generateManifestExportId();

  // ── Encrypt BEFORE anything is written to disk. If this throws, the
  // function returns here — there is no code path in this file that
  // writes a plaintext file, with or without a fallback. ─────────────────
  let encryptedBuffer: Buffer;
  try {
    const plaintext = Buffer.from(JSON.stringify(safeExport), "utf8");
    encryptedBuffer = encryptBackup(plaintext, passphrase);
  } catch (err) {
    console.error(`Manifesti krüpteerimine ebaõnnestus — faili EI kirjutata: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const artifactPath = `kivora-manifest-${exportId}.enc`;
  try {
    writeFileSync(artifactPath, encryptedBuffer);
  } catch (err) {
    console.error(`Krüpteeritud faili kirjutamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const totalDocumentsCaptured = Object.values(safeExport.manifest).reduce((sum, entries) => sum + entries.length, 0);
  const summary: CaptureManifestEncryptedSummary = {
    uid,
    exportId,
    collectionsCaptured: Object.keys(safeExport.manifest).length,
    totalDocumentsCaptured,
    structureOk: safeExport.structureCheck.ok,
    encryptedArtifact: { path: artifactPath, sizeBytes: encryptedBuffer.length },
    overallSuccess: result.overallSuccess && encryptedBuffer.length > 0,
  };
  printSafeSummary(summary);
  return summary.overallSuccess ? 0 : 1;
}
