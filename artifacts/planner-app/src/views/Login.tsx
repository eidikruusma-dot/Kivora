import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Smartphone, MessageSquare, Loader2 } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { auth } from '@/lib/firebase'
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

// MFA step in the login flow
type MfaMode = 'totp' | 'sms-sending' | 'sms-code' | 'choose' | null

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

  // ── Compute AuthShell title/subtitle ──────────────────────────────────
  const shellTitle = (() => {
    if (mfaMode === 'totp') return t('login.mfa.title', lang)
    if (mfaMode === 'sms-sending' || mfaMode === 'sms-code')
      return t('login.mfa.sms.title', lang)
    if (mfaMode === 'choose') return t('login.mfa.choose', lang)
    return t('login.title', lang)
  })()

  const shellSubtitle = (() => {
    if (mfaMode === 'totp') return t('login.mfa.desc', lang)
    if (mfaMode === 'sms-code' && mfaSmsPhoneHint)
      return t('login.mfa.sms.sentTo', lang).replace('{phone}', mfaSmsPhoneHint)
    return mfaMode ? '' : t('login.subtitle', lang)
  })()

  return (
    <AuthShell
      title={shellTitle}
      subtitle={shellSubtitle}
      footer={
        mfaMode ? (
          <></>
        ) : (
          <>
            {t('login.noAccount', lang)}
            <Link to="/register" className="text-[#6F5AE8] font-medium hover:underline">
              {t('login.createAccount', lang)}
            </Link>
          </>
        )
      }
    >
      {/* ── Method selector (both TOTP + SMS enrolled) ── */}
      {mfaMode === 'choose' && (
        <div className="space-y-3 mt-2">
          {mfaError && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {mfaError}
            </div>
          )}
          <button
            onClick={() => { setMfaCode(''); setMfaError(''); setMfaMode('totp') }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] hover:bg-[#F1F5F9] hover:border-[#6F5AE8] transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0">
              <Smartphone size={16} className="text-[#6F5AE8]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1F36]">
                {t('login.mfa.useTotp', lang)}
              </p>
              <p className="text-xs text-[#94A3B8]">
                {t('sec.2fa.method.totp.desc', lang)}
              </p>
            </div>
          </button>
          <button
            onClick={() => {
              setMfaCode('')
              setMfaError('')
              sendSmsCodeWithResolver(mfaResolver!)
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] hover:bg-[#F1F5F9] hover:border-[#16A34A] transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
              <MessageSquare size={16} className="text-[#16A34A]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1F36]">
                {t('login.mfa.useSms', lang)}
              </p>
              <p className="text-xs text-[#94A3B8]">
                {t('sec.2fa.method.sms.desc', lang)}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={resetMfa}
            className="w-full h-10 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors"
          >
            ← {t('login.mfa.back', lang)}
          </button>
        </div>
      )}

      {/* ── TOTP code entry ── */}
      {mfaMode === 'totp' && (
        <form onSubmit={handleTotpVerify} className="space-y-4 mt-2">
          {mfaError && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {mfaError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
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
              className="w-full h-11 px-4 rounded-xl border border-[#D1D5DB] bg-[#FAFAFA] text-sm text-[#1A1F36] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] focus:bg-white transition-colors font-mono tracking-[0.5em]"
            />
          </div>
          <div className="pt-2 space-y-2">
            <AuthButton type="submit" disabled={mfaLoading || mfaCode.length !== 6}>
              {mfaLoading ? t('login.mfa.verifying', lang) : t('login.mfa.verify', lang)}
            </AuthButton>
            {/* Switch to SMS if resolver has both hints */}
            {mfaResolver?.hints.some(
              (h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID
            ) && (
              <button
                type="button"
                onClick={() => { setMfaCode(''); setMfaError(''); sendSmsCodeWithResolver(mfaResolver!) }}
                className="w-full h-10 text-sm text-[#6F5AE8] hover:underline transition-colors"
              >
                {t('login.mfa.useSms', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={resetMfa}
              className="w-full h-10 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors"
            >
              ← {t('login.mfa.back', lang)}
            </button>
          </div>
        </form>
      )}

      {/* ── SMS sending / code entry ── */}
      {(mfaMode === 'sms-sending' || mfaMode === 'sms-code') && (
        <form onSubmit={handleSmsVerify} className="space-y-4 mt-2">
          {mfaMode === 'sms-sending' && (
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <Loader2 size={14} className="animate-spin text-[#6F5AE8]" />
              {t('login.mfa.sending', lang)}
            </div>
          )}
          {mfaError && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {mfaError}
            </div>
          )}
          {mfaMode === 'sms-code' && (
            <div>
              <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
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
                className="w-full h-11 px-4 rounded-xl border border-[#D1D5DB] bg-[#FAFAFA] text-sm text-[#1A1F36] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] focus:bg-white transition-colors font-mono tracking-[0.5em]"
              />
            </div>
          )}
          <div className="pt-2 space-y-2">
            <AuthButton
              type="submit"
              disabled={mfaLoading || mfaCode.length !== 6 || mfaMode === 'sms-sending'}
            >
              {mfaLoading ? t('login.mfa.verifying', lang) : t('login.mfa.verify', lang)}
            </AuthButton>
            {/* Switch to TOTP if resolver has both hints */}
            {mfaResolver?.hints.some(
              (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
            ) && (
              <button
                type="button"
                onClick={() => { setMfaCode(''); setMfaError(''); setMfaMode('totp') }}
                className="w-full h-10 text-sm text-[#6F5AE8] hover:underline transition-colors"
              >
                {t('login.mfa.useTotp', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={resetMfa}
              className="w-full h-10 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors"
            >
              ← {t('login.mfa.back', lang)}
            </button>
          </div>
        </form>
      )}

      {/* ── Regular login form ── */}
      {!mfaMode && (
        <>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <AuthInput
              label={t('login.email', lang)}
              type="email"
              placeholder="sinu@email.ee"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-[#1A1F36]">
                  {t('login.password', lang)}
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-[#6F5AE8] font-medium hover:underline"
                >
                  {t('login.forgotPassword', lang)}
                </Link>
              </div>
              <div className="relative">
                <AuthInput
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#6F5AE8] transition-colors"
                  aria-label={
                    showPassword ? t('login.hidePassword', lang) : t('login.showPassword', lang)
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-[#D1D5DB] text-[#6F5AE8] focus:ring-[#6F5AE8] cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-[#64748B]">{t('login.rememberMe', lang)}</span>
            </label>
            <div className="pt-2">
              <AuthButton type="submit" disabled={loading}>
                {loading ? t('login.loading', lang) : t('login.submit', lang)}
              </AuthButton>
            </div>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#EBEBEB]" />
            <span className="text-xs text-[#94A3B8]">{t('pub.or', lang)}</span>
            <div className="flex-1 h-px bg-[#EBEBEB]" />
          </div>

          <SocialButtons action="login" />
        </>
      )}

      {/* Invisible reCAPTCHA container — always in DOM */}
      <div id="sms-login-recaptcha" className="hidden" />
    </AuthShell>
  )
}
