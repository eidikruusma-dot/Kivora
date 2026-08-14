---
name: AI document actions
description: Architecture for AI-triggered file save/move/rename into Kivora from the AI assistant page.
---

## Storage schema

- Firestore: `users/{uid}/documents/{id}` — KivoraDocument metadata
- Firebase Storage: `users/{uid}/documents/{id}/{filename}` — binary file
- No pre-existing document collection existed; this is the first and only document store.

## Key types

`KivoraDocument`: id, name, mimeType, storagePath, downloadURL, size, module ('notes'|'school'|'personal'), folder (NoteFolder, for notes), subjectId/subjectName (for school), createdAt, updatedAt.

`ActionContext` (aiActions.ts): uid, getFile(id)→PendingFileRef|null, getAllDocuments().

`PendingFileRef`: id, name, mimeType, file (original File object), size.

## File object lifecycle

1. `handleFileSelect` stores the original `File` object in `AttachedFile.file`.
2. `sendMessage` snapshots `readyFiles` into `pendingFilesRef.current` (a `useRef`) BEFORE calling `setAttachedFiles([])`.
3. Both `.then()` handlers in `createChat` and `sendMessage` are async and call `await executeActionsAsync(res.actions, actionCtx)`.
4. `actionCtx.getFile(id)` looks up `pendingFilesRef.current` — the File object is still alive in the closure.
5. After execution, `pendingFilesRef.current = []` releases the references.

## Hidden context format

Every attached file's context now includes `attachmentId: <id>` so the AI can reference it:
- `Attached document (attachmentId: <id>): filename\n---\ntext`
- `Attached bank statement (attachmentId: <id>): filename\n---\nJSON`

## AI action types (system prompt)

- `save_document`: fileId, module, folder?, subjectName?, name?
- `move_document`: documentId, module, folder?, subjectName?
- `rename_document`: documentId, newName
- `batch_save_documents`: items[] — delegates to save_document per item

## Behavior rules (in system prompt)

- Explicit destination → act immediately, no confirmation needed.
- AI-selected sort → propose plan first, ask once, then emit batch_save_documents.
- Missing subject/folder → ask one clarification question.
- Duplicate detection via `findDuplicate()` before Storage upload; returns error message, not silent overwrite.
- School module: resolves subjectName→subjectId via getAllSchoolSubjects(); returns error if name not found.

## initDocumentsStore

Called from AuthContext.tsx alongside all other stores on auth state change.

**Why:** Follows the same singleton onSnapshot + pub/sub pattern as all other stores. Must be initialized before any AI action can read `getDocumentById`/`findDuplicate`.
