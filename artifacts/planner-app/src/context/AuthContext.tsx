import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  type User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
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
import { ensureUserProfile } from '@/lib/userProfile'

interface AuthContextValue {
  user: User | null
  loading: boolean
  googleRedirectError: string | null
  clearGoogleRedirectError: () => void
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string, remember?: boolean) => Promise<User>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  sendVerificationEmail: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  reloadUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleRedirectError, setGoogleRedirectError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) {
        ensureUserProfile(u).catch(() => {
          // Silently fail — profile creation will retry on next login
        })
      }
    })
    return unsub
  }, [])

  // Handle Google redirect result — process success and surface errors
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // onAuthStateChanged will pick up the user; nothing else needed
        }
      })
      .catch((err) => {
        setGoogleRedirectError(err?.code || 'redirect-error')
      })
  }, [])

  const clearGoogleRedirectError = useCallback(() => {
    setGoogleRedirectError(null)
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
    const provider = new GoogleAuthProvider()
    // Mobile: use redirect (popup is unreliable on mobile browsers)
    if (isMobile()) {
      await signInWithRedirect(auth, provider)
      return
    }
    // Desktop: popup only — no redirect fallback (redirect fails in Bolt iframe)
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
        googleRedirectError,
        clearGoogleRedirectError,
        signUp,
        signIn,
        signInWithGoogle,
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
