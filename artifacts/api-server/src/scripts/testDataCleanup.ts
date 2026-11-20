/**
 * testDataCleanup.ts — the core logic for a SEPARATE, purpose-built,
 * safety-first tool that deletes Kivora 2.0 test data from one specific,
 * explicitly resolved account, while leaving everything else untouched.
 *
 * ── This is NOT the existing "delete my account" feature ─────────────────
 * This file never imports from, calls, or shares any logic with
 * planner-app's full-account-deletion service (the live "delete my
 * account" feature) — confirmed by testDataCleanup.test.ts's source-scan
 * test. That feature deletes an ENTIRE account (paired with removing the
 * Auth user itself) and is independently known to be incomplete (missing
 * plans/calendars/documents/Money — see the Kivora 2.0 cleanup planning
 * discussion). Reusing it here would have been both the wrong tool and
 * an unsafe one.
 *
 * ── The twelve mandatory safety properties this file implements ─────────
 *  1. Separate implementation — see above.
 *  2. Defaults to dry-run — main() treats a missing CLEANUP_MODE as
 *     "dry-run"; only the literal value "execute" ever allows a delete.
 *  3. Execute mode requires BOTH an exact CONFIRMATION_PHRASE match and a
 *     named BACKUP_ID — see main().
 *  4. EXPECTED_UID and EXPECTED_PROJECT_ID must be supplied and must
 *     exactly match the resolved account's real uid and the Admin SDK's
 *     real FIREBASE_PROJECT_ID — see main().
 *  5. CLEANUP_ALLOWLIST is the one, explicit, hardcoded list of
 *     collections this tool will ever touch — assertCollectionIsAllowlisted()
 *     throws before any delete if a path is not on it, or is one of
 *     PROTECTED_NAMES. Nothing is ever discovered-and-deleted dynamically.
 *  6. checkForUnexpectedStructure() reuses dataCleanupDryRun.ts's already-
 *     tested discoverUnknownAndNestedCollections() as a hard pre-flight
 *     gate: ANY unknown top-level collection or unexpected nested
 *     subcollection anywhere under this account aborts the ENTIRE run
 *     before a single document is touched.
 *  7. Two layers of comparison against what was actually approved, not
 *     just a count: verifySnapshotMatch() is a cheap, fast pre-check
 *     against APPROVED_SNAPSHOT_2026_11_20 (counts only); the
 *     AUTHORITATIVE gate is verifyManifestMatch(), which compares the
 *     exact, captured set of {document id, updateTime} pairs against
 *     APPROVED_MANIFEST_2026_11_20 — catching "same count, different or
 *     replaced document" and "same document, changed content" cases a
 *     count alone cannot. See both functions' own doc comments for the
 *     directional rule that also enables safe resumption (property 11).
 *  8. verifyBackupBeforeCleanup() re-runs an ACTUAL, fresh restorability
 *     check (reusing restoreVerification.ts's verifyRestorability(),
 *     scratch-path-only, nothing it does ever touches real data) against
 *     the named BACKUP_ID right now — never trusting a past claim of
 *     success, and never treating a backup with zero reconstructed
 *     content as sufficient.
 *  9. PROTECTED_NAMES (backups/_fullBackups/_fullBackup/
 *     _restoreVerificationScratch/settings) can never appear in
 *     CLEANUP_ALLOWLIST (tested) and assertCollectionIsAllowlisted()
 *     refuses them explicitly by name even if that invariant were ever
 *     broken. The users/{uid} profile document itself is never referenced
 *     by any delete call in this file. No Storage API is ever called.
 * 10. deleteCollectionSafely() deletes in SMALL_BATCH_SIZE-sized batches
 *     (well under Firestore's 500-op limit) and every log line is a path,
 *     a count, or an id — never field content. Every stage of main() and
 *     runCleanup() fails closed with a specific, named reason rather than
 *     continuing past an unexpected condition. The same function also
 *     implements concurrency protection between manifest verification
 *     and the actual delete (see its own doc comment): an application-
 *     level re-check immediately before touching each collection, PLUS
 *     a real Firestore delete precondition ({lastUpdateTime}) on every
 *     individual delete() call, so the database itself — not just this
 *     script — refuses a delete whose document changed after approval.
 * 11. Resumability — see verifySnapshotMatch()'s and verifyManifestMatch()'s
 *     own doc comments: a live count/document LOWER than or already
 *     matching what was approved is accepted (expected prior partial
 *     progress), never treated as a reason to widen scope, because the
 *     scope ceiling (CLEANUP_ALLOWLIST, APPROVED_SNAPSHOT_2026_11_20,
 *     APPROVED_MANIFEST_2026_11_20) is fixed in source and identical on
 *     every invocation.
 * 12. See testDataCleanup.test.ts for the simulated-failure, interrupted-
 *     execution, and protected-collection-targeting tests.
 *
 * ── What this file explicitly does NOT do in this version ───────────────
 * Per the approved scope: never touches the shared root collections
 * (feedbackSubmissions/supportMessages/contactSubmissions) — those are
 * handled separately, later. Never touches Firebase Storage. Never
 * changes Firebase Authentication.
 *
 * This file only DEFINES and EXPORTS main() — it never calls it itself,
 * the same split as every other tool in this project. The CLI entry
 * point is the separate runTestDataCleanupCli.ts.
 */

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";
import {
  discoverUnknownAndNestedCollections,
  type FirestoreLike as DryRunFirestoreLike,
} from "./dataCleanupDryRun.js";
import { verifyRestorability, type FirestoreWithDelete } from "./restoreVerification.js";
import type { BackedUpDocument } from "./fullAccountBackup.js";

