import { type ReactNode, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import LanguageToggle from '@/components/layout/LanguageToggle'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

function Logo() {
  return (
    <Link to="/" className="inline-flex items-center">
      <img src="/kivora-logo.png" alt="Kivora" height={28} style={{ height: 28, width: 'auto', objectFit: 'contain' }} draggable={false} />
    </Link>
  )
}

function BrandIllustration() {
  return (
    <svg viewBox="0 0 400 240" className="w-full max-w-[300px] mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="320" cy="52" r="32" fill="#6F5AE8" opacity="0.13" />
      <path d="M130 72 Q134 68 138 72" stroke="#6F5AE8" strokeWidth="1.2" strokeOpacity="0.3" fill="none" />
      <path d="M148 62 Q153 57 158 62" stroke="#6F5AE8" strokeWidth="1.2" strokeOpacity="0.25" fill="none" />
      <path d="M-10 240 L70 95 L140 140 L200 68 L275 118 L345 82 L410 138 L410 240 Z" fill="#6F5AE8" opacity="0.13" />
      <path d="M-10 240 L50 128 L120 168 L185 108 L248 155 L318 112 L410 172 L410 240 Z" fill="#6F5AE8" opacity="0.22" />
      <line x1="200" y1="68" x2="200" y2="50" stroke="#6F5AE8" strokeWidth="1.5" strokeOpacity="0.5" />
      <path d="M200 50 L213 55 L200 60 Z" fill="#6F5AE8" opacity="0.55" />
      <path d="M-10 240 L80 188 L165 205 L255 183 L340 198 L410 188 L410 240 Z" fill="#6F5AE8" opacity="0.32" />
      <path d="M-10 240 L410 240 L410 218 L340 210 L255 200 L165 218 L80 205 L-10 218 Z" fill="#6F5AE8" opacity="0.18" />
      <rect x="93" y="197" width="3" height="16" rx="1" fill="#6F5AE8" opacity="0.45" />
      <ellipse cx="94.5" cy="194" rx="8" ry="9" fill="#6F5AE8" opacity="0.32" />
      <rect x="270" y="188" width="3" height="14" rx="1" fill="#6F5AE8" opacity="0.4" />
      <ellipse cx="271.5" cy="185" rx="7" ry="8" fill="#6F5AE8" opacity="0.28" />
      <path d="M94 205 Q140 185 168 160 Q185 140 200 108" stroke="white" strokeWidth="1.2" strokeDasharray="4 4" strokeOpacity="0.5" fill="none" />
    </svg>
  )
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const taglines = t('auth.brandTagline', lang).split('\n')

  return (
    <div className="min-h-[100dvh] bg-[#F4F3EF] flex items-center justify-center px-4 py-8 lg:py-10">
      <div className="w-full max-w-[950px] lg:flex lg:rounded-3xl lg:shadow-sm lg:border lg:border-[#EBEBEB] lg:overflow-hidden bg-white">
        {/* Brand panel — hidden on mobile */}
        <div className="hidden lg:flex lg:w-[440px] bg-[#EDE9FB] flex-col justify-between p-8">
          <Logo />
          <div className="flex-1 flex flex-col justify-end">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#1A1F36] leading-snug mb-3">
                {taglines[0]}<br />{taglines[1]}
              </h2>
              <p className="text-sm text-[#64748B] leading-relaxed max-w-[300px]">
                {t('auth.brandSubtitle', lang)}
              </p>
            </div>
            <div className="px-6">
              <BrandIllustration />
            </div>
          </div>
          <p className="text-xs text-[#94A3B8]">© {new Date().getFullYear()} Kivora. {t('auth.copyright', lang)}</p>
        </div>

        {/* Form panel */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-[500px]">
            {/* Mobile logo + toggle */}
            <div className="lg:hidden mb-8 flex items-center justify-between">
              <Logo />
              <LanguageToggle />
            </div>
            {/* Desktop toggle */}
            <div className="hidden lg:flex justify-end mb-4">
              <LanguageToggle />
            </div>

            <h1 className="text-xl font-bold text-[#1A1F36] mb-1">{title}</h1>
            {subtitle && <p className="text-sm text-[#94A3B8] mb-6">{subtitle}</p>}
            <div className={subtitle ? '' : 'mt-5'}>
              {children}
            </div>

            {footer && <div className="text-center mt-6 text-sm text-[#64748B]">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
