import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
} from 'lucide-react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface Props {
  onBack: () => void
}

type MsgState = { type: 'success' | 'error'; text: string } | null

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#F0F0F0]">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F36]">{title}</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function MessageBanner({ msg, onDismiss }: { msg: MsgState; onDismiss: () => void }) {
  if (!msg) return null
  return (
    <div
      role="alert"
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm mb-5 ${
        msg.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}
    >
      {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span className="flex-1">{msg.text}</span>
      <button
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
      >
        ×
      </button>
    </div>
  )
}

export default function TurvalisusPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const { user, reloadUser } = useAuth()

  // Determines if this is an email/password account
  const isPasswordProvider = user?.providerData?.some((p) => p.providerId === 'password') ?? false

  // ── Change password ────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<MsgState>(null)

  const handleChangePassword = async () => {
    if (!user || !user.email) return
    if (newPw.length < 6) {
      setPwMsg({ type: 'error', text: t('sec.pw.error.min', lang) })
      return
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: t('sec.pw.error.mismatch', lang) })
      return
    }
    setPwSaving(true)
    setPwMsg(null)
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw)
      await reauthenticateWithCredential(user, cred)
      await updatePassword(user, newPw)
      setPwMsg({ type: 'success', text: t('sec.pw.success', lang) })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPwMsg({ type: 'error', text: t('sec.pw.error.wrong', lang) })
      } else if (code === 'auth/too-many-requests') {
        setPwMsg({ type: 'error', text: t('sec.pw.error.tooMany', lang) })
      } else {
        setPwMsg({ type: 'error', text: t('sec.pw.error.failed', lang) })
      }
    } finally {
      setPwSaving(false)
    }
  }

  // ── Email verification ─────────────────────────────────────────────────
  const [verifSending, setVerifSending] = useState(false)
  const [verifMsg, setVerifMsg] = useState<MsgState>(null)

  const handleResendVerification = async () => {
    if (!auth.currentUser) return
    setVerifSending(true)
    setVerifMsg(null)
    try {
      await sendEmailVerification(auth.currentUser)
      await reloadUser()
      setVerifMsg({ type: 'success', text: t('sec.email.success', lang) })
    } catch {
      setVerifMsg({ type: 'error', text: t('sec.email.error', lang) })
    } finally {
      setVerifSending(false)
    }
  }

  // ── Sign out ───────────────────────────────────────────────────────────
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await auth.signOut()
    } finally {
      setSigningOut(false)
      setSignOutConfirm(false)
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('sec.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('sec.subtitle', lang)}
          </p>
        </div>

        {/* ── Change password ── */}
        {isPasswordProvider ? (
          <SectionCard
            icon={<Lock size={20} strokeWidth={1.8} />}
            iconBg="#EDE9FB"
            iconColor="#6F5AE8"
            title={t('sec.pw.title', lang)}
            description={t('sec.pw.desc', lang)}
          >
            <MessageBanner msg={pwMsg} onDismiss={() => setPwMsg(null)} />
            <div className="space-y-4">
              {/* Current password */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('sec.pw.current', lang)}
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                    placeholder={t('sec.pw.placeholder.current', lang)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('sec.pw.new', lang)}
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                    placeholder={t('sec.pw.placeholder.new', lang)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm new password */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('sec.pw.confirm', lang)}
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  placeholder={t('sec.pw.placeholder.confirm', lang)}
                  autoComplete="new-password"
                />
              </div>

              <div className="pt-1">
                <button
                  onClick={handleChangePassword}
                  disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                  className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {pwSaving && <Loader2 size={15} className="animate-spin" />}
                  {t('sec.pw.save', lang)}
                </button>
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            icon={<Lock size={20} strokeWidth={1.8} />}
            iconBg="#EDE9FB"
            iconColor="#6F5AE8"
            title={t('sec.pw.title', lang)}
            description={t('sec.pw.notAvailable', lang)}
          >
            <p className="text-sm text-[#64748B]">
              {t('sec.pw.social', lang)}
            </p>
          </SectionCard>
        )}

        {/* ── Email verification ── */}
        <SectionCard
          icon={<Mail size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('sec.email.title', lang)}
          description={t('sec.email.desc', lang)}
        >
          <MessageBanner msg={verifMsg} onDismiss={() => setVerifMsg(null)} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#1A1F36] font-medium">{user?.email}</p>
              {user?.emailVerified ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 size={14} className="text-green-600" />
                  <span className="text-xs text-green-600 font-medium">{t('sec.email.verified', lang)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle size={14} className="text-amber-500" />
                  <span className="text-xs text-amber-600 font-medium">{t('sec.email.notVerified', lang)}</span>
                </div>
              )}
            </div>
            {!user?.emailVerified && (
              <button
                onClick={handleResendVerification}
                disabled={verifSending}
                className="h-9 px-4 rounded-xl bg-[#FEF9C3] text-[#CA8A04] border border-[#FDE68A] text-sm font-medium hover:bg-[#FEF08A] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {verifSending && <Loader2 size={14} className="animate-spin" />}
                {t('sec.email.resend', lang)}
              </button>
            )}
          </div>
        </SectionCard>

        {/* ── Two-factor auth (informational) ── */}
        <SectionCard
          icon={<ShieldCheck size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t('sec.2fa.title', lang)}
          description={t('sec.2fa.desc', lang)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#64748B]">
                {t('sec.2fa.body', lang)}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">{t('sec.2fa.soon', lang)}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#F1F5F9] text-xs font-medium text-[#64748B]">
              {t('sec.2fa.badge', lang)}
            </span>
          </div>
        </SectionCard>

        {/* ── Sign out ── */}
        <SectionCard
          icon={<LogOut size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t('sec.signout.title', lang)}
          description={t('sec.signout.desc', lang)}
        >
          {!signOutConfirm ? (
            <button
              onClick={() => setSignOutConfirm(true)}
              className="h-9 px-4 rounded-xl bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-sm font-medium hover:bg-[#FECACA] transition-colors"
            >
              {t('sec.signout.button', lang)}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-[#64748B]">{t('sec.signout.confirm', lang)}</p>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-9 px-4 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {signingOut && <Loader2 size={14} className="animate-spin" />}
                {t('sec.signout.button', lang)}
              </button>
              <button
                onClick={() => setSignOutConfirm(false)}
                className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
              >
                {t('sec.signout.cancel', lang)}
              </button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