// ── Structural interfaces — a superset of every narrower "Like" interface ──
// the functions this file reuses expect (dataCleanupDryRun.ts's, fullAccountBackup.ts's,
// restoreVerification.ts's). Structural typing means passing a real Admin
// Firestore instance, or an object shaped like this, satisfies all of
// them automatically — this file defines ONE wide shape rather than
// juggling several incompatible named types.

/** Structurally just Firestore's own Timestamp — real Admin SDK Timestamp objects satisfy this automatically. */
export interface TimestampLike {
  toMillis(): number;
}

export interface DocSnapshotLike {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  /** Only populated by a real .get() call (not listDocuments()) — used to detect a document changing between manifest capture and deletion (safety property 6/13). */
  updateTime?: TimestampLike;
}

export interface DocRefLike {
  id: string;
  path: string;
  collection(path: string): CollRefLike;
  get(): Promise<DocSnapshotLike>;
  listCollections(): Promise<CollRefLike[]>;
}

export interface CollRefLike {
  id: string;
  doc(id?: string): DocRefLike;
  listDocuments(): Promise<DocRefLike[]>;
  get(): Promise<{ docs: DocSnapshotLike[] }>;
  where(field: string, op: "==", value: unknown): { get(): Promise<{ docs: DocSnapshotLike[] }> };
}

/** Matches the real Admin SDK's WriteBatch.delete(ref, precondition) signature exactly — lastUpdateTime is the same option real Firestore understands. */
export interface DeletePrecondition {
  lastUpdateTime?: TimestampLike;
}

export interface WriteBatchLike {
  set(ref: DocRefLike, data: Record<string, unknown>): void;
  delete(ref: DocRefLike, precondition?: DeletePrecondition): void;
  commit(): Promise<unknown>;
}

export interface FirestoreLike {
  collection(path: string): CollRefLike;
  doc(path: string): DocRefLike;
  batch(): WriteBatchLike;
}

// ── The explicit allowlist (safety property 5) ─────────────────────────────

export type CleanupCategory = "general" | "aiConversations" | "documents" | "finance";

export interface CleanupPlanEntry {
  /** Path relative to users/{uid}. */
  path: string;
  label: string;
  category: CleanupCategory;
}

export const CLEANUP_ALLOWLIST: readonly CleanupPlanEntry[] = [
  { path: "tasks", label: "Ülesanded", category: "general" },
  { path: "habits", label: "Harjumused", category: "general" },
  { path: "goals", label: "Eesmärgid", category: "general" },
  { path: "plans", label: "Plaanid", category: "general" },
  { path: "calendarEvents", label: "Kalendrisündmused", category: "general" },
  { path: "calendars", label: "Kasutaja loodud kalendrid", category: "general" },
  { path: "notes", label: "Märkmed", category: "general" },
  { path: "schoolItems", label: "Kool", category: "general" },
  { path: "entityLinks", label: "Moodulitevahelised seosed", category: "general" },
  { path: "notifications", label: "Teavitused", category: "general" },
  { path: "pushSubscriptions", label: "Push-registreeringud", category: "general" },
  { path: "aiConversations", label: "AI-vestlused (+ messages alamkogu)", category: "aiConversations" },
  { path: "documents", label: "Dokumendimooduli kirjed", category: "documents" },
  { path: "transactions", label: "Raha — tehingud", category: "finance" },
  { path: "bills", label: "Raha — arved", category: "finance" },
  { path: "monthlyBudgets", label: "Raha — eelarved", category: "finance" },
];

/**
 * Names this tool must NEVER touch, checked explicitly by
 * assertCollectionIsAllowlisted() in addition to (not instead of) the
 * structural guarantee that the delete loop only ever iterates
 * CLEANUP_ALLOWLIST. "settings" and the backup/scratch namespaces are
 * listed here even though they could never appear in CLEANUP_ALLOWLIST —
 * belt-and-suspenders against a future edit to that list.
 */
export const PROTECTED_NAMES: readonly string[] = [
  "backups",
  "_fullBackups",
  "_fullBackup",
  "_restoreVerificationScratch",
  "settings",
];

/**
 * Throws before any Firestore call if `path` is not on CLEANUP_ALLOWLIST,
 * or is one of PROTECTED_NAMES. Called at the start of
 * deleteCollectionSafely() for every single collection this tool ever
 * touches — this is the one, central chokepoint a future edit cannot
 * bypass without deliberately removing this call.
 */
