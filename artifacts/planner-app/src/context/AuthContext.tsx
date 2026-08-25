import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  type User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  reload,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { isNativePlatform, nativeSignInWithGoogle, nativeSignInWithFacebook } from '@/lib/nativeAuth'
import {
  isAndroidChrome,
  mobileSignInWithGoogle,
  initiateFacebookRedirect,
  parseFacebookCallback,
  completeFacebookRedirect,
  FB_ERROR_KEY,
} from '@/lib/mobileAuth'
import { ensureUserProfile } from '@/lib/userProfile'
import { initTasksStore } from '@/lib/tasksStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initAIConversationsStore } from '@/lib/aiConversationsStore'
import { initSchoolStore } from '@/lib/schoolStore'
import { initNotificationItemsStore } from '@/lib/notificationItemsStore'
import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initMoneyStore } from '@/lib/moneyStore'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import { initModulesStore } from '@/lib/modulesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initDocumentsStore } from '@/lib/documentsStore'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string, remember?: boolean) => Promise<User>
  signInWithGoogle: () => Promise<void>
  signInWithFacebook: () => Promise<void>
  logout: () => Promise<void>
  sendVerificationEmail: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  reloadUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ── Facebook OAuth redirect callback (Android Chrome mobile flow) ──────
    // After initiateFacebookRedirect() sends the user to Facebook and Facebook
    // redirects them back, parseFacebookCallback() finds the access_token in
    // the URL fragment (success) or an error code in the query string (failure).
    const fbResult = parseFacebookCallback()

    // TODO: remove after Facebook auth confirmed working on kivora.ee
    console.log('[FB authCtx] parseFacebookCallback:', fbResult
      ? JSON.stringify({ hasToken: !!fbResult.accessToken, errorCode: fbResult.errorCode })
      : 'null')

    // When there is an access token to exchange, we must suppress the initial
    // null from onAuthStateChanged. Firebase fires that callback synchronously
    // the moment onAuthStateChanged is registered — before signInWithCredential
    // has a chance to run. If we let it through, loading becomes false with
    // user=null and the landing page renders logged-out even though sign-in
    // is still in progress.
    //
    // The guard below skips any null callbacks until the credential exchange
    // completes. The next callback will carry the authenticated user (success)
    // or we manually release loading after the catch (failure).
    let awaitingFbCredential = !!fbResult?.accessToken

    // ── Firebase auth state ────────────────────────────────────────────────
    const unsub = onAuthStateChanged(auth, (u) => {
      // Suppress the synchronous null fired before signInWithCredential resolves.
      if (awaitingFbCredential && u === null) return

      setUser(u)
      setLoading(false)
      // Initialise (or teardown) all Firestore listeners for this user.
      const uid = u?.uid ?? null
      initTasksStore(uid)
      initGoalsStore(uid)
      initCalendarStore(uid)
      initNotesStore(uid)
      initAIConversationsStore(uid)
      initSchoolStore(uid)
      initNotificationItemsStore(uid)
      initEntityLinksStore(uid)
      if (MONEY_MODULE_ENABLED) initMoneyStore(uid)
      initModulesStore(uid)
      initHabitsStore(uid)
      initDocumentsStore(uid)
      if (u) {
        ensureUserProfile(u).catch(() => {
          // Silently fail — profile creation will retry on next login
        })
      }
    })

    if (fbResult?.accessToken) {
      // TODO: remove after Facebook auth confirmed working on kivora.ee
      console.log('[FB authCtx] calling signInWithCredential …')

      completeFacebookRedirect(auth, fbResult.accessToken)
        .then(() => {
          // TODO: remove after Facebook auth confirmed working on kivora.ee
          console.log('[FB authCtx] signInWithCredential succeeded; navigating to /app')
          // Firebase persists the session; a full-page navigation to /app lets
          // ProtectedRoute verify the persisted user on the new load.
          // Landing.tsx has no auth-aware redirect, so we must navigate here.
          window.location.replace('/app')
        })
        .catch((err) => {
          // TODO: remove after Facebook auth confirmed working on kivora.ee
          console.error('[FB authCtx] signInWithCredential failed:', err)

          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? String((err as { code: string }).code)
              : 'auth/internal-error'

          // Store error for SocialButtons on the login page to display.
          sessionStorage.setItem(FB_ERROR_KEY, code)
          // Navigate to login so the error is actually shown.
          window.location.replace('/login')
        })
        .finally(() => {
          awaitingFbCredential = false
          // Safety net: if neither .then() nor .catch() unblocked loading
          // (e.g. the page navigated away), ensure loading never stays true
          // forever on a component that is still mounted.
          if (!auth.currentUser) {
            setUser(null)
            setLoading(false)
          }
        })
    } else if (fbResult?.errorCode) {
      // Facebook returned an error before we even had a token (e.g. user
      // pressed Cancel on the Facebook consent screen).
      // Store for SocialButtons and send the user to the login page.
      sessionStorage.setItem(FB_ERROR_KEY, fbResult.errorCode ?? 'auth/internal-error')
      window.location.replace('/login')
    }

    return unsub
  }, [])


  const signUp = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name) {
      await updateProfile(cred.user, { displayName: name })
    }
    await sendEmailVerification(cred.user)
    await signOut(auth)
  }

  const signIn = async (email: string, password: string, remember = false) => {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return cred.user
  }

  const signInWithGoogle = async () => {
    // Native Capacitor Android: use device-native Google Sign-In SDK.
    if (isNativePlatform) {
      await nativeSignInWithGoogle()
      return
    }
    // Android Chrome web: Firebase's browserPopupRedirectResolver relays auth
    // events via a hidden cross-origin GAPI iframe (firebaseapp.com/__/auth/iframe
    // embedded in kivora.ee). Chrome's cross-site storage partitioning isolates
    // that iframe's localStorage from the popup's unpartitioned storage, so the
    // auth event never arrives → auth/popup-closed-by-user after 8 s.
    // Fix: bypass the GAPI iframe entirely using Google Identity Services (GIS)
    // token client + signInWithCredential.
    if (isAndroidChrome()) {
      await mobileSignInWithGoogle(auth)
      return
    }
    // Desktop / other browsers: standard popup (GAPI iframe storage works).
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const signInWithFacebook = async () => {
    // Native Capacitor Android: use device-native Facebook SDK.
    if (isNativePlatform) {
      await nativeSignInWithFacebook()
      return
    }
    // Android Chrome web: FB.login() uses window.open() + window.opener.postMessage()
    // to return the auth result. Android Chrome's tab model restricts window.opener
    // across origins; the callback fires with { status: 'unknown', authResponse: null }
    // or is never invoked at all.
    // Fix: redirect the current tab to Facebook's OAuth dialog (response_type=token,
    // display=touch). Facebook redirects back with #access_token= in the URL fragment.
    // The AuthProvider useEffect detects this on the next load and calls
    // completeFacebookRedirect() → signInWithCredential(). No popup needed.
    if (isAndroidChrome()) {
      initiateFacebookRedirect() // sets window.location.href; page navigates away
      return
    }
    // Desktop / other browsers: standard popup.
    const provider = new FacebookAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const logout = async () => {
    await signOut(auth)
  }

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser)
    }
  }

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const reloadUser = async () => {
    if (auth.currentUser) {
      setUser({ ...auth.currentUser })
      try {
        await reload(auth.currentUser)
        setUser({ ...auth.currentUser })
      } catch {
        // State already updated from in-memory user object
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signInWithFacebook,
        logout,
        sendVerificationEmail,
        sendPasswordReset,
        reloadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
