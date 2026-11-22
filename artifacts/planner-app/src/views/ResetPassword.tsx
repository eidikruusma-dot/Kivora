import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, MailWarning, Loader2, ArrowRight } from 'lucide-react'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import LanguageToggle from '@/components/layout/LanguageToggle'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// This page deliberately does NOT use the shared AuthShell/AuthInput/
// AuthButton components — those are also used by VerifyEmail, which
// this redesign must not affect. Everything visual here is local to
// this file (same small CARD/Header pattern as the already-approved
// Register.tsx/Login.tsx/ForgotPassword.tsx, duplicated rather than
// imported, so none of the four pages depends on another). All
// password-reset logic — the oobCode verification, confirmPasswordReset
// call, validation, the expired/success/loading states, the countdown
// redirect — is unchanged from the previous version of this page.

type Mode = 'loading' | 'valid' | 'expired' | 'success'

// Shared glass-card look, matching Register.tsx/Login.tsx/ForgotPassword.tsx.
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

function Page({ lang, children }: { lang: AppLang; children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-4 py-10 sm:py-14">
      <AuroraBackground />
      <div className="relative z-[1] w-full max-w-[460px]">
        <Header lang={lang} />
        {children}
      </div>
    </div>
  )
}

function ResetSuccess({ navigate, lang }: { navigate: (to: string) => void; lang: AppLang }) {
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(interval); navigate('/login'); return 0 }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <Page lang={lang}>
      <div className={`${CARD} text-center`}>
        <div className="w-14 h-14 rounded-full bg-[#2FBE8F]/10 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={26} className="text-[#2FBE8F]" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-1.5">{t('reset.success.title', lang)}</h1>
        <p className="text-sm font-semibold text-[#1A1F36] mb-2">
          {t('reset.success.changed', lang)}
        </p>
        <p className="text-xs text-[#9A94B8] mb-6">
          {t('reset.success.redirect', lang).replace('{n}', String(countdown))}
        </p>
        <button
          onClick={() => navigate('/login')}
          className="kv-aurora-glow w-full h-[48px] rounded-full text-[15px] font-bold text-white bg-gradient-to-br from-[#A78BFA] to-[#6D28D9] flex items-center justify-center gap-2"
        >
          {t('reset.success.goLogin', lang)}
          <ArrowRight size={16} />
        </button>
      </div>
    </Page>
  )
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [mode, setMode] = useState<Mode>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionCode, setActionCode] = useState('')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  useEffect(() => {
    const code = searchParams.get('oobCode') || ''
    if (!code) { setMode('expired'); return }
    setActionCode(code)
    verifyPasswordResetCode(auth, code)
      .then(() => setMode('valid'))
      .catch(() => setMode('expired'))
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setConfirmError('')
    if (password.length < 8) { setPasswordError(t('reset.error.length', lang)); return }
    if (password !== confirm) { setConfirmError(t('reset.error.mismatch', lang)); return }
    setSubmitting(true)
    try {
      await confirmPasswordReset(auth, actionCode, password)
      setMode('success')
    } catch {
      setMode('expired')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'loading') {
    return (
      <Page lang={lang}>
        <div className={`${CARD} text-center`}>
          <h1 className="text-xl font-extrabold tracking-tight text-[#1A1F36] mb-6">{t('reset.checking', lang)}</h1>
          <div className="flex justify-center pb-2">
            <Loader2 size={32} className="animate-spin text-[#6D28D9]" />
          </div>
        </div>
      </Page>
    )
  }

  if (mode === 'expired') {
    return (
      <Page lang={lang}>
        <div className={`${CARD} text-center`}>
          <div className="w-14 h-14 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mx-auto mb-5">
            <MailWarning size={26} className="text-[#F59E0B]" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-2">{t('reset.expired.title', lang)}</h1>
          <p className="text-sm text-[#6B6485] leading-relaxed mb-6">
            {t('reset.expired.body', lang)}
          </p>
          <Link
            to="/forgot-password"
            className="kv-aurora-glow w-full h-[48px] rounded-full text-[15px] font-bold text-white bg-gradient-to-br from-[#A78BFA] to-[#6D28D9] flex items-center justify-center gap-2"
          >
            {t('reset.expired.sendNew', lang)}
          </Link>
        </div>
        <p className="text-center mt-6 text-sm">
          <Link to="/login" className="text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors">
            {t('reset.backToLogin', lang)}
          </Link>
        </p>
      </Page>
    )
  }

  if (mode === 'success') {
    return <ResetSuccess navigate={navigate} lang={lang} />
  }

  return (
    <Page lang={lang}>
      <div className={CARD}>
        <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#1A1F36] mb-1.5">
          {t('reset.form.title', lang)}
        </h1>
        <p className="text-sm text-[#6B6485] mb-6 sm:mb-7">
          {t('reset.form.subtitle', lang)}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reset.form.newPassword', lang)}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full h-[46px] pl-4 pr-11 text-sm bg-white/60 border rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors ${
                  passwordError ? 'border-red-300 focus:border-red-400' : 'border-[#E4DEFB] focus:border-[#8B5CF6]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A94B8] hover:text-[#6D28D9] transition-colors"
                aria-label={showPassword ? t('reset.form.hidePassword', lang) : t('reset.form.showPassword', lang)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {passwordError && <p className="text-[11.5px] text-red-500 mt-1.5">{passwordError}</p>}
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reset.form.confirmPassword', lang)}</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={`w-full h-[46px] pl-4 pr-11 text-sm bg-white/60 border rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors ${
                  confirmError ? 'border-red-300 focus:border-red-400' : 'border-[#E4DEFB] focus:border-[#8B5CF6]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A94B8] hover:text-[#6D28D9] transition-colors"
                aria-label={showConfirm ? t('reset.form.hidePassword', lang) : t('reset.form.showPassword', lang)}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {confirmError && <p className="text-[11.5px] text-red-500 mt-1.5">{confirmError}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full h-[48px] mt-1 rounded-full text-[15px] font-bold text-white flex items-center justify-center gap-2 transition-opacity ${
              !submitting
                ? 'kv-aurora-glow bg-gradient-to-br from-[#A78BFA] to-[#6D28D9]'
                : 'bg-[#CBBEF2] cursor-not-allowed'
            }`}
          >
            {submitting ? t('reset.saving', lang) : t('reset.submit', lang)}
          </button>
        </form>
      </div>

      <p className="text-center mt-6 text-sm">
        <Link to="/login" className="text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors">
          {t('reset.backToLogin', lang)}
        </Link>
      </p>
    </Page>
  )
}