export function assertCollectionIsAllowlisted(path: string): void {
  if (PROTECTED_NAMES.includes(path)) {
    throw new Error(`Turvarikkumise katse: "${path}" on kaitstud kogu — see tööriist ei puutu seda KUNAGI.`);
  }
  if (!CLEANUP_ALLOWLIST.some((e) => e.path === path)) {
    throw new Error(`Turvarikkumise katse: "${path}" ei ole lubatud nimekirjas (CLEANUP_ALLOWLIST) — tundmatut kogu ei kustutata kunagi automaatselt.`);
  }
}

/**
 * The one, explicit, dated, hardcoded snapshot this tool compares live
 * counts against (safety property 7). Changing these numbers — to
 * authorize a NEW cleanup run against a freshly re-approved dry-run —
 * requires a new source change, review, and test run, exactly like every
 * other step in this project; it is never a runtime parameter a caller
 * could simply override.
 *
 * Source: the dry-run #2 report approved on 2026-11-20 (see the "Kivora
 * 2.0 andmete puhastamine" planning conversation). 91 total documents
 * across the nonzero entries below.
 */
export const APPROVED_SNAPSHOT_2026_11_20: Readonly<Record<string, number>> = {
  tasks: 35,
  habits: 0,
  goals: 0,
  plans: 2,
  calendarEvents: 0,
  calendars: 1,
  notes: 0,
  schoolItems: 0,
  entityLinks: 17,
  notifications: 35,
  pushSubscriptions: 1,
  aiConversations: 0,
  documents: 0,
  transactions: 0,
  bills: 0,
  monthlyBudgets: 0,
};

/** Execute mode requires this EXACT string, nothing derived or guessable from it. */
export const CONFIRMATION_PHRASE = "KUSTUTA KIVORA TESTANDMED";

/** Well under Firestore's 500-operation batch limit, to keep each unit of work small and independently resumable. */
export const SMALL_BATCH_SIZE = 50;

// ── Live counts + snapshot comparison (safety properties 7 and 11) ─────────

export async function getLiveCounts(firestore: FirestoreLike, uid: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const entry of CLEANUP_ALLOWLIST) {
    const refs = await firestore.collection(`users/${uid}/${entry.path}`).listDocuments();
    counts[entry.path] = refs.length;
  }
  return counts;
}

export interface SnapshotMismatch {
  path: string;
  approved: number;
  live: number;
  reason: "unexpected_new_data" | "previously_empty_now_nonzero";
}

/**
 * Directional, resumption-aware comparison against the approved snapshot:
 *   - live > approved            → ABORT ("unexpected_new_data": something
 *     appeared since the dry-run that was never reviewed).
 *   - approved === 0 && live > 0 → ABORT ("previously_empty_now_nonzero"),
 *     unconditionally — a category that was empty must stay empty, with
 *     zero tolerance, regardless of the general rule below.
 *   - live <= approved           → ACCEPTED. A live count LOWER than
 *     approved is exactly what an interrupted-and-resumed run looks like
 *     (some documents from THIS same approved scope were already deleted
 *     in a prior invocation) — never a reason to abort, and never a
 *     reason to touch anything outside CLEANUP_ALLOWLIST either way.
 */
