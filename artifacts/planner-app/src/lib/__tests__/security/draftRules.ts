/**
 * Draft Firestore/Storage rule additions for "users/{uid}/calendars" and
 * "users/{uid}/documents" — NOT deployed anywhere. These exist only so
 * firestoreSecurityRules.rules-test.ts can verify the shape works
 * (owner-only CRUD, cross-user denial) before anyone deploys them for
 * real. See this project's README.md in this same folder.
 *
 * The Firestore draft mirrors the already-deployed, already-approved
 * "plans" rule's shape exactly (same isOwner(uid) pattern, same
 * create/update/delete structure). The Storage draft mirrors the known
 * "users/{uid}/profile/{fileName}" rule's shape (from
 * .migration-backup/storage.rules — a snapshot known to be stale, so this
 * is a best-effort match, not a confirmed-current one).
 */

export const DRAFT_CALENDARS_AND_DOCUMENTS_FIRESTORE_RULES = `
    match /users/{uid}/calendars/{calId} {
      allow read: if isOwner(uid);

      allow create: if isOwner(uid)
        && request.resource.data.label is string
        && request.resource.data.label.trim().size() > 0
        && request.resource.data.color is string;

      allow update: if isOwner(uid);
      allow delete: if isOwner(uid);
    }

    match /users/{uid}/documents/{docId} {
      allow read: if isOwner(uid);

      allow create: if isOwner(uid)
        && request.resource.data.name is string
        && request.resource.data.name.trim().size() > 0
        && request.resource.data.mimeType is string
        && request.resource.data.storagePath is string
        && request.resource.data.downloadURL is string
        && request.resource.data.size is int
        && request.resource.data.module in ['notes', 'school', 'personal'];

      allow update: if isOwner(uid);
      allow delete: if isOwner(uid);
    }
`

/**
 * Splices the draft Firestore rules into a copy of the real rules text,
 * right before the "DEFAULT DENY" catch-all match block — never mutating
 * the real, committed firestore.rules file on disk.
 */
export function withDraftFirestoreRules(realRulesText: string): string {
  const anchor = '    // DEFAULT DENY'
  if (!realRulesText.includes(anchor)) {
    throw new Error(
      'withDraftFirestoreRules(): expected anchor "// DEFAULT DENY" not found — ' +
        'firestore.rules has changed shape; update this splice point.',
    )
  }
  return realRulesText.replace(
    anchor,
    `${DRAFT_CALENDARS_AND_DOCUMENTS_FIRESTORE_RULES}\n${anchor}`,
  )
}

export const DRAFT_STORAGE_RULES = `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/profile/{fileName} {
      allow read: if request.auth != null
        && request.auth.uid == uid;
      allow write: if request.auth != null
        && request.auth.uid == uid
        && request.resource.contentType.matches('image/(jpeg|png|webp)')
        && request.resource.size < 5 * 1024 * 1024;
    }
    match /users/{uid}/documents/{docId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null
        && request.auth.uid == uid
        && request.resource.size < 25 * 1024 * 1024;
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
`
