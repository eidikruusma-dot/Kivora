import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck, ArrowLeft, ArrowRight } from 'lucide-react'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import LanguageToggle from '@/components/layout/LanguageToggle'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// This page deliberately does NOT use the shared AuthShell/AuthInput/
// AuthButton components — those are also used by ResetPassword and
// VerifyEmail, which this redesign must not affect. Everything visual
// here is local to this file (same small CARD/Header pattern as the
// already-approved Register.tsx/Login.tsx, duplicated rather than
// imported, so none of the three pages depends on another). All
// password-reset logic (validation, sendPasswordReset call, error
// mapping) is unchanged from the previous version of this page.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shared glass-card look, matching Register.tsx/Login.tsx exactly.
const CARD = 'rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_30px_70px_-30px_rgba(111,90,232,0.35)] px-6 py-8 sm:px-9 sm:py-10'

function Header({ lang }: { lang: AppLang }) {
  return (
    <div className="flex items-center justify-between mb-6 sm:mb-8">
      <Link to="/" className="inline-flex items-center">
        <KivoraLogo height={30} />
      </Link>
      <LanguageToggle />
    </div>
  )
}

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError(t('forgot.error.required', lang)); return }
    if (!EMAIL_RE.test(email.trim())) { setError(t('forgot.error.email', lang)); return }
    setLoading(true)
    try {
      await sendPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(mapFirebaseError(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-4 py-10 sm:py-14">
        <AuroraBackground />
        <div className="relative z-[1] w-full max-w-[460px]">
          <Header lang={lang} />
          <div className={`${CARD} text-center`}>
            <div className="w-14 h-14 rounded-full bg-[#8B5CF6]/10 flex items-center justify-center mx-auto mb-5">
              <MailCheck size={26} className="text-[#6D28D9]" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-2">{t('forgot.sent.title', lang)}</h1>
            <p className="text-sm text-[#6B6485] leading-relaxed mb-6">
              {t('forgot.sent.body', lang)}
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-[#6D28D9] hover:text-[#5B21B6] transition-colors"
            >
              <ArrowLeft size={15} />
              {t('forgot.backToLogin', lang)}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-4 py-10 sm:py-14">
      <AuroraBackground />

      <div className="relative z-[1] w-full max-w-[460px]">
        <Header lang={lang} />

        <div className={CARD}>
          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#1A1F36] mb-1.5">
            {t('forgot.title', lang)}
          </h1>
          <p className="text-sm text-[#6B6485] mb-6 sm:mb-7">
            {t('forgot.subtitle', lang)}
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('login.email', lang)}</label>
              <input
                type="email"
                placeholder="sinu@email.ee"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-[46px] px-4 text-sm bg-white/60 border border-[#E4DEFB] rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full h-[48px] mt-1 rounded-full text-[15px] font-bold text-white flex items-center justify-center gap-2 transition-opacity ${
                !loading
                  ? 'kv-aurora-glow bg-gradient-to-br from-[#A78BFA] to-[#6D28D9]'
                  : 'bg-[#CBBEF2] cursor-not-allowed'
              }`}
            >
              {loading ? t('forgot.loading', lang) : (<>{t('forgot.submit', lang)}<ArrowRight size={16} /></>)}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors"
          >
            <ArrowLeft size={15} />
            {t('forgot.backToLogin', lang)}
          </Link>
        </p>
      </div>
    </div>
  )
}
