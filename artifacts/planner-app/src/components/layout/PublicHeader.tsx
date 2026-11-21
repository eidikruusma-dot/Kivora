import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import LanguageToggle from '@/components/layout/LanguageToggle'
import InstallButton from '@/components/landing/InstallButton'
import KivoraLogo from '@/components/brand/KivoraLogo'

export default function PublicHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const headerRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  // Lock the page's own scroll while the full-screen mobile menu is open —
  // the `position: fixed` + remembered `scrollY` technique (rather than a
  // plain `overflow: hidden`) because it also stops iOS Safari's
  // scroll-into-view/rubber-banding from reaching the body underneath, and
  // restoring `scrollY` on close keeps the visitor at the exact same
  // scroll position (no `overflow:hidden`/scroll-lock convention exists
  // elsewhere in this codebase yet to reuse — see PublicHeader's own
  // history for why this one was written by hand).
  useEffect(() => {
    if (!mobileOpen) return
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    style.overflow = 'hidden'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [mobileOpen])

  // Escape-to-close (same convention used by the app's other hand-rolled
  // modals) plus a simple Tab focus trap across every focusable element
  // the open menu exposes: the header's own top row (logo, toggle) plus
  // the nav panel (links, language toggle, install/login/register). The
  // panel is a sibling of <header> rather than nested inside it — nesting
  // it inside would put it under <header>'s `backdrop-blur-md`, and a
  // `backdrop-filter` ancestor makes a `position: fixed` descendant size
  // itself against THAT ancestor's own box instead of the viewport, which
  // collapsed the panel to 0 height (header's own height is just its
  // 64px top row) — so the trap reads two refs instead of one DOM subtree.
  useEffect(() => {
    if (!mobileOpen) return
    toggleRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        toggleRef.current?.focus()
        return
      }
      if (e.key !== 'Tab') return
      const selector = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      const focusables = [
        ...(headerRef.current?.querySelectorAll<HTMLElement>(selector) ?? []),
        ...(panelRef.current?.querySelectorAll<HTMLElement>(selector) ?? []),
      ]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const navLinks = [
    { href: '#features',     label: t('pub.nav.features',    lang) },
    { href: '#how-it-works', label: t('pub.nav.howItWorks',  lang) },
    { href: '#about',        label: t('pub.nav.about',       lang) },
  ]

  // Anchors only exist on the landing page itself. On other public routes
  // (e.g. /privacy, /terms, /contact — which also render this header),
  // prefix with '/' so the link navigates to the landing page and lets the
  // browser's native hash-scroll land on the target section there.
  const onLanding = location.pathname === '/'
  function navHref(anchor: string): string {
    return onLanding ? anchor : `/${anchor}`
  }

  function handleLogoClick() {
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/')
    }
  }

  return (
    <>
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-[#F4F3EF]/80 backdrop-blur-md border-b border-[#EBEBEB]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <button onClick={handleLogoClick} className="inline-flex items-center hover:opacity-80 transition-opacity">
          <KivoraLogo height={28} />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={navHref(link.href)}
              className="text-sm font-medium text-[#64748B] hover:text-[#1A1F36] transition-colors"
            >
              {link.label}
            </a>
          ))}
          <InstallButton lang={lang} />
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

        {/* Mobile menu button — also the panel's close control once open,
            so focus naturally lands back on the same element either way */}
        <button
          ref={toggleRef}
          className="md:hidden p-2 text-[#1A1F36]"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls="kv-mobile-nav-panel"
          aria-label={t(mobileOpen ? 'pub.nav.closeMenu' : 'pub.nav.openMenu', lang)}
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
    </header>

      {/* Mobile menu — a full-viewport overlay (not an in-flow dropdown)
          so the landing page never shows through underneath. A sibling of
          <header> rather than nested inside it: <header> has
          `backdrop-blur-md`, and a `backdrop-filter` ancestor makes a
          `position: fixed` descendant size itself against THAT ancestor's
          box instead of the viewport (a Chromium/WebKit containing-block
          quirk) — nested here, `top-16 bottom-0` resolved against
          <header>'s own 64px height and collapsed the panel to 0px tall.
          As a sibling it stretches to fill the gap between `top-16` and
          `bottom-0` against the browser's *current* viewport edges, which
          is what keeps it full-height as mobile browser toolbars
          show/hide (the thing a fixed `100vh`/`100dvh` height can get a
          frame behind). `role="dialog"`/`aria-modal` + the focus
          trap/Escape/scroll-lock above follow the standard disclosure-menu
          pattern; everything inside is still the header's real, working
          nav — same links, language toggle, install, login and register
          as before, just restyled as a full screen. */}
      {mobileOpen && (
        <div
          id="kv-mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('pub.nav.menuLabel', lang)}
          className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-[#FBFAFF] overflow-hidden kv-modal-enter"
        >
          {/* Pearl-white base + soft lavender/pink light wash, echoing the
              Aurora Living Premium hero's palette (AuroraBackground) but
              toned down and static — a calm nav surface, not a second hero.
              This decorative layer sits on the OUTER, non-scrolling panel
              (not inside the scrollable <nav> below it): an earlier version
              nested it inside the scrollable element, so scrolling a long
              menu scrolled the background away too and the real page
              showed through underneath. */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            <span
              className="absolute rounded-full blur-[90px] opacity-50 w-[320px] h-[320px] -top-24 -right-20"
              style={{ background: 'radial-gradient(circle, #C4B5FD 0%, rgba(196,181,253,.4) 50%, transparent 78%)' }}
            />
            <span
              className="absolute rounded-full blur-[90px] opacity-40 w-[280px] h-[280px] -bottom-24 -left-16"
              style={{ background: 'radial-gradient(circle, #F3B4D6 0%, rgba(243,180,214,.35) 50%, transparent 78%)' }}
            />
          </div>

          <nav aria-label={t('pub.nav.menuLabel', lang)} className="relative h-full overflow-y-auto overscroll-contain px-6 py-8 flex flex-col">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={navHref(link.href)}
                  className="block text-base font-semibold text-[#1A1F36] py-3"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-[#E8E3FB] flex flex-col gap-3">
              <div className="pb-1"><LanguageToggle /></div>
              <InstallButton
                lang={lang}
                onAction={() => setMobileOpen(false)}
                className="py-2 text-left"
              />
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
          </nav>
        </div>
      )}
    </>
  )
}
