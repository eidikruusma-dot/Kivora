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
 */

import {
  collection,
  doc,
  getDocs,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
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
import { db, auth } from '@/lib/firebase'
import { deleteBackup } from '@/lib/backupService'

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
  await deleteCollection(uid, 'habits')          // usually empty — in-memory store
  await deleteCollection(uid, 'goals')
  await deleteCollection(uid, 'schoolItems')
  await deleteAIConversations(uid)               // handles nested messages
  await deleteCollection(uid, 'notifications')
  await deleteCollection(uid, 'settings')
  await deleteCollection(uid, 'entityLinks')
  await deleteAllBackups(uid)                    // handles nested chunks
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
