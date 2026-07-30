import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

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

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await signIn(email, password, remember)
      if (!user.emailVerified) {
        await signOut(auth)
        setError(t('login.emailNotVerified', lang))
        return
      }
      navigate('/app')
    } catch (err) {
      setError(mapFirebaseError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('login.title', lang)}
      subtitle={t('login.subtitle', lang)}
      footer={<>{t('login.noAccount', lang)}<Link to="/register" className="text-[#6F5AE8] font-medium hover:underline">{t('login.createAccount', lang)}</Link></>}
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
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-[#1A1F36]">{t('login.password', lang)}</label>
            <Link to="/forgot-password" className="text-xs text-[#6F5AE8] font-medium hover:underline">
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
              aria-label={showPassword ? t('login.hidePassword', lang) : t('login.showPassword', lang)}
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
    </AuthShell>
  )
}
