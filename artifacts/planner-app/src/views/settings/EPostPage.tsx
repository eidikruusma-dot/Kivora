import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { sendEmailVerification } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ── Shared sub-components (match TurvalisusPage exactly) ──────────────────

type MsgState = { type: 'success' | 'error' | 'info'; text: string } | null

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
  const colours = {
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  }
  const Icon = msg.type === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div
      role="alert"
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm mb-5 border ${colours[msg.type]}`}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="flex-1">{msg.text}</span>
      <button
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
        aria-label="dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function EPostPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const { user, reloadUser } = useAuth()

  // ── Section: Email verification ──────────────────────────────────────
  const [verifSending, setVerifSending] = useState(false)
  const [verifMsg, setVerifMsg] = useState<MsgState>(null)

  const handleResendVerification = async () => {
    if (!auth.currentUser) return
    setVerifSending(true)
    setVerifMsg(null)
    try {
      await sendEmailVerification(auth.currentUser)
      await reloadUser()
      setVerifMsg({ type: 'success', text: t('emailSettings.verif.success', lang) })
    } catch {
      setVerifMsg({ type: 'error', text: t('emailSettings.verif.error', lang) })
    } finally {
      setVerifSending(false)
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
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t('emailSettings.title', lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('emailSettings.subtitle', lang)}
          </p>
        </div>

        {/* ── 1. Primary email ── */}
        <SectionCard
          icon={<Mail size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('emailSettings.primary.title', lang)}
          description={t('emailSettings.primary.desc', lang)}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#1A1F36]">{user?.email}</p>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                {t('emailSettings.primary.address', lang)}
              </p>
            </div>
            {user?.emailVerified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-xs font-medium text-green-700 flex-shrink-0">
                <CheckCircle2 size={13} />
                {t('emailSettings.verif.verified', lang)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-600 flex-shrink-0">
                <AlertCircle size={13} />
                {t('emailSettings.verif.notVerified', lang)}
              </span>
            )}
          </div>
        </SectionCard>

        {/* ── 2. Email verification status ── */}
        <SectionCard
          icon={<ShieldCheck size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t('emailSettings.verif.title', lang)}
          description={t('emailSettings.verif.desc', lang)}
        >
          <MessageBanner msg={verifMsg} onDismiss={() => setVerifMsg(null)} />

          {user?.emailVerified ? (
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700">
                  {t('emailSettings.verif.verified', lang)}
                </p>
                <p className="text-xs text-[#94A3B8] mt-0.5">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-amber-700">
                    {t('emailSettings.verif.notVerified', lang)}
                  </p>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1 ml-6">{user?.email}</p>
              </div>
              <button
                onClick={handleResendVerification}
                disabled={verifSending}
                className="h-9 px-4 rounded-xl bg-[#FEF9C3] text-[#CA8A04] border border-[#FDE68A] text-sm font-medium hover:bg-[#FEF08A] transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              >
                {verifSending && <Loader2 size={14} className="animate-spin" />}
                {verifSending
                  ? t('emailSettings.verif.resending', lang)
                  : t('emailSettings.verif.resend', lang)}
              </button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
