import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getDailyMessage } from '@/lib/dailyMessage'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL, MONTHS_ET, MONTHS_EN } from '@/lib/calendar/dateUtils'
import heroBloom from '@/assets/dashboard/hero-bloom.webp'

export default function HeroCard() {
  const { user } = useAuth()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('hero.morning', lang) : hour < 18 ? t('hero.afternoon', lang) : t('hero.evening', lang)
  const name = user?.displayName || t('header.user', lang)
  const dailyMsg = getDailyMessage({ date: new Date(), lang })

  const today = new Date()
  const weekday = lang === 'en' ? WEEKDAYS_EN_FULL[(today.getDay() + 6) % 7] : WEEKDAYS_ET_FULL[(today.getDay() + 6) % 7]
  const month = lang === 'en' ? MONTHS_EN[today.getMonth()] : MONTHS_ET[today.getMonth()]
  const dateLabel = lang === 'en'
    ? `${weekday}, ${month} ${today.getDate()}, ${today.getFullYear()}`
    : `${weekday}, ${today.getDate()}. ${month.toLowerCase()} ${today.getFullYear()}`

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#E4D6FB] dark:bg-[#2A1D52] shadow-[0_22px_48px_rgba(99,69,181,0.22),0_4px_14px_rgba(99,69,181,0.1)] dark:shadow-[0_22px_48px_rgba(0,0,0,0.4),0_4px_14px_rgba(0,0,0,0.25)] px-5 sm:px-7 py-5 sm:py-7">
      {/* The photo itself, `cover`-sized so it fills the card edge to edge
         at every breakpoint — never letterboxed, so there is no visible
         seam against a fallback color and no empty bars above/below on
         phones. `bg-cover` always crops rather than shrinks, so the
         position below (not the size) is what keeps the bloom framed:
         anchored further right on narrow phones (where cover crops more
         off the left) and progressively less so on wider screens (where
         cover crops top/bottom instead and the bloom is naturally fully
         visible already). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-no-repeat bg-[position:82%_center] sm:bg-[position:72%_center] lg:bg-[position:64%_center]"
        style={{ backgroundImage: `url(${heroBloom})` }}
      />

      {/* Dark-mode-only uniform darkening scrim over the WHOLE card — the
         source photo is a pale, light-toned pearl/lavender image, so dark
         mode needs an even scrim across it (bloom included), not just
         near the text, to read as part of the dark theme. Fully
         transparent in light mode. */}
      <div className="absolute inset-0 bg-transparent dark:bg-[#140D28]/45" />

      {/* Smooth transparent gradient behind the text specifically — pale
         (light mode) or dark (dark mode) near the greeting, fading to
         fully transparent toward the bloom on the right, so the text
         always has enough contrast regardless of exactly what part of
         the photo ends up behind it after cover-cropping. Wider/more
         opaque on mobile (where the greeting spans the full card width)
         than on sm+ (where it's already confined to the left by the
         pr-40/pr-52 reserved space). */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/55 to-transparent sm:from-white/80 sm:via-white/30 sm:to-transparent dark:from-black/60 dark:via-black/30 dark:to-transparent sm:dark:from-black/55 sm:dark:via-black/20 sm:dark:to-transparent" />

      <div className="relative min-w-0 pr-0 sm:pr-40 md:pr-52">
        <p className="text-2xl sm:text-3xl font-bold text-[#3D2B6B] dark:text-white leading-tight">
          {greeting},
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-[#3D2B6B] dark:text-white leading-tight mb-2">
          {name} 👋
        </p>
        <p className="text-sm text-[#5B4A8A] dark:text-white/85 font-medium">{dateLabel}</p>
        <p className="text-sm sm:text-base text-[#5B4A8A] dark:text-white/90 italic mt-3 max-w-md">
          „{dailyMsg}"
        </p>
      </div>
    </div>
  )
}
