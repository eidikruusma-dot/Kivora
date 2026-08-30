import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import KivoraLogo from '@/components/brand/KivoraLogo'

export default function PublicFooter() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <footer className="border-t border-[#EBEBEB] bg-[#F4F3EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="inline-flex items-center hover:opacity-80 transition-opacity">
            <KivoraLogo height={24} />
          </Link>
          {/* Mobile-only, below 360px: flex-wrap lets these 3 links wrap to
              a second line instead of overflowing the page — confirmed via
              a real Chromium render of the compiled Tailwind output, the
              three Estonian labels ("Privaatsuspoliitika" etc.) don't fit
              on one line at 320px and pushed the whole footer ~21px past
              the viewport edge. min-[360px]: reverts flex-wrap/justify/gap
              back to the exact original single-line row (flex-nowrap,
              default justify, gap-6) starting at 360px — the width already
              confirmed to render this row with no page-level overflow —
              rather than at 640px (there's no sm:/md: breakpoint between
              360 and where the outer row itself switches to a horizontal
              layout, so a plain sm: override would have kept wrapping the
              row all the way up through 639px, well past where it already
              fit). gap-y-2 only ever applies to the wrapped (<360px) case:
              the vertical space between the two wrapped lines. */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 min-[360px]:flex-nowrap min-[360px]:justify-start min-[360px]:gap-6 text-sm text-[#64748B]">
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
