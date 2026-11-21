/**
 * fullAccountRemoval.ts — a SEPARATE, purpose-built tool for completely
 * removing ONE Kivora account's Firestore data, built on top of
 * testDataCleanup.ts's already-reviewed safety architecture (exact
 * document+version manifest, two-layer concurrency protection,
 * structural discovery, small-batch precondition-protected deletes) —
 * reused directly wherever its existing, exported scope already covers
 * this tool's needs, never reimplemented.
 *
 * ── Why this is a NEW tool, not an extension of either existing one ──────
 * testDataCleanup.ts deliberately protects "settings" and never touches
 * the users/{uid} profile document itself — correct for a TEST-DATA
 * cleanup, wrong for a full account removal. planner-app's existing
 * client-side "delete my account" feature (its own dedicated service
 * module, independent of this server-side tooling entirely) is
 * independently known to be incomplete — checked directly against its
 * source: it never touches "plans", "calendars", "documents", or any
 * Money collection ("transactions"/"bills"/"monthlyBudgets") — and has
 * none of this project's manifest/precondition safety properties. This
 * file fixes both gaps with a new, narrowly-scoped tool, the same way
 * every other tool in this project does (see this file's own test
 * suite's source-scan test confirming it shares no code with that
 * client-side feature by name).
 *
 * ── What this file additionally covers, beyond testDataCleanup.ts ───────
 *  - "settings" (deliberately excluded from testDataCleanup.ts's scope —
 *    see that file's own PROTECTED_NAMES; this file never imports or
 *    reuses that constant for this reason).
 *  - The users/{uid} profile root document itself — captured and
 *    deleted LAST, only after every subcollection and every shared-
 *    collection entry below is confirmed gone by this same run.
 *  - feedbackSubmissions / supportMessages — ONLY the documents whose
 *    own "uid" field exactly matches the verified account uid (a
 *    Firestore query, re-verified per returned document after fetching
 *    — see captureSharedUidScopedManifest()'s own comment).
 *    contactSubmissions is NEVER queried, read, or deleted by this file
 *    at all — it is scoped only by a sender's email address, which is
 *    not sufficient proof of account ownership — see
 *    NEVER_TOUCHED_SHARED_COLLECTIONS below.
 *
 * ── What this file still does NOT do ─────────────────────────────────────
 * Never touches Firebase Authentication — no call to delete a user
 * anywhere in this file (confirmed by this file's own test suite's
 * source-scan test; that account-removal step is a separate, later,
 * even more guarded action). Never touches Firebase Storage — its
 * status is always reported as the literal string
 * "UNKNOWN_NOT_CHECKED", never assumed empty, and no Storage API is
 * ever called here. Never touches backups / _fullBackups /
 * _fullBackup / _restoreVerificationScratch — see PROTECTED_NAMESPACES.
 * Never touches contactSubmissions.
 *
 * ── Nested subcollections — checked, never assumed away ──────────────────
 * checkForUnexpectedStructure() (reused, unmodified from testDataCleanup.ts)
 * already recurses into EVERY document of EVERY known top-level
 * users/{uid} collection — including "settings" — looking for an
 * unexpected nested subcollection, with exactly one named exemption
 * (aiConversations/{id}/messages, itself fully manifest-and-precondition
 * protected by deleteCollectionSafely(), also reused unmodified). That
 * generic check is a hard pre-flight gate here too: ANY unexpected
 * nested subcollection anywhere under users/{uid} aborts the ENTIRE run
 * before any delete. For the two shared, uid-scoped collections
 * (outside users/{uid}, so outside that existing discovery's reach),
 * this file adds its own equivalent — assertNoNestedSubcollections() —
 * against every matched document, before it is ever treated as
 * deletable. Deleting a parent document never assumes its subcollections
 * went with it: every nested case this file knows about is captured,
 * re-verified, and deleted in its own right.
 *
 * ── Partial-deletion transparency and resumability ───────────────────────
 * Every category (each of the 16 base collections — including
 * aiConversations' own nested messages, reported under its own compound
 * key — plus settings, feedbackSubmissions, supportMessages, and the
 * profile document) is processed in sequence. A failure in one category
 * stops the ENTIRE run — no later category is attempted — but every
 * category already fully processed stays deleted (real progress, not
 * rolled back), and the returned FullAccountRemovalResult always
 * reports EXACTLY which categories succeeded (removedCounts) and which
 * one failed (failedCategory + abortReason), rather than only throwing.
 * A resumed invocation is checked against the SAME, fixed
 * APPROVED_FULL_REMOVAL_MANIFEST_* constant every time — never a newer
 * or wider one — so resuming can only finish the SAME approved scope,
 * never expand it.
 *
 * This file only DEFINES and EXPORTS main() — it never calls it itself,
 * the same split as every other tool in this project. The CLI entry
 * point is the separate runFullAccountRemovalCli.ts.
 */

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import {
  CLEANUP_ALLOWLIST,
  captureManifest,
  verifyManifestMatch,
  checkForUnexpectedStructure,
  deleteCollectionSafely,
  verifyBackupBeforeCleanup,
  SMALL_BATCH_SIZE,
  type FirestoreLike,
  type DocRefLike,
  type ManifestEntry,
  type ApprovedManifest,
  type ManifestMismatch,
  type StructureCheckResult,
  type BackupVerificationResult,
} from "./testDataCleanup.js";
import type { FirestoreWithDelete } from "./restoreVerification.js";

