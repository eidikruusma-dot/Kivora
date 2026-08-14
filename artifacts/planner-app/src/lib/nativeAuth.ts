/**
 * Native social authentication for Capacitor Android.
 *
 * On native Android the standard Firebase signInWithPopup / signInWithRedirect
 * flows don't work inside a WebView.  Instead we call the device-native SDKs
 * (Google Sign-In, Facebook SDK) to obtain an OAuth token, then exchange that
 * token for a Firebase credential via signInWithCredential — giving exactly the
 * same Firebase Auth session as the web flow.
 *
 * On web (kivora.ee) this module is imported but the helpers are never called;
 * AuthContext guards every call behind `isNativePlatform`.
 */

import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { FacebookLogin } from '@capacitor-community/facebook-login'
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithCredential,
} from 'firebase/auth'
import { auth } from './firebase'

/** True when running inside the Capacitor Android (or iOS) shell. */
export const isNativePlatform: boolean = Capacitor.isNativePlatform()

/**
 * Native Google Sign-In.
 *
 * The plugin reads its serverClientId from capacitor.config.ts (GoogleAuth →
 * serverClientId).  The returned ID token is exchanged for a Firebase
 * credential via GoogleAuthProvider.credential so the session is identical to
 * the web OAuth flow.
 *
 * Prerequisites (see NATIVE_AUTH_SETUP.md):
 *   • google-services.json placed in android/app/
 *   • SHA-1 of the signing key registered in Firebase Console
 *   • GoogleAuth.serverClientId set in capacitor.config.ts
 */
export async function nativeSignInWithGoogle(): Promise<void> {
  const googleUser = await GoogleAuth.signIn()
  const idToken = googleUser.authentication?.idToken
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token. ' +
      'Make sure google-services.json is in android/app/ and the ' +
      'Web Client ID is set in capacitor.config.ts → GoogleAuth.serverClientId.')
  }
  const credential = GoogleAuthProvider.credential(idToken)
  await signInWithCredential(auth, credential)
}

/**
 * Native Facebook Login.
 *
 * The Facebook SDK returns an access token which is exchanged for a Firebase
 * credential via FacebookAuthProvider.credential.
 *
 * Prerequisites (see NATIVE_AUTH_SETUP.md):
 *   • facebook_app_id and facebook_client_token set in strings.xml
 *   • FacebookActivity + CustomTabActivity in AndroidManifest.xml
 *   • Your app's package name and key hash registered in the Facebook
 *     Developer Console (App Settings → Basic → Android)
 */
export async function nativeSignInWithFacebook(): Promise<void> {
  const result = await FacebookLogin.login({ permissions: ['email', 'public_profile'] })
  const token = result.accessToken?.token
  if (!token) {
    throw new Error('Facebook login cancelled or access token missing.')
  }
  const credential = FacebookAuthProvider.credential(token)
  await signInWithCredential(auth, credential)
}
