import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '@/components/auth/AuthShell'
import AuthButton from '@/components/auth/AuthButton'
import { Mail, CheckCircle, MailWarning, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

type State = 'sent' | 'verified' | 'expired'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const { user, sendVerificationEmail, reloadUser, logout } = useAuth()
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

  const stateConfig: Record<State, { icon: typeof Mail; titleKey: 'verify.sent.title' | 'verify.verified.title' | 'verify.expired.title'; textKey: 'verify.sent.text' | 'verify.verified.text' | 'verify.expired.text'; color: string }> = {
    sent:     { icon: Mail,        titleKey: 'verify.sent.title',     textKey: 'verify.sent.text',     color: '#6F5AE8' },
    verified: { icon: CheckCircle, titleKey: 'verify.verified.title', textKey: 'verify.verified.text', color: '#22C55E' },
    expired:  { icon: MailWarning, titleKey: 'verify.expired.title',  textKey: 'verify.expired.text',  color: '#F97316' },
  }

  const current = stateConfig[state]
  const Icon = current.icon

  return (
    <AuthShell
      title={t(current.titleKey, lang)}
      footer={
        state === 'verified' ? null : (
          <Link to="/login" className="text-[#6F5AE8] font-medium hover:underline">
            {t('verify.backToLogin', lang)}
          </Link>
        )
      }
    >
      <div className="text-center py-2">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${current.color}15` }}
        >
          <Icon size={26} style={{ color: current.color }} />
        </div>
        <p className="text-sm text-[#64748B] leading-relaxed mb-6">{t(current.textKey, lang)}</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
            {error}
          </div>
        )}

        {state === 'sent' && (
          <>
            <div className="pt-2">
              <AuthButton onClick={handleResend} disabled={sending}>
                {sending ? t('verify.resending', lang) : t('verify.resend', lang)}
              </AuthButton>
            </div>
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#6F5AE8] font-medium hover:underline disabled:opacity-50"
            >
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
              {checking ? t('verify.checking', lang) : t('verify.checkStatus', lang)}
            </button>
            <button
              onClick={handleLogout}
              className="mt-3 block w-full text-sm text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
            >
              {t('verify.logout', lang)}
            </button>
          </>
        )}

        {state === 'verified' && (
          <div className="pt-2">
            <Link to="/login"><AuthButton>{t('verify.login', lang)}</AuthButton></Link>
          </div>
        )}

        {state === 'expired' && (
          <div className="pt-2">
            <AuthButton onClick={handleResend} disabled={sending}>
              {sending ? t('verify.resending', lang) : t('verify.resend', lang)}
            </AuthButton>
          </div>
        )}
      </div>
    </AuthShell>
  )
}
