/**
 * accountDeletionService.ts
 *
 * Real account deletion utilities.
 *
 * deleteCollection()   — batch-delete all docs in a flat subcollection (handles 500-op limit)
 * deleteAllUserData()  — delete every Firestore subcollection under users/{uid}, then the
 *                        profile root document.
 *                        Throws on the first failure. Does NOT call deleteUser() — the caller
 *                        must do that only after this function resolves successfully.
 * reauthenticate()     — provider-aware re-authentication before sensitive operations.
 *
 * ── What this does NOT delete, and why ───────────────────────────────────
 *
 * "calendars" and "documents" (+ its Storage files, + the profile photo
 * Storage file) are each gated behind a featureFlags.ts flag
 * (ACCOUNT_DELETION_CALENDARS_ENABLED / ACCOUNT_DELETION_STORAGE_ENABLED),
 * both currently false — see those flags' own doc comments for exactly
 * what is missing (a Firestore rule for each collection, and for Storage,
 * the project's still-pending Blaze plan upgrade) and what must be
 * verified before flipping them. Turning either on before its
 * prerequisites are met would make EVERY account deletion fail outright
 * (not silently skip) at that step, which is deliberate: this file must
 * never report a deletion as successful while real data was left behind.
 *
 * "feedbackSubmissions" and "supportMessages" are NEVER touched here, by
 * design, not oversight: both collections' Firestore rules deny read and
 * delete to every client unconditionally (`allow read, delete: if false`),
 * including to the document's own author — there is no client-side
 * credential that could ever satisfy that rule, so no amount of extra
 * code here would help. Removing a deleted user's entries from these two
 * collections requires an administrator to run the existing, separate
 * server-side tool — artifacts/api-server/src/scripts/runFullAccountRemovalCli.ts
 * (via fullAccountRemoval.ts, Admin SDK, bypasses client rules by design)
 * — for that uid, as its own manual step. This is NOT triggered
 * automatically by a user deleting their own account; nothing in this
 * file calls it, schedules it, or notifies anyone that it is needed.
 *
 * "contactSubmissions" is out of scope entirely: every document in it has
 * `uid: null` unconditionally (Contact.tsx never sets it, and the
 * collection's own create rule requires that) — it is never attributable
 * to any Firebase Auth account, so there is no "this user's rows" to
 * find or delete. Its retention is a separate, time-based data-retention
 * policy question, not an account-deletion one.
 *
 * "users/{uid}/_fullBackups" (written only by the separate, admin-run
 * full-account-backup tool) and the GitHub Actions encrypted backup
 * artifact are both deliberately left untouched here — their retention
 * policy is still an open decision, not a bug.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import {
  type User,
  type MultiFactorError,
  type MultiFactorResolver,
  type MultiFactorInfo,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  PhoneMultiFactorGenerator,
  PhoneAuthProvider,
  RecaptchaVerifier,
} from 'firebase/auth'
import { db, auth, storage } from '@/lib/firebase'
import { deleteBackup } from '@/lib/backupService'
import { extractStoragePathFromUrl } from '@/lib/profilePhoto'
import {
  ACCOUNT_DELETION_CALENDARS_ENABLED,
  ACCOUNT_DELETION_STORAGE_ENABLED,
  ACCOUNT_DELETION_FEEDBACK_SUPPORT_ENABLED,
} from '@/lib/featureFlags'

// ── Constants ──────────────────────────────────────────────────────────────

const BATCH_LIMIT = 500

// ── Batch deletion helpers ─────────────────────────────────────────────────

/**
 * Delete every document in a flat subcollection under users/{uid}.
 * Processes in BATCH_LIMIT-sized chunks to respect Firestore's 500-op batch limit.
 * No-ops on empty collections.
 */
export async function deleteCollection(uid: string, name: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, name))
  if (snap.empty) return
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * Delete the messages subcollection of a single AI conversation.
 * Firestore does not cascade-delete subcollections automatically.
 */
