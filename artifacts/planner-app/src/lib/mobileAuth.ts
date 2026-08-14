/**
 * Mobile-browser auth bypass for Android Chrome.
 *
 * Problem: Firebase's signInWithPopup uses a hidden cross-origin GAPI iframe at
 * firebaseapp.com/__/auth/iframe embedded inside kivora.ee. After OAuth the popup
 * writes its auth result to unpartitioned firebaseapp.com localStorage. The iframe
 * sits in a partitioned storage context keyed to (kivora.ee, firebaseapp.com) — a
 * separate partition — so the event never arrives. The popup closes and Firebase
 * throws auth/popup-closed-by-user after 8 s.
 *
 * Fix: on Android Chrome, bypass the GAPI iframe entirely by obtaining tokens
 * directly from the provider SDK and exchanging them via signInWithCredential.
 *
 * Required env vars (set as Replit Secrets / VITE_ prefix so Vite exposes them):
 *   VITE_GOOGLE_WEB_CLIENT_ID  — Firebase Console → Auth → Google → Web client ID
 *   VITE_FACEBOOK_APP_ID       — Facebook Developer Console → numeric App ID
 */

import {
  signInWithCredential,
  GoogleAuthProvider,
  FacebookAuthProvider,
  type Auth,
  type UserCredential,
} from 'firebase/auth'

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Returns true for Android Chrome (non-WebView).
 * WebView is detected by 'wv' or 'Version/' in the UA; those are the Capacitor
 * native WebView and should use nativeAuth.ts instead.
 */
export function isAndroidChrome(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /android/i.test(ua) &&
    /chrome/i.test(ua) &&
    !/wv\b/i.test(ua) &&
    !/Version\//i.test(ua)
  )
}

// ─── Type declarations for dynamically-loaded SDKs ───────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: {
              access_token?: string
              error?: string
              error_description?: string
            }) => void
          }): { requestAccessToken(options?: { prompt?: string }): void }
        }
      }
    }
    FB?: {
      init(options: {
        appId: string
        version: string
        xfbml?: boolean
        cookie?: boolean
      }): void
      login(
        callback: (response: {
          authResponse?: { accessToken: string }
          status: string
        }) => void,
        options?: { scope: string },
      ): void
    }
    fbAsyncInit?: () => void
  }
}

// ─── Google via Google Identity Services (GIS) ────────────────────────────────

let gisLoading: Promise<void> | null = null

function loadGIS(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Ei \u00F5nnestunud Google\u2019i autentimisteeki laadida.'))
    document.head.appendChild(script)
  })
  return gisLoading
}

/**
 * Sign in with Google on Android Chrome using GIS token client.
 * Opens Google's own OAuth picker — no Firebase GAPI iframe involved.
 */
export async function mobileSignInWithGoogle(auth: Auth): Promise<UserCredential> {
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined
  if (!clientId) {
    throw Object.assign(
      new Error('VITE_GOOGLE_WEB_CLIENT_ID pole seadistatud.'),
      { code: 'auth/configuration-not-found' },
    )
  }

  await loadGIS()

  return new Promise<UserCredential>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (response) => {
        if (!response.access_token) {
          const msg = response.error_description ?? response.error ?? 'Tundmatu viga'
          // User cancelled → behave like popup-closed-by-user
          const code = response.error === 'access_denied' ? 'auth/popup-closed-by-user' : 'auth/internal-error'
          reject(Object.assign(new Error(msg), { code }))
          return
        }
        try {
          const credential = GoogleAuthProvider.credential(null, response.access_token)
          resolve(await signInWithCredential(auth, credential))
        } catch (err) {
          reject(err)
        }
      },
    })
    client.requestAccessToken({ prompt: 'select_account' })
  })
}

// ─── Facebook via OAuth redirect (Android Chrome) ─────────────────────────────
//
// Why not FB.login()? FB.login() opens a popup/new tab and communicates the
// result back via window.opener.postMessage(). Android Chrome's tab model
// restricts window.opener across origins — the callback receives
// { status: 'unknown', authResponse: undefined } or is never invoked.
//
// Fix: redirect the current tab to Facebook's OAuth dialog and let Facebook
// redirect back to the app URL with #access_token= in the fragment. No popup,
// no window.opener, no cross-origin communication channel needed.
//
// REQUIRED: add https://kivora.ee/ to Facebook App → Valid OAuth Redirect URIs.
// The existing https://kivora-f1281.firebaseapp.com/__/auth/handler entry stays
// for desktop signInWithPopup.

