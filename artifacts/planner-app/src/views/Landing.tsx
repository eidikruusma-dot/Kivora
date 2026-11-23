import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AuroraBackground from '@/components/landing/AuroraBackground'
import { AuroraVisualDesktop, AuroraVisualMobile } from '@/components/landing/AuroraVisual'
import DeviceSyncIllustration from '@/components/landing/DeviceSyncIllustration'
import { CheckSquare, Calendar, StickyNote, Activity, Target, Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react'

type FeatureKey = 'tasks' | 'calendar' | 'notes' | 'habits' | 'goals' | 'ai'

const FEATURE_ICONS: Record<FeatureKey, React.ElementType> = {
  tasks: CheckSquare,
  calendar: Calendar,
  notes: StickyNote,
  habits: Activity,
  goals: Target,
  ai: Sparkles,
}

const FEATURE_KEYS: FeatureKey[] = ['tasks', 'calendar', 'notes', 'habits', 'goals', 'ai']

// Light, varied tint per feature so the grid reads as a considered "bento"
// set rather than six identical cards. "ai" gets the one dark-violet
// accent card — the single place real dark colour appears on the page.
const FEATURE_THEME: Record<FeatureKey, { card: string; iconBg: string; iconColor: string; title: string; desc: string }> = {
  tasks:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    title: 'text-[#1A1F36]', desc: 'text-[#475569]' },
  calendar: { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-sky-50',     iconColor: 'text-sky-600',     title: 'text-[#1A1F36]', desc: 'text-[#475569]' },
  notes:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   title: 'text-[#1A1F36]', desc: 'text-[#475569]' },
  habits:   { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', title: 'text-[#1A1F36]', desc: 'text-[#475569]' },
  goals:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-orange-50',  iconColor: 'text-orange-600',  title: 'text-[#1A1F36]', desc: 'text-[#475569]' },
  ai:       { card: 'bg-gradient-to-br from-[#2E1065] to-[#5B21B6] border border-[#4C1D95]', iconBg: 'bg-white/15', iconColor: 'text-white', title: 'text-white', desc: 'text-white/75' },
}

export default function Landing() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const shouldReduceMotion = useReducedMotion()

  // Shared scroll-reveal variants — a quick, light fade + small rise.
  // Reduced-motion preference collapses this to a plain, instant fade
  // (no transform, ~0 duration) rather than disabling the reveal
  // entirely, so content still appears without any motion.
  const fadeUp: Variants = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.01 } } }
    : { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } }

  const staggerContainer: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: shouldReduceMotion ? 0 : 0.07 } },
  }

  const features = FEATURE_KEYS.map((key) => ({
    key,
    Icon: FEATURE_ICONS[key],
    theme: FEATURE_THEME[key],
    title: t(`landing.feat.${key}.title` as Parameters<typeof t>[0], lang),
    desc:  t(`landing.feat.${key}.desc`  as Parameters<typeof t>[0], lang),
  }))

  const steps = [
    { step: '1', title: t('landing.step1.title', lang), desc: t('landing.step1.desc', lang) },
    { step: '2', title: t('landing.step2.title', lang), desc: t('landing.step2.desc', lang) },
    { step: '3', title: t('landing.step3.title', lang), desc: t('landing.step3.desc', lang) },
  ]

  const principles = [0, 1, 2, 3, 4].map((i) =>
    t(`landing.principle.${i}` as Parameters<typeof t>[0], lang)
  )

  const bottomChips = [
    { icon: Zap, labelKey: 'landing.hero.chip1' as const, bg: 'bg-blue-50', color: 'text-blue-600' },
    { icon: Target, labelKey: 'landing.hero.chip2' as const, bg: 'bg-orange-50', color: 'text-orange-600' },
    { icon: Sparkles, labelKey: 'landing.hero.chip3' as const, bg: 'bg-[#EDE9FB]', color: 'text-[#6F5AE8]' },
    { icon: RefreshCw, labelKey: 'landing.hero.chip4' as const, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  ]

  // The hero's five-item capability row (Kavand D's `.caps-row`) — real
  // Kivora capabilities, each reusing the same translation key used for
  // that module elsewhere on the page (no invented feature names).
  const auroraCapabilities = [
    { key: 'tasks', Icon: CheckSquare, label: t('hero.tasks', lang) },
    { key: 'calendar', Icon: Calendar, label: t('dash.calendar.title', lang) },
    { key: 'goals', Icon: Target, label: t('hero.goals', lang) },
    { key: 'habits', Icon: Activity, label: t('hero.habits', lang) },
    { key: 'ai', Icon: Sparkles, label: t('nav.assistant', lang) },
  ]

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#FBFAFF] via-[#F8F6FD] to-[#F4F1FB] overflow-x-hidden">
      <PublicHeader />

      {/* Hero — "Aurora Living Premium" (Kavand D, confirmed): a rich
          lavender-to-pink aurora light wash, glossy organic 3D shapes,
          floating glass UI fragments and one substantial dashboard
          preview, interlocked into a single scene rather than stacked
          layers. Ported from the approved static mockup; see
          AuroraBackground / AuroraVisual / AuroraDashboardPanel /
          AuroraGlassFragments for the piece-by-piece port notes. */}
      {/* pt-20 clears the fixed PublicHeader's 64px (h-16) bar with a bit of
          breathing room — pt-10 left the eyebrow badge mostly hidden behind
          the header on mobile, with only its rounded bottom edge visible. */}
      <section className="relative isolate pt-20 pb-8 sm:pb-20 overflow-hidden">
        <AuroraBackground />

        <div className="relative z-[2] max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-16">
          <div className="flex items-center gap-8 max-[720px]:flex-col max-[720px]:gap-[34px] lg:gap-[52px]">
            {/* LEFT: copy */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="flex-1 basis-[680px] min-w-0 max-[720px]:text-center max-[720px]:basis-auto"
            >
              <motion.h1
                variants={fadeUp}
                className="text-[2.5rem] leading-[1.08] sm:text-5xl lg:text-[60px] font-extrabold tracking-tight text-[#1A1F36] mb-3 min-[721px]:mb-4 max-w-[580px] max-[720px]:max-w-full max-[720px]:mx-auto"
              >
                {t('landing.hero.title', lang)} {t('landing.hero.titleAccent', lang)}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="text-sm font-semibold tracking-wide text-[#6D28D9] mb-3 min-[721px]:mb-4"
              >
                {t('landing.aurora.eyebrow', lang)}
              </motion.p>

              <motion.p
                variants={fadeUp}
                className="text-lg text-[#4A4F6A] leading-relaxed mb-5 min-[721px]:mb-9 max-w-[510px] max-[720px]:max-w-full max-[720px]:mx-auto max-[720px]:text-[15px]"
              >
                {t('landing.hero.subtitle', lang)}
              </motion.p>

              <motion.div variants={fadeUp} className="flex items-center gap-[18px] mb-[26px] min-[721px]:mb-[52px] max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-2">
                <button
                  onClick={() => navigate('/register')}
                  className="kv-aurora-glow relative overflow-hidden px-[34px] py-4 max-[720px]:py-3.5 rounded-full text-[16px] font-bold text-white bg-gradient-to-br from-[#A78BFA] to-[#6D28D9] inline-flex items-center justify-center gap-2 max-[720px]:w-full"
                >
                  <span aria-hidden="true" className="kv-aurora-shimmer absolute top-[-40%] left-0 w-[38px] h-[180%] bg-gradient-to-r from-white/0 via-white/55 to-white/0 pointer-events-none" />
                  <span className="relative">{t('landing.cta.start', lang)}</span>
                  <ArrowRight size={16} className="relative" />
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="px-8 py-4 max-[720px]:py-3.5 rounded-full text-[16px] font-semibold text-[#1A1F36] bg-white/50 backdrop-blur-xl border-[1.6px] border-[#DCD2FB] hover:bg-white/70 transition-colors max-[720px]:w-full"
                >
                  {t('landing.cta.login', lang)}
                </button>
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-x-5 max-[720px]:gap-x-5 gap-y-3.5 max-[720px]:gap-y-1.5 max-[720px]:justify-center">
                {auroraCapabilities.map(({ key, Icon, label }) => (
                  <div key={key} className="flex items-center gap-[9px] max-[720px]:gap-[6px] text-sm max-[720px]:text-[12.5px] font-semibold text-[#4A4F6A]">
                    <span className="w-[30px] h-[30px] max-[720px]:w-[25px] max-[720px]:h-[25px] rounded-[9px] bg-[#8B5CF6]/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={15} className="text-[#6D28D9] max-[720px]:hidden" />
                      <Icon size={13} className="text-[#6D28D9] hidden max-[720px]:block" />
                    </span>
                    {label}
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* RIGHT: interlocked aurora scene — desktop above 720px, a
                separate simplified composition at/under it (two mounted
                trees, CSS-toggled, same convention as the rest of the
                page's responsive sections). */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex-1 basis-[820px] min-w-0 max-[720px]:basis-auto max-[720px]:w-full"
            >
              <div className="hidden min-[721px]:block">
                <AuroraVisualDesktop lang={lang} />
              </div>
              <div className="max-[720px]:block hidden">
                <AuroraVisualMobile lang={lang} />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Synced across devices */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="mt-8 sm:mt-24 text-center max-w-[250px] sm:max-w-sm mx-auto"
        >
          <DeviceSyncIllustration className="w-full mb-2 sm:mb-5" />
          <p className="text-sm sm:text-lg font-bold text-[#1A1F36]">{t('landing.hero.syncTitle', lang)}</p>
          <p className="text-xs sm:text-sm text-[#475569] mt-0.5 sm:mt-1">{t('landing.hero.syncSubtitle', lang)}</p>
        </motion.div>

        {/* Four benefit chips — kept visually close to the sync block above
            (small top margin on mobile) so the two read as one compact unit */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="mt-4 sm:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3 max-w-2xl mx-auto"
        >
          {bottomChips.map(({ icon: Icon, labelKey, bg, color }) => (
            <motion.div
              key={labelKey}
              variants={fadeUp}
              className="flex flex-col items-center text-center gap-1 sm:gap-2 bg-white/70 backdrop-blur rounded-2xl border border-[#EEE9FB] px-3 py-2 sm:py-4"
            >
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={16} className={`${color} sm:hidden`} />
                <Icon size={17} className={`${color} hidden sm:block`} />
              </div>
              <span className="text-xs font-semibold text-[#1A1F36]">{t(labelKey, lang)}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Features preview — a soft "bento" set: varied tints, one dark-violet
          accent card (AI assistant), never six identical tiles */}
      <section id="features" className="py-8 sm:py-20 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] text-center mb-2.5">{t('landing.features.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm sm:text-base text-[#475569] text-center mb-5 sm:mb-12">{t('landing.features.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5">
            {features.map(({ key, Icon, theme, title, desc }) => (
              <motion.div
                key={key}
                variants={fadeUp}
                className={`rounded-2xl sm:rounded-3xl p-2.5 sm:p-7 flex items-center sm:block gap-2.5 sm:gap-0 ${theme.card} hover:shadow-[0_20px_45px_-28px_rgba(111,90,232,0.35)] hover:-translate-y-0.5 transition-all`}
              >
                <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${theme.iconBg} flex items-center justify-center flex-shrink-0 sm:mb-5`}>
                  <Icon size={16} className={`${theme.iconColor} sm:hidden`} />
                  <Icon size={22} className={`${theme.iconColor} hidden sm:block`} />
                </div>
                <div className="min-w-0">
                  <h3 className={`text-[12.5px] sm:text-base font-bold mb-0.5 sm:mb-2 ${theme.title}`}>{title}</h3>
                  <p className={`text-[10.5px] sm:text-sm leading-snug sm:leading-relaxed ${theme.desc}`}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How it works — three simple steps */}
      <section id="how-it-works" className="py-8 sm:py-20 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-2.5">{t('landing.how.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm sm:text-base text-[#475569] mb-5 sm:mb-12">{t('landing.how.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-3 gap-3 sm:gap-8">
            {steps.map(({ step, title, desc }) => (
              <motion.div key={step} variants={fadeUp} className="text-center">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#6F5AE8] to-[#8B5CF6] text-white font-bold text-sm sm:text-base flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-[0_10px_24px_-8px_rgba(111,90,232,0.5)]">
                  {step}
                </div>
                <h3 className="text-xs sm:text-base font-bold text-[#1A1F36] mb-1 leading-snug">{title}</h3>
                <p className="text-[11px] sm:text-sm text-[#475569] leading-snug">{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* About — short and to the point */}
      <section id="about" className="py-6 sm:py-20 px-4 sm:px-6 scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-2xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-2.5">{t('landing.about.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm font-semibold text-[#6F5AE8] mb-3 sm:mb-7">{t('landing.about.tagline', lang)}</motion.p>

          <motion.div variants={fadeUp} className="space-y-1.5 mb-3 sm:space-y-3 sm:mb-7">
            <p className="text-sm sm:text-[15px] text-[#475569] leading-snug sm:leading-relaxed">{t('landing.about.p1', lang)}</p>
            <p className="text-sm sm:text-[15px] text-[#475569] leading-snug sm:leading-relaxed">{t('landing.about.p2', lang)}</p>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-8">
            {principles.map((principle) => (
              <span
                key={principle}
                className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-white border border-[#EEE9FB] text-xs font-medium text-[#1A1F36] shadow-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[#6F5AE8] to-[#8B5CF6] flex-shrink-0" />
                {principle}
              </span>
            ))}
          </motion.div>

          <motion.p variants={fadeUp} className="text-lg sm:text-2xl font-extrabold tracking-tight text-[#1A1F36]">
            {t('landing.finalTagline', lang)}
          </motion.p>
        </motion.div>
      </section>

      {/* Final CTA — premium card with a soft glow behind it */}
      <section className="py-6 sm:py-24 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="relative max-w-2xl mx-auto"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-40 rounded-full bg-[#8B5CF6]/[0.18] blur-3xl" />
          </div>
          <div className="text-center bg-white/90 backdrop-blur rounded-[28px] sm:rounded-[32px] border border-[#EEE9FB] shadow-[0_30px_70px_-30px_rgba(111,90,232,0.4)] px-6 py-6 sm:px-10 sm:py-16">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-1.5 sm:mb-3">{t('landing.cta2.title', lang)}</h2>
            <p className="text-sm sm:text-base text-[#475569] mb-3 sm:mb-7">{t('landing.cta2.subtitle', lang)}</p>
            <button
              onClick={() => navigate('/register')}
              className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#6F5AE8] to-[#8B5CF6] text-white text-sm font-bold shadow-[0_14px_32px_-10px_rgba(111,90,232,0.6)] hover:shadow-[0_18px_38px_-8px_rgba(111,90,232,0.7)] hover:-translate-y-0.5 active:scale-[0.98] transition-all inline-flex items-center gap-2"
            >
              {t('landing.cta.start', lang)}
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </section>

      <PublicFooter />
    </div>
  )
}
