import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function Contact() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    try {
      await new Promise<void>((resolve, reject) => {
        if (!name.trim() || !email.trim() || !message.trim()) reject(new Error('Missing'))
        else setTimeout(resolve, 600)
      })
      setStatus('success')
      setName(''); setEmail(''); setSubject(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-[#E8E6E0] text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors'

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      <PublicHeader />

      <main className="flex-1 py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            {t('pub.backToHome', lang)}
          </Link>

          <h1 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">{t('contact.title', lang)}</h1>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-10">{t('contact.subtitle', lang)}</p>

          <div className="space-y-5 mb-10">
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">{t('contact.desc1', lang)}</p>
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">{t('contact.desc2', lang)}</p>
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">{t('contact.desc3', lang)}</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-6">
            {status === 'success' ? (
              <div className="py-6 text-center">
                <p className="text-sm font-medium text-[#16A34A]">{t('contact.success', lang)}</p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                {status === 'error' && (
                  <p className="text-sm font-medium text-[#DC2626] text-center">{t('contact.error', lang)}</p>
                )}
                <div>
                  <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('contact.form.name', lang)}</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={t('contact.form.namePlaceholder', lang)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('contact.form.email', lang)}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder={t('contact.form.emailPlaceholder', lang)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('contact.form.subject', lang)}</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder={t('contact.form.subjectPlaceholder', lang)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('contact.form.message', lang)}</label>
                  <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} placeholder={t('contact.form.messagePlaceholder', lang)} />
                </div>
                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === 'submitting' ? t('contact.form.submitting', lang) : t('contact.form.submit', lang)}
                </button>
              </form>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">{t('contact.info.title', lang)}</h3>
            <div className="space-y-2">
              <p className="text-[15px] text-[#64748B] leading-relaxed">{t('contact.info.website', lang)}</p>
              <p className="text-[15px] text-[#64748B] leading-relaxed">{t('contact.info.email', lang)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-10">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">{t('contact.privacy.title', lang)}</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('contact.privacy.text', lang)}</p>
          </div>

          <p className="text-center text-xl font-bold text-[#1A1F36]">{t('contact.thanks', lang)}</p>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