/** sessionStorage keys — exported so AuthContext and SocialButtons can share them. */
export const FB_STATE_KEY = 'fb_oauth_state'
export const FB_ERROR_KEY = 'fb_oauth_error'

/**
 * Redirects the current tab to Facebook's OAuth dialog (mobile-only path).
 * Stores a CSRF state token in sessionStorage before leaving.
 * Facebook returns to https://kivora.ee/#access_token=...&state=...
 * Call parseFacebookCallback() on the next page load to complete sign-in.
 */
export function initiateFacebookRedirect(): void {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined
  if (!appId) {
    throw Object.assign(
      new Error('VITE_FACEBOOK_APP_ID pole seadistatud.'),
      { code: 'auth/configuration-not-found' },
    )
  }

  // CSRF protection
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  sessionStorage.setItem(FB_STATE_KEY, state)

  // Redirect URI must exactly match an entry in Facebook App → Valid OAuth
  // Redirect URIs. Use the app origin root (https://kivora.ee/).
  const redirectUri = `${window.location.origin}/`

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'email,public_profile',
    state,
    response_type: 'token',
    display: 'touch', // mobile-optimised view
  })

  // Assign synchronously; page navigation starts immediately.
  window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?${params}`
}

/**
 * Inspects the current URL for a Facebook OAuth redirect callback.
 * Returns { accessToken } on success, { errorCode } on failure, or null if
 * there is no pending Facebook auth (no FB_STATE_KEY in sessionStorage).
 *
 * Always cleans up sessionStorage and the URL fragment/query string when a
 * callback is detected so the result is never processed twice.
 */
export function parseFacebookCallback():
  | { accessToken: string; errorCode?: never }
  | { errorCode: string; accessToken?: never }
  | null {
  const storedState = sessionStorage.getItem(FB_STATE_KEY)

  // TODO: remove after Facebook auth confirmed working on kivora.ee
  console.log('[FB parseCb] storedState:', storedState ? 'present' : 'absent')
  console.log('[FB parseCb] hash:', window.location.hash.slice(0, 120) || '(empty)')
  console.log('[FB parseCb] search:', window.location.search.slice(0, 120) || '(empty)')

  // No pending auth → nothing to process.
  if (!storedState) return null

  // ── Success: access_token in URL fragment ────────────────────────────────
  const hash = window.location.hash
  if (hash.startsWith('#') && hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    const returnedState = params.get('state')

    // TODO: remove after Facebook auth confirmed working on kivora.ee
    console.log('[FB parseCb] token present:', !!accessToken)
    console.log('[FB parseCb] state match:', returnedState === storedState)

    // Clear state key now that we've extracted what we need.
    sessionStorage.removeItem(FB_STATE_KEY)
    // Remove token from URL so a reload doesn't reprocess it.
    window.history.replaceState({}, '', window.location.pathname + window.location.search)

    if (!accessToken) return { errorCode: 'auth/internal-error' }
    if (returnedState !== storedState) {
      // State mismatch → CSRF or stale redirect; treat as internal error.
      return { errorCode: 'auth/internal-error' }
    }

    return { accessToken }
  }

  // ── Failure: Facebook returns error params in query string ───────────────
  const search = window.location.search
  if (search.includes('error=')) {
    const params = new URLSearchParams(search.slice(1))
    const error = params.get('error')
    const returnedState = params.get('state')

    // Only claim this callback if the state token matches our pending auth.
    if (!error || returnedState !== storedState) return null

    // TODO: remove after Facebook auth confirmed working on kivora.ee
    console.log('[FB parseCb] Facebook error code:', error)

    sessionStorage.removeItem(FB_STATE_KEY)
    window.history.replaceState({}, '', window.location.pathname)

    // access_denied means the user pressed Cancel on Facebook.
    return { errorCode: error === 'access_denied' ? 'auth/popup-closed-by-user' : 'auth/internal-error' }
  }

  // TODO: remove after Facebook auth confirmed working on kivora.ee
  console.log('[FB parseCb] no matching callback pattern found in URL')

  // Nothing in the URL matches a Facebook callback.
  return null
}

/**
 * Completes Facebook sign-in after a redirect callback.
 * Call this when parseFacebookCallback() returns { accessToken }.
 */
export async function completeFacebookRedirect(
  auth: Auth,
  accessToken: string,
): Promise<UserCredential> {
  const credential = FacebookAuthProvider.credential(accessToken)
  return signInWithCredential(auth, credential)
}