async function deleteConversationMessages(
  uid: string,
  conversationId: string,
): Promise<void> {
  const snap = await getDocs(
    collection(db, 'users', uid, 'aiConversations', conversationId, 'messages'),
  )
  if (snap.empty) return
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * Delete all AI conversations and their nested messages subcollections.
 */
async function deleteAIConversations(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'aiConversations'))
  if (snap.empty) return
  // Messages subcollections must be deleted before the parent documents
  for (const conv of snap.docs) {
    await deleteConversationMessages(uid, conv.id)
  }
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * Delete all backups (with their nested chunks) for a user.
 * Lists ALL backups — not capped at 10 like listBackups().
 * Reuses the existing deleteBackup() from backupService to handle chunk deletion.
 */
async function deleteAllBackups(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'backups'))
  for (const d of snap.docs) {
    await deleteBackup(uid, d.id)
  }
}

// ── Storage-aware deletion helpers ──────────────────────────────────────────

/**
 * Delete one Storage object by path, treating "it's already gone" as
 * success and any other failure as a real failure that must propagate.
 *
 * "storage/object-not-found" is the ONLY tolerated error code — it means
 * the file was already removed (e.g. a previous, partially-completed
 * deletion attempt), not that anything is wrong. Every other error
 * (permission-denied, network failure, the project not being on a plan
 * that serves Storage at all, ...) is rethrown so the caller aborts
 * instead of silently treating a real failure as a no-op.
 */
async function deleteStorageObjectTolerateMissing(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath))
  } catch (err) {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err
  }
}

/**
 * Delete every document in users/{uid}/documents, pairing each one with
 * its own Storage file.
 *
 * Each pair is handled sequentially, Storage file first, Firestore
 * metadata second, and NEVER the other way around: if a file's Storage
 * delete fails for a real reason (not "already gone"), this throws
 * immediately and that document's Firestore record is deliberately left
 * in place — losing the record would lose the only remaining pointer to
 * that orphaned file, making it permanently undeletable. Documents
 * already fully processed before the failure stay deleted; this is not
 * rolled back.
 *
 * Gated by ACCOUNT_DELETION_STORAGE_ENABLED — see that flag's doc comment.
 */
async function deleteDocumentsWithStorage(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'documents'))
  for (const d of snap.docs) {
    const data = d.data() as { storagePath?: unknown }
    if (typeof data.storagePath === 'string' && data.storagePath) {
      await deleteStorageObjectTolerateMissing(data.storagePath)
    }
    await deleteDoc(d.ref)
  }
}

/**
 * Delete the user's profile photo from Storage, if one is set.
 * Does NOT touch the users/{uid} document itself — the caller deletes
 * that separately, after this resolves.
 *
 * Gated by ACCOUNT_DELETION_STORAGE_ENABLED — see that flag's doc comment.
 */
async function deleteProfilePhotoStorageFile(uid: string): Promise<void> {
  const profileSnap = await getDoc(doc(db, 'users', uid))
  const photoURL = (profileSnap.data() as { photoURL?: unknown } | undefined)?.photoURL
  if (typeof photoURL !== 'string' || !photoURL) return
  const storagePath = extractStoragePathFromUrl(photoURL)
  if (!storagePath) return
  await deleteStorageObjectTolerateMissing(storagePath)
}

// ── Pre-flight availability check ───────────────────────────────────────────

export type AutomaticDeletionBlockedReason =
  | 'calendars'
  | 'documents-and-profile-photo'
  | 'feedback-and-support-messages'

export interface AutomaticDeletionAvailability {
  /** True only if deleteAllUserData() + deleteUser() together would leave NO known category of this user's personal data behind. */
  available: boolean
  /** Which gated categories are currently blocking full automatic deletion — empty when available is true. */
  blockedReasons: AutomaticDeletionBlockedReason[]
}

/**
 * Checks whether a FULL, automatic, self-service account deletion is
 * currently possible — i.e. whether deleteAllUserData() followed by
 * deleteUser() would remove every category of personal data this
 * codebase knows about, with nothing left behind anywhere.
 *
 * This must be called, and its result checked, BEFORE any deletion step
 * is attempted (see AndmeteKustutaminePage.tsx) — not just relied on to
 * explain a failure after the fact. The three flags it reads are each
 * documented in featureFlags.ts: two are temporary (pending a Firestore
 * rule deploy and/or the Blaze plan), one is structural (feedbackSubmissions/
 * supportMessages can never be opened to client-side deletion by design,
 * and need an administrator — or a not-yet-built server endpoint — instead).
 *
 * While ANY reason is present, the UI must not offer, and this service
 * must not perform, automatic deletion — the user is instead directed to
 * request deletion manually (see the help/support page link in
 * AndmeteKustutaminePage.tsx). This function performs no network calls;
 * it only reads the three flags, so it is safe to call synchronously and
 * as often as needed (e.g. once at render time AND again, defensively,
 * right before performDeletion() acts on it).
 */