// ── This tool's own protected namespaces — deliberately NOT reused from
// testDataCleanup.ts's PROTECTED_NAMES, because that list also includes
// "settings" (correctly protected there, wrongly protected here — full
// account removal must be able to delete settings). Keeping this as an
// independent literal, rather than filtering the other file's constant,
// means a future change to testDataCleanup.ts's PROTECTED_NAMES can
// never silently also change what this file protects. ─────────────────
export const PROTECTED_NAMESPACES: readonly string[] = [
  "backups",
  "_fullBackups",
  "_fullBackup",
  "_restoreVerificationScratch",
];

/**
 * The two shared, root-level (NOT under users/{uid}) collections this
 * tool may remove entries from — ONLY the documents whose own "uid"
 * field exactly matches the verified account uid.
 */
export const SHARED_UID_SCOPED_COLLECTIONS: readonly string[] = ["feedbackSubmissions", "supportMessages"];

/**
 * Collections this file deliberately NEVER queries, reads, or deletes
 * from, under any mode, for any uid. contactSubmissions is scoped only
 * by a sender's email address (scopeField "senderEmail" in
 * dataCleanupDryRun.ts's own PUBLIC_ROOT_COLLECTIONS_PLAN) — an email
 * address is not reliable proof that a specific Firebase Auth account
 * owns that submission (a contact form may be filled in by anyone,
 * signed in or not, and email addresses can be shared, mistyped, or
 * reused). This constant exists so that fact is checked directly, not
 * just asserted in a comment — see this file's own test suite's
 * source-scan test, which confirms the literal string
 * "contactSubmissions" never appears anywhere else in this file.
 */
export const NEVER_TOUCHED_SHARED_COLLECTIONS: readonly string[] = ["contactSubmissions"];

/** The exact Storage status this tool always reports — never silently implying "empty" (see this file's own doc comment, property 6 of the approved plan). */
export const STORAGE_STATUS_UNKNOWN = "UNKNOWN_NOT_CHECKED" as const;

/** The synthetic manifest key representing the users/{uid} profile root document itself (a single document, not a collection). */
export const PROFILE_DOCUMENT_MANIFEST_KEY = "profile";

export const CONFIRMATION_PHRASE = "KUSTUTA KIVORA VANA KONTO TÄIELIKULT";

