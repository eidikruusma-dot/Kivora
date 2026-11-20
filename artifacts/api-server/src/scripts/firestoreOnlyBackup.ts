/**
 * firestoreOnlyBackup.ts — core logic for a Firestore-ONLY Kivora account
 * backup, built because Firebase Storage access is currently blocked for
 * this project (Spark pricing plan — Firebase's own Storage FAQ confirms
 * Storage API calls return 402/403 until the project moves to the Blaze
 * plan; see https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
 * This file NEVER attempts a Storage call of any kind — see
 * firestoreOnlyBackup.test.ts's source-scan test for the structural proof.
 *
 * ── What this backs up ───────────────────────────────────────────────────
 * Exactly the Firestore half of fullAccountBackup.ts's coverage: every
 * users/{uid} subcollection discovered recursively (including unknown and
 * nested ones), plus the three public root-level submission collections
 * scoped to this account. Reuses fullAccountBackup.ts's already-tested,
 * Storage-independent functions directly — discoverAndReadAllUserCollections,
 * readRootCollections, flattenBackup, writeFirestoreBackup,
 * verifyFirestoreBackupIntegrity, buildExportPayload, EXCLUDED_FROM_DISCOVERY
 * — rather than re-implementing any of them.
 *
 * ── What this deliberately does NOT back up, and says so ────────────────
 * Firebase Storage (profile photos, uploaded documents) is NOT included.
 * This is never silently implied to be "empty" — the encrypted export's
 * storageStatus field is always the literal string
 * "NOT_INCLUDED_BLOCKED_BY_BILLING_PLAN", and every console summary line
 * calls this a "Firestore'i varukoopia", never a full/complete account
 * backup — see printSummary() below and
 * firestoreOnlyBackup.test.ts's check that the full-backup tool's own
 * "complete" wording never appears here.
 *
 * ── Two independent destinations, same discipline as fullAccountBackup.ts ──
 * 1. A Firestore-side copy (via the SAME users/{uid}/_fullBackups/{id}
 *    namespace fullAccountBackup.ts uses — already excluded from
 *    discovery, already tested, so reusing it needs no change to that
 *    file's EXCLUDED_FROM_DISCOVERY list).
 * 2. An encrypted (AES-256-GCM), independent export, uploaded only as a
 *    GitHub Actions artifact — see runFirestoreOnlyBackupCli.ts and
 *    .github/workflows/firestore-only-backup.yml.
 *
 * ── Never touches the existing backups, never deletes anything ──────────
 * Same guarantees as fullAccountBackup.ts: EXCLUDED_FROM_DISCOVERY keeps
 * the existing users/{uid}/backups collection and this tool's own
 * namespaces out of discovery; nothing in this file performs a delete. The
 * one restore-shaped call (the restorability check) is hardcoded to an
 * isolated scratch path and cleans itself up — see restoreVerification.ts.
 *
 * This file only DEFINES and EXPORTS main() — it never calls it itself,
 * the same split as runFullAccountBackup.ts/runFullAccountBackupCli.ts.
 * The actual CLI entry point is runFirestoreOnlyBackupCli.ts.
 */

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import {
  discoverAndReadAllUserCollections,
  readRootCollections,
  flattenBackup,
  writeFirestoreBackup,
  verifyFirestoreBackupIntegrity,
  buildExportPayload,
  type FirestoreLike,
  type BackedUpCollection,
} from "./fullAccountBackup.js";
import { verifyRestorability, type FirestoreWithDelete } from "./restoreVerification.js";
import { encryptBackup } from "./backupEncryption.js";

/** The one, fixed reason code for why Storage is absent — never a free-text guess, so a later reader can branch on it exactly. */
export const STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN = "NOT_INCLUDED_BLOCKED_BY_BILLING_PLAN" as const;

