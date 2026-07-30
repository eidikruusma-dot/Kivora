import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function PublicFooter() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <footer className="border-t border-[#EBEBEB] bg-[#F4F3EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#6F5AE8] flex items-center justify-center">
              <span className="text-white font-bold text-xs tracking-tight">K</span>
            </div>
            <span className="text-sm font-bold text-[#1A1F36] tracking-tight">kivora</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-[#64748B]">
            <Link to="/privacy" className="hover:text-[#1A1F36] transition-colors">{t('footer.privacy', lang)}</Link>
            <Link to="/terms"   className="hover:text-[#1A1F36] transition-colors">{t('footer.terms',   lang)}</Link>
            <Link to="/contact" className="hover:text-[#1A1F36] transition-colors">{t('footer.contact', lang)}</Link>
          </div>
          <p className="text-xs text-[#94A3B8]">© {new Date().getFullYear()} Kivora. {t('footer.copyright', lang)}</p>
        </div>
      </div>
    </footer>
  )
}
