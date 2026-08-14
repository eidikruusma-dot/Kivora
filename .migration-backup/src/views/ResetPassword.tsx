import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, MailWarning, Loader2 } from 'lucide-react'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import { mapFirebaseError } from '@/lib/firebaseErrors'

type Mode = 'loading' | 'valid' | 'expired' | 'success'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionCode, setActionCode] = useState('')

  useEffect(() => {
    const code = searchParams.get('oobCode') || ''
    if (!code) {
      setMode('expired')
      return
    }
    setActionCode(code)
    verifyPasswordResetCode(auth, code)
      .then(() => setMode('valid'))
      .catch(() => setMode('expired'))
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setConfirmError('')

    if (password.length < 8) {
      setPasswordError('Parool peab olema vähemalt 8 tähemärki pikk.')
      return
    }
    if (password !== confirm) {
      setConfirmError('Paroolid ei ühti.')
      return
    }

    setSubmitting(true)
    try {
      await confirmPasswordReset(auth, actionCode, password)
      setMode('success')
    } catch (err) {
      setMode('expired')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'loading') {
    return (
      <AuthShell title="Kontrollin linki…" footer={null}>
        <div className="flex justify-center py-8">
          <Loader2 size={32} className="animate-spin text-[#6F5AE8]" />
        </div>
      </AuthShell>
    )
  }

  if (mode === 'expired') {
    return (
      <AuthShell
        title="Kinnitamise link on aegunud"
        footer={
          <Link to="/forgot-password" className="text-[#6F5AE8] font-medium hover:underline">
            Saada uus taastamise link
          </Link>
        }
      >
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-[#FFEDD5] flex items-center justify-center mx-auto mb-4">
            <MailWarning size={26} className="text-[#F97316]" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed mb-6">
            See link on aegunud või vigane. Palun taotle uus parooli taastamise link.
          </p>
          <div className="pt-2">
            <Link to="/forgot-password">
              <AuthButton>Saada uus taastamise link</AuthButton>
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  if (mode === 'success') {
    return (
      <AuthShell title="Parool muudetud" footer={null}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={26} className="text-[#22C55E]" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed mb-6">
            Sinu parool on edukalt uuendatud.
          </p>
          <div className="pt-2">
            <Link to="/login">
              <AuthButton>Logi sisse</AuthButton>
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Loo uus parool"
      subtitle="Sisesta uus parool ja kinnita see."
      footer={
        <Link to="/login" className="text-[#6F5AE8] font-medium hover:underline">
          Tagasi sisselogimisse
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Uus parool</label>
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
              aria-label={showPassword ? 'Peida parool' : 'Näita parooli'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Kinnita uus parool</label>
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
              aria-label={showConfirm ? 'Peida parool' : 'Näita parooli'}
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="pt-2">
          <AuthButton type="submit" disabled={submitting}>
            {submitting ? 'Salvestan…' : 'Salvesta uus parool'}
          </AuthButton>
        </div>
      </form>
    </AuthShell>
  )
}
