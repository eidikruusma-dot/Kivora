import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import { MailCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
      <AuthShell
        title={t('forgot.sent.title', lang)}
        footer={<Link to="/login" className="text-[#6F5AE8] font-medium hover:underline">{t('forgot.backToLogin', lang)}</Link>}
      >
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-[#EDE9FB] flex items-center justify-center mx-auto mb-4">
            <MailCheck size={26} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed">
            {t('forgot.sent.body', lang)}
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('forgot.title', lang)}
      subtitle={t('forgot.subtitle', lang)}
      footer={<Link to="/login" className="text-[#6F5AE8] font-medium hover:underline">{t('forgot.backToLogin', lang)}</Link>}
    >
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
        <div className="pt-2">
          <AuthButton type="submit" disabled={loading}>
            {loading ? t('forgot.loading', lang) : t('forgot.submit', lang)}
          </AuthButton>
        </div>
      </form>
    </AuthShell>
  )
}