export function checkAutomaticDeletionAvailability(): AutomaticDeletionAvailability {
  const blockedReasons: AutomaticDeletionBlockedReason[] = []
  if (!ACCOUNT_DELETION_CALENDARS_ENABLED) blockedReasons.push('calendars')
  if (!ACCOUNT_DELETION_STORAGE_ENABLED) blockedReasons.push('documents-and-profile-photo')
  if (!ACCOUNT_DELETION_FEEDBACK_SUPPORT_ENABLED) blockedReasons.push('feedback-and-support-messages')
  return { available: blockedReasons.length === 0, blockedReasons }
}

// ── Full user data deletion ────────────────────────────────────────────────

/**
 * Delete all Firestore data for a user in safe dependency order.
 *
 * Order rationale:
 *  - Subcollections with nested subcollections (aiConversations → messages,
 *    backups → chunks) are fully cleared before their parent documents.
 *  - The profile root document (users/{uid}) is deleted last.
 *
 * Throws on the first failure — no silent swallowing.
 * Does NOT call deleteUser(). The caller must do that only after this resolves.
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  await deleteCollection(uid, 'tasks')
  await deleteCollection(uid, 'calendarEvents')
  await deleteCollection(uid, 'notes')
  await deleteCollection(uid, 'habits')
  await deleteCollection(uid, 'goals')
  await deleteCollection(uid, 'schoolItems')
  await deleteCollection(uid, 'plans')
  await deleteCollection(uid, 'transactions')
  await deleteCollection(uid, 'bills')
  await deleteCollection(uid, 'monthlyBudgets')
  await deleteAIConversations(uid)               // handles nested messages
  await deleteCollection(uid, 'notifications')
  await deleteCollection(uid, 'settings')
  await deleteCollection(uid, 'entityLinks')
  await deleteCollection(uid, 'pushSubscriptions')
  await deleteAllBackups(uid)                    // handles nested chunks

  // See this file's own top-of-file doc comment and each flag's doc
  // comment in featureFlags.ts for exactly why these two are gated rather
  // than unconditional, and what must be true before enabling them.
  if (ACCOUNT_DELETION_CALENDARS_ENABLED) {
    await deleteCollection(uid, 'calendars')
  }
  if (ACCOUNT_DELETION_STORAGE_ENABLED) {
    await deleteDocumentsWithStorage(uid)        // Firestore + Storage, paired
    await deleteProfilePhotoStorageFile(uid)      // before the profile doc itself is gone
  }

  await deleteDoc(doc(db, 'users', uid))         // profile root — last
}

// ── Re-authentication ──────────────────────────────────────────────────────

export type ReauthErrorCode =
  | 'wrong-password'
  | 'popup-closed'
  | 'requires-recent-login'
  | 'network-error'
  | 'unknown'

export class ReauthError extends Error {
  constructor(
    public readonly reauthCode: ReauthErrorCode,
    message: string,
    /** Raw Firebase error code — always populated, empty string if unavailable */
    public readonly rawCode: string = '',
    /** Raw Firebase error message — always populated, empty string if unavailable */
    public readonly rawMessage: string = '',
  ) {
    super(message)
    this.name = 'ReauthError'
  }
}

/**
 * Thrown when Firebase first-factor sign-in succeeds but a second factor is required.
 * Carries the MultiFactorResolver and enrolled hints needed to complete the challenge.
 * Pass the resolver and the relevant hint to completeMFAChallenge() after collecting
 * the one-time code from the user.
 */
export class MFARequiredError extends Error {
  constructor(
    public readonly resolver: MultiFactorResolver,
    public readonly hints: MultiFactorInfo[],
  ) {
    super('Multi-factor authentication required')
    this.name = 'MFARequiredError'
  }
}

/**
 * Re-authenticate the current user before a sensitive operation.
 *
 * Email/password users: pass the current password.
 * Google users: triggers a sign-in popup — password argument is ignored.
 *
 * Throws MFARequiredError when a second factor is required (caller must complete the
 * challenge with completeMFAChallenge() before proceeding).
 * Throws ReauthError with a typed reauthCode on all other known failure modes.
 * rawCode and rawMessage on the thrown ReauthError always reflect the original Firebase values.
 */