/**
 * The one, explicit, hardcoded, exact document+version manifest this
 * tool compares the live account against in execute mode. Deliberately
 * empty — see testDataCleanup.ts's own APPROVED_MANIFEST_2026_11_20 for
 * the identical rationale: while this stays empty, execute mode will
 * always abort, which is the correct, fail-closed behavior, not a bug.
 * Populating this is a separate, later, explicitly-approved source
 * change, reviewed against a real capture-manifest run's actual output.
 */
export const APPROVED_FULL_REMOVAL_MANIFEST: Readonly<ApprovedManifest> = {};

// ── Manifest capture for this tool's own, additional scope ──────────────
//
// captureManifestForPath() below is a deliberate, small duplicate of the
// identically-named private (non-exported) helper inside
// testDataCleanup.ts, rather than a modification to that already-
// reviewed, already-committed file to export it. Keeping the two
// independent (same small shape, no shared code path) avoids touching a
// file this session has already shipped, at the cost of this one, tiny,
// easily-reviewed duplication.

async function captureManifestForPath(
  firestore: FirestoreLike,
  fullPath: string,
): Promise<{ refs: DocRefLike[]; entries: ManifestEntry[] }> {
  const refs = await firestore.collection(fullPath).listDocuments();
  const entries: ManifestEntry[] = [];
  for (const ref of refs) {
    const snap = await ref.get();
    if (snap.exists && snap.updateTime) entries.push({ id: ref.id, updateTime: snap.updateTime });
  }
  return { refs, entries };
}

/**
 * Throws if `ref` has ANY nested subcollection with at least one
 * document in it, EXCEPT a name listed in `ignoreNames` — used ONLY for
 * the profile root document, whose nested PROTECTED_NAMESPACES
 * (backups/_fullBackups/_fullBackup/_restoreVerificationScratch) are
 * EXPECTED to still be there by the time this runs (every other
 * category has already been removed, deliberately leaving those
 * namespaces behind — see this file's own doc comment). Every other
 * call site passes no ignore list at all, so ANY nested subcollection
 * there is genuinely unexpected.
 *
 * This is the generic "deleting a parent never assumes its children are
 * gone too" guarantee, applied explicitly rather than assumed — and
 * applying it to the profile document specifically surfaced a real bug
 * during this file's own test development: without `ignoreNames`, this
 * check would have refused to EVER delete the profile document while
 * the deliberately-preserved backup namespaces are still present under
 * it, which is always true by the time this function runs.
 */
async function assertNoNestedSubcollections(ref: DocRefLike, context: string, ignoreNames: readonly string[] = []): Promise<void> {
  const nestedCollections = await ref.listCollections();
  for (const nested of nestedCollections) {
    if (ignoreNames.includes(nested.id)) continue;
    const nestedDocs = await nested.listDocuments();
    if (nestedDocs.length > 0) {
      throw new Error(
        `Ootamatu pesastatud alamkogu "${nested.id}" leiti "${context}" alt (${nestedDocs.length} dok.) — ` +
          `katkestan enne mistahes kustutamist. Vanema dokumendi kustutamine EI eemaldaks seda automaatselt.`,
      );
    }
  }
}

/**
 * Captures the manifest for "settings" and for the users/{uid} profile
 * root document — the two pieces of this tool's scope that live
 * directly under users/{uid} but outside testDataCleanup.ts's own
 * captureManifest() (which deliberately excludes "settings" and never
 * looks at the profile document).
 */
export async function captureSettingsAndProfileManifest(
  firestore: FirestoreLike,
  uid: string,
): Promise<ApprovedManifest> {
  const { entries: settingsEntries } = await captureManifestForPath(firestore, `users/${uid}/settings`);
  const profileRef = firestore.doc(`users/${uid}`);
  const profileSnap = await profileRef.get();
  const profileEntries: ManifestEntry[] =
    profileSnap.exists && profileSnap.updateTime ? [{ id: uid, updateTime: profileSnap.updateTime }] : [];
  return {
    settings: [...settingsEntries].sort((a, b) => a.id.localeCompare(b.id)),
    [PROFILE_DOCUMENT_MANIFEST_KEY]: profileEntries,
  };
}

