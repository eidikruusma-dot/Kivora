/**
 * restoreFromBackup.ts — writes a flattened backup (fullAccountBackup.ts's
 * flattenBackup() output) back into Firestore at a given root path.
 *
 * ── Why this exists instead of reusing backupService.ts's restoreBackup() ─
 * Checked directly against the source (not assumed): the existing
 * restoreBackup() has three confirmed incompatibilities with this
 * backup's scope —
 *   1. It takes `const id = item.id` and silently `continue`s (drops the
 *      item, no error) whenever that field is missing. pushSubscriptions'
 *      stored document shape uses `subId`, not `id` — every push
 *      registration would be silently dropped on restore.
 *   2. It only ever writes to users/{uid}/{collName}/{id} — exactly one
 *      level deep — so it cannot restore a nested subcollection like
 *      aiConversations/{id}/messages at all.
 *   3. It operates only under users/{uid}/... — the three public root
 *      collections (contactSubmissions etc.) are structurally outside
 *      its reach regardless of storage format.
 * This file avoids all three by construction: it never reads an `id`
 * field out of the document's own data at all — every item carries the
 * REAL Firestore document ID it was read from (BackedUpDocument.id, set
 * once, at backup time, directly from docRef.id — never guessed from a
 * same-named field), and every flattened path is used as a single,
 * full, slash-delimited collection path string (Admin SDK's
 * `collection(fullPathString)` resolves arbitrary depth from one string,
 * unlike the multi-segment-argument form), so a nested path like
 * "aiConversations/c1/messages" is just another entry, not a special case.
 *
 * ── Deliberately never deletes anything ──────────────────────────────────
 * Unlike restoreBackup() (which deletes a collection's existing documents
 * before writing the backup's copies), this function only ever calls
 * batch.set() — never batch.delete(). In the real disaster-recovery
 * scenario this exists for, the target collections are already empty (the
 * data was lost), so "delete first" is moot; everywhere else this
 * function might be pointed (a verification scratch path, see
 * restoreVerification.ts) that scratch path starts empty too. Not
 * deleting by default is strictly safer in every context this file is
 * actually used in, and it means this file's own write-capable surface is
 * provably delete-free — restoreFromBackup.test.ts's source-scan test
 * checks this directly.
 */

import { sanitizeForFirestoreWrite } from "./firestoreValueCodec.js";
import type { BackedUpDocument, FirestoreLike } from "./fullAccountBackup.js";

const FIRESTORE_BATCH_LIMIT = 450;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface RestoreResult {
  pathsWritten: string[];
  docsWritten: number;
}

/**
 * Writes every (relativePath -> items) entry in `flat` to
 * `${rootPath}/${relativePath}`, using each item's own captured document
 * ID. `rootPath` is caller-supplied so the SAME function serves both a
 * real restore (rootPath = "users/{uid}") and the isolated verification
 * check (rootPath = a scratch path — see restoreVerification.ts) without
 * any branching here for which case it is.
 */
export async function restoreFromBackup(
  firestore: FirestoreLike,
  rootPath: string,
  flat: Map<string, BackedUpDocument[]>,
): Promise<RestoreResult> {
  const pathsWritten: string[] = [];
  let docsWritten = 0;

  for (const [relativePath, items] of flat.entries()) {
    if (items.length === 0) {
      pathsWritten.push(relativePath);
      continue;
    }
    const fullPath = `${rootPath}/${relativePath}`;
    const col = firestore.collection(fullPath);
    for (const group of chunkArray(items, FIRESTORE_BATCH_LIMIT)) {
      const batch = firestore.batch();
      for (const item of group) {
        batch.set(col.doc(item.id), sanitizeForFirestoreWrite(item.data) as Record<string, unknown>);
      }
      await batch.commit();
      docsWritten += group.length;
    }
    pathsWritten.push(relativePath);
  }

  return { pathsWritten, docsWritten };
}