export async function reauthenticate(user: User, password?: string): Promise<void> {
  const isGoogle = user.providerData.some((p) => p.providerId === 'google.com')

  try {
    if (isGoogle) {
      await reauthenticateWithPopup(user, new GoogleAuthProvider())
    } else {
      if (!user.email) throw new ReauthError('unknown', 'User has no email address', '', 'email is null')
      if (!password) throw new ReauthError('wrong-password', 'Password is required', '', 'no password supplied')
      const cred = EmailAuthProvider.credential(user.email, password)
      await reauthenticateWithCredential(user, cred)
    }
  } catch (err: unknown) {
    if (err instanceof ReauthError) throw err
    if (err instanceof MFARequiredError) throw err

    // ── MFA required: first factor accepted, second factor needed ────────
    if ((err as { code?: string }).code === 'auth/multi-factor-auth-required') {
      const resolver = getMultiFactorResolver(auth, err as MultiFactorError)
      throw new MFARequiredError(resolver, resolver.hints)
    }

    const rawCode = (err as { code?: string }).code ?? ''
    const rawMessage = (err as { message?: string }).message ?? ''
    if (rawCode === 'auth/wrong-password' || rawCode === 'auth/invalid-credential') {
      throw new ReauthError('wrong-password', 'Incorrect password', rawCode, rawMessage)
    }
    if (
      rawCode === 'auth/popup-closed-by-user' ||
      rawCode === 'auth/cancelled-popup-request'
    ) {
      throw new ReauthError('popup-closed', 'Sign-in popup was closed', rawCode, rawMessage)
    }
    if (rawCode === 'auth/requires-recent-login') {
      throw new ReauthError('requires-recent-login', 'Recent login required', rawCode, rawMessage)
    }
    if (rawCode === 'auth/network-request-failed') {
      throw new ReauthError('network-error', 'Network error', rawCode, rawMessage)
    }
    throw new ReauthError('unknown', 'Authentication failed', rawCode, rawMessage)
  }
}

// ── MFA challenge helpers ──────────────────────────────────────────────────

/**
 * Initiate a phone-based MFA challenge by sending an SMS.
 * Returns the verificationId required by completeMFAChallenge().
 *
 * recaptchaContainerId must be the id of a DOM element present in the current page.
 * The reCAPTCHA widget is rendered as invisible — no user interaction required.
 */
export async function sendMFAPhoneCode(
  resolver: MultiFactorResolver,
  hintIndex: number,
  recaptchaContainerId: string,
): Promise<string> {
  const hint = resolver.hints[hintIndex]
  const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
    size: 'invisible',
  })
  const provider = new PhoneAuthProvider(auth)
  const verificationId = await provider.verifyPhoneNumber(
    { multiFactorHint: hint, session: resolver.session },
    recaptchaVerifier,
  )
  return verificationId
}

/**
 * Complete an MFA challenge using the Firebase MultiFactorResolver.
 *
 * Supports TOTP (e.g. Google Authenticator) and phone SMS factors:
 *  - TOTP: pass the 6-digit code from the authenticator app; phoneVerificationId is ignored.
 *  - Phone: pass the code from the SMS along with the verificationId from sendMFAPhoneCode().
 *
 * On success, Firebase resolves the underlying re-authentication — the caller may then
 * proceed with deleteAllUserData() and deleteUser().
 */
export async function completeMFAChallenge(
  resolver: MultiFactorResolver,
  hint: MultiFactorInfo,
  code: string,
  phoneVerificationId?: string,
): Promise<void> {
  if (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)
    await resolver.resolveSignIn(assertion)
  } else if (hint.factorId === 'phone') {
    if (!phoneVerificationId) {
      throw new Error('phoneVerificationId is required for phone MFA — call sendMFAPhoneCode() first')
    }
    const phoneCred = PhoneAuthProvider.credential(phoneVerificationId, code)
    const assertion = PhoneMultiFactorGenerator.assertion(phoneCred)
    await resolver.resolveSignIn(assertion)
  } else {
    throw new Error(`Unsupported MFA factor type: ${hint.factorId}`)
  }
}
