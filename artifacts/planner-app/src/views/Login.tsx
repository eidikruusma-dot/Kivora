import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Smartphone, MessageSquare, Loader2 } from 'lucide-react'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import LanguageToggle from '@/components/layout/LanguageToggle'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { auth } from '@/lib/firebase'
import { resendVerificationEmail } from '@/lib/verificationResend'
import {
  signOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from 'firebase/auth'
import type {
  MultiFactorError,
  MultiFactorResolver,
  PhoneMultiFactorInfo,
} from 'firebase/auth'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// This page deliberately does NOT use the shared AuthShell/AuthInput/
// AuthButton components — those are also used by ForgotPassword,
// ResetPassword and VerifyEmail, which this redesign must not affect.
// Everything visual here is local to this file (same small CARD/Header
// pattern as the already-approved Register.tsx, duplicated rather than
// imported, so neither page depends on the other). All MFA logic —
// TOTP, SMS, the resolver flow, the reCAPTCHA container — is unchanged
// from the previous version of this page; only the markup/styling of
// each screen changed.

// MFA step in the login flow
type MfaMode = 'totp' | 'sms-sending' | 'sms-code' | 'choose' | null

// Shared glass-card look, matching Register.tsx exactly.
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

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Resend verification email (shown under the "not verified" error) ───
  // Reached from all 3 unverified-email branches below (regular submit,
  // TOTP verify, SMS verify) — each resets mfaMode to null and sets the
  // same `error` string, so a single resend UI under the error banner
  // covers every entry point.
  const [resendState, setResendState] = useState<
    'idle' | 'sending' | 'sent' | 'already-verified' | 'mfa-required' | 'error'
  >('idle')
  const [resendError, setResendError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // ── MFA step state ─────────────────────────────────────────────────────
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null)
  const [mfaMode, setMfaMode] = useState<MfaMode>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSmsVerificationId, setMfaSmsVerificationId] = useState('')
  const [mfaSmsPhoneHint, setMfaSmsPhoneHint] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const loginRecaptchaRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Countdown tick for the resend cooldown — self-cleaning: each tick's
  // cleanup clears the previous timeout, and unmounting clears the last one.
  useEffect(() => {
    if (resendCooldown === 0) return
    const timer = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  // ── Resend verification email ─────────────────────────────────────────
  // Re-authenticates on an isolated secondary Firebase instance (see
  // verificationResend.ts) using the email/password already entered on
  // this screen — never a new sign-in on the app's main `auth`, so this
  // can never grant even momentary access to a protected view.
  const handleResend = async () => {
    if (resendState === 'sending' || resendCooldown > 0) return
    setResendState('sending')
    setResendError('')
    try {
      const result = await resendVerificationEmail(email, password)
      setResendState(result === 'already-verified' ? 'already-verified' : 'sent')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/multi-factor-auth-required') {
        setResendState('mfa-required')
      } else {
        setResendState('error')
        setResendError(mapFirebaseError(err))
      }
    } finally {
      setResendCooldown(30)
    }
  }

  // Clean up RecaptchaVerifier on unmount
  useEffect(() => {
    return () => {
      if (loginRecaptchaRef.current) {
        try { loginRecaptchaRef.current.clear() } catch { /* ignore */ }
      }
    }
  }, [])

  // ── Regular sign-in ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResendState('idle')
    setResendError('')
    setLoading(true)
    try {
      const fbUser = await signIn(email, password, remember)
      if (!fbUser.emailVerified) {
        await signOut(auth)
        setError(t('login.emailNotVerified', lang))
        return
      }
      navigate('/app')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err as MultiFactorError)
        setMfaResolver(resolver)
        const hasTOTP = resolver.hints.some(
          (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
        )
        const hasSMS = resolver.hints.some(
          (h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID
        )
        if (hasTOTP && hasSMS) {
          setMfaMode('choose')
        } else if (hasTOTP) {
          setMfaMode('totp')
        } else if (hasSMS) {
          // Auto-send SMS code (non-blocking — state updates propagate after)
          sendSmsCodeWithResolver(resolver)
        }
      } else {
        setError(mapFirebaseError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Send SMS verification code ────────────────────────────────────────
  const sendSmsCodeWithResolver = async (resolver: MultiFactorResolver) => {
    setMfaError('')
    setMfaLoading(true)
    setMfaMode('sms-sending')
    try {
      const smsHint = resolver.hints.find(
        (h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID
      ) as PhoneMultiFactorInfo | undefined
      if (!smsHint) throw new Error('No SMS hint')

      // Always clear any previous verifier before creating a new one.
      // clear() removes the widget from the DOM; the container div stays.
      if (loginRecaptchaRef.current) {
        try { loginRecaptchaRef.current.clear() } catch { /* ignore */ }
        loginRecaptchaRef.current = null
      }
      loginRecaptchaRef.current = new RecaptchaVerifier(
        auth,
        'sms-login-recaptcha',
        { size: 'invisible' }
      )

      // render() MUST be awaited before verifyPhoneNumber.
      // Firebase accesses the container element's .style inside render(); skipping
      // it causes "Cannot read properties of null (reading 'style')".
      await loginRecaptchaRef.current.render()

      const phoneProvider = new PhoneAuthProvider(auth)
      const verificationId = await phoneProvider.verifyPhoneNumber(
        { multiFactorHint: smsHint, session: resolver.session },
        loginRecaptchaRef.current
      )
      setMfaSmsVerificationId(verificationId)
      setMfaSmsPhoneHint(smsHint.phoneNumber ?? '')
      setMfaCode('')
      setMfaMode('sms-code')
    } catch (err: unknown) {
      if (import.meta.env.DEV) {
        const e = err as { code?: string; message?: string }
        console.error('[SMS login] Firebase error:', e.code, e.message)
      }
      // Clear the verifier on any failure so the next attempt starts clean.
      if (loginRecaptchaRef.current) {
        try { loginRecaptchaRef.current.clear() } catch { /* ignore */ }
        loginRecaptchaRef.current = null
      }
      const code = (err as { code?: string }).code
      if (code === 'auth/too-many-requests') {
        setMfaError(t('login.mfa.err.tooMany', lang))
      } else {
        setMfaError(t('login.mfa.err.failed', lang))
      }
      // Fall back to login form on hard failure
      setMfaMode(null)
      setMfaResolver(null)
    } finally {
      setMfaLoading(false)
    }
  }

  // ── Verify TOTP code ──────────────────────────────────────────────────
  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaResolver) return
    setMfaError('')
    setMfaLoading(true)
    try {
      const totpHint = mfaResolver.hints.find(
        (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
      )
      if (!totpHint) throw new Error('No TOTP factor enrolled')
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        totpHint.uid,
        mfaCode.trim()
      )
      const cred = await mfaResolver.resolveSignIn(assertion)
      if (!cred.user.emailVerified) {
        await signOut(auth)
        setMfaMode(null)
        setMfaResolver(null)
        setError(t('login.emailNotVerified', lang))
        setResendState('idle')
        setResendError('')
        return
      }
      navigate('/app')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (
        code === 'auth/invalid-verification-code' ||
        code === 'auth/totp-challenge-timeout' ||
        code === 'auth/code-expired'
      ) {
        setMfaError(t('login.mfa.err.invalidCode', lang))
      } else {
        setMfaError(t('login.mfa.err.failed', lang))
      }
    } finally {
      setMfaLoading(false)
    }
  }

  // ── Verify SMS code ───────────────────────────────────────────────────
  const handleSmsVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaResolver || !mfaSmsVerificationId) return
    setMfaError('')
    setMfaLoading(true)
    try {
      const credential = PhoneAuthProvider.credential(mfaSmsVerificationId, mfaCode.trim())
      const assertion = PhoneMultiFactorGenerator.assertion(credential)
      const cred = await mfaResolver.resolveSignIn(assertion)
      if (!cred.user.emailVerified) {
        await signOut(auth)
        setMfaMode(null)
        setMfaResolver(null)
        setError(t('login.emailNotVerified', lang))
        setResendState('idle')
        setResendError('')
        return
      }
      navigate('/app')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') {
        setMfaError(t('login.mfa.err.invalidCode', lang))
      } else {
        setMfaError(t('login.mfa.err.failed', lang))
      }
    } finally {
      setMfaLoading(false)
    }
  }

  // ── Reset MFA state ───────────────────────────────────────────────────
  const resetMfa = () => {
    setMfaResolver(null)
    setMfaMode(null)
    setMfaCode('')
    setMfaSmsVerificationId('')
    setMfaSmsPhoneHint('')
    setMfaError('')
  }

  // ── Compute title/subtitle ─────────────────────────────────────────────
  const title = (() => {
    if (mfaMode === 'totp') return t('login.mfa.title', lang)
    if (mfaMode === 'sms-sending' || mfaMode === 'sms-code')
      return t('login.mfa.sms.title', lang)
    if (mfaMode === 'choose') return t('login.mfa.choose', lang)
    return t('login.title', lang)
  })()

  const subtitle = (() => {
    if (mfaMode === 'totp') return t('login.mfa.desc', lang)
    if (mfaMode === 'sms-code' && mfaSmsPhoneHint)
      return t('login.mfa.sms.sentTo', lang).replace('{phone}', mfaSmsPhoneHint)
    return mfaMode ? '' : t('login.subtitle', lang)
  })()

  const mfaCodeInputClass = 'w-full h-[46px] px-4 text-sm bg-white/60 border border-[#E4DEFB] rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors font-mono tracking-[0.4em]'
  const primaryBtnClass = (enabled: boolean) =>
    `w-full h-[48px] rounded-full text-[15px] font-bold text-white flex items-center justify-center gap-2 transition-opacity ${
      enabled ? 'kv-aurora-glow bg-gradient-to-br from-[#A78BFA] to-[#6D28D9]' : 'bg-[#CBBEF2] cursor-not-allowed'
    }`

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-4 py-10 sm:py-14">
      <AuroraBackground />

      <div className="relative z-[1] w-full max-w-[460px]">
        <Header lang={lang} />

        <div className={CARD}>
          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#1A1F36] mb-1.5">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-[#6B6485] mb-6 sm:mb-7">{subtitle}</p>}

          {/* ── Method selector (both TOTP + SMS enrolled) ── */}
          {mfaMode === 'choose' && (
            <div className="space-y-3">
              {mfaError && (
                <div className="px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
                  {mfaError}
                </div>
              )}
              <button
                onClick={() => { setMfaCode(''); setMfaError(''); setMfaMode('totp') }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-[#E4DEFB] bg-white/60 hover:bg-white/90 hover:border-[#8B5CF6] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center flex-shrink-0">
                  <Smartphone size={16} className="text-[#6D28D9]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A1F36]">{t('login.mfa.useTotp', lang)}</p>
                  <p className="text-xs text-[#9A94B8]">{t('sec.2fa.method.totp.desc', lang)}</p>
                </div>
              </button>
              <button
                onClick={() => { setMfaCode(''); setMfaError(''); sendSmsCodeWithResolver(mfaResolver!) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-[#E4DEFB] bg-white/60 hover:bg-white/90 hover:border-[#2FBE8F] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-[#2FBE8F]/10 flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={16} className="text-[#2FBE8F]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A1F36]">{t('login.mfa.useSms', lang)}</p>
                  <p className="text-xs text-[#9A94B8]">{t('sec.2fa.method.sms.desc', lang)}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={resetMfa}
                className="w-full h-10 text-sm text-[#6B6485] hover:text-[#1A1F36] transition-colors"
              >
                ← {t('login.mfa.back', lang)}
              </button>
            </div>
          )}

          {/* ── TOTP code entry ── */}
          {mfaMode === 'totp' && (
            <form onSubmit={handleTotpVerify} className="space-y-4">
              {mfaError && (
                <div className="px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
                  {mfaError}
                </div>
              )}
              <div>
                <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">
                  {t('login.mfa.codeLabel', lang)}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('login.mfa.codePh', lang)}
                  autoComplete="one-time-code"
                  required
                  className={mfaCodeInputClass}
                />
              </div>
              <div className="pt-1 space-y-2">
                <button type="submit" disabled={mfaLoading || mfaCode.length !== 6} className={primaryBtnClass(!mfaLoading && mfaCode.length === 6)}>
                  {mfaLoading ? t('login.mfa.verifying', lang) : t('login.mfa.verify', lang)}
                </button>
                {mfaResolver?.hints.some((h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID) && (
                  <button
                    type="button"
                    onClick={() => { setMfaCode(''); setMfaError(''); sendSmsCodeWithResolver(mfaResolver!) }}
                    className="w-full h-10 text-sm text-[#6D28D9] hover:underline transition-colors"
                  >
                    {t('login.mfa.useSms', lang)}
                  </button>
                )}
                <button type="button" onClick={resetMfa} className="w-full h-10 text-sm text-[#6B6485] hover:text-[#1A1F36] transition-colors">
                  ← {t('login.mfa.back', lang)}
                </button>
              </div>
            </form>
          )}

          {/* ── SMS sending / code entry ── */}
          {(mfaMode === 'sms-sending' || mfaMode === 'sms-code') && (
            <form onSubmit={handleSmsVerify} className="space-y-4">
              {mfaMode === 'sms-sending' && (
                <div className="flex items-center gap-2 text-sm text-[#6B6485]">
                  <Loader2 size={14} className="animate-spin text-[#6D28D9]" />
                  {t('login.mfa.sending', lang)}
                </div>
              )}
              {mfaError && (
                <div className="px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
                  {mfaError}
                </div>
              )}
              {mfaMode === 'sms-code' && (
                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1F36] mb-1.5">
                    {t('login.mfa.codeLabel', lang)}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('login.mfa.codePh', lang)}
                    autoComplete="one-time-code"
                    required
                    className={mfaCodeInputClass}
                  />
                </div>
              )}
              <div className="pt-1 space-y-2">
                <button
                  type="submit"
                  disabled={mfaLoading || mfaCode.length !== 6 || mfaMode === 'sms-sending'}
                  className={primaryBtnClass(!mfaLoading && mfaCode.length === 6 && mfaMode !== 'sms-sending')}
                >
                  {mfaLoading ? t('login.mfa.verifying', lang) : t('login.mfa.verify', lang)}
                </button>
                {mfaResolver?.hints.some((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) && (
                  <button
                    type="button"
                    onClick={() => { setMfaCode(''); setMfaError(''); setMfaMode('totp') }}
                    className="w-full h-10 text-sm text-[#6D28D9] hover:underline transition-colors"
                  >
                    {t('login.mfa.useTotp', lang)}
                  </button>
                )}
                <button type="button" onClick={resetMfa} className="w-full h-10 text-sm text-[#6B6485] hover:text-[#1A1F36] transition-colors">
                  ← {t('login.mfa.back', lang)}
                </button>
              </div>
            </form>
          )}

          {/* ── Regular login form ── */}
          {!mfaMode && (
            <>
              {error && error === t('login.emailNotVerified', lang) && resendState === 'already-verified' && (
                // The live resend check just found the email IS verified now (e.g. the
                // user clicked the link in another tab after the error above appeared).
                // Showing "not verified" and "already verified" in the same banner would
                // read as contradictory, so this state fully replaces the stale error
                // instead of appending to it.
                <div className="mb-4 px-4 py-3 rounded-2xl bg-green-50/90 border border-green-100 text-sm text-[#15803D]">
                  {t('login.resend.alreadyVerified', lang)}
                </div>
              )}

              {error && !(error === t('login.emailNotVerified', lang) && resendState === 'already-verified') && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600">
                  <p>{error}</p>
                  {error === t('login.emailNotVerified', lang) && (
                    <div className="mt-2 space-y-1.5">
                      {resendState === 'sent' && (
                        <p className="text-[#15803D]">{t('login.resend.sent', lang)}</p>
                      )}
                      {resendState === 'mfa-required' && (
                        <p className="text-[#1A1F36]">{t('login.resend.mfaRequired', lang)}</p>
                      )}
                      {resendState === 'error' && resendError && (
                        <p className="text-red-600">{resendError}</p>
                      )}
                      {resendState !== 'mfa-required' && (
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={resendState === 'sending' || resendCooldown > 0}
                          className="font-semibold text-[#6D28D9] hover:underline disabled:text-[#B7AEDB] disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {resendState === 'sending'
                            ? t('verify.resending', lang)
                            : resendCooldown > 0
                              ? t('login.resend.cooldown', lang).replace('{n}', String(resendCooldown))
                              : t('verify.resend', lang)}
                        </button>
                      )}
                    </div>
                  )}
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

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[13px] font-semibold text-[#1A1F36]">{t('login.password', lang)}</label>
                    <Link to="/forgot-password" className="text-[12.5px] text-[#6D28D9] font-semibold hover:underline">
                      {t('login.forgotPassword', lang)}
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full h-[46px] pl-4 pr-11 text-sm bg-white/60 border border-[#E4DEFB] rounded-2xl text-[#1A1F36] placeholder:text-[#ACA6C9] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A94B8] hover:text-[#6D28D9] transition-colors"
                      aria-label={showPassword ? t('login.hidePassword', lang) : t('login.showPassword', lang)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-[#D4CCF5] text-[#6D28D9] focus:ring-[#6D28D9] cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-[#6B6485]">{t('login.rememberMe', lang)}</span>
                </label>

                <button type="submit" disabled={loading} className={`${primaryBtnClass(!loading)} mt-1`}>
                  {loading ? t('login.loading', lang) : t('login.submit', lang)}
                </button>
              </form>

              <div className="flex items-center gap-3 my-5 sm:my-6">
                <div className="flex-1 h-px bg-[#E4DEFB]" />
                <span className="text-xs text-[#9A94B8]">{t('pub.or', lang)}</span>
                <div className="flex-1 h-px bg-[#E4DEFB]" />
              </div>

              <SocialButtons action="login" />
            </>
          )}
        </div>

        {!mfaMode && (
          <p className="text-center mt-6 text-sm text-[#4A4F6A]">
            {t('login.noAccount', lang)}
            <Link to="/register" className="text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors">
              {t('login.createAccount', lang)}
            </Link>
          </p>
        )}

        {/* Invisible reCAPTCHA container — always in DOM, unchanged id */}
        <div id="sms-login-recaptcha" className="hidden" />
      </div>
    </div>
  )
}