/**
 * Captures the manifest for the two shared, uid-scoped collections —
 * ONLY documents whose own "uid" field matches `uid` exactly. The
 * Firestore query (`where("uid", "==", uid)`) already filters server-
 * side, but every returned document's own "uid" field is re-checked
 * here too, directly against its fetched data — defense in depth
 * against a query implementation bug, never trusting the query filter
 * alone to be the only thing standing between "this account's data" and
 * "someone else's".
 */
export async function captureSharedUidScopedManifest(
  firestore: FirestoreLike,
  uid: string,
): Promise<{ manifest: ApprovedManifest; refsByPath: Map<string, DocRefLike[]> }> {
  const manifest: Record<string, ManifestEntry[]> = {};
  const refsByPath = new Map<string, DocRefLike[]>();
  for (const path of SHARED_UID_SCOPED_COLLECTIONS) {
    const queryResult = await firestore.collection(path).where("uid", "==", uid).get();
    const entries: ManifestEntry[] = [];
    const refs: DocRefLike[] = [];
    for (const snap of queryResult.docs) {
      const data = snap.data();
      if (!data || data["uid"] !== uid) continue; // re-verified, never trusted from the query alone
      refs.push(firestore.doc(`${path}/${snap.id}`));
      if (snap.exists && snap.updateTime) entries.push({ id: snap.id, updateTime: snap.updateTime });
    }
    manifest[path] = entries.sort((a, b) => a.id.localeCompare(b.id));
    refsByPath.set(path, refs);
  }
  return { manifest, refsByPath };
}

/** The complete, exact manifest this tool's execute/dry-run/capture-manifest modes verify against: testDataCleanup.ts's own 16 collections (+ aiConversations' nested messages) PLUS this file's additional scope. */
export async function captureFullRemovalManifest(firestore: FirestoreLike, uid: string): Promise<ApprovedManifest> {
  const [base, settingsAndProfile, shared] = await Promise.all([
    captureManifest(firestore, uid),
    captureSettingsAndProfileManifest(firestore, uid),
    captureSharedUidScopedManifest(firestore, uid),
  ]);
  return { ...base, ...settingsAndProfile, ...shared.manifest };
}

