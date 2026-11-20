/**
 * restoreVerification.ts — proves a backup is actually restorable WITHOUT
 * ever touching real user data.
 *
 * ── Why this can't just run restoreFromBackup() against the live collections ─
 * restoreFromBackup() writes real documents at real IDs — pointed at
 * users/{uid} directly, it would overwrite live data, which is exactly
 * what verification must never do. Instead this writes the SAME backup
 * content to an isolated, clearly-named scratch root
 * (users/{uid}/__restoreVerification__/{backupId}/...), reads every
 * document back, deep-compares it against the original in-memory backup
 * content, then deletes everything it just wrote — success or failure,
 * via a finally block.
 *
 * ── The collision guard ───────────────────────────────────────────────────
 * assertScratchPathIsIsolated() is called before any write and throws if
 * "__restoreVerification__" is ever itself the name of a real, discovered
 * top-level collection — this is checked programmatically against the
 * actual discovered collection list (fullAccountBackup.ts's
 * discoverAndReadAllUserCollections), not assumed safe just because the
 * name looks unlikely to collide.
 *
 * ── What a passing check proves, and what it does not ────────────────────
 * This writes through the Admin SDK, which bypasses firestore.rules
 * entirely — a passing check proves the data is structurally writable
 * (correct shapes, no size-limit violations, every item has a usable ID)
 * and reads back byte-for-byte identical, NOT that a real client subject
 * to security rules could perform the equivalent write. That would need a
 * separate, client-SDK-based check with a real authenticated user context
 * — out of scope here, since this tool is deliberately server/Admin-only
 * end to end and never represents itself as a rules test.
 */

import { deepEqualIgnoringKeyOrder, type BackedUpDocument, type DocRefLike, type FirestoreLike, type WriteBatchLike } from "./fullAccountBackup.js";
import { restoreFromBackup } from "./restoreFromBackup.js";

export const RESTORE_VERIFICATION_SEGMENT = "__restoreVerification__";

export function scratchRootPathFor(uid: string, backupId: string): string {
  return `users/${uid}/${RESTORE_VERIFICATION_SEGMENT}/${backupId}`;
}

/**
 * Throws if the scratch segment name would ever collide with a real,
 * currently-existing top-level collection under users/{uid} — checked
 * against the actual discovered list the caller already has from backing
 * the account up, not merely assumed safe because of the name chosen.
 */
export function assertScratchPathIsIsolated(realTopLevelCollectionPaths: string[]): void {
  if (realTopLevelCollectionPaths.includes(RESTORE_VERIFICATION_SEGMENT)) {
    throw new Error(
      `Turvarikkumise oht: kogu "${RESTORE_VERIFICATION_SEGMENT}" on juba tegelik, päris kogu selle ` +
        "kasutaja all — taastekontrolli ei saa turvaliselt käivitada enne nimekonflikti lahendamist.",
    );
  }
}

// ── Delete-capable Firestore — a strictly separate interface from fullAccountBackup.ts's ──
//
// fullAccountBackup.ts's own WriteBatchLike deliberately has no delete
// method at all, so that file's safety guarantee ("never deletes
// anything") holds by the absence of the capability, not by convention.
// This file's cleanup step is the one place in this whole system that
// legitimately needs to delete something (the scratch copy it just made)
// — so it declares its OWN, separate, wider interface rather than
// weakening fullAccountBackup.ts's.

export interface DeletableWriteBatchLike extends WriteBatchLike {
  delete(ref: DocRefLike): void;
}

export interface FirestoreWithDelete extends FirestoreLike {
  batch(): DeletableWriteBatchLike;
}

const DELETE_BATCH_LIMIT = 450;

/**
 * Deletes every document this verification run wrote under
 * scratchRootPath — nothing else. Returns false (never throws) on
 * failure, so a cleanup problem is reported rather than crashing the
 * whole verification result; a human should still be told to check for
 * leftover scratch data if this ever comes back false.
 */
async function deleteScratchPath(
  firestore: FirestoreWithDelete,
  scratchRootPath: string,
  relativePaths: string[],
): Promise<boolean> {
  try {
    for (const relativePath of relativePaths) {
      const refs = await firestore.collection(`${scratchRootPath}/${relativePath}`).listDocuments();
      for (let i = 0; i < refs.length; i += DELETE_BATCH_LIMIT) {
        const batch = firestore.batch();
        for (const ref of refs.slice(i, i + DELETE_BATCH_LIMIT)) batch.delete(ref);
        await batch.commit();
      }
    }
    return true;
  } catch {
    return false;
  }
}

export interface VerificationItemResult {
  path: string;
  expectedCount: number;
  restoredCount: number;
  contentMatches: boolean;
}

export interface VerificationResult {
  scratchRootPath: string;
  items: VerificationItemResult[];
  allMatch: boolean;
  cleanupSucceeded: boolean;
}

export async function verifyRestorability(
  firestore: FirestoreWithDelete,
  uid: string,
  backupId: string,
  flat: Map<string, BackedUpDocument[]>,
  realTopLevelCollectionPaths: string[],
): Promise<VerificationResult> {
  assertScratchPathIsIsolated(realTopLevelCollectionPaths);
  const scratchRootPath = scratchRootPathFor(uid, backupId);
  const items: VerificationItemResult[] = [];
  let cleanupSucceeded = false;

  try {
    await restoreFromBackup(firestore, scratchRootPath, flat);

    for (const [relativePath, originalItems] of flat.entries()) {
      const refs = await firestore.collection(`${scratchRootPath}/${relativePath}`).listDocuments();
      const restored: BackedUpDocument[] = [];
      for (const ref of refs) {
        const snap = await ref.get();
        restored.push({ id: ref.id, data: snap.exists ? snap.data() ?? {} : {}, subcollections: {} });
      }
      const contentMatches =
        restored.length === originalItems.length &&
        restored.every((r) => {
          const match = originalItems.find((o) => o.id === r.id);
          return match !== undefined && deepEqualIgnoringKeyOrder(r.data, match.data);
        });
      items.push({
        path: relativePath,
        expectedCount: originalItems.length,
        restoredCount: restored.length,
        contentMatches,
      });
    }
  } finally {
    cleanupSucceeded = await deleteScratchPath(firestore, scratchRootPath, [...flat.keys()]);
  }

  return {
    scratchRootPath,
    items,
    allMatch: items.length > 0 && items.every((i) => i.contentMatches),
    cleanupSucceeded,
  };
}
