import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  type Auth,
} from 'firebase/auth'
import { firebaseConfig } from '@/lib/firebase'

/**
 * Resending a "please verify your email" email for an account the visitor
 * is NOT currently signed in as (the normal post-signup/failed-login case)
 * needs a momentary, real sign-in — Firebase's client SDK can only call
 * `sendEmailVerification()` on a genuinely authenticated `User`, there is
 * no way to do it for a signed-out visitor.
 *
 * That momentary sign-in deliberately does NOT happen on the app's main
 * `auth` instance (src/lib/firebase.ts). Doing it there would fire the
 * shared `onAuthStateChanged` listener in AuthContext.tsx — which drives
 * `ProtectedRoute`, `PublicOnlyRoute`, and (re)initializes every Firestore
 * data store for whatever uid that listener sees — for a throwaway
 * credential check that has nothing to do with the rest of the app's
 * session. Routing it through a second, uniquely-named Firebase App/Auth
 * instance instead means this never touches the main `user` state at all:
 * it is architecturally impossible for this to grant even momentary access
 * to any protected view, rather than relying on ProtectedRoute's reactive
 * re-check to catch it after the fact.
 */
const SECONDARY_APP_NAME = 'kivora-verification-resend'

function getSecondaryAuth(): Auth {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME)
  const secondaryApp: FirebaseApp = existing ?? initializeApp(firebaseConfig, SECONDARY_APP_NAME)
  return getAuth(secondaryApp)
}

export type ResendVerificationResult = 'sent' | 'already-verified'

/**
 * Re-authenticates on the isolated secondary instance, sends a fresh
 * verification email if needed, then ALWAYS signs that secondary instance
 * back out — success, "already verified", or failure alike — so no
 * session (verified or not) is ever left behind anywhere.
 *
 * Throws the original FirebaseError on any failure (wrong/changed
 * password, rate-limited, network error, or — if the account has since
 * enrolled MFA — `auth/multi-factor-auth-required`). That last case is
 * deliberately NOT handled by completing a second-factor challenge here;
 * resending a verification email isn't worth that much extra flow, and
 * doing so would require surfacing a full MFA resolver UI just for this.
 * The caller shows a dedicated message for that one code instead. When it
 * is thrown, Firebase has not created a signed-in session on the
 * secondary instance at all (the credential exchange never completed),
 * so there is nothing to sign out of.
 */
export async function resendVerificationEmail(
  email: string,
  password: string
): Promise<ResendVerificationResult> {
  const secondaryAuth = getSecondaryAuth()
  const cred = await signInWithEmailAndPassword(secondaryAuth, email, password)
  try {
    if (cred.user.emailVerified) {
      return 'already-verified'
    }
    await sendEmailVerification(cred.user)
    return 'sent'
  } finally {
    await signOut(secondaryAuth).catch(() => {
      // Best-effort — the secondary instance's session is short-lived and
      // isolated from the rest of the app either way.
    })
  }
}
