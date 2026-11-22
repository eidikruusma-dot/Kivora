/**
 * featureFlags.ts
 *
 * Central switches for optional Kivora modules. Every place that shows,
 * routes to, or initializes data for a flagged module must read the flag
 * from here — never maintain a separate local copy of the decision, so
 * flipping one value here is the single source of truth everywhere.
 */

/**
 * Controls the Raha (finance) module: sidebar/mobile navigation, the
 * onboarding and settings module-selection lists, the /app/finance route,
 * the money data store's Firestore listeners (transactions, bills,
 * monthlyBudgets), and the AI assistant's bank-statement import action.
 * Set to true to re-enable the module everywhere at once.
 */
export const MONEY_MODULE_ENABLED = false;

/**
 * Gates deleting "users/{uid}/calendars" during full account deletion
 * (accountDeletionService.ts's deleteAllUserData()).
 *
 * That collection has NO Firestore security rule deployed today (confirmed
 * directly in the Firebase Console). Every read or delete call against it
 * is rejected with permission-denied right now — if this flag were on,
 * EVERY account deletion would fail at this one step, not just accounts
 * that actually have calendar data, because Firestore rejects the LIST
 * query itself before it even knows whether anything matches.
 *
 * Flip to true only after a rule for "users/{uid}/calendars" (owner-only
 * read/create/update/delete, matching the existing "plans" rule's shape)
 * has been deployed and confirmed live.
 */
export const ACCOUNT_DELETION_CALENDARS_ENABLED = false;

/**
 * Gates deleting "users/{uid}/documents" (Firestore metadata AND its
 * Firebase Storage file) and the user's profile photo file, during full
 * account deletion.
 *
 * Two independent blockers today:
 *  - "users/{uid}/documents" has no Firestore security rule deployed
 *    either (same permission-denied-for-everyone problem as calendars
 *    above).
 *  - Firebase Storage itself requires upgrading this project to the
 *    Blaze (pay-as-you-go) plan, which has not been done — Storage reads
 *    and writes may fail outright regardless of rules.
 *
 * A document's Firestore metadata and its Storage file are always deleted
 * as one paired unit, never one without the other, specifically so a
 * Storage failure can never leave an orphaned file with no remaining
 * reference to it anywhere. That pairing is exactly why this is a single
 * flag rather than two independent ones — flipping only the Firestore
 * side on would re-open that same orphaning risk.
 *
 * Flip to true only after, in order: (1) this project is on the Blaze
 * plan and Storage reads/writes are confirmed working end-to-end, (2) the
 * "users/{uid}/documents" Firestore rule is deployed and confirmed live,
 * (3) a real account deletion has been verified end-to-end in a
 * non-production project.
 */
export const ACCOUNT_DELETION_STORAGE_ENABLED = false;

/**
 * Whether a user's "feedbackSubmissions"/"supportMessages" entries can be
 * removed as part of full account deletion.
 *
 * Unlike the two flags above, this is NOT a "deploy a rule, flip a
 * switch" gap. Both collections deny read and delete to every client
 * unconditionally (`allow read, delete: if false` in firestore.rules),
 * including to the document's own author — by design, so that no client,
 * not even one presenting a spoofed "owner" field, can ever read or mass-
 * delete other users' submissions. No Firestore rule change could ever
 * safely open this to the client.
 *
 * Today, removing a deleted user's entries requires an administrator to
 * run the separate, already-built server-side tool —
 * artifacts/api-server/src/scripts/runFullAccountRemovalCli.ts (Admin
 * SDK, bypasses client rules by design) — for that uid, as a manual step
 * after the user requests deletion (see AndmeteKustutaminePage.tsx's
 * "automatic deletion unavailable" notice and its link to the help/
 * support page for how that request reaches an administrator today).
 *
 * This could only ever flip to true if a genuinely NEW, narrowly-scoped,
 * authenticated server endpoint were built that lets a signed-in user
 * trigger deletion of ONLY their own feedbackSubmissions/supportMessages
 * entries (verified server-side against their ID token's uid, via the
 * Admin SDK) — not by relaxing the Firestore rule, and not by exposing
 * the existing admin CLI tool directly to end users. No such endpoint
 * exists yet.
 */
export const ACCOUNT_DELETION_FEEDBACK_SUPPORT_ENABLED = false;
