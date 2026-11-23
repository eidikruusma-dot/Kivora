import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, LifeBuoy } from 'lucide-react'
import { addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AuroraBackground from '@/components/landing/AuroraBackground'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// Aurora Living Premium glass-card look, matching Privacy.tsx/Terms.tsx
// (duplicated locally — not imported — so this page can evolve independently).
const CARD =
  'rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_30px_70px_-30px_rgba(111,90,232,0.35)] px-6 py-7 sm:px-9 sm:py-9'

function Email({ children }: { children: string }) {
  return (
    <a href={`mailto:${children}`} className="text-[#6D28D9] font-semibold hover:underline">
      {children}
    </a>
  )
}

type Status = 'idle' | 'submitting' | 'success' | 'saved' | 'error'

export default function Contact() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Saatmisloogika on muutmata: Firestore kirjutus enne e-kirja saatmist,
  // seejärel /api/contact kutse, seejärel delivery-staatuse uuendus —
  // ainult markup ja stiil on ümber tehtud.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus('error')
      return
    }
    setStatus('submitting')

    // 1. Persist to Firestore before attempting email delivery
    let docRef: Awaited<ReturnType<typeof addDoc>> | null = null
    try {
      docRef = await addDoc(collection(db, 'contactSubmissions'), {
        senderName: name.trim(),
        senderEmail: email.trim(),
        subject: subject.trim() || null,
        message: message.trim(),
        type: 'contact',
        source: 'contact_page',
        uid: null,
        mayContact: null,
        createdAt: serverTimestamp(),
        emailDeliveryStatus: 'pending',
      })
    } catch {
      setStatus('error')
      return
    }

    // 2. Attempt email delivery via API
    let emailOk = false
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
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
      // Status update is best-effort; the submission is already saved
    }

    if (emailOk) {
      setName(''); setEmail(''); setSubject(''); setMessage('')
      setStatus('success')
    } else {
      setStatus('saved')
    }
  }

  const nameInvalid = status === 'error' && !name.trim()
  const emailInvalid = status === 'error' && !email.trim()
  const messageInvalid = status === 'error' && !message.trim()

  const inputCls =
    'w-full px-4 py-2.5 rounded-2xl border border-[#E4DEFB] bg-white/90 text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FBFAFF] flex flex-col">
      <AuroraBackground />
      <div className="relative z-[1] flex flex-col min-h-screen">
        <PublicHeader />

        <main className="flex-1 py-10 sm:py-14 px-4 sm:px-6">
          <div className="max-w-[640px] mx-auto">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('pub.backToHome', lang)}
            </Link>

            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#1A1F36] mb-2">
                {t('contact.title', lang)}
              </h1>
              <p className="text-sm font-semibold text-[#6D28D9] mb-3">{t('contact.subtitle', lang)}</p>
              <p className="text-[15px] text-[#64748B] leading-relaxed max-w-[480px] mx-auto">
                {t('contact.desc', lang)}
              </p>
            </div>

            <div className={`${CARD} mb-5`}>
              {status === 'success' ? (
                <div className="py-4 text-center" role="status" aria-live="polite">
                  <p className="text-sm font-medium text-[#16A34A]">{t('contact.success', lang)}</p>
                </div>
              ) : status === 'saved' ? (
                <div className="py-4 text-center" role="status" aria-live="polite">
                  <p className="text-sm font-medium text-[#CA8A04]">{t('contact.saved', lang)}</p>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                  {status === 'error' && (
                    <p
                      id="contact-error-msg"
                      role="alert"
                      aria-live="assertive"
                      className="text-sm font-medium text-[#DC2626] text-center"
                    >
                      {t('contact.error', lang)}
                    </p>
                  )}
                  <div>
                    <label htmlFor="contact-name" className="block text-[13px] font-medium text-[#1A1F36] mb-1.5">
                      {t('contact.form.name', lang)}
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder={t('contact.form.namePlaceholder', lang)}
                      aria-invalid={nameInvalid}
                      aria-describedby={nameInvalid ? 'contact-error-msg' : undefined}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-[13px] font-medium text-[#1A1F36] mb-1.5">
                      {t('contact.form.email', lang)}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                      placeholder={t('contact.form.emailPlaceholder', lang)}
                      aria-invalid={emailInvalid}
                      aria-describedby={emailInvalid ? 'contact-error-msg' : undefined}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-subject" className="block text-[13px] font-medium text-[#1A1F36] mb-1.5">
                      {t('contact.form.subject', lang)}
                    </label>
                    <input
                      id="contact-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className={inputCls}
                      placeholder={t('contact.form.subjectPlaceholder', lang)}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="block text-[13px] font-medium text-[#1A1F36] mb-1.5">
                      {t('contact.form.message', lang)}
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className={`${inputCls} resize-none`}
                      placeholder={t('contact.form.messagePlaceholder', lang)}
                      aria-invalid={messageInvalid}
                      aria-describedby={messageInvalid ? 'contact-error-msg' : undefined}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full px-6 py-3 rounded-2xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {status === 'submitting' ? t('contact.form.submitting', lang) : t('contact.form.submit', lang)}
                  </button>
                </form>
              )}
            </div>

            <div className={CARD}>
              <h3 className="text-lg font-bold text-[#1A1F36] mb-4">{t('contact.info.title', lang)}</h3>
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center shrink-0">
                    <Mail size={16} className="text-[#6D28D9]" />
                  </div>
                  <div className="text-[14px] text-[#64748B]">
                    <span className="block text-[12.5px] text-[#9A94B8]">{t('contact.info.generalLabel', lang)}</span>
                    <Email>info@kivora.ee</Email>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center shrink-0">
                    <LifeBuoy size={16} className="text-[#6D28D9]" />
                  </div>
                  <div className="text-[14px] text-[#64748B]">
                    <span className="block text-[12.5px] text-[#9A94B8]">{t('contact.info.supportLabel', lang)}</span>
                    <Email>support@kivora.ee</Email>
                  </div>
                </div>
              </div>
              <p className="text-[13px] text-[#64748B] leading-relaxed border-t border-[#E4DEFB] pt-4">
                {t('contact.privacy.text', lang)} (vt{' '}
                <Link to="/privacy" className="text-[#6D28D9] font-semibold hover:underline">/privacy</Link>).
              </p>
              <p className="text-[13px] text-[#9A94B8] mt-3">{t('contact.thanks', lang)}</p>
            </div>
          </div>
        </main>

        <PublicFooter />
      </div>
    </div>
  )
}
