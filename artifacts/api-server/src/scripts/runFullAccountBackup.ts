/**
 * runFullAccountBackup.ts — the CLI entry point that orchestrates the
 * full Kivora account backup, tying together every already-tested piece:
 *
 *   discover (recursive, incl. unknown/nested) → read (type-preserving)
 *   → write Firestore-side copy (users/{uid}/_fullBackups/{id}) → verify
 *   its content+type integrity → copy + checksum-verify Storage files →
 *   build the independent export payload → encrypt it (AES-256-GCM) →
 *   write ONLY the encrypted bytes to disk → run the restorability check
 *   (isolated scratch path, never real data — see below)
 *
 * ── "Taastamist ei tohi selle töövoo kaudu käivitada" ────────────────────
 * This file never writes real restored data to the real "users/{uid}"
 * root — the only restore-shaped call anywhere in this orchestration is
 * verifyRestorability()'s own internal one, which is
 * hardcoded to an isolated scratch path (users/{uid}/__restoreVerification__/…)
 * and deletes everything it wrote before returning, success or failure
 * (see restoreVerification.ts and its tests). There is no code path here
 * — none — that writes to, deletes from, or otherwise touches a real
 * collection the live app reads from. "Taastamine" (an actual restoration
 * of real data) never happens via this script; only "taastatavuse
 * kontroll" (a restorability check that proves it WOULD work, without
 * doing it for real) does.
 *
 * ── Plaintext never touches disk or logs ─────────────────────────────────
 * The export payload is held only in memory (a Buffer) between being
 * built and being encrypted. The ONLY thing this script ever writes to
 * disk is the final encrypted buffer. No step prints document content —
 * every console.log/console.error here is a count, a path, a checksum,
 * or a backup/collection name, the same discipline dataCleanupDryRun.ts
 * and fullAccountBackup.ts already follow.
 *
 * ── Never overwrites existing data or the two existing backups ──────────
 * fullAccountBackup.ts's write path has no delete method on its own
 * interface (structurally provable — see its tests) and never references
 * the existing backups collection (EXCLUDED_FROM_DISCOVERY, also tested).
 * This file additionally checks, right before writing, that the fresh
 * backupId it generated does not already exist — belt-and-suspenders
 * against the (practically impossible, given the id's entropy) case of a
 * collision.
 *
 * ── Failure reporting ─────────────────────────────────────────────────────
 * Each stage is wrapped so a failure names exactly which stage and target
 * failed and why, then returns a non-zero exit code — main()'s caller
 * (the GitHub Actions step) sees a failed step with a specific message,
 * never a silent or generic failure.
 *
 * This file only DEFINES and EXPORTS main() — it deliberately never calls
 * it, so it stays side-effect-free and safely importable by its own unit
 * tests (runFullAccountBackup.test.ts). The actual CLI entry point that
 * calls main() and sets the process exit code is the separate, tiny
 * runFullAccountBackupCli.ts — see that file's doc comment for exactly
 * why that split exists, and for the usage command .github/workflows/
 * full-account-backup.yml actually runs.
 *
 * Requires the same FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY Admin credentials as the rest of this server, plus
 * BACKUP_ENCRYPTION_PASSPHRASE (a passphrase the account owner chose —
 * never generated or stored by this script) and, optionally,
 * FIREBASE_STORAGE_BUCKET if the project's default Storage bucket cannot
 * be resolved automatically.
 */

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
  getFirebaseAdminStorage,
} from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import {
  discoverAndReadAllUserCollections,
  readRootCollections,
  flattenBackup,
  writeFirestoreBackup,
  verifyFirestoreBackupIntegrity,
  backupStoragePrefix,
  downloadStorageFileForExport,
  storagePrefixesFor,
  buildExportPayload,
  EXCLUDED_FROM_DISCOVERY,
  type FirestoreLike,
  type StorageLike,
  type BackedUpCollection,
} from "./fullAccountBackup.js";
import { verifyRestorability, type FirestoreWithDelete } from "./restoreVerification.js";
import { encryptBackup } from "./backupEncryption.js";

