import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  if (success) {
    return (
      <AuthShell
        title={t('reg.success.title', lang)}
        subtitle={t('reg.success.subtitle', lang)}
      >
        <div className="mt-6 space-y-5">
          <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-100 text-sm text-green-700 whitespace-pre-line">
            {t('reg.success.body', lang)}
          </div>
          <div className="pt-2">
            <AuthButton type="button" onClick={() => navigate('/login')}>
              {t('reg.success.goLogin', lang)}
            </AuthButton>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('reg.title', lang)}
      subtitle={t('reg.subtitle', lang)}
      footer={<>{t('reg.hasAccount', lang)}<Link to="/login" className="text-[#6F5AE8] font-semibold hover:text-[#5B4AD5] transition-colors">{t('reg.login', lang)}</Link></>}
    >
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <AuthInput
          label={t('reg.name', lang)}
          type="text"
          placeholder={t('reg.namePlaceholder', lang)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <AuthInput
          label={t('reg.email', lang)}
          type="email"
          placeholder="sinu@email.ee"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <AuthInput
          label={t('reg.password', lang)}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <AuthInput
          label={t('reg.confirmPassword', lang)}
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <label className="flex items-start gap-2.5 cursor-pointer pt-3 select-none">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#D1D5DB] text-[#6F5AE8] focus:ring-[#6F5AE8] cursor-pointer flex-shrink-0"
          />
          <span className="text-xs text-[#64748B] leading-tight">
            {t('reg.agree', lang)}
            <Link to="/terms"   className="text-[#6F5AE8] font-medium hover:underline">{t('reg.terms',   lang)}</Link>
            {t('reg.and', lang)}
            <Link to="/privacy" className="text-[#6F5AE8] font-medium hover:underline">{t('reg.privacy', lang)}</Link>
          </span>
        </label>
        <div className="pt-2">
          <AuthButton type="submit" disabled={!agree || loading} className={agree && !loading ? '' : 'opacity-50 cursor-not-allowed'}>
            {loading ? t('reg.loading', lang) : t('reg.submit', lang)}
          </AuthButton>
        </div>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[#EBEBEB]" />
        <span className="text-xs text-[#94A3B8]">{t('pub.or', lang)}</span>
        <div className="flex-1 h-px bg-[#EBEBEB]" />
      </div>

      <SocialButtons action="register" />
    </AuthShell>
  )
}
