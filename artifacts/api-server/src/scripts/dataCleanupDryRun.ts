/**
 * dataCleanupDryRun.ts — READ-ONLY reconnaissance for the Kivora 2.0
 * data-cleanup project (see the "Kivora andmete puhastamisplaan" report
 * produced earlier in this effort).
 *
 * ── What this file does ─────────────────────────────────────────────────
 * For exactly one resolved account (by email or uid, never a hardcoded
 * identity — same resolution rule as grantOwnerRole.ts, reused directly
 * from it), this counts documents in every users/{uid} Firestore
 * subcollection this codebase actually writes to, and classifies each as:
 *   - KEEP               — settings/config, never touched
 *   - DELETE_CANDIDATE   — ordinary module content (tasks, habits, notes, …)
 *   - NEEDS_CONFIRMATION — Money module data, existing backups, and the
 *                          three public contact-form collections
 * It also flags two things discovered during the earlier audit that any
 * cleanup plan must account for: aiConversations/{id}/messages is a real,
 * rule-protected subcollection that nothing in the current client writes
 * to (so it must be checked per-document, not assumed empty), and the
 * existing backups do NOT cover plans/calendars/documents/pushSubscriptions
 * /Money — so they must never be treated as a sufficient safety net.
 *
 * ── Added for the Kivora 2.0 cleanup-candidate review ───────────────────
 * checkFullBackups() reports (never classifies as a cleanup candidate)
 * users/{uid}/_fullBackups — the separate, newer backup namespace the
 * Firestore-only/dual-destination backup tools write to — plus whether
 * anything was left behind under the restore-verification scratch
 * namespace (informational only; nothing here ever touches it).
 * checkDocumentsStorageReferences() counts how many users/{uid}/documents
 * records have a populated storagePath/downloadURL, WITHOUT ever logging
 * the actual path/URL values, and without making any Storage API call —
 * it only reads a Firestore field that happens to contain a Storage
 * reference string. discoverUnknownAndNestedCollections() is a
 * metadata-only (never reads document field data) recursive pass that
 * flags any top-level collection outside this file's known plan, or any
 * unexpected nested subcollection beyond the known aiConversations/
 * messages case — always excluding every backup/restore-verification
 * namespace from being reported as an "unknown" finding.
 *
 * Firebase Storage access itself is deliberately out of scope for this
 * version — it would need a new Admin accessor and a new secret
 * (FIREBASE_STORAGE_BUCKET), which this Firestore-only pass does not
 * need (and, separately, Storage access for this project is currently
 * blocked by its billing plan regardless).
 *
 * ── What this file NEVER does ───────────────────────────────────────────
 * This file contains no call to any Firestore write method (set, update,
 * delete, add, commit, batch) — only collection()/doc()/listDocuments()/
 * listCollections()/where()/get(), all of which are reads. dataCleanupDryRun.test.ts
 * asserts this file's own source contains none of those write-method
 * substrings, so a future edit that accidentally introduced one would
 * fail that test immediately — a structural, automatically-checked
 * safety guarantee, not just a comment's promise. It also never calls
 * any Firebase Auth method that changes an account's claims, profile, or
 * existence — only getUser/getUserByEmail, both reads. It never calls
 * any Firebase Storage API at all.
 *
 * ── How this is actually run ─────────────────────────────────────────────
 * This file exports only pure, side-effect-free functions plus main()
 * (which performs no top-level side effects on import — it must be
 * explicitly called), exactly like grantOwnerRole.ts, so it is safe to
 * import from a test with zero risk of contacting Firebase. The actual
 * entry point a human runs directly is the separate runDataCleanupDryRun.ts
 * — see .github/workflows/data-cleanup-dry-run.yml for the manual-only
 * (workflow_dispatch) GitHub Actions workflow that runs it using the
 * repository's existing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY secrets (the same ones reminders-tick.yml already
 * uses — no new secret is created for this).
 *
 * To run locally instead (from artifacts/api-server):
 *
 *   OWNER_UID=<uid> npx esbuild --bundle --platform=node --format=esm \
 *       --packages=external src/scripts/runDataCleanupDryRun.ts \
 *       --outfile=.tmp-runDataCleanupDryRun.mjs && node .tmp-runDataCleanupDryRun.mjs
 */

