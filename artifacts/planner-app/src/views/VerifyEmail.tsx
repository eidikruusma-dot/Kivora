import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, CheckCircle, MailWarning, RefreshCw, Loader2 } from 'lucide-react'
import AuroraBackground from '@/components/landing/AuroraBackground'
import KivoraLogo from '@/components/brand/KivoraLogo'
import LanguageToggle from '@/components/layout/LanguageToggle'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// This page deliberately does NOT use the shared AuthShell/AuthButton
// components. Everything visual here is local to this file (same small
// CARD/Header/Page pattern as Register.tsx/Login.tsx/ForgotPassword.tsx/
// ResetPassword.tsx, duplicated rather than imported). All verification
// logic — sendVerificationEmail()/reloadUser()/logout() from AuthContext,
// the sent/verified/expired states — is unchanged from the previous
// version of this page; the only addition is the "no active session"
// case below (previously this page silently rendered a non-functional
// resend button when opened signed-out, since sendVerificationEmail()
// no-ops without a current user).
type State = 'sent' | 'verified' | 'expired'

// Shared glass-card look, matching Register.tsx/Login.tsx/ForgotPassword.tsx/ResetPassword.tsx.
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

const PRIMARY_BTN = 'w-full h-[48px] rounded-full text-[15px] font-bold text-white flex items-center justify-center gap-2 transition-opacity'
const primaryBtnClass = (enabled: boolean) =>
  `${PRIMARY_BTN} ${enabled ? 'kv-aurora-glow bg-gradient-to-br from-[#A78BFA] to-[#6D28D9]' : 'bg-[#CBBEF2] cursor-not-allowed'}`

export default function VerifyEmail() {
  const navigate = useNavigate()
  const { user, loading, sendVerificationEmail, reloadUser, logout } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [state, setState] = useState<State>('sent')
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  useEffect(() => {
    if (user && user.emailVerified) setState('verified')
    else if (user) setState('sent')
  }, [user])

  const handleResend = async () => {
    setError('')
    setSending(true)
    try { await sendVerificationEmail() }
    catch (err) { setError(mapFirebaseError(err)) }
    finally { setSending(false) }
  }

  const handleCheckStatus = async () => {
    setError('')
    setChecking(true)
    try { await reloadUser() }
    catch (err) { setError(mapFirebaseError(err)) }
    finally { setChecking(false) }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (loading) {
    return (
      <Page lang={lang}>
        <div className={`${CARD} text-center`}>
          <div className="flex justify-center py-6">
            <Loader2 size={32} className="animate-spin text-[#6D28D9]" />
          </div>
        </div>
      </Page>
    )
  }

  if (!user) {
    return (
      <Page lang={lang}>
        <div className={`${CARD} text-center`}>
          <div className="w-14 h-14 rounded-full bg-[#8B5CF6]/10 flex items-center justify-center mx-auto mb-5">
            <Mail size={26} className="text-[#6D28D9]" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-2">
            {t('verify.noSession.title', lang)}
          </h1>
          <p className="text-sm text-[#6B6485] leading-relaxed mb-6">
            {t('verify.noSession.body', lang)}
          </p>
          <Link to="/login" className={primaryBtnClass(true)}>
            {t('verify.login', lang)}
          </Link>
        </div>
      </Page>
    )
  }

  const stateConfig: Record<
    State,
    {
      icon: typeof Mail
      titleKey: 'verify.sent.title' | 'verify.verified.title' | 'verify.expired.title'
      textKey: 'verify.sent.text' | 'verify.verified.text' | 'verify.expired.text'
      color: string
    }
  > = {
    sent: { icon: Mail, titleKey: 'verify.sent.title', textKey: 'verify.sent.text', color: '#6D28D9' },
    verified: { icon: CheckCircle, titleKey: 'verify.verified.title', textKey: 'verify.verified.text', color: '#2FBE8F' },
    expired: { icon: MailWarning, titleKey: 'verify.expired.title', textKey: 'verify.expired.text', color: '#F59E0B' },
  }

  const current = stateConfig[state]
  const Icon = current.icon

  return (
    <Page lang={lang}>
      <div className={`${CARD} text-center`}>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: `${current.color}15` }}
        >
          <Icon size={26} style={{ color: current.color }} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A1F36] mb-2">
          {t(current.titleKey, lang)}
        </h1>
        <p className="text-sm text-[#6B6485] leading-relaxed mb-6">{t(current.textKey, lang)}</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50/90 border border-red-100 text-sm text-red-600 text-left">
            {error}
          </div>
        )}

        {state === 'sent' && (
          <>
            <button onClick={handleResend} disabled={sending} className={primaryBtnClass(!sending)}>
              {sending ? t('verify.resending', lang) : t('verify.resend', lang)}
            </button>
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#6D28D9] font-semibold hover:underline disabled:opacity-50"
            >
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
              {checking ? t('verify.checking', lang) : t('verify.checkStatus', lang)}
            </button>
            <button
              onClick={handleLogout}
              className="mt-3 block w-full text-sm text-[#9A94B8] hover:text-[#1A1F36] transition-colors"
            >
              {t('verify.logout', lang)}
            </button>
          </>
        )}

        {state === 'verified' && (
          <Link to="/login" className={primaryBtnClass(true)}>
            {t('verify.login', lang)}
          </Link>
        )}

        {state === 'expired' && (
          <button onClick={handleResend} disabled={sending} className={primaryBtnClass(!sending)}>
            {sending ? t('verify.resending', lang) : t('verify.resend', lang)}
          </button>
        )}
      </div>

      {state !== 'verified' && (
        <p className="text-center mt-6 text-sm">
          <Link to="/login" className="text-[#6D28D9] font-semibold hover:text-[#5B21B6] transition-colors">
            {t('verify.backToLogin', lang)}
          </Link>
        </p>
      )}
    </Page>
  )
}
