# Security-rule tests (local emulator only)

These tests evaluate the REAL `firestore.rules` content (and a draft
Storage-rules fixture) against the Firebase Local Emulator Suite, using
`@firebase/rules-unit-testing`. They are **not** run by `vitest run` or CI:
their filenames end in `.rules-test.ts`, which `vitest.config.ts`'s
`include` pattern (`src/**/*.test.ts`) does not match, so they are only
run when explicitly named.

**Important — unverified in the cloud session that wrote them.** This
sandboxed environment's network proxy blocks `firebase-public.firebaseio.com`
(confirmed: `firebase emulators:start` fails there with
`connect_rejected, HTTP 403`), which the Firebase emulator needs to check
for/download its Firestore and Storage emulator binaries on first run. That
means these tests could not actually be executed or verified here — they
are written carefully against the documented `@firebase/rules-unit-testing`
v5 API, but their correctness has NOT been confirmed by a real run. Please
run them locally (where the emulator can reach the internet) before relying
on them.

## Dependencies

Already added to `artifacts/planner-app/package.json` as devDependencies,
for local use only:
- `firebase-tools`
- `@firebase/rules-unit-testing@5.0.2` (pinned to match this project's
  `firebase@^12.16.0` — the newer `6.x` line requires `firebase@^13`)

## Running locally

From `artifacts/planner-app`:

```bash
npx firebase emulators:exec \
  --only firestore,storage \
  --project demo-kivora-rules \
  "npx vitest run src/lib/__tests__/security/firestoreSecurityRules.rules-test.ts"
```

No `firebase.json` emulator config is required — `initializeTestEnvironment()`
is called with the rules text passed directly (read from the real
`firestore.rules` file for the "already deployed" tests, and from
`draftRules.ts`'s fixture strings for the not-yet-deployed `calendars`/
`documents` draft). `firebase emulators:exec` picks default ports and sets
the `FIRESTORE_EMULATOR_HOST`/`FIREBASE_STORAGE_EMULATOR_HOST` environment
variables the test file reads.

## What these tests cover

1. **Cross-user isolation** (the specific check asked for): a second
   authenticated user (`uid: "user-b"`) can never read, write, or delete
   `uid: "user-a"`'s documents in `tasks` (representative of the
   `isOwner(uid)`-guarded collections) using the REAL, currently-deployed
   `firestore.rules`.
2. **feedbackSubmissions / supportMessages / contactSubmissions stay
   locked down** — regression lock proving `allow read, delete: if false`
   still holds for everyone, including the document's own author, against
   the REAL rules file. This is the thing `accountDeletionService.ts`
   relies on to justify never attempting to delete these collections.
3. **Draft `calendars`/`documents` rules** (from `draftRules.ts`, appended
   in-memory to a copy of the real rules text — the real, committed
   `firestore.rules` file itself is never modified) behave as intended:
   the owner can create/read/update/delete their own documents, and a
   different authenticated user cannot read, write, or delete them.
4. **Storage**: a draft rule for `users/{uid}/documents/**` (same
   owner-only shape as the known `users/{uid}/profile/**` rule) is
   exercised the same way, against the `@firebase/rules-unit-testing`
   Storage emulator. The live Storage rules could not be fetched from the
   Firebase Console for this task (only a `.migration-backup/storage.rules`
   snapshot exists, already known to be stale), so this part validates the
   *draft* only — it says nothing about what is live today.
