import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, MailWarning, Loader2 } from 'lucide-react'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

type Mode = 'loading' | 'valid' | 'expired' | 'success'

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
    <AuthShell title={t('reset.success.title', lang)} footer={null}>
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={26} className="text-[#22C55E]" />
        </div>
        <p className="text-sm font-medium text-[#1A1F36] mb-2">
          {t('reset.success.changed', lang)}
        </p>
        <p className="text-xs text-[#94A3B8] mb-6">
          {t('reset.success.redirect', lang).replace('{n}', String(countdown))}
        </p>
        <div className="pt-2">
          <AuthButton onClick={() => navigate('/login')}>
            {t('reset.success.goLogin', lang)}
          </AuthButton>
        </div>
      </div>
    </AuthShell>
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
      <AuthShell title={t('reset.checking', lang)} footer={null}>
        <div className="flex justify-center py-8">
          <Loader2 size={32} className="animate-spin text-[#6F5AE8]" />
        </div>
      </AuthShell>
    )
  }

  if (mode === 'expired') {
    return (
      <AuthShell
        title={t('reset.expired.title', lang)}
        footer={<Link to="/forgot-password" className="text-[#6F5AE8] font-medium hover:underline">{t('reset.expired.sendNew', lang)}</Link>}
      >
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-[#FFEDD5] flex items-center justify-center mx-auto mb-4">
            <MailWarning size={26} className="text-[#F97316]" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed mb-6">
            {t('reset.expired.body', lang)}
          </p>
          <div className="pt-2">
            <Link to="/forgot-password">
              <AuthButton>{t('reset.expired.sendNew', lang)}</AuthButton>
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  if (mode === 'success') {
    return <ResetSuccess navigate={navigate} lang={lang} />
  }

  return (
    <AuthShell
      title={t('reset.form.title', lang)}
      subtitle={t('reset.form.subtitle', lang)}
      footer={<Link to="/login" className="text-[#6F5AE8] font-medium hover:underline">{t('reset.backToLogin', lang)}</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('reset.form.newPassword', lang)}</label>
          <div className="relative">
            <AuthInput
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#6F5AE8] transition-colors"
              aria-label={showPassword ? t('reset.form.hidePassword', lang) : t('reset.form.showPassword', lang)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('reset.form.confirmPassword', lang)}</label>
          <div className="relative">
            <AuthInput
              type={showConfirm ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={confirmError}
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#6F5AE8] transition-colors"
              aria-label={showConfirm ? t('reset.form.hidePassword', lang) : t('reset.form.showPassword', lang)}
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="pt-2">
          <AuthButton type="submit" disabled={submitting}>
            {submitting ? t('reset.saving', lang) : t('reset.submit', lang)}
          </AuthButton>
        </div>
      </form>
    </AuthShell>
  )
}
