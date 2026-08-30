/**
 * ownerClaimCheck.ts
 *
 * TEMPORARY, manually-invoked, dev/owner-only diagnostic — same
 * "expose a window global for deliberate console use" pattern as
 * buildInfo.ts and legacySubjectCleanup.ts, not a permanent surface.
 *
 * Purpose: after granting the `owner` Firebase Auth custom claim to the
 * production owner account (see api-server's grantOwnerRole.ts) and
 * refreshing the signed-in session, this is the smallest way to confirm
 * the refreshed ID token actually carries `owner: true` — without ever
 * printing the raw token, without a permanent admin/debug HTTP endpoint,
 * and without hardcoding any email/UID (it only ever inspects whichever
 * account happens to be signed in when it's called).
 *
 * Reuses the existing modular Firebase Auth instance (`auth` from
 * @/lib/firebase) and the standard modular `getIdTokenResult` function —
 * no new Firebase app, no new auth architecture.
 *
 * Usage from the browser console, while signed in as the account being
 * checked:
 *
 *   window.__KIVORA_CHECK_OWNER_CLAIM__()
 *     — forces a fresh ID token (getIdTokenResult(..., true) — the same
 *       force-refresh a logout/login would produce), then logs and
 *       returns ONLY the parsed `owner` boolean claim. Never logs or
 *       returns the raw token string, the uid, the email, or any other
 *       claim. Resolves to `null` (with a console warning, never a
 *       thrown error) if nobody is signed in.
 *
 * Safe to remove later: delete this file and its one import in main.tsx.
 * Should be removed once the owner grant has been confirmed via this
 * check — it exists solely to close that one verification loop.
 */

import { getIdTokenResult } from 'firebase/auth'
import { auth } from '@/lib/firebase'

async function checkOwnerClaimForConsole(): Promise<boolean | null> {
  const user = auth.currentUser
  if (!user) {
    console.log('[Kivora] No signed-in user — sign in first, then run this again.')
    return null
  }

  const result = await getIdTokenResult(user, /* forceRefresh */ true)
  const owner = result.claims['owner'] === true

  console.log(`[Kivora] owner claim on the current (freshly refreshed) ID token: ${owner}`)
  return owner
}

if (typeof window !== 'undefined') {
  ;(window as typeof window & {
    __KIVORA_CHECK_OWNER_CLAIM__?: typeof checkOwnerClaimForConsole
  }).__KIVORA_CHECK_OWNER_CLAIM__ = checkOwnerClaimForConsole
}
