import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import LanguageToggle from '@/components/layout/LanguageToggle'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// This page deliberately does NOT use the shared AuthShell/AuthInput/
// AuthButton components — those are also used by Login, ForgotPassword,
// ResetPassword and VerifyEmail, which this redesign must not affect.
// Everything visual here is local to this file; all auth logic
// (validation order/messages, signUp call, error mapping) is unchanged
// from the previous version of this page.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shared glass-card look for both the form and the success state.
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

export default function Register() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError(t('reg.error.required', lang)); return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('reg.error.email', lang)); return
    }
    if (password !== confirm) {
      setError(t('reg.error.mismatch', lang)); return
    }
    if (password.length < 8) {
      setError(t('reg.error.weak', lang)); return
    }
    if (!agree) {
      setError(t('reg.error.terms', lang)); return
    }

    setLoading(true)
    try {
      await signUp(name.trim(), email.trim(), password)
      setSuccess(true)
    } catch (err) {
      setError(mapFirebaseError(err))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (hasToggle = false) =>
    `w-full h-[46px] ${hasToggle ? 'pl-4 pr-11' : 'px-4'} text-sm bg-white/60 border border-[#E4DEFB] rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors`

  if (success) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-4 py-10 sm:py-14">
        <AuroraBackground />
        <div className="relative z-[1] w-full max-w-[460px]">
          <Header lang={lang} />
          <div className={`${CARD} text-center`}>
            <div className="w-14 h-14 rounded-full bg-[#2FBE8F]/10 flex items-center justify-center mx-auto mb-5">
              <Check size={26} className="text-[#2FBE8F]" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-2">{t('reg.success.title', lang)}</h1>
            <p className="text-sm text-[#6B6485] mb-6">{t('reg.success.subtitle', lang)}</p>
            <div className="px-4 py-3 rounded-2xl bg-[#2FBE8F]/10 border border-[#2FBE8F]/20 text-sm text-[#1A7A5C] whitespace-pre-line text-left mb-6">
              {t('reg.success.body', lang)}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="kv-aurora-glow w-full h-[48px] rounded-full text-[15px] font-bold text-white bg-gradient-to-br from-[#A78BFA] to-[#6D28D9] flex items-center justify-center gap-2"
            >
              {t('reg.success.goLogin', lang)}
              <ArrowRight size={16} />
            </button>
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
            {t('reg.title', lang)}
          </h1>
          <p className="text-sm text-[#6B6485] mb-6 sm:mb-7">
            {t('reg.subtitle', lang)}
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reg.name', lang)}</label>
              <input
                type="text"
                placeholder={t('reg.namePlaceholder', lang)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass()}
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reg.email', lang)}</label>
              <input
                type="email"
                placeholder="sinu@email.ee"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass()}
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reg.password', lang)}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={inputClass(true)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t(showPassword ? 'reg.hidePassword' : 'reg.showPassword', lang)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A94B8] hover:text-[#6D28D9] transition-colors"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className="text-[11.5px] text-[#9A94B8] mt-1.5">{t('reg.passwordHint', lang)}</p>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">{t('reg.confirmPassword', lang)}</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={inputClass(true)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={t(showConfirm ? 'reg.hidePassword' : 'reg.showPassword', lang)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A94B8] hover:text-[#6D28D9] transition-colors"
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {/* Live, non-blocking hint only — the actual mismatch check
                  that blocks submission still runs in handleSubmit above,
                  unchanged. */}
              {confirm.length > 0 && (
                password === confirm ? (
                  <p className="text-[11.5px] text-[#2FBE8F] mt-1.5 flex items-center gap-1">
                    <Check size={12} strokeWidth={3} /> {t('reg.passwordMatch', lang)}
                  </p>
                ) : (
                  <p className="text-[11.5px] text-red-500 mt-1.5">{t('reg.error.mismatch', lang)}</p>
                )
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-2 select-none">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[#D4CCF5] text-[#6D28D9] focus:ring-[#6D28D9] cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-[#6B6485] leading-snug">
                {t('reg.agree', lang)}
                <Link to="/terms" className="text-[#6D28D9] font-semibold hover:underline">{t('reg.terms', lang)}</Link>
                {t('reg.and', lang)}
                <Link to="/privacy" className="text-[#6D28D9] font-semibold hover:underline">{t('reg.privacy', lang)}</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={!agree || loading}
              className={`w-full h-[48px] mt-1 rounded-full text-[15px] font-bold text-white flex items-center justify-center gap-2 transition-opacity ${
                agree && !loading
                  ? 'kv-aurora-glow bg-gradient-to-br from-[#A78BFA] to-[#6D28D9]'
                  : 'bg-[#CBBEF2] cursor-not-allowed'
              }`}
            >
              {loading ? t('reg.loading', lang) : (<>{t('reg.submit', lang)}<ArrowRight size={16} /></>)}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 sm:my-6">
            <div className="flex-1 h-px bg-[#E4DEFB]" />
            <span className="text-xs text-[#9A94B8]">{t('pub.or', lang)}</span>
            <div className="flex-1 h-px bg-[#E4DEFB]" />
          </div>

          <SocialButtons action="register" />
        </div>

        <p className="text-center mt-6 text-sm text-[#4A4F6A]">
          {t('reg.hasAccount', lang)}
          <Link to="/login" className="text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors">{t('reg.login', lang)}</Link>
        </p>
      </div>
    </div>
  )
}
