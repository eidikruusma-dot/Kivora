import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AppPreviewMock from '@/components/landing/AppPreviewMock'
import { CheckSquare, Calendar, StickyNote, Activity, Target, Sparkles, ArrowRight } from 'lucide-react'

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
  tasks:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    title: 'text-[#1A1F36]', desc: 'text-[#64748B]' },
  calendar: { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-sky-50',     iconColor: 'text-sky-600',     title: 'text-[#1A1F36]', desc: 'text-[#64748B]' },
  notes:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   title: 'text-[#1A1F36]', desc: 'text-[#64748B]' },
  habits:   { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', title: 'text-[#1A1F36]', desc: 'text-[#64748B]' },
  goals:    { card: 'bg-white border border-[#EEE9FB]',    iconBg: 'bg-orange-50',  iconColor: 'text-orange-600',  title: 'text-[#1A1F36]', desc: 'text-[#64748B]' },
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

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#FBFAFF] via-[#F8F6FD] to-[#F4F1FB] overflow-x-hidden">
      <PublicHeader />

      {/* Hero — the one "effective and modern" section; everything below stays minimal */}
      <section className="relative pt-28 pb-14 px-4 sm:px-6 sm:pt-32 sm:pb-20 overflow-hidden">
        {/* Decorative background — pure CSS, no images, no layout impact.
            Soft lavender/white glow blobs with a slow, cheap transform-only
            float; disabled entirely under prefers-reduced-motion. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="kv-landing-float-1 absolute -top-28 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-[#8B5CF6]/[0.14] blur-3xl" />
          <div className="kv-landing-float-2 absolute top-24 right-[-8rem] w-80 h-80 rounded-full bg-[#6F5AE8]/[0.12] blur-3xl" />
          <div className="absolute bottom-0 left-[-6rem] w-72 h-72 rounded-full bg-[#C4B5FD]/[0.18] blur-3xl" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur border border-[#EDE6FB] text-[#6F5AE8] text-xs font-semibold mb-6 shadow-sm"
          >
            <Sparkles size={14} />
            {t('landing.badge', lang)}
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-5"
          >
            <span className="block text-[#1A1F36]">{t('landing.hero.title', lang)}</span>
            <span className="block bg-gradient-to-r from-[#6F5AE8] via-[#8B5CF6] to-[#6F5AE8] bg-clip-text text-transparent">
              {t('landing.hero.titleAccent', lang)}
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-base sm:text-lg text-[#64748B] leading-relaxed mb-8 max-w-xl mx-auto">
            {t('landing.hero.subtitle', lang)}
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#6F5AE8] to-[#8B5CF6] text-white text-sm font-bold shadow-[0_14px_32px_-10px_rgba(111,90,232,0.6)] hover:shadow-[0_18px_38px_-8px_rgba(111,90,232,0.7)] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {t('landing.cta.start', lang)}
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-white/70 backdrop-blur border border-[#E4DEFB] text-[#1A1F36] text-sm font-semibold hover:bg-white hover:border-[#D6CCFA] active:scale-[0.98] transition-all"
            >
              {t('landing.cta.login', lang)}
            </button>
          </motion.div>
          <motion.p variants={fadeUp} className="text-xs text-[#94A3B8] mt-3">{t('landing.cta.free', lang)}</motion.p>

          <motion.div variants={fadeUp} className="mt-12 sm:mt-16">
            <AppPreviewMock lang={lang} />
          </motion.div>
        </motion.div>
      </section>

      {/* Features preview — a soft "bento" set: varied tints, one dark-violet
          accent card (AI assistant), never six identical tiles */}
      <section id="features" className="py-14 sm:py-20 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] text-center mb-2.5">{t('landing.features.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm sm:text-base text-[#64748B] text-center mb-8 sm:mb-12">{t('landing.features.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {features.map(({ key, Icon, theme, title, desc }) => (
              <motion.div
                key={key}
                variants={fadeUp}
                className={`rounded-2xl sm:rounded-3xl p-4 sm:p-7 ${theme.card} hover:shadow-[0_20px_45px_-28px_rgba(111,90,232,0.35)] hover:-translate-y-0.5 transition-all`}
              >
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${theme.iconBg} flex items-center justify-center mb-3 sm:mb-5`}>
                  <Icon size={17} className={`${theme.iconColor} sm:hidden`} />
                  <Icon size={22} className={`${theme.iconColor} hidden sm:block`} />
                </div>
                <h3 className={`text-[13px] sm:text-base font-bold mb-1 sm:mb-2 ${theme.title}`}>{title}</h3>
                <p className={`text-[12px] sm:text-sm leading-snug sm:leading-relaxed ${theme.desc}`}>{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How it works — three simple steps */}
      <section id="how-it-works" className="py-14 sm:py-20 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-2.5">{t('landing.how.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm sm:text-base text-[#64748B] mb-8 sm:mb-12">{t('landing.how.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {steps.map(({ step, title, desc }) => (
              <motion.div key={step} variants={fadeUp} className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#6F5AE8] to-[#8B5CF6] text-white font-bold text-base flex items-center justify-center mx-auto mb-3 shadow-[0_10px_24px_-8px_rgba(111,90,232,0.5)]">
                  {step}
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#1A1F36] mb-1">{title}</h3>
                <p className="text-sm text-[#64748B]">{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* About — short and to the point */}
      <section id="about" className="py-14 sm:py-20 px-4 sm:px-6 scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-2xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-2.5">{t('landing.about.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm font-semibold text-[#6F5AE8] mb-6 sm:mb-7">{t('landing.about.tagline', lang)}</motion.p>

          <motion.div variants={fadeUp} className="space-y-3 mb-7">
            <p className="text-sm sm:text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p1', lang)}</p>
            <p className="text-sm sm:text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p2', lang)}</p>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {principles.map((principle) => (
              <span
                key={principle}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#EEE9FB] text-xs font-medium text-[#1A1F36] shadow-sm"
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
      <section className="py-16 sm:py-24 px-4 sm:px-6">
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
          <div className="text-center bg-white/90 backdrop-blur rounded-[28px] sm:rounded-[32px] border border-[#EEE9FB] shadow-[0_30px_70px_-30px_rgba(111,90,232,0.4)] px-6 py-12 sm:px-10 sm:py-16">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F36] mb-3">{t('landing.cta2.title', lang)}</h2>
            <p className="text-sm sm:text-base text-[#64748B] mb-7">{t('landing.cta2.subtitle', lang)}</p>
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
