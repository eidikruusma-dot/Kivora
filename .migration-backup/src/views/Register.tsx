import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '@/components/auth/AuthShell'
import AuthInput from '@/components/auth/AuthInput'
import AuthButton from '@/components/auth/AuthButton'
import SocialButtons from '@/components/auth/SocialButtons'
import { useAuth } from '@/context/AuthContext'
import { mapFirebaseError } from '@/lib/firebaseErrors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError('Kõik väljad peavad olema täidetud.')
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Vigane e-posti aadress.')
      return
    }
    if (password !== confirm) {
      setError('Paroolid ei ühti.')
      return
    }
    if (password.length < 8) {
      setError('Parool on liiga nõrk. Kasuta vähemalt 8 tähemärki.')
      return
    }
    if (!agree) {
      setError('Palun nõustu kasutustingimustega.')
      return
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
        title="Konto loodud"
        subtitle="Enne sisselogimist kinnita oma e-posti aadress."
      >
        <div className="mt-6 space-y-5">
          <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-100 text-sm text-green-700">
            Konto loodi edukalt. Saatsime sinu e-posti aadressile kinnitamise lingi.
            Enne sisselogimist ava see ja kinnita oma e-posti aadress.
          </div>
          <div className="pt-2">
            <AuthButton type="button" onClick={() => navigate('/login')}>
              Mine sisselogimisele
            </AuthButton>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Loo konto"
      subtitle="Loo konto ja alusta oma päeva korraldamist."
      footer={<>Konto on juba olemas? <Link to="/login" className="text-[#6F5AE8] font-semibold hover:text-[#5B4AD5] transition-colors">Logi sisse</Link></>}
    >
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <AuthInput
          label="Nimi"
          type="text"
          placeholder="Mari Kask"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <AuthInput
          label="E-post"
          type="email"
          placeholder="sinu@email.ee"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <AuthInput
          label="Parool"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <AuthInput
          label="Parooli kinnitus"
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
            Nõustun <Link to="/terms" className="text-[#6F5AE8] font-medium hover:underline">kasutustingimustega</Link> ja <Link to="/privacy" className="text-[#6F5AE8] font-medium hover:underline">privaatsuspoliitikaga</Link>.
          </span>
        </label>
        <div className="pt-2">
          <AuthButton type="submit" disabled={!agree || loading} className={agree && !loading ? '' : 'opacity-50 cursor-not-allowed'}>
            {loading ? 'Laadib…' : 'Loo konto'}
          </AuthButton>
        </div>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[#EBEBEB]" />
        <span className="text-xs text-[#94A3B8]">või</span>
        <div className="flex-1 h-px bg-[#EBEBEB]" />
      </div>

      <SocialButtons action="register" />
    </AuthShell>
  )
}