import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebaseAdmin.js";
import { resolveTargetIdentifier } from "./grantOwnerRole.js";

// ── Narrow, structural read-only interface ──────────────────────────────────
//
// Deliberately NOT importing firebase-admin's own Firestore type here: this
// interface lists only the handful of read methods this file actually
// calls, so (a) a real Admin Firestore instance satisfies it automatically
// (it has strictly more members), and (b) a test can hand-write a minimal
// fake that implements exactly this surface — with no delete/set/update
// method on it at all, so an accidental write call in this file would fail
// to compile against the fake, not just at runtime.

export interface DocSnapshotLike {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapshotLike {
  docs: DocSnapshotLike[];
}

export interface DocRefLike {
  id: string;
  collection(path: string): CollRefLike;
  get(): Promise<DocSnapshotLike>;
  /** Metadata-only — returns collection REFERENCES, never reads any document's field data. Used by discoverUnknownAndNestedCollections(). */
  listCollections(): Promise<CollRefLike[]>;
}

export interface CollRefLike {
  /** The collection's own name (e.g. "tasks") — needed to report an unknown or unexpected nested collection by name without reading any of its documents' content. */
  id: string;
  listDocuments(): Promise<DocRefLike[]>;
  get(): Promise<QuerySnapshotLike>;
  where(field: string, op: "==", value: unknown): { get(): Promise<QuerySnapshotLike> };
}

export interface FirestoreLike {
  collection(path: string): CollRefLike;
  /** Needed only for listing a user's top-level collections (doc.listCollections()) — never used to read or write that document's own data. */
  doc(path: string): DocRefLike;
}

// ── Classification plan — the single source of truth for this script ──────

export type Classification = "KEEP" | "DELETE_CANDIDATE" | "NEEDS_CONFIRMATION";

export interface CollectionPlanEntry {
  /** Path relative to users/{uid}, e.g. "tasks" or "aiConversations". */
  path: string;
  label: string;
  classification: Classification;
}

/**
 * Every users/{uid} subcollection this codebase's client actually writes
 * to, per a direct grep of collection(db, 'users', uid, …) across
 * planner-app/src/lib — not the (incomplete) list inside
 * accountDeletionService.ts, which predates plans/calendars/documents/
 * Money. aiConversations and backups are handled separately below because
 * each needs a per-document nested-subcollection check.
 */
export const SIMPLE_SUBCOLLECTION_PLAN: CollectionPlanEntry[] = [
  { path: "tasks", label: "Ülesanded", classification: "DELETE_CANDIDATE" },
  { path: "habits", label: "Harjumused", classification: "DELETE_CANDIDATE" },
  { path: "goals", label: "Eesmärgid", classification: "DELETE_CANDIDATE" },
  { path: "plans", label: "Plaanid", classification: "DELETE_CANDIDATE" },
  { path: "calendarEvents", label: "Kalendrisündmused", classification: "DELETE_CANDIDATE" },
  { path: "calendars", label: "Kasutaja loodud kalendrid", classification: "DELETE_CANDIDATE" },
  { path: "notes", label: "Märkmed", classification: "DELETE_CANDIDATE" },
  { path: "schoolItems", label: "Kool (ained / ülesanded / eksamid / tunniplaan)", classification: "DELETE_CANDIDATE" },
  { path: "entityLinks", label: "Moodulitevahelised seosed", classification: "DELETE_CANDIDATE" },
  { path: "notifications", label: "Teavituste nimekiri", classification: "DELETE_CANDIDATE" },
  { path: "pushSubscriptions", label: "Push-teavituse registreeringud", classification: "DELETE_CANDIDATE" },
  { path: "documents", label: "Dokumendimooduli Firestore kirjed", classification: "DELETE_CANDIDATE" },
  { path: "transactions", label: "Raha — tehingud", classification: "NEEDS_CONFIRMATION" },
  { path: "bills", label: "Raha — arved", classification: "NEEDS_CONFIRMATION" },
  { path: "monthlyBudgets", label: "Raha — igakuised eelarved", classification: "NEEDS_CONFIRMATION" },
  { path: "settings", label: "Seadistused (varundus/privaatsus/eksport/moodulid/Kooli lingid)", classification: "KEEP" },
];

export interface RootCollectionPlanEntry {
  path: string;
  label: string;
  classification: Classification;
  /** contactSubmissions always writes uid: null (public, pre-login form) — scope by email instead. */
  scopeField: "uid" | "senderEmail";
}

export const ROOT_COLLECTION_PLAN: RootCollectionPlanEntry[] = [
  { path: "feedbackSubmissions", label: "Tagasiside", classification: "NEEDS_CONFIRMATION", scopeField: "uid" },
  { path: "supportMessages", label: "Tugisõnumid", classification: "NEEDS_CONFIRMATION", scopeField: "uid" },
  { path: "contactSubmissions", label: "Kontaktivorm", classification: "NEEDS_CONFIRMATION", scopeField: "senderEmail" },
];

// ── Per-collection read-only checks ─────────────────────────────────────────

export interface CollectionResult {
  path: string;
  label: string;
  classification: Classification;
  documentCount: number;
}

/**
 * listDocuments() (not get()) deliberately: it returns document
 * REFERENCES only — Firestore never transfers field data for this call —
 * which is the minimal possible read for a plain count.
 */
export async function countSubcollection(
  firestore: FirestoreLike,
  uid: string,
  entry: CollectionPlanEntry,
): Promise<CollectionResult> {
  const refs = await firestore.collection(`users/${uid}/${entry.path}`).listDocuments();
  return {
    path: entry.path,
    label: entry.label,
    classification: entry.classification,
    documentCount: refs.length,
  };
}

export interface AiConversationsResult extends CollectionResult {
  /** How many conversation documents have at least one doc in their own messages/ subcollection. */
  conversationsWithMessagesSubcollection: number;
  /** Total message documents found across all of those nested subcollections. */
  totalNestedMessageDocs: number;
}

/**
 * aiConversations needs its own check because the CURRENT client stores a
 * conversation's messages as an embedded array field on the parent
 * document — but firestore.rules still protects a
 * users/{uid}/aiConversations/{id}/messages/{messageId} subcollection that
 * nothing in today's code writes to. That could mean it is simply always
 * empty (a forward-looking rule), or it could hold real documents left
 * over from an earlier data model. This checks every conversation
 * document's own messages subcollection directly — still listDocuments(),
 * never reading message content.
 */
export async function checkAiConversations(
  firestore: FirestoreLike,
  uid: string,
): Promise<AiConversationsResult> {
  const refs = await firestore.collection(`users/${uid}/aiConversations`).listDocuments();
  let conversationsWithMessagesSubcollection = 0;
  let totalNestedMessageDocs = 0;
  for (const ref of refs) {
    const messageRefs = await ref.collection("messages").listDocuments();
    if (messageRefs.length > 0) {
      conversationsWithMessagesSubcollection++;
      totalNestedMessageDocs += messageRefs.length;
    }
  }
  return {
    path: "aiConversations",
    label: "AI-vestlused",
    classification: "DELETE_CANDIDATE",
    documentCount: refs.length,
    conversationsWithMessagesSubcollection,
    totalNestedMessageDocs,
  };
}

export interface BackupSummary {
  id: string;
  createdAt: unknown;
  totalItems: unknown;
  collectionNames: unknown;
  chunkCount: number;
}

export interface BackupsResult {
  documentCount: number;
  backups: BackupSummary[];
}

/**
 * Reads each backup's own metadata fields (createdAt/totalItems/
 * collectionNames) — the only collection this script reads full document
 * data for, besides the root-scoped collections below, because that
 * metadata is exactly what tells you whether an existing backup is
 * complete enough to rely on.
 */
export async function checkBackups(firestore: FirestoreLike, uid: string): Promise<BackupsResult> {
  const refs = await firestore.collection(`users/${uid}/backups`).listDocuments();
  const backups: BackupSummary[] = [];
  for (const ref of refs) {
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const chunkRefs = await ref.collection("chunks").listDocuments();
    backups.push({
      id: ref.id,
      createdAt: data["createdAt"],
      totalItems: data["totalItems"],
      collectionNames: data["collectionNames"],
      chunkCount: chunkRefs.length,
    });
  }
  return { documentCount: refs.length, backups };
}

// ── Full (Firestore-only) backups + restore-verification scratch visibility ──
//
// Independent copies of fullAccountBackup.ts's EXCLUDED_FROM_DISCOVERY and
// restoreVerification.ts's RESTORE_VERIFICATION_SEGMENT values — kept as
// their own literals here, never imported, because fullAccountBackup.ts
// already imports SIMPLE_SUBCOLLECTION_PLAN/ROOT_COLLECTION_PLAN from THIS
// file; importing back from either of those would create a circular
// module dependency. dataCleanupDryRun.test.ts's cross-check test imports
// the real constants from both files and fails loudly if this list is
// ever allowed to drift apart from them.

export const BACKUP_AND_SCRATCH_NAMESPACES: readonly string[] = [
  "backups",
  "_fullBackups",
  "_fullBackup",
  "_restoreVerificationScratch",
];

export interface FullBackupSummary {
  id: string;
  createdAt: unknown;
  chunksWritten: unknown;
  collectionPaths: unknown;
}

export interface FullBackupsResult {
  documentCount: number;
  backups: FullBackupSummary[];
  /** True if ANYTHING still exists under the restore-verification scratch namespace — a successful run always cleans this up itself; this is a read-only sanity check, not a guarantee (Firestore can retain "phantom" ancestor document references), and this script never touches or removes anything found here regardless of the result. */
  restoreVerificationScratchFound: boolean;
}

/**
 * Reports on users/{uid}/_fullBackups — the separate, newer Firestore-only
 * and dual-destination backup namespace (see fullAccountBackup.ts /
 * runFullAccountBackup.ts / firestoreOnlyBackup.ts). Never classified as a
 * cleanup candidate anywhere in this file — this is PRESERVE-only
 * reporting, included so an operator can see what exists there rather
 * than it being entirely invisible to this tool.
 */
export async function checkFullBackups(firestore: FirestoreLike, uid: string): Promise<FullBackupsResult> {
  const refs = await firestore.collection(`users/${uid}/_fullBackups`).listDocuments();
  const backups: FullBackupSummary[] = [];
  for (const ref of refs) {
    const snap = await ref.get();
    const data = snap.data() ?? {};
    backups.push({
      id: ref.id,
      createdAt: data["createdAt"],
      chunksWritten: data["chunksWritten"],
      collectionPaths: data["collectionPaths"],
    });
  }
  const scratchRefs = await firestore.collection(`users/${uid}/_restoreVerificationScratch`).listDocuments();
  return { documentCount: refs.length, backups, restoreVerificationScratchFound: scratchRefs.length > 0 };
}

// ── Documents module: Storage-reference visibility (never touches Storage itself) ──

export interface DocumentsStorageReferenceResult {
  documentCount: number;
  withStoragePathCount: number;
  withDownloadUrlCount: number;
}

/**
 * Reads each users/{uid}/documents document's OWN data (unlike
 * countSubcollection()'s plain listDocuments()-only count) solely to
 * check whether its "storagePath"/"downloadURL" fields are populated —
 * every KivoraDocument in documentsStore.ts carries both by design. Only
 * COUNTS are ever returned or logged; the actual path/URL string values
 * are read into a local variable, checked, and discarded — never
 * included in this function's return value, a console.log, or anywhere
 * else. This makes no Firebase Storage call of any kind — it only reads
 * a Firestore field that happens to contain a Storage path/URL string.
 */
export async function checkDocumentsStorageReferences(
  firestore: FirestoreLike,
  uid: string,
): Promise<DocumentsStorageReferenceResult> {
  const refs = await firestore.collection(`users/${uid}/documents`).listDocuments();
  let withStoragePathCount = 0;
  let withDownloadUrlCount = 0;
  for (const ref of refs) {
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const storagePath = data["storagePath"];
    const downloadURL = data["downloadURL"];
    if (typeof storagePath === "string" && storagePath.length > 0) withStoragePathCount++;
    if (typeof downloadURL === "string" && downloadURL.length > 0) withDownloadUrlCount++;
  }
  return { documentCount: refs.length, withStoragePathCount, withDownloadUrlCount };
}

// ── Recursive discovery of unknown top-level and unexpected nested collections ──

export interface UnknownTopLevelCollectionFinding {
  path: string;
  documentCount: number;
}

export interface UnexpectedNestedSubcollectionFinding {
  parentPath: string;
  documentId: string;
  nestedCollectionName: string;
  nestedDocumentCount: number;
}

export interface UnknownOrNestedDiscoveryResult {
  unknownTopLevelCollections: UnknownTopLevelCollectionFinding[];
  unexpectedNestedSubcollections: UnexpectedNestedSubcollectionFinding[];
}

const KNOWN_TOP_LEVEL_PATHS = new Set<string>([
  ...SIMPLE_SUBCOLLECTION_PLAN.map((e) => e.path),
  "aiConversations",
]);

/**
 * Read-only, metadata-only recursive discovery — the same algorithm as
 * fullAccountBackup.ts's discoverAndReadAllUserCollections() (reimplemented
 * here rather than imported, to avoid the circular dependency described
 * above), but intentionally lighter: it NEVER reads a document's own
 * field data, only collection/document existence and names via
 * listCollections()/listDocuments() — both reference-only Firestore
 * calls. Reports (a) any users/{uid} top-level collection not already
 * known to this script's plan (aiConversations counts as known — it has
 * its own dedicated check above) and not a backup/scratch namespace
 * (BACKUP_AND_SCRATCH_NAMESPACES, excluded unconditionally — see the
 * "cannot accidentally include backup data" requirement), and (b) any
 * document anywhere that has a nested subcollection other than the one
 * already-expected case (aiConversations/{id}/messages). Never exposes a
 * document's field content — only path/collection NAMES and counts.
 */
export async function discoverUnknownAndNestedCollections(
  firestore: FirestoreLike,
  uid: string,
): Promise<UnknownOrNestedDiscoveryResult> {
  const userDoc = firestore.doc(`users/${uid}`);
  const topLevel = await userDoc.listCollections();

  const unknownTopLevelCollections: UnknownTopLevelCollectionFinding[] = [];
  const unexpectedNestedSubcollections: UnexpectedNestedSubcollectionFinding[] = [];

  for (const coll of topLevel) {
    if (BACKUP_AND_SCRATCH_NAMESPACES.includes(coll.id)) continue;

    const docRefs = await coll.listDocuments();
    if (!KNOWN_TOP_LEVEL_PATHS.has(coll.id)) {
      unknownTopLevelCollections.push({ path: coll.id, documentCount: docRefs.length });
    }

    for (const docRef of docRefs) {
      const nestedCollections = await docRef.listCollections();
      for (const nested of nestedCollections) {
        if (coll.id === "aiConversations" && nested.id === "messages") continue;
        const nestedDocs = await nested.listDocuments();
        if (nestedDocs.length > 0) {
          unexpectedNestedSubcollections.push({
            parentPath: coll.id,
            documentId: docRef.id,
            nestedCollectionName: nested.id,
            nestedDocumentCount: nestedDocs.length,
          });
        }
      }
    }
  }

  return { unknownTopLevelCollections, unexpectedNestedSubcollections };
}

export interface RootCollectionResult {
  path: string;
  label: string;
  classification: Classification;
  scopeField: "uid" | "senderEmail";
  scopeValue: string;
  /** Every document in the collection, regardless of owner — these are shared, not per-user, collections. */
  totalDocumentCount: number;
  /** Documents matching this account's uid or email. */
  matchingDocumentCount: number;
}

export async function checkRootCollection(
  firestore: FirestoreLike,
  entry: RootCollectionPlanEntry,
  uid: string,
  email: string | undefined,
): Promise<RootCollectionResult> {
  const col = firestore.collection(entry.path);
  const totalRefs = await col.listDocuments();
  const scopeValue = entry.scopeField === "uid" ? uid : (email ?? "");
  let matchingDocumentCount = 0;
  if (scopeValue) {
    const snap = await col.where(entry.scopeField, "==", scopeValue).get();
    matchingDocumentCount = snap.docs.length;
  }
  return {
    path: entry.path,
    label: entry.label,
    classification: entry.classification,
    scopeField: entry.scopeField,
    scopeValue,
    totalDocumentCount: totalRefs.length,
    matchingDocumentCount,
  };
}

// ── Full report ─────────────────────────────────────────────────────────────

export interface DryRunReport {
  uid: string;
  email?: string;
  generatedAt: string;
  subcollections: CollectionResult[];
  aiConversations: AiConversationsResult;
  backups: BackupsResult;
  fullBackups: FullBackupsResult;
  documentsStorageReferences: DocumentsStorageReferenceResult;
  unknownOrNestedDiscovery: UnknownOrNestedDiscoveryResult;
  rootCollections: RootCollectionResult[];
  warnings: string[];
}

const KNOWN_INCOMPLETE_BACKUP_COLLECTIONS = [
  "plans",
  "calendars",
  "documents",
  "pushSubscriptions",
  "transactions",
  "bills",
  "monthlyBudgets",
];

export async function runDryRun(
  firestore: FirestoreLike,
  uid: string,
  email: string | undefined,
): Promise<DryRunReport> {
  const warnings: string[] = [];

  const subcollections: CollectionResult[] = [];
  for (const entry of SIMPLE_SUBCOLLECTION_PLAN) {
    subcollections.push(await countSubcollection(firestore, uid, entry));
  }

  const aiConversations = await checkAiConversations(firestore, uid);
  if (aiConversations.conversationsWithMessagesSubcollection > 0) {
    warnings.push(
      `${aiConversations.conversationsWithMessagesSubcollection} AI-vestlusel on eraldi "messages" ` +
        `alamkogu dokumente (${aiConversations.totalNestedMessageDocs} kokku) — need EI sisaldu ` +
        "olemasolevas backupService.ts varunduses ja vajavad enne kustutamist eraldi käsitlust.",
    );
  }

  const backups = await checkBackups(firestore, uid);
  if (backups.documentCount === 0) {
    warnings.push(
      "Ei leitud ühtegi dokumenti users/{uid}/backups alt sellel kontol — kontrollige, et teadaolevad " +
        "2 varukoopiat on tegelikult SELLEL kasutajal, mitte mujal.",
    );
  }
  warnings.push(
    "Olemasolevad varukoopiad (backupService.ts createBackup()) EI kata: " +
      `${KNOWN_INCOMPLETE_BACKUP_COLLECTIONS.join(", ")}. Ära loe neid piisavaks taastamisvõimaluseks ` +
      "enne täiendava, täieliku varukoopia loomist.",
  );

  const fullBackups = await checkFullBackups(firestore, uid);
  if (fullBackups.restoreVerificationScratchFound) {
    warnings.push(
      "users/{uid}/_restoreVerificationScratch alt leiti midagi — mõne varasema taastatavuse kontrolli " +
        "puhastus ei näi olnud täielik. See on ainult info, midagi SIIN ei puudutata; vaadake käsitsi " +
        "üle enne edasisi otsuseid, ei kustutata automaatselt.",
    );
  }

  const documentsStorageReferences = await checkDocumentsStorageReferences(firestore, uid);
  if (documentsStorageReferences.withStoragePathCount > 0 || documentsStorageReferences.withDownloadUrlCount > 0) {
    warnings.push(
      `documents: ${documentsStorageReferences.withStoragePathCount}/${documentsStorageReferences.documentCount} ` +
        `kirjel on storagePath ja ${documentsStorageReferences.withDownloadUrlCount}/${documentsStorageReferences.documentCount} ` +
        "downloadURL täidetud — need viitavad Firebase Storage failidele, millele praegu ligipääs puudub " +
        "(Spark pakett). Firestore kirje kustutamine EI kustuta vastavat Storage faili — see jääks orvuks.",
    );
  }

  const unknownOrNestedDiscovery = await discoverUnknownAndNestedCollections(firestore, uid);
  if (unknownOrNestedDiscovery.unknownTopLevelCollections.length > 0) {
    warnings.push(
      "Leiti tundmatu(id) users/{uid} kogu(sid), mida ei ole praeguses plaanis: " +
        unknownOrNestedDiscovery.unknownTopLevelCollections.map((c) => `${c.path} (${c.documentCount} dok.)`).join(", ") +
        " — vajab käsitsi klassifitseerimist enne mistahes kustutamist.",
    );
  }
  if (unknownOrNestedDiscovery.unexpectedNestedSubcollections.length > 0) {
    warnings.push(
      "Leiti ootamatu(id) pesastatud alamkogu(sid) (väljaspool teadaolevat aiConversations/messages juhtumit): " +
        unknownOrNestedDiscovery.unexpectedNestedSubcollections
          .map((f) => `${f.parentPath}/${f.documentId}/${f.nestedCollectionName} (${f.nestedDocumentCount} dok.)`)
          .join(", ") +
        " — vajab käsitsi ülevaatust enne mistahes kustutamist.",
    );
  }

  const rootCollections: RootCollectionResult[] = [];
  for (const entry of ROOT_COLLECTION_PLAN) {
    rootCollections.push(await checkRootCollection(firestore, entry, uid, email));
  }
  const contact = rootCollections.find((r) => r.path === "contactSubmissions");
  if (contact && !email) {
    warnings.push(
      "Kontole ei leitud e-posti aadressi, nii et contactSubmissions (mis ei kanna kunagi uid-d) " +
        "kuvatakse ainult koguarvuna, ilma selle kontoga sidumata.",
    );
  } else if (contact) {
    warnings.push(
      `contactSubmissions: ${contact.matchingDocumentCount}/${contact.totalDocumentCount} kirjet vastab selle ` +
        "konto e-posti aadressile. E-posti vastavus ÜKSI ei ole omandi tõend — kontaktivorm ei nõua " +
        "sisselogimist, nii et keegi teine võis sisestada Teie e-posti aadressi. See ei tohi kunagi ÜKSI " +
        "olla kustutamise aluseks.",
    );
  }

  warnings.push(
    "Firebase Storage (profiilipildid, dokumendimooduli failid) EI ole selles versioonis kontrollitud " +
      "— see on tahtlikult lihtsustatud, ainult-Firestore'i esimene läbimine.",
  );

  return {
    uid,
    email,
    generatedAt: new Date().toISOString(),
    subcollections,
    aiConversations,
    backups,
    fullBackups,
    documentsStorageReferences,
    unknownOrNestedDiscovery,
    rootCollections,
    warnings,
  };
}

// ── Human-readable output ───────────────────────────────────────────────────

function classificationLabel(c: Classification): string {
  if (c === "KEEP") return "SÄILITA";
  if (c === "DELETE_CANDIDATE") return "KUSTUTA";
  return "KÜSI KINNITUST";
}

export function formatReport(report: DryRunReport): string {
  const lines: string[] = [];
  lines.push("═".repeat(72));
  lines.push("KIVORA ANDMETE DRY-RUN — AINULT LUGEMINE, MIDAGI EI KUSTUTATUD");
  lines.push("═".repeat(72));
  lines.push(`Konto:        uid=${report.uid}${report.email ? `  e-post=${report.email}` : "  (e-post puudub)"}`);
  lines.push(`Genereeritud: ${report.generatedAt}`);
  lines.push("");
  lines.push("users/{uid} alamkogud");
  lines.push("-".repeat(72));
  for (const c of report.subcollections) {
    lines.push(
      `  [${classificationLabel(c.classification).padEnd(14)}] ${c.label.padEnd(42)} ${c.documentCount} dok.`,
    );
  }
  lines.push(
    `  [${classificationLabel(report.aiConversations.classification).padEnd(14)}] ` +
      `${report.aiConversations.label.padEnd(42)} ${report.aiConversations.documentCount} dok.` +
      (report.aiConversations.totalNestedMessageDocs > 0
        ? `  (+ ${report.aiConversations.totalNestedMessageDocs} "messages" alamdok. ${report.aiConversations.conversationsWithMessagesSubcollection} vestluses)`
        : ""),
  );
  lines.push("");
  lines.push("Varukoopiad (users/{uid}/backups)");
  lines.push("-".repeat(72));
  if (report.backups.backups.length === 0) {
    lines.push("  Ühtegi varukoopiat ei leitud.");
  }
  for (const b of report.backups.backups) {
    lines.push(
      `  ${b.id}  loodud=${String(b.createdAt)}  kirjeid=${String(b.totalItems)}  tükke=${b.chunkCount}`,
    );
    lines.push(`    kogud: ${JSON.stringify(b.collectionNames)}`);
  }
  lines.push("");
  lines.push("Täielikud Firestore varukoopiad (users/{uid}/_fullBackups) — SÄILITA, mitte kustutamiskandidaat");
  lines.push("-".repeat(72));
  if (report.fullBackups.backups.length === 0) {
    lines.push("  Ühtegi _fullBackups kirjet ei leitud.");
  }
  for (const b of report.fullBackups.backups) {
    lines.push(`  ${b.id}  loodud=${String(b.createdAt)}  tükke=${String(b.chunksWritten)}`);
    lines.push(`    kogud: ${JSON.stringify(b.collectionPaths)}`);
  }
  lines.push(
    `  Taastekontrolli ajutine nimeruum (_restoreVerificationScratch): ${
      report.fullBackups.restoreVerificationScratchFound ? "LEITI SISU — vajab käsitsi ülevaatust" : "tühi (ootuspärane)"
    }`,
  );
  lines.push("");
  lines.push("Dokumendimooduli Storage-viited (users/{uid}/documents) — Storage'it EI puudutatud");
  lines.push("-".repeat(72));
  lines.push(
    `  Dokumente kokku: ${report.documentsStorageReferences.documentCount}  ` +
      `storagePath täidetud: ${report.documentsStorageReferences.withStoragePathCount}  ` +
      `downloadURL täidetud: ${report.documentsStorageReferences.withDownloadUrlCount}`,
  );
  lines.push("");
  lines.push("Tundmatud/ootamatud kogud (rekursiivne avastus)");
  lines.push("-".repeat(72));
  if (
    report.unknownOrNestedDiscovery.unknownTopLevelCollections.length === 0 &&
    report.unknownOrNestedDiscovery.unexpectedNestedSubcollections.length === 0
  ) {
    lines.push("  Midagi ootamatut ei leitud.");
  }
  for (const c of report.unknownOrNestedDiscovery.unknownTopLevelCollections) {
    lines.push(`  TUNDMATU KOGU: ${c.path} (${c.documentCount} dok.)`);
  }
  for (const f of report.unknownOrNestedDiscovery.unexpectedNestedSubcollections) {
    lines.push(`  OOTAMATU ALAMKOGU: ${f.parentPath}/${f.documentId}/${f.nestedCollectionName} (${f.nestedDocumentCount} dok.)`);
  }
  lines.push("");
  lines.push("Avalikud/jagatud kogud (root)");
  lines.push("-".repeat(72));
  for (const r of report.rootCollections) {
    lines.push(
      `  [${classificationLabel(r.classification).padEnd(14)}] ${r.label.padEnd(20)} ` +
        `kokku=${r.totalDocumentCount}  selle kontoga (${r.scopeField})=${r.matchingDocumentCount}`,
    );
  }
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Hoiatused");
    lines.push("-".repeat(72));
    for (const w of report.warnings) lines.push(`  ⚠ ${w}`);
  }
  lines.push("");
  lines.push("═".repeat(72));
  lines.push("Midagi ei kustutatud. See on ainult eelvaade.");
  lines.push("═".repeat(72));
  return lines.join("\n");
}

