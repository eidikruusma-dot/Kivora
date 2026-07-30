import { useState, useEffect } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function HelpPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1F36] mb-3">{t('help.title', lang)}</h1>
      <p className="text-sm text-[#64748B]">{t('help.comingSoon', lang)}</p>
    </div>
  )
}