function generateBackupId(): string {
  return `bk_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export interface FirestoreOnlyBackupSummary {
  backupId: string;
  uid: string;
  firestoreDestination: {
    succeeded: boolean;
    chunksWritten: number;
    integrityOk: boolean;
    failedPaths: string[];
  };
  storageStatus: typeof STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN;
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

function printSummary(summary: FirestoreOnlyBackupSummary): void {
  console.log("═".repeat(72));
  console.log("KIVORA FIRESTORE'I VARUKOOPIA (Storage EI OLE kaasatud)");
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
  console.log("2. Firebase Storage");
  console.log(`   Olek: ${summary.storageStatus}`);
  console.log(
    "   Storage'ile ei olnud varundamise ajal ligipääsu (Spark pakett nõuab Blaze'ile üleminekut " +
      "Storage'i kasutamiseks). Storage'i sisu EI OLE kontrollitud ega varundatud — see ei tähenda, " +
      "et Storage on tühi, vaid et see jääb teadmata, kuni ligipääs taastatakse.",
  );
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
      ? "TULEMUS: ÕNNESTUS — Firestore'i varukoopia õnnestus ja kontrolliti. Storage EI OLE selle sees."
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
        "  - CLI argument: node runFirestoreOnlyBackup.mjs <e-post-või-uid>\n" +
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

  // Deliberately no Storage Admin accessor call anywhere in this file —
  // this script never touches Firebase Storage, so it never needs a
  // Storage bucket name either.
  let auth: ReturnType<typeof getFirebaseAdminAuth>;
  let firestore: FirestoreLike & FirestoreWithDelete;
  try {
    auth = getFirebaseAdminAuth();
    firestore = getFirebaseAdminFirestore();
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

  // Logged BEFORE any write, so a later failure's log always names the
  // exact backupId to look up under users/{uid}/_fullBackups/.
  console.log(`Varukoopia ID: ${backupId} (konto uid: ${uid}) — Firestore-only (Storage ei ole kaasatud)`);

  // ── 1. Discover + read (Firestore only) ───────────────────────────────────
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

  // ── There is no stage 3 here. Firebase Storage is never read, copied, or
  // downloaded — see the file's own doc comment and the source-scan test. ──

  // ── 3. Build export payload (Firestore-only) + encrypt ───────────────────
  let encryptedBuffer: Buffer;
  try {
    const basePayload = buildExportPayload(uid, backupId, flat, []);
    const payload = {
      ...basePayload,
      storageStatus: STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN,
      storageNote:
        "Firebase Storage'ile ei olnud varundamise ajal ligipääsu (Spark pakett nõuab Blaze'ile " +
        "üleminekut). Storage'i sisu ei ole kontrollitud, loetud ega varundatud. See EI tähenda, et " +
        "Storage on tühi — see on teadmata.",
    };
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    encryptedBuffer = encryptBackup(plaintext, passphrase);
  } catch (err) {
    console.error(`Varukoopia krüpteerimine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const artifactPath = `kivora-firestore-only-backup-${backupId}.enc`;
  try {
    writeFileSync(artifactPath, encryptedBuffer);
  } catch (err) {
    console.error(`Krüpteeritud faili kirjutamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── 4. Restorability check — isolated scratch path ONLY, never real data ──
  let restorabilityAllMatch = false;
  let restorabilityCleanupOk = false;
  try {
    // The collision guard checks whether the scratch segment name
    // (restoreVerification.ts's RESTORE_VERIFICATION_SEGMENT) happens to collide with an ACTUAL,
    // currently-existing top-level collection — so this list must be only
    // the real, discovered collection paths. EXCLUDED_FROM_DISCOVERY must
    // NOT be spread in here: that constant itself always contains the
    // scratch segment's own name (it's one of the names this tool
    // deliberately skips during discovery), so including it would make
    // the guard always see its own name as "real" and refuse to run.
    const realCollectionNames = userCollections.map((c) => c.path);
    const verification = await verifyRestorability(firestore, uid, backupId, flat, realCollectionNames);
    restorabilityAllMatch = verification.allMatch;
    restorabilityCleanupOk = verification.cleanupSucceeded;
  } catch (err) {
    console.error(`Taastatavuse kontroll ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const summary: FirestoreOnlyBackupSummary = {
    backupId,
    uid,
    firestoreDestination: { succeeded: firestoreIntegrityOk, chunksWritten, integrityOk: firestoreIntegrityOk, failedPaths },
    storageStatus: STORAGE_STATUS_BLOCKED_BY_BILLING_PLAN,
    restorabilityCheck: { ranAgainstScratchPathOnly: true, allMatch: restorabilityAllMatch, cleanupSucceeded: restorabilityCleanupOk },
    encryptedArtifact: { path: artifactPath, sizeBytes: encryptedBuffer.length },
    overallSuccess: firestoreIntegrityOk && restorabilityAllMatch && restorabilityCleanupOk && encryptedBuffer.length > 0,
  };

  printSummary(summary);
  return summary.overallSuccess ? 0 : 1;
}