// ── CLI orchestration — no top-level side effects; must be called explicitly ─

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const target = resolveTargetIdentifier(argv, env);

  if (!target) {
    console.error(
      "Sihtkontot ei määratud. Üks järgnevast on vajalik:\n" +
        "  - CLI argument: node runDataCleanupDryRun.mjs <e-post-või-uid>\n" +
        "  - OWNER_EMAIL keskkonnamuutuja\n" +
        "  - OWNER_UID keskkonnamuutuja\n" +
        "Ei arva vaikimisi kontot ära — vaikekontot ei ole.",
    );
    return 1;
  }

  let auth: ReturnType<typeof getFirebaseAdminAuth>;
  let firestore: FirestoreLike;
  try {
    auth = getFirebaseAdminAuth();
    firestore = getFirebaseAdminFirestore();
  } catch (err) {
    console.error(
      `Firebase Admin ei ole kättesaadav: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  let uid: string;
  let email: string | undefined;
  try {
    const user = target.mode === "email" ? await auth.getUserByEmail(target.value) : await auth.getUser(target.value);
    uid = user.uid;
    email = user.email;
  } catch (err) {
    console.error(
      `Kasutajat ei leitud (${target.mode}="${target.value}"): ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  try {
    const report = await runDryRun(firestore, uid, email);
    console.log(formatReport(report));
    return 0;
  } catch (err) {
    console.error(`Dry-run ebaõnnestus: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