async function deleteRefsWithPrecondition(
  firestore: FirestoreLike,
  refs: DocRefLike[],
  approvedEntries: readonly ManifestEntry[],
  batchSize: number,
): Promise<number> {
  const approvedUpdateTimeById = new Map(approvedEntries.map((e) => [e.id, e.updateTime]));
  let deleted = 0;
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = firestore.batch();
    const slice = refs.slice(i, i + batchSize);
    for (const ref of slice) {
      const lastUpdateTime = approvedUpdateTimeById.get(ref.id);
      batch.delete(ref, lastUpdateTime ? { lastUpdateTime } : undefined);
    }
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

/** Re-captures + re-verifies "settings" immediately before deleting it, then deletes with preconditions — the same two-layer concurrency protection as every other category. */
export async function removeSettings(
  firestore: FirestoreLike,
  uid: string,
  approvedManifest: Readonly<ApprovedManifest>,
  batchSize: number,
  log: (msg: string) => void,
): Promise<number> {
  const { refs, entries } = await captureManifestForPath(firestore, `users/${uid}/settings`);
  const recheck = verifyManifestMatch({ settings: entries }, approvedManifest);
  if (!recheck.ok) {
    throw new Error(
      `Samaaegse muutuse kaitse: "settings" alt leiti vahetult enne kustutamist kinnitamata dokumente — katkestan: ` +
        recheck.mismatches.map((m) => `${m.id} (${m.reason})`).join(", "),
    );
  }
  for (const ref of refs) await assertNoNestedSubcollections(ref, `settings/${ref.id}`);
  const deleted = await deleteRefsWithPrecondition(firestore, refs, approvedManifest["settings"] ?? [], batchSize);
  if (deleted > 0) log(`settings: kustutatud ${deleted} dok.`);
  return deleted;
}

/** Re-captures + re-verifies one shared, uid-scoped collection immediately before deleting it, re-checking nested subcollections and the "uid" field one more time on every matched document. */
export async function removeSharedUidScopedCollection(
  firestore: FirestoreLike,
  uid: string,
  path: string,
  approvedManifest: Readonly<ApprovedManifest>,
  batchSize: number,
  log: (msg: string) => void,
): Promise<number> {
  const { manifest, refsByPath } = await captureSharedUidScopedManifest(firestore, uid);
  const liveEntries = manifest[path] ?? [];
  const refs = refsByPath.get(path) ?? [];
  const recheck = verifyManifestMatch({ [path]: liveEntries }, approvedManifest);
  if (!recheck.ok) {
    throw new Error(
      `Samaaegse muutuse kaitse: "${path}" alt leiti vahetult enne kustutamist kinnitamata dokumente — katkestan: ` +
        recheck.mismatches.map((m) => `${m.id} (${m.reason})`).join(", "),
    );
  }
  for (const ref of refs) await assertNoNestedSubcollections(ref, `${path}/${ref.id}`);
  const deleted = await deleteRefsWithPrecondition(firestore, refs, approvedManifest[path] ?? [], batchSize);
  if (deleted > 0) log(`${path} (uid-vastavad kirjed): kustutatud ${deleted} dok.`);
  return deleted;
}

/**
 * Re-captures + re-verifies the profile root document immediately
 * before deleting it. Callers MUST only call this after every
 * subcollection and every shared-collection entry is already confirmed
 * removed — this function itself still independently re-checks that the
 * document has no nested subcollection left (never assuming the caller
 * got the order right), but it does not re-verify every OTHER category
 * on its own; the call order in runFullAccountRemoval() is what
 * guarantees "profile document last".
 */
export async function removeProfileDocument(
  firestore: FirestoreLike,
  uid: string,
  approvedManifest: Readonly<ApprovedManifest>,
  log: (msg: string) => void,
): Promise<number> {
  const ref = firestore.doc(`users/${uid}`);
  const snap = await ref.get();

  // Nested subcollections must be checked REGARDLESS of whether the
  // profile document itself still exists — a Firestore document can
  // have subcollections even when the document has no data of its own
  // (or never did; this is the same "phantom parent" behavior noted
  // elsewhere in this codebase), so an already-missing profile document
  // must NEVER be treated as "nothing left to check under users/{uid}."
  // PROTECTED_NAMESPACES are deliberately still here — every other
  // category has already been removed by the time this runs, so they
  // are the ONLY nested collections expected to remain. Anything else
  // (even with no profile document present at all) is genuinely
  // unexpected and still aborts.
  await assertNoNestedSubcollections(ref, `users/${uid}`, PROTECTED_NAMESPACES);

  // The manifest re-check runs unconditionally too — with no live entry
  // (profile already gone), it always passes, which is the correct,
  // directional "already deleted in a prior partial run" behavior, not
  // an error. Only an UNEXPECTED live entry (wrong id, or a changed
  // updateTime) would ever be flagged here.
  const liveEntries: ManifestEntry[] = snap.exists && snap.updateTime ? [{ id: uid, updateTime: snap.updateTime }] : [];
  const recheck = verifyManifestMatch({ [PROFILE_DOCUMENT_MANIFEST_KEY]: liveEntries }, approvedManifest);
  if (!recheck.ok) {
    throw new Error(
      `Samaaegse muutuse kaitse: profiilidokument muutus vahetult enne kustutamist — katkestan: ` +
        recheck.mismatches.map((m) => `${m.id} (${m.reason})`).join(", "),
    );
  }

  if (!snap.exists) return 0; // already gone (prior partial run) — resumable, not an error

  const approvedUpdateTime = (approvedManifest[PROFILE_DOCUMENT_MANIFEST_KEY] ?? []).find((e) => e.id === uid)?.updateTime;
  const batch = firestore.batch();
  batch.delete(ref, approvedUpdateTime ? { lastUpdateTime: approvedUpdateTime } : undefined);
  await batch.commit();
  log(`Profiilidokument (users/${uid}) kustutatud.`);
  return 1;
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface FullAccountRemovalOptions {
  mode: "dry-run" | "execute" | "capture-manifest";
  backupId?: string;
  log?: (msg: string) => void;
  /** Test-only override — see testDataCleanup.ts's identical field for why this exists and why main() never sets it. */
  approvedManifestOverride?: Readonly<ApprovedManifest>;
}

export interface FullAccountRemovalResult {
  mode: "dry-run" | "execute" | "capture-manifest";
  structureCheck: StructureCheckResult;
  manifestCheck: { ok: boolean; mismatches: ManifestMismatch[] };
  backupVerification?: BackupVerificationResult;
  storageStatus: typeof STORAGE_STATUS_UNKNOWN;
  /** Exactly which categories were removed, and how many documents each — populated incrementally, in order, even on partial failure. */
  removedCounts: Record<string, number>;
  /** The one category that failed, if any — every category BEFORE this one in removedCounts succeeded; every category after it was never attempted. */
  failedCategory?: string;
  overallSuccess: boolean;
  abortReason?: string;
  capturedManifest?: ApprovedManifest;
}

/**
 * The full, callable-without-main() orchestration. Every safety gate
 * runs, in order, before any delete; the first failing PRE-FLIGHT gate
 * (structure check, manifest check, backup verification) aborts the
 * ENTIRE run with nothing deleted. Once deletion begins, categories run
 * in a fixed order — the 16 testDataCleanup.ts collections, then
 * settings, then feedbackSubmissions, then supportMessages, then the
 * profile document LAST — and a failure in any one of them stops every
 * later category, while every earlier category's real progress stands
 * and is reported in removedCounts.
 */
export async function runFullAccountRemoval(
  firestore: FirestoreLike,
  uid: string,
  options: FullAccountRemovalOptions,
): Promise<FullAccountRemovalResult> {
  const log = options.log ?? (() => {});
  const structureCheck = await checkForUnexpectedStructure(firestore, uid);

  if (options.mode === "capture-manifest") {
    const capturedManifest = await captureFullRemovalManifest(firestore, uid);
    log("Täieliku konto manifesti hõivamine lõpetatud — see on AINULT lugemine, midagi ei kustutatud ega muudetud.");
    return {
      mode: options.mode,
      structureCheck,
      manifestCheck: { ok: true, mismatches: [] },
      storageStatus: STORAGE_STATUS_UNKNOWN,
      removedCounts: {},
      overallSuccess: true,
      capturedManifest,
    };
  }

  const base: FullAccountRemovalResult = {
    mode: options.mode,
    structureCheck,
    manifestCheck: { ok: true, mismatches: [] },
    storageStatus: STORAGE_STATUS_UNKNOWN,
    removedCounts: {},
    overallSuccess: false,
  };

  if (!structureCheck.ok) {
    return {
      ...base,
      abortReason:
        "Leiti ootamatu struktuur (tundmatu kogu või pesastatud alamkogu) — katkestan enne mistahes kustutamist: " +
        [...structureCheck.unknownTopLevelCollections, ...structureCheck.unexpectedNestedSubcollections].join(", "),
    };
  }

  const approvedManifest = options.approvedManifestOverride ?? APPROVED_FULL_REMOVAL_MANIFEST;
  const liveManifest = await captureFullRemovalManifest(firestore, uid);
  const manifestCheck = verifyManifestMatch(liveManifest, approvedManifest);
  if (!manifestCheck.ok) {
    return {
      ...base,
      manifestCheck,
      abortReason:
        "Elavad dokumendid lahknevad heakskiidetud täieliku eemaldamise manifestist — katkestan enne mistahes kustutamist: " +
        manifestCheck.mismatches.map((m) => `${m.path}/${m.id} (${m.reason})`).join(", "),
    };
  }

  if (options.mode === "dry-run") {
    log("Dry-run: kõik kontrollid läbiti, midagi ei kustutatud.");
    return { ...base, manifestCheck, overallSuccess: true };
  }

  // ── Execute mode from here — backup re-verification, then deletion in
  // the fixed, documented order. ────────────────────────────────────────

  if (!options.backupId) {
    return { ...base, manifestCheck, abortReason: "Execute režiim vajab backupId-d — katkestan." };
  }

  const topLevelRefs = await firestore.doc(`users/${uid}`).listCollections();
  const realTopLevelCollectionPaths = topLevelRefs.map((c) => c.id);
  const backupVerification = await verifyBackupBeforeCleanup(
    firestore as FirestoreLike & FirestoreWithDelete,
    uid,
    options.backupId,
    realTopLevelCollectionPaths,
  );
  if (
    !backupVerification.exists ||
    !backupVerification.metadataFound ||
    !backupVerification.hasContent ||
    !backupVerification.restorabilityAllMatch ||
    !backupVerification.cleanupSucceeded
  ) {
    return {
      ...base,
      manifestCheck,
      backupVerification,
      abortReason: `Varukoopia "${options.backupId}" kontroll ebaõnnestus (osalist/kontrollimata varukoopiat ei loeta piisavaks) — katkestan enne mistahes kustutamist.`,
    };
  }

  const removedCounts: Record<string, number> = {};
  let failedCategory: string | undefined;
  let abortReason: string | undefined;

  async function runCategory(name: string, fn: () => Promise<number>): Promise<boolean> {
    try {
      removedCounts[name] = await fn();
      return true;
    } catch (err) {
      failedCategory = name;
      abortReason =
        `Kategooria "${name}" kustutamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)} — ` +
        `katkestan KOHE, varasemad kategooriad jäävad kustutatuks (ei taastata).`;
      return false;
    }
  }

  for (const entry of CLEANUP_ALLOWLIST) {
    const ok = await runCategory(entry.path, async () => {
      const { deleted, nestedDeleted } = await deleteCollectionSafely(firestore, uid, entry, approvedManifest, SMALL_BATCH_SIZE, log);
      if (entry.path === "aiConversations" && nestedDeleted > 0) {
        removedCounts["aiConversations/*/messages"] = nestedDeleted;
      }
      return deleted;
    });
    if (!ok) return { ...base, manifestCheck, backupVerification, removedCounts, failedCategory, abortReason };
  }

  const settingsOk = await runCategory("settings", () => removeSettings(firestore, uid, approvedManifest, SMALL_BATCH_SIZE, log));
  if (!settingsOk) return { ...base, manifestCheck, backupVerification, removedCounts, failedCategory, abortReason };

  for (const path of SHARED_UID_SCOPED_COLLECTIONS) {
    const ok = await runCategory(path, () => removeSharedUidScopedCollection(firestore, uid, path, approvedManifest, SMALL_BATCH_SIZE, log));
    if (!ok) return { ...base, manifestCheck, backupVerification, removedCounts, failedCategory, abortReason };
  }

  const profileOk = await runCategory(PROFILE_DOCUMENT_MANIFEST_KEY, () => removeProfileDocument(firestore, uid, approvedManifest, log));
  if (!profileOk) return { ...base, manifestCheck, backupVerification, removedCounts, failedCategory, abortReason };

  return { ...base, manifestCheck, backupVerification, removedCounts, overallSuccess: true };
}

// ── Human-readable output (counts/paths only — never field content) ────────

export function printSummary(result: FullAccountRemovalResult): void {
  console.log("═".repeat(72));
  console.log(`KIVORA VANA KONTO TÄIELIK EEMALDAMINE — režiim: ${result.mode.toUpperCase()}`);
  console.log("═".repeat(72));
  console.log(`Struktuurikontroll:  ${result.structureCheck.ok ? "OK" : "EBAÕNNESTUS"}`);
  console.log(`Manifesti kontroll:  ${result.manifestCheck.ok ? "OK" : "EBAÕNNESTUS"}`);
  console.log(`Firebase Storage:    ${result.storageStatus} (ei puudutatud, ei eeldatud tühjaks)`);
  if (result.backupVerification) {
    console.log(
      `Varukoopia kontroll: taastatavus=${result.backupVerification.restorabilityAllMatch ? "OK" : "EI"}  ` +
        `puhastus=${result.backupVerification.cleanupSucceeded ? "OK" : "EI"}`,
    );
  }
  console.log("");
  console.log("Kategooriate seis (õnnestunud JA ebaõnnestunud/katsetamata — täpne ülevaade):");
  const allCategoryNames = [
    ...CLEANUP_ALLOWLIST.map((e) => e.path),
    "aiConversations/*/messages",
    "settings",
    ...SHARED_UID_SCOPED_COLLECTIONS,
    PROFILE_DOCUMENT_MANIFEST_KEY,
  ];
  for (const name of allCategoryNames) {
    if (name in result.removedCounts) {
      console.log(`  ${name}: kustutatud ${result.removedCounts[name]} dok. — ÕNNESTUS`);
    } else if (name === result.failedCategory) {
      console.log(`  ${name}: EBAÕNNESTUS`);
    } else if (result.failedCategory !== undefined) {
      console.log(`  ${name}: KATSETAMATA (katkestati varasema kategooria tõttu)`);
    }
  }
  if (result.capturedManifest) {
    console.log("");
    console.log("Hõivatud manifest (id + versiooni ajatempel millisekundites — SISU EI SISALDU):");
    for (const [path, entries] of Object.entries(result.capturedManifest)) {
      console.log(`  ${path}: ${entries.length} dok.`);
      for (const e of entries) console.log(`    ${e.id}  updateTime=${e.updateTime.toMillis()}`);
    }
  }
  console.log("");
  console.log(result.overallSuccess ? "TULEMUS: ÕNNESTUS" : `TULEMUS: KATKESTATUD — ${result.abortReason ?? "teadmata põhjus"}`);
  console.log("═".repeat(72));
}

// ── CLI orchestration — no top-level side effects; must be called explicitly ─

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const target = resolveTargetIdentifier(argv, env);
  if (!target) {
    console.error(
      "Sihtkontot ei määratud. Üks järgnevast on vajalik:\n" +
        "  - CLI argument: node runFullAccountRemoval.mjs <e-post-või-uid>\n" +
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

  const modeRaw = env["CLEANUP_MODE"] ?? "dry-run";
  if (modeRaw !== "dry-run" && modeRaw !== "execute" && modeRaw !== "capture-manifest") {
    console.error(`Vigane CLEANUP_MODE="${modeRaw}" — lubatud on ainult "dry-run" (vaikimisi), "capture-manifest" või "execute".`);
    return 1;
  }
  const mode = modeRaw;

  if (mode === "execute" && env["CONFIRMATION_PHRASE"] !== CONFIRMATION_PHRASE) {
    console.error(`CONFIRMATION_PHRASE ei vasta oodatud fraasile ("${CONFIRMATION_PHRASE}") — execute režiimi ei alustata.`);
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

  try {
    const result = await runFullAccountRemoval(firestore, uid, {
      mode,
      backupId: env["BACKUP_ID"],
      log: (msg) => console.log(msg),
    });
    printSummary(result);
    return result.overallSuccess ? 0 : 1;
  } catch (err) {
    console.error(`Täielik konto eemaldamine ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
