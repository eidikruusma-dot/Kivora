import { useState, useEffect } from 'react'
import { applyLanguage, getLocalLangSettings, subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'

interface Props {
  className?: string
}

/**
 * A simple ET | EN pill toggle for use on public pages and auth screens.
 * Reads from and writes to the language store (localStorage).
 */
export default function LanguageToggle({ className = '' }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => subscribeToLanguage((settings) => setLang(settings.appLang)), [])

  function toggle(next: AppLang) {
    if (next === lang) return
    const current = getLocalLangSettings()
    applyLanguage({ ...current, appLang: next })
  }

  return (
    <div
      className={`flex items-center border border-[#D1D5DB] rounded-lg overflow-hidden ${className}`}
      style={{ height: '32px' }}
    >
      {(['et', 'en'] as AppLang[]).map((code) => (
        <button
          key={code}
          onClick={() => toggle(code)}
          className={`px-3 h-full text-xs font-semibold uppercase transition-colors ${
            lang === code
              ? 'bg-[#6F5AE8] text-white'
              : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] bg-white'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