export function verifySnapshotMatch(
  liveCounts: Record<string, number>,
  approvedSnapshot: Readonly<Record<string, number>>,
): { ok: boolean; mismatches: SnapshotMismatch[] } {
  const mismatches: SnapshotMismatch[] = [];
  for (const [path, approved] of Object.entries(approvedSnapshot)) {
    const live = liveCounts[path] ?? 0;
    if (approved === 0 && live > 0) {
      mismatches.push({ path, approved, live, reason: "previously_empty_now_nonzero" });
    } else if (live > approved) {
      mismatches.push({ path, approved, live, reason: "unexpected_new_data" });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

// ── Exact document manifest — the real fix for "counts alone are insufficient" ──

export interface ManifestEntry {
  id: string;
  updateTime: TimestampLike;
}

/** path -> the exact set of documents (id + the version they were in when approved). */
export interface ApprovedManifest {
  [path: string]: readonly ManifestEntry[];
}

/**
 * Reads every allowlisted collection's documents' OWN data (a real .get()
 * per document, not just listDocuments()) specifically to capture each
 * one's id and updateTime — never its field content, which is never
 * returned or logged by this function. This is the READ-ONLY step an
 * operator runs (CLEANUP_MODE="capture-manifest") to produce the exact
 * manifest that a human then reviews and a future, separate source
 * change turns into the next dated APPROVED_MANIFEST_* constant — the
 * same review discipline APPROVED_SNAPSHOT_2026_11_20 went through.
 */
/**
 * Captures every allowlisted top-level collection's documents, PLUS —
 * for aiConversations specifically — every individual conversation's own
 * nested "messages" subcollection, each under its own compound key
 * (nestedMessagesManifestKey()). This is what closes the nested-AI-
 * conversation gap: a message document is now just as much a named,
 * versioned entry in the manifest as a top-level task or plan is, so
 * verifyManifestMatch() (which checks every key present in the live
 * manifest, not only CLEANUP_ALLOWLIST's own paths) covers it too.
 */
export async function captureManifest(firestore: FirestoreLike, uid: string): Promise<ApprovedManifest> {
  const manifest: Record<string, ManifestEntry[]> = {};
  for (const entry of CLEANUP_ALLOWLIST) {
    const { refs, entries } = await captureManifestForPath(firestore, `users/${uid}/${entry.path}`);
    manifest[entry.path] = [...entries].sort((a, b) => a.id.localeCompare(b.id));

    if (entry.path === "aiConversations") {
      for (const ref of refs) {
        const { entries: nestedEntries } = await captureManifestForPath(firestore, `users/${uid}/aiConversations/${ref.id}/messages`);
        manifest[nestedMessagesManifestKey(ref.id)] = [...nestedEntries].sort((a, b) => a.id.localeCompare(b.id));
      }
    }
  }
  return manifest;
}

export interface ManifestMismatch {
  path: string;
  id: string;
  reason: "not_in_approved_manifest" | "updateTime_changed";
}

/**
 * The authoritative, document-exact gate (replacing counts-only
 * verifySnapshotMatch as the thing execute mode actually trusts; the
 * count check above still runs first as a cheap, fast sanity pre-check).
 *
 * For every live document in every allowlisted collection:
 *   - its id must appear in the approved manifest for that path, AND
 *   - its updateTime must exactly match what was approved (toMillis()
 *     comparison — real Firestore Timestamp object identity is
 *     otherwise meaningless to compare with ===).
 * Any live document failing either check aborts the WHOLE run — this is
 * what actually catches "same count, different/replaced document" and
 * "same document, changed content", which a count comparison alone
 * (verifySnapshotMatch) cannot.
 *
 * Resumability: an APPROVED id that is simply ABSENT from live (because
 * a prior partial run already deleted it) produces no mismatch at all —
 * only documents that are LIVE and NOT property-matched against the
 * approved manifest are ever flagged. Scope never widens: every path
 * this function ever checks is either a CLEANUP_ALLOWLIST path or a
 * nestedMessagesManifestKey() for a conversation that is itself only
 * ever discovered under the (already allowlisted) aiConversations path
 * — never an arbitrary, caller-supplied key.
 *
 * Checks every path key present in EITHER manifest, not only
 * CLEANUP_ALLOWLIST's fixed list — this is what makes nested
 * aiConversations/{id}/messages keys (captureManifest() above) subject
 * to exactly the same exact-match gate as a top-level collection,
 * closing the "parent conversation matches, but its messages don't"
 * gap: a mismatch on a nested key aborts the whole run precisely like a
 * mismatch on "tasks" would.
 */
export function verifyManifestMatch(
  liveManifest: ApprovedManifest,
  approvedManifest: Readonly<ApprovedManifest>,
): { ok: boolean; mismatches: ManifestMismatch[] } {
  const mismatches: ManifestMismatch[] = [];
  const allPaths = new Set<string>([
    ...CLEANUP_ALLOWLIST.map((e) => e.path),
    ...Object.keys(liveManifest),
    ...Object.keys(approvedManifest),
  ]);
  for (const path of allPaths) {
    const approvedById = new Map((approvedManifest[path] ?? []).map((e) => [e.id, e.updateTime]));
    for (const live of liveManifest[path] ?? []) {
      const approvedUpdateTime = approvedById.get(live.id);
      if (approvedUpdateTime === undefined) {
        mismatches.push({ path, id: live.id, reason: "not_in_approved_manifest" });
      } else if (approvedUpdateTime.toMillis() !== live.updateTime.toMillis()) {
        mismatches.push({ path, id: live.id, reason: "updateTime_changed" });
      }
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * The exact, reviewed manifest of document ids (+ versions) approved for
 * deletion. EMPTY today, deliberately: this session's dry-run only ever
 * reported COUNTS (35 tasks, 2 plans, ...), never the actual document
 * ids or their updateTime — there is nothing truthful to hardcode here
 * yet. Running captureManifest() for real against Firestore (via
 * CLEANUP_MODE="capture-manifest" — read-only, same safety class as the
 * counting dry-run before it) produces the real data; a human reviews
 * its output, and a NEW, separate, reviewed source change populates this
 * constant before execute mode can ever do anything. While this stays
 * empty, verifyManifestMatch() will report every live document as
 * "not_in_approved_manifest" and execute mode will always abort — this
 * is the correct, honest, fail-closed behavior, not a bug.
 */
export const APPROVED_MANIFEST_2026_11_20: Readonly<ApprovedManifest> = {};

/**
 * Pure, independently testable gate predicate: does ANY collection in
 * `category` currently have live documents? Extracted from runCleanup()
 * so this specific gate's logic can be tested directly with synthetic
 * counts, decoupled from whether that scenario could ever arise given
 * today's hardcoded APPROVED_SNAPSHOT_2026_11_20 (which currently sets
 * every finance/documents entry to 0, so a live nonzero count there
 * would already be caught by verifySnapshotMatch first in practice).
 */
export function categoryNeedsConfirmation(category: CleanupCategory, liveCounts: Record<string, number>): boolean {
  return CLEANUP_ALLOWLIST.filter((e) => e.category === category).some((e) => (liveCounts[e.path] ?? 0) > 0);
}

// ── Pre-flight structure check (safety property 6) ──────────────────────────

export interface StructureCheckResult {
  ok: boolean;
  unknownTopLevelCollections: string[];
  unexpectedNestedSubcollections: string[];
}

export async function checkForUnexpectedStructure(firestore: FirestoreLike, uid: string): Promise<StructureCheckResult> {
  const discovery = await discoverUnknownAndNestedCollections(firestore as unknown as DryRunFirestoreLike, uid);
  return {
    ok: discovery.unknownTopLevelCollections.length === 0 && discovery.unexpectedNestedSubcollections.length === 0,
    unknownTopLevelCollections: discovery.unknownTopLevelCollections.map((c) => c.path),
    unexpectedNestedSubcollections: discovery.unexpectedNestedSubcollections.map(
      (f) => `${f.parentPath}/${f.documentId}/${f.nestedCollectionName}`,
    ),
  };
}

// ── Backup re-verification, right now, not a trust of a past claim (safety property 8) ──

export async function reconstructFlatFromFullBackup(
  firestore: FirestoreLike,
  uid: string,
  backupId: string,
): Promise<Map<string, BackedUpDocument[]>> {
  const chunkRefs = await firestore.collection(`users/${uid}/_fullBackups/${backupId}/chunks`).listDocuments();
  const flat = new Map<string, BackedUpDocument[]>();
  for (const ref of chunkRefs) {
    const snap = await ref.get();
    const data = snap.data() as { path?: string; items?: BackedUpDocument[] } | undefined;
    if (!data?.path) continue;
    const existing = flat.get(data.path) ?? [];
    flat.set(data.path, [...existing, ...(data.items ?? [])]);
  }
  return flat;
}

export interface BackupVerificationResult {
  exists: boolean;
  metadataFound: boolean;
  hasContent: boolean;
  restorabilityAllMatch: boolean;
  cleanupSucceeded: boolean;
}

/**
 * Re-runs an ACTUAL restorability check against the named backup right
 * now — never a re-statement of what a past run claimed. Reuses
 * restoreVerification.ts's verifyRestorability() unchanged: it writes
 * only to an isolated scratch path, deletes everything it wrote
 * regardless of outcome, and never touches real data — see that file's
 * own tests. A backup with no reconstructable content at all (metadata
 * exists but zero chunks, i.e. a "partial" backup) is explicitly never
 * treated as sufficient, independent of whatever verifyRestorability
 * would say about an empty map.
 */
export async function verifyBackupBeforeCleanup(
  firestore: FirestoreLike & FirestoreWithDelete,
  uid: string,
  backupId: string,
  realTopLevelCollectionPaths: string[],
): Promise<BackupVerificationResult> {
  const metaSnap = await firestore.doc(`users/${uid}/_fullBackups/${backupId}`).get();
  if (!metaSnap.exists) {
    return { exists: false, metadataFound: false, hasContent: false, restorabilityAllMatch: false, cleanupSucceeded: false };
  }

  const flat = await reconstructFlatFromFullBackup(firestore, uid, backupId);
  const hasContent = flat.size > 0 && [...flat.values()].some((items) => items.length > 0);
  if (!hasContent) {
    return { exists: true, metadataFound: true, hasContent: false, restorabilityAllMatch: false, cleanupSucceeded: false };
  }

  const verification = await verifyRestorability(firestore, uid, backupId, flat, realTopLevelCollectionPaths);
  return {
    exists: true,
    metadataFound: true,
    hasContent: true,
    restorabilityAllMatch: verification.allMatch,
    cleanupSucceeded: verification.cleanupSucceeded,
  };
}

/**
 * Shared by captureManifest() and deleteCollectionSafely()'s own
 * pre-delete re-check — for BOTH top-level allowlisted collections and
 * nested ones (e.g. a specific conversation's own "messages"
 * subcollection). Takes the already-qualified full Firestore path
 * (callers build it as `users/{uid}/{path}` or
 * `users/{uid}/aiConversations/{conversationId}/messages`) rather than
 * assuming every path is a direct child of users/{uid}.
 */
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

/** The exact manifest key used for one conversation's nested messages — the single, central spelling every reader/writer of this key must share. */
function nestedMessagesManifestKey(conversationId: string): string {
  return `aiConversations/${conversationId}/messages`;
}

// ── Small-batch, audit-logged deletion (safety properties 9, 10) ───────────
//
// ── Concurrency protection (safety property 6), two independent layers ──
// 1. Application-level: this function re-captures and re-verifies THIS
//    ONE collection's live manifest against approvedManifest right
//    before touching it — shrinking the time-of-check-to-time-of-use
//    window from "the whole multi-collection run" down to "immediately
//    before this one collection's deletes", and aborting with a clear,
//    specific reason if anything changed in that (much smaller) window.
// 2. Database-level, the real backstop for whatever tiny window remains
//    between that re-check and the actual commit: every delete() call
//    below passes the exact updateTime the manifest approved as a
//    Firestore delete precondition (the same {lastUpdateTime} option
//    the real Admin SDK's WriteBatch.delete() understands natively) — if
//    the document was modified by anything else in that remaining
//    window, Firestore itself rejects the precondition and the WHOLE
//    containing batch commit fails, rather than silently deleting a
//    document whose content was never actually approved.
// A full ACID guarantee would require wrapping this in a single Firestore
// transaction instead of batches; that is a larger structural change
// than this safety-hardening pass and is noted as a known limitation,
// not attempted here.

export async function deleteCollectionSafely(
  firestore: FirestoreLike,
  uid: string,
  entry: CleanupPlanEntry,
  approvedManifest: Readonly<ApprovedManifest>,
  batchSize: number,
  log: (msg: string) => void,
): Promise<{ deleted: number; nestedDeleted: number }> {
  assertCollectionIsAllowlisted(entry.path);

  const { refs, entries: liveEntries } = await captureManifestForPath(firestore, `users/${uid}/${entry.path}`);
  const recheck = verifyManifestMatch({ [entry.path]: liveEntries }, approvedManifest);
  if (!recheck.ok) {
    throw new Error(
      `Samaaegse muutuse kaitse: "${entry.path}" alt leiti vahetult enne kustutamist kinnitamata dokumente ` +
        `(uus dokument või muutunud sisu pärast heakskiitmist) — katkestan: ` +
        recheck.mismatches.map((m) => `${m.id} (${m.reason})`).join(", "),
    );
  }
  const approvedUpdateTimeById = new Map((approvedManifest[entry.path] ?? []).map((e) => [e.id, e.updateTime]));

  // ── aiConversations/{id}/messages — covered by the SAME manifest +
  // precondition protection as any top-level collection, not a separate,
  // weaker path. For EVERY conversation, its messages are re-captured
  // and re-verified against the approved manifest's own entry for that
  // exact conversation (nestedMessagesManifestKey()) BEFORE any delete —
  // of either the messages OR the parent conversation document itself.
  // A mismatch here throws immediately, which means the parent-delete
  // loop below (processed after this whole block) never runs at all for
  // THIS collection: deleting a parent conversation can never bypass
  // protection for its own nested messages, because the parent is never
  // reached unless every one of its conversations' messages already
  // passed this check.
  let nestedDeleted = 0;
  if (entry.path === "aiConversations") {
    for (const ref of refs) {
      const nestedKey = nestedMessagesManifestKey(ref.id);
      const { refs: messageRefs, entries: liveMessageEntries } = await captureManifestForPath(
        firestore,
        `users/${uid}/aiConversations/${ref.id}/messages`,
      );
      const nestedRecheck = verifyManifestMatch({ [nestedKey]: liveMessageEntries }, approvedManifest);
      if (!nestedRecheck.ok) {
        throw new Error(
          `Samaaegse muutuse kaitse: "${nestedKey}" alt leiti vahetult enne kustutamist kinnitamata dokumente ` +
            `— katkestan TÄIELIKULT (ülemvestlust EI kustutata, kui selle sõnumid ei vasta heakskiidule): ` +
            nestedRecheck.mismatches.map((m) => `${m.id} (${m.reason})`).join(", "),
        );
      }

      const approvedNestedUpdateTimeById = new Map((approvedManifest[nestedKey] ?? []).map((e) => [e.id, e.updateTime]));
      for (let i = 0; i < messageRefs.length; i += batchSize) {
        const batch = firestore.batch();
        const slice = messageRefs.slice(i, i + batchSize);
        for (const m of slice) {
          const lastUpdateTime = approvedNestedUpdateTimeById.get(m.id);
          batch.delete(m, lastUpdateTime ? { lastUpdateTime } : undefined);
        }
        await batch.commit();
        nestedDeleted += slice.length;
      }
    }
    if (nestedDeleted > 0) log(`aiConversations/*/messages: kustutatud ${nestedDeleted} dok.`);
  }

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
    log(`${entry.path}: kustutatud ${deleted}/${refs.length}`);
  }

  return { deleted, nestedDeleted };
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface CleanupOptions {
  mode: "dry-run" | "execute" | "capture-manifest";
  backupId?: string;
  financeConfirmed?: boolean;
  documentsConfirmed?: boolean;
  log?: (msg: string) => void;
  /**
   * Test-only override for which manifest to verify against, in place of
   * the hardcoded APPROVED_MANIFEST_2026_11_20. main() — the real CLI
   * path — NEVER sets this (confirmed by runTestDataCleanupCli.test.ts's
   * and this file's own test suite's source-scan tests): there is no env
   * var or CLI flag that reaches this field, so a real invocation can
   * never override what was actually reviewed and committed to source.
   * Exists solely so testDataCleanup.test.ts can exercise the full
   * orchestration (happy path, resumption, replacement detection, ...)
   * with a synthetic manifest, since this session's real dry-run only
   * ever reported counts, never actual document ids/versions to hardcode.
   */
  approvedManifestOverride?: Readonly<ApprovedManifest>;
}

export interface CleanupResult {
  mode: "dry-run" | "execute" | "capture-manifest";
  liveCounts: Record<string, number>;
  snapshotCheck: { ok: boolean; mismatches: SnapshotMismatch[] };
  structureCheck: StructureCheckResult;
  manifestCheck: { ok: boolean; mismatches: ManifestMismatch[] };
  backupVerification?: BackupVerificationResult;
  deletedCounts: Record<string, number>;
  overallSuccess: boolean;
  abortReason?: string;
  /** Only populated in "capture-manifest" mode — ids + updateTime only, never field content. */
  capturedManifest?: ApprovedManifest;
}

/**
 * The full, callable-without-main() orchestration — every safety gate
 * runs, in order, before any delete; the first failing gate aborts the
 * ENTIRE run (no partial category execution) and reports exactly why.
 *
 * Three modes:
 *   - "capture-manifest": read-only, same safety class as the counting
 *     dry-run before it. Produces the exact document+version manifest
 *     for a human to review before it ever becomes a new
 *     APPROVED_MANIFEST_* source constant. Never gated by the count/
 *     structure checks below — its whole purpose is to report the
 *     CURRENT state, including a state that wouldn't yet pass them.
 *   - "dry-run": runs every gate execute mode would, including the new
 *     authoritative manifest check, but never deletes anything — so it
 *     reports exactly what execute mode would decide.
 *   - "execute": dry-run's gates, plus backup re-verification and the
 *     category-specific finance/documents confirmations, then deletes.
 */
export async function runCleanup(firestore: FirestoreLike, uid: string, options: CleanupOptions): Promise<CleanupResult> {
  const log = options.log ?? (() => {});

  if (options.mode === "capture-manifest") {
    const [liveCounts, structureCheck, capturedManifest] = await Promise.all([
      getLiveCounts(firestore, uid),
      checkForUnexpectedStructure(firestore, uid),
      captureManifest(firestore, uid),
    ]);
    log("Manifesti hõivamine lõpetatud — see on AINULT lugemine, midagi ei kustutatud ega muudetud.");
    return {
      mode: options.mode,
      liveCounts,
      snapshotCheck: verifySnapshotMatch(liveCounts, APPROVED_SNAPSHOT_2026_11_20),
      structureCheck,
      manifestCheck: { ok: true, mismatches: [] },
      deletedCounts: {},
      overallSuccess: true,
      capturedManifest,
    };
  }

  const liveCounts = await getLiveCounts(firestore, uid);
  const snapshotCheck = verifySnapshotMatch(liveCounts, APPROVED_SNAPSHOT_2026_11_20);
  const structureCheck = await checkForUnexpectedStructure(firestore, uid);

  const base: CleanupResult = {
    mode: options.mode,
    liveCounts,
    snapshotCheck,
    structureCheck,
    manifestCheck: { ok: true, mismatches: [] },
    deletedCounts: {},
    overallSuccess: false,
  };

  if (!snapshotCheck.ok) {
    return {
      ...base,
      abortReason:
        "Elavad dokumentide arvud lahknevad heakskiidetud momentvõttest (APPROVED_SNAPSHOT_2026_11_20) — katkestan enne mistahes kustutamist: " +
        snapshotCheck.mismatches.map((m) => `${m.path} (lubatud=${m.approved}, elav=${m.live}, ${m.reason})`).join(", "),
    };
  }
  if (!structureCheck.ok) {
    return {
      ...base,
      abortReason:
        "Leiti ootamatu struktuur (tundmatu kogu või pesastatud alamkogu) — katkestan enne mistahes kustutamist: " +
        [...structureCheck.unknownTopLevelCollections, ...structureCheck.unexpectedNestedSubcollections].join(", "),
    };
  }

  // ── The authoritative, document-exact gate (requirements 1–4: counts
  // alone cannot prove "the same documents") — the cheap count check
  // above already ran; this is what execute mode actually trusts.
  // approvedManifestOverride is test-only — see CleanupOptions' own doc
  // comment; a real invocation (main()) never sets it.
  const approvedManifest = options.approvedManifestOverride ?? APPROVED_MANIFEST_2026_11_20;
  const liveManifest = await captureManifest(firestore, uid);
  const manifestCheck = verifyManifestMatch(liveManifest, approvedManifest);
  if (!manifestCheck.ok) {
    return {
      ...base,
      manifestCheck,
      abortReason:
        "Elavad dokumendid lahknevad heakskiidetud manifestist (APPROVED_MANIFEST_2026_11_20) — katkestan enne mistahes kustutamist: " +
        manifestCheck.mismatches.map((m) => `${m.path}/${m.id} (${m.reason})`).join(", "),
    };
  }

  if (options.mode === "dry-run") {
    log("Dry-run: kõik kontrollid läbiti, midagi ei kustutatud.");
    return { ...base, manifestCheck, overallSuccess: true };
  }

  // ── Execute mode from here — every remaining gate must also pass ────────

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

  const financeNeeded = categoryNeedsConfirmation("finance", liveCounts);
  if (financeNeeded && !options.financeConfirmed) {
    return {
      ...base,
      manifestCheck,
      backupVerification,
      abortReason: "Finantsandmeid (transactions/bills/monthlyBudgets) leiti, kuid eraldi kinnitust ei antud — katkestan TÄIELIKULT, ei kustuta MIDAGI.",
    };
  }
  const documentsNeeded = categoryNeedsConfirmation("documents", liveCounts);
  if (documentsNeeded && !options.documentsConfirmed) {
    return {
      ...base,
      manifestCheck,
      backupVerification,
      abortReason: "Dokumendimooduli kirjeid leiti, kuid eraldi kinnitust ei antud — katkestan TÄIELIKULT, ei kustuta MIDAGI.",
    };
  }

  const deletedCounts: Record<string, number> = {};
  for (const entry of CLEANUP_ALLOWLIST) {
    const { deleted } = await deleteCollectionSafely(firestore, uid, entry, approvedManifest, SMALL_BATCH_SIZE, log);
    deletedCounts[entry.path] = deleted;
  }

  return { ...base, manifestCheck, backupVerification, deletedCounts, overallSuccess: true };
}

// ── Human-readable output (counts/paths only — never field content) ────────

export function printSummary(result: CleanupResult): void {
  console.log("═".repeat(72));
  console.log(`KIVORA TESTANDMETE PUHASTUS — režiim: ${result.mode.toUpperCase()}`);
  console.log("═".repeat(72));
  for (const [path, count] of Object.entries(result.liveCounts)) {
    console.log(`  ${path}: elav=${count}  lubatud=${APPROVED_SNAPSHOT_2026_11_20[path] ?? "?"}  kustutatud=${result.deletedCounts[path] ?? 0}`);
  }
  console.log("");
  console.log(`Momentvõtte kontroll (arvud):     ${result.snapshotCheck.ok ? "OK" : "EBAÕNNESTUS"}`);
  console.log(`Struktuurikontroll:               ${result.structureCheck.ok ? "OK" : "EBAÕNNESTUS"}`);
  console.log(`Manifesti kontroll (täpne id+versioon): ${result.manifestCheck.ok ? "OK" : "EBAÕNNESTUS"}`);
  if (result.backupVerification) {
    console.log(
      `Varukoopia kontroll:  taastatavus=${result.backupVerification.restorabilityAllMatch ? "OK" : "EI"}  ` +
        `puhastus=${result.backupVerification.cleanupSucceeded ? "OK" : "EI"}`,
    );
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
        "  - CLI argument: node runTestDataCleanup.mjs <e-post-või-uid>\n" +
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
    console.error(
      `Projekti ID lahknevus: FIREBASE_PROJECT_ID ei vasta EXPECTED_PROJECT_ID-le ("${expectedProjectId}"). Katkestan.`,
    );
    return 1;
  }

  const modeRaw = env["CLEANUP_MODE"] ?? "dry-run";
  if (modeRaw !== "dry-run" && modeRaw !== "execute" && modeRaw !== "capture-manifest") {
    console.error(`Vigane CLEANUP_MODE="${modeRaw}" — lubatud on ainult "dry-run" (vaikimisi), "capture-manifest" või "execute".`);
    return 1;
  }
  const mode = modeRaw;

  if (mode === "execute" && env["CONFIRMATION_PHRASE"] !== CONFIRMATION_PHRASE) {
    console.error('CONFIRMATION_PHRASE ei vasta oodatud fraasile ("KUSTUTA KIVORA TESTANDMED") — execute režiimi ei alustata.');
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
    console.error(`UID lahknevus: lahendatud kasutaja ei vasta EXPECTED_UID-le. Katkestan enne mistahes toimingut.`);
    return 1;
  }

  try {
    const result = await runCleanup(firestore, uid, {
      mode,
      backupId: env["BACKUP_ID"],
      financeConfirmed: env["CONFIRM_FINANCE_DELETION"] === "true",
      documentsConfirmed: env["CONFIRM_DOCUMENTS_DELETION"] === "true",
      log: (msg) => console.log(msg),
    });
    printSummary(result);
    return result.overallSuccess ? 0 : 1;
  } catch (err) {
    console.error(`Puhastus ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
