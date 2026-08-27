import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react'
import { addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import KivoraLogo from '@/components/brand/KivoraLogo'

// ── Shared sub-components ──────────────────────────────────────────────────

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

// ── FAQ accordion item ─────────────────────────────────────────────────────

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string
  answer: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-[#F5F5F5] last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-4 text-left group"
      >
        <span className="text-sm font-medium text-[#1A1F36] group-hover:text-[#6F5AE8] transition-colors">
          {question}
        </span>
        {open ? (
          <ChevronUp size={16} className="text-[#6F5AE8] flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-[#94A3B8] flex-shrink-0 group-hover:text-[#6F5AE8] transition-colors" />
        )}
      </button>
      {open && (
        <p className="text-sm text-[#64748B] leading-relaxed pb-4 -mt-1">
          {answer}
        </p>
      )}
    </div>
  )
}

// ── FAQ data ───────────────────────────────────────────────────────────────

const FAQ_ITEMS: {
  qKey: 'help.faq.q1' | 'help.faq.q2' | 'help.faq.q3' | 'help.faq.q4' | 'help.faq.q5'
  aKey: 'help.faq.a1' | 'help.faq.a2' | 'help.faq.a3' | 'help.faq.a4' | 'help.faq.a5'
}[] = [
  { qKey: 'help.faq.q1', aKey: 'help.faq.a1' },
  { qKey: 'help.faq.q2', aKey: 'help.faq.a2' },
  { qKey: 'help.faq.q3', aKey: 'help.faq.a3' },
  { qKey: 'help.faq.q4', aKey: 'help.faq.a4' },
  { qKey: 'help.faq.q5', aKey: 'help.faq.a5' },
]

// ── Page ──────────────────────────────────────────────────────────────────

interface Props {
  /** Present when opened from Settings subview — omit when rendered as a standalone route page */
  onBack?: () => void
}

const APP_VERSION = '1.0.0'

type SendResult = 'sent' | 'saved' | 'error' | null

export default function AbiJaTugiPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult>(null)

  function toggleFaq(i: number) {
    setOpenFaq((prev) => (prev === i ? null : i))
  }

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setResult(null)

    // 1. Persist to Firestore before attempting email delivery
    let docRef: Awaited<ReturnType<typeof addDoc>> | null = null
    try {
      docRef = await addDoc(collection(db, 'supportMessages'), {
        message: message.trim(),
        type: 'support',
        source: 'help_support_page',
        uid: auth.currentUser?.uid ?? null,
        senderName: auth.currentUser?.displayName ?? null,
        senderEmail: auth.currentUser?.email ?? null,
        mayContact: null,
        subject: null,
        createdAt: serverTimestamp(),
        emailDeliveryStatus: 'pending',
      })
    } catch {
      setSending(false)
      setResult('error')
      return
    }

    // 2. Attempt email delivery via API
    let emailOk = false
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          uid: auth.currentUser?.uid ?? '',
        }),
      })
      const json = await res.json().catch(() => ({ ok: false }))
      emailOk = res.ok && json.ok === true
    } catch {
      emailOk = false
    }

    // 3. Update delivery status in Firestore
    try {
      await updateDoc(docRef, {
        emailDeliveryStatus: emailOk ? 'sent' : 'failed',
      })
    } catch {
      // Best-effort — submission is already saved
    }

    setSending(false)
    if (emailOk) {
      setMessage('')
      setResult('sent')
      setTimeout(() => setResult(null), 5000)
    } else {
      setResult('saved')
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {t('settings.back', lang)}
        </button>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('help.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t('help.subtitle', lang)}</p>
        </div>

        {/* ── 1. FAQ ── */}
        <SectionCard
          icon={<HelpCircle size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('help.faq.title', lang)}
          description={t('help.faq.desc', lang)}
        >
          <div className="-my-1">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem
                key={i}
                question={t(item.qKey, lang)}
                answer={t(item.aKey, lang)}
                open={openFaq === i}
                onToggle={() => toggleFaq(i)}
              />
            ))}
          </div>
        </SectionCard>

        {/* ── 2. Contact ── */}
        <SectionCard
          icon={<Send size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('help.contact.title', lang)}
          description={t('help.contact.desc', lang)}
        >
          {result === 'sent' ? (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              {t('help.contact.sent', lang)}
            </div>
          ) : result === 'saved' ? (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
              <AlertCircle size={16} className="flex-shrink-0" />
              {t('help.contact.saved', lang)}
            </div>
          ) : (
            <div className="space-y-4">
              {result === 'error' && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {t('contact.error', lang)}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('help.contact.message.label', lang)}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('help.contact.message.placeholder', lang)}
                  rows={4}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 py-3 text-sm text-[#1A1F36] placeholder:text-[#CBD5E1] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors resize-none"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={14} strokeWidth={2} />
                )}
                {sending ? t('help.contact.sending', lang) : t('help.contact.send', lang)}
              </button>
            </div>
          )}
        </SectionCard>

        {/* ── 3. App info ── */}
        <SectionCard
          icon={<Info size={20} strokeWidth={1.8} />}
          iconBg="#F1F5F9"
          iconColor="#64748B"
          title={t('help.version.title', lang)}
          description={t('help.version.desc', lang)}
        >
          <div className="flex items-center gap-3">
            <KivoraLogo height={28} />
            <p className="text-xs text-[#94A3B8]">
              {t('help.version.label', lang)} {APP_VERSION}
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
