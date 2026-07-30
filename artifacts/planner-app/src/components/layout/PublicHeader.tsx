import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import LanguageToggle from '@/components/layout/LanguageToggle'

export default function PublicHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const navLinks = [
    { href: '#features',     label: t('pub.nav.features',    lang) },
    { href: '#how-it-works', label: t('pub.nav.howItWorks',  lang) },
    { href: '#about',        label: t('pub.nav.about',       lang) },
  ]

  function handleLogoClick() {
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/')
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#F4F3EF]/80 backdrop-blur-md border-b border-[#EBEBEB]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <button onClick={handleLogoClick} className="inline-flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#6F5AE8] flex items-center justify-center">
            <span className="text-white font-bold text-sm tracking-tight">K</span>
          </div>
          <span className="text-base font-bold text-[#1A1F36] tracking-tight">kivora</span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#64748B] hover:text-[#1A1F36] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageToggle />
          <button
            onClick={() => navigate('/login')}
            className="text-sm font-medium text-[#1A1F36] hover:text-[#6F5AE8] transition-colors px-4 py-2"
          >
            {t('pub.nav.login', lang)}
          </button>
          <button
            onClick={() => navigate('/register')}
            className="text-sm font-semibold text-white bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors px-5 py-2.5 rounded-xl"
          >
            {t('pub.nav.start', lang)}
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-[#1A1F36]"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-[#EBEBEB] px-4 py-4 space-y-3">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block text-sm font-medium text-[#64748B] hover:text-[#1A1F36] transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-3 border-t border-[#EBEBEB] flex flex-col gap-2">
            <div className="pb-1"><LanguageToggle /></div>
            <button
              onClick={() => { setMobileOpen(false); navigate('/login') }}
              className="text-sm font-medium text-[#1A1F36] py-2 text-left"
            >
              {t('pub.nav.login', lang)}
            </button>
            <button
              onClick={() => { setMobileOpen(false); navigate('/register') }}
              className="text-sm font-semibold text-white bg-[#6F5AE8] py-2.5 rounded-xl"
            >
              {t('pub.nav.start', lang)}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
