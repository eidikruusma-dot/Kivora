import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { FB_ERROR_KEY } from '@/lib/mobileAuth'

interface SocialButtonsProps {
  action: 'login' | 'register'
}

export default function SocialButtons({ action }: SocialButtonsProps) {
  const { signInWithGoogle, signInWithFacebook } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [error, setError] = useState('')
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingFacebook, setLoadingFacebook] = useState(false)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Pick up any error left by the Facebook redirect flow on Android Chrome.
  // AuthContext stores the raw error code in sessionStorage when the redirect
  // callback fails; we map it here and clear the key so it only shows once.
  useEffect(() => {
    const code = sessionStorage.getItem(FB_ERROR_KEY)
    if (code) {
      sessionStorage.removeItem(FB_ERROR_KEY)
      setError(mapFirebaseError({ code }))
    }
  }, [])

  const handleGoogle = async () => {
    setError('')
    setLoadingGoogle(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      // TODO: remove after auth confirmed working on kivora.ee
      console.error('[Auth] Google sign-in error:', err)
      setError(mapFirebaseError(err))
    } finally {
      setLoadingGoogle(false)
    }
  }

  const handleFacebook = async () => {
    setError('')
    setLoadingFacebook(true)
    try {
      await signInWithFacebook()
    } catch (err) {
      // TODO: remove after auth confirmed working on kivora.ee
      console.error('[Auth] Facebook sign-in error:', err)
      setError(mapFirebaseError(err))
    } finally {
      setLoadingFacebook(false)
    }
  }

  const anyLoading = loadingGoogle || loadingFacebook
  const loadingText = t('social.loading', lang)

  return (
    <div className="space-y-2.5">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Google */}
      <button
        onClick={handleGoogle}
        disabled={anyLoading}
        className="w-full h-[52px] rounded-xl bg-white border border-[#E8E6E0] text-sm font-medium text-[#1A1F36] flex items-center justify-center gap-2.5 hover:bg-[#F8F7F4] hover:border-[#D4D0CB] hover:shadow-sm transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {loadingGoogle ? loadingText : t('social.google', lang)}
      </button>

      {/* Facebook — temporarily hidden pending mobile OAuth redirect diagnostics.
           All provider config, Firebase settings, and handler code are intact.
           Re-enable by removing the enclosing false && block. */}
      {false && (
        <button
          onClick={handleFacebook}
          disabled={anyLoading}
          className="w-full h-[52px] rounded-xl bg-white border border-[#E8E6E0] text-sm font-medium text-[#1A1F36] flex items-center justify-center gap-2.5 hover:bg-[#F8F7F4] hover:border-[#D4D0CB] hover:shadow-sm transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
        >
          {/* Facebook brand icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="4" fill="#1877F2"/>
            <path d="M16.5 12H14V10.5C14 9.95 14.45 9.5 15 9.5H16.5V7H14.5C12.84 7 11.5 8.34 11.5 10V12H9.5V14.5H11.5V22H14V14.5H16L16.5 12Z" fill="white"/>
          </svg>
          {loadingFacebook ? loadingText : t('social.facebook', lang)}
        </button>
      )}
    </div>
  )
}