function generateBackupId(): string {
  return `bk_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export interface FullBackupSummary {
  backupId: string;
  uid: string;
  firestoreDestination: {
    succeeded: boolean;
    chunksWritten: number;
    integrityOk: boolean;
    failedPaths: string[];
  };
  storageDestination: {
    filesCopied: number;
    checksumMismatches: string[];
  };
  restorabilityCheck: {
    ranAgainstScratchPathOnly: true;
    allMatch: boolean;
    cleanupSucceeded: boolean;
  };
  encryptedArtifact: {
    path: string;
    sizeBytes: number;
  };
  overallSuccess: boolean;
}

function printSummary(summary: FullBackupSummary): void {
  console.log("═".repeat(72));
  console.log("KIVORA TÄIELIK VARUNDAMINE");
  console.log("═".repeat(72));
  console.log(`Varukoopia ID: ${summary.backupId}`);
  console.log(`Konto uid:     ${summary.uid}`);
  console.log("");
  console.log("1. Firestore-sisene koopia (users/{uid}/_fullBackups)");
  console.log(`   Kirjutatud tükke: ${summary.firestoreDestination.chunksWritten}`);
  console.log(`   Terviklikkus:     ${summary.firestoreDestination.integrityOk ? "OK" : "EBAÕNNESTUS"}`);
  if (summary.firestoreDestination.failedPaths.length > 0) {
    console.log(`   Ebaõnnestunud kogud: ${summary.firestoreDestination.failedPaths.join(", ")}`);
  }
  console.log("");
  console.log("2. Firebase Storage koopia");
  console.log(`   Kopeeritud faile: ${summary.storageDestination.filesCopied}`);
  console.log(`   Kontrollsumma vastuolusid: ${summary.storageDestination.checksumMismatches.length}`);
  if (summary.storageDestination.checksumMismatches.length > 0) {
    console.log(`     - ${summary.storageDestination.checksumMismatches.join("\n     - ")}`);
  }
  console.log("");
  console.log("3. Taastatavuse kontroll (AINULT eraldatud proovi-teel — päris andmeid ei puudutatud)");
  console.log(`   Kõik kogud taastusid korrektselt: ${summary.restorabilityCheck.allMatch ? "JAH" : "EI"}`);
  console.log(`   Proovi-andmete puhastus õnnestus: ${summary.restorabilityCheck.cleanupSucceeded ? "JAH" : "EI"}`);
  console.log("");
  console.log("4. Krüpteeritud, sõltumatu eksport (GitHub Actions artifact)");
  console.log(`   Fail: ${summary.encryptedArtifact.path}`);
  console.log(`   Suurus: ${summary.encryptedArtifact.sizeBytes} baiti`);
  console.log("");
  console.log("═".repeat(72));
  console.log(
    summary.overallSuccess
      ? "TULEMUS: ÕNNESTUS — mõlemad sõltumatud varundused õnnestusid ja kontrolliti."
      : "TULEMUS: EBAÕNNESTUS — vt üksikasju ülal. Ei loe seda varundust piisavaks.",
  );
  console.log("═".repeat(72));
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  // ── Fail fast on configuration problems, before touching Firebase at all ──
  const target = resolveTargetIdentifier(argv, env);
  if (!target) {
    console.error(
      "Sihtkontot ei määratud. Üks järgnevast on vajalik:\n" +
        "  - CLI argument: node runFullAccountBackup.mjs <e-post-või-uid>\n" +
        "  - OWNER_EMAIL keskkonnamuutuja\n" +
        "  - OWNER_UID keskkonnamuutuja\n" +
        "Ei arva vaikimisi kontot ära — vaikekontot ei ole.",
    );
    return 1;
  }

  const passphrase = env["BACKUP_ENCRYPTION_PASSPHRASE"];
  if (!passphrase) {
    console.error(
      "Keskkonnamuutuja BACKUP_ENCRYPTION_PASSPHRASE on vajalik — see on konto omaniku enda valitud " +
        "parool, mida see skript ei genereeri ega salvesta. Ilma selleta ei krüpteerita midagi, nii et " +
        "varundust ei käivitata üldse.",
    );
    return 1;
  }

  let auth: ReturnType<typeof getFirebaseAdminAuth>;
  let firestore: FirestoreLike & FirestoreWithDelete;
  let storage: StorageLike;
  try {
    auth = getFirebaseAdminAuth();
    firestore = getFirebaseAdminFirestore();
    storage = getFirebaseAdminStorage();
  } catch (err) {
    console.error(`Firebase Admin ei ole kättesaadav: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let uid: string;
  let email: string | undefined;
  try {
    const user = target.mode === "email" ? await auth.getUserByEmail(target.value) : await auth.getUser(target.value);
    uid = user.uid;
    email = user.email;
  } catch (err) {
    console.error(`Kasutajat ei leitud (${target.mode}="${target.value}"): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const backupId = generateBackupId();

  // ── Belt-and-suspenders: never proceed if this fresh id somehow already exists ──
  try {
    const existing = await firestore.doc(`users/${uid}/_fullBackups/${backupId}`).get();
    if (existing.exists) {
      console.error(
        `Turvapeatus: varukoopia ID "${backupId}" on juba olemas — katkestan, et vältida olemasoleva ` +
          "varukoopia ülekirjutamist, selle asemel, et proovida uuesti juhuslikuma ID-ga.",
      );
      return 1;
    }
  } catch (err) {
    console.error(`Varukoopia ID kontroll ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── 1. Discover + read (Firestore) ────────────────────────────────────────
  let userCollections: BackedUpCollection[];
  let rootCollections: BackedUpCollection[];
  try {
    userCollections = await discoverAndReadAllUserCollections(firestore, uid);
    rootCollections = await readRootCollections(firestore, uid, email);
  } catch (err) {
    console.error(`Andmete lugemine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const flat = flattenBackup([...userCollections, ...rootCollections]);

  // ── 2. Firestore-side copy + integrity check ──────────────────────────────
  let chunksWritten = 0;
  let firestoreIntegrityOk = true;
  const failedPaths: string[] = [];
  try {
    const writeResult = await writeFirestoreBackup(firestore, uid, backupId, flat);
    chunksWritten = writeResult.chunksWritten;
    const checks = await verifyFirestoreBackupIntegrity(firestore, uid, backupId, flat);
    for (const check of checks) {
      if (!check.contentMatches || check.actualCount !== check.expectedCount) {
        firestoreIntegrityOk = false;
        failedPaths.push(check.path);
      }
    }
  } catch (err) {
    console.error(`Firestore-sisese koopia kirjutamine/kontroll ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── 3. Storage: copy + checksum verify (destination 1) AND download (destination 2) ──
  let filesCopied = 0;
  const checksumMismatches: string[] = [];
  const storageExports: { path: string; content: Buffer; md5Hash: string | undefined }[] = [];
  try {
    const bucketName = env["FIREBASE_STORAGE_BUCKET"];
    const bucket = storage.bucket(bucketName);
    for (const { prefix } of storagePrefixesFor(uid)) {
      const copyResults = await backupStoragePrefix(bucket, prefix, backupId, uid);
      for (const result of copyResults) {
        filesCopied++;
        if (!result.checksumsMatch) checksumMismatches.push(result.sourcePath);
        const downloaded = await downloadStorageFileForExport(bucket, result.sourcePath);
        storageExports.push(downloaded);
      }
    }
  } catch (err) {
    console.error(`Firebase Storage varundus ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── 4. Build export payload + encrypt (plaintext never touches disk) ─────
  let encryptedBuffer: Buffer;
  try {
    const payload = buildExportPayload(uid, backupId, flat, storageExports);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    encryptedBuffer = encryptBackup(plaintext, passphrase);
  } catch (err) {
    console.error(`Varukoopia krüpteerimine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const artifactPath = `kivora-backup-${backupId}.enc`;
  try {
    writeFileSync(artifactPath, encryptedBuffer);
  } catch (err) {
    console.error(`Krüpteeritud faili kirjutamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── 5. Restorability check — isolated scratch path ONLY, never real data ──
  let restorabilityAllMatch = false;
  let restorabilityCleanupOk = false;
  try {
    const realCollectionNames = [...EXCLUDED_FROM_DISCOVERY, ...userCollections.map((c) => c.path)];
    const verification = await verifyRestorability(firestore, uid, backupId, flat, realCollectionNames);
    restorabilityAllMatch = verification.allMatch;
    restorabilityCleanupOk = verification.cleanupSucceeded;
  } catch (err) {
    console.error(`Taastatavuse kontroll ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const summary: FullBackupSummary = {
    backupId,
    uid,
    firestoreDestination: { succeeded: firestoreIntegrityOk, chunksWritten, integrityOk: firestoreIntegrityOk, failedPaths },
    storageDestination: { filesCopied, checksumMismatches },
    restorabilityCheck: { ranAgainstScratchPathOnly: true, allMatch: restorabilityAllMatch, cleanupSucceeded: restorabilityCleanupOk },
    encryptedArtifact: { path: artifactPath, sizeBytes: encryptedBuffer.length },
    overallSuccess:
      firestoreIntegrityOk &&
      checksumMismatches.length === 0 &&
      restorabilityAllMatch &&
      restorabilityCleanupOk &&
      encryptedBuffer.length > 0,
  };

  printSummary(summary);
  return summary.overallSuccess ? 0 : 1;
}
