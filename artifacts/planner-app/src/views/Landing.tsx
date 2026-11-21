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
    <div className="min-h-[100dvh] bg-[#F4F3EF] overflow-x-hidden">
      <PublicHeader />

      {/* Hero — the one "effective and modern" section; everything below stays minimal */}
      <section className="relative pt-28 pb-14 px-4 sm:px-6 sm:pt-32 sm:pb-20 overflow-hidden">
        {/* Decorative background — pure CSS, no images, no layout impact */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[32rem] h-[32rem] rounded-full bg-[#6F5AE8]/[0.12] blur-3xl" />
          <div className="absolute top-20 right-[-6rem] w-72 h-72 rounded-full bg-[#6F5AE8]/[0.08] blur-3xl" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-xs font-semibold mb-5"
          >
            <Sparkles size={14} />
            {t('landing.badge', lang)}
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-[2.25rem] leading-[1.1] sm:text-5xl font-bold text-[#1A1F36] sm:leading-tight mb-4 whitespace-pre-line">
            {t('landing.hero.title', lang)}
          </motion.h1>
          <motion.p variants={fadeUp} className="text-base sm:text-lg text-[#64748B] leading-relaxed mb-7 max-w-xl mx-auto">
            {t('landing.hero.subtitle', lang)}
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {t('landing.cta.start', lang)}
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white border border-[#E8E6E0] text-[#1A1F36] text-sm font-semibold hover:bg-[#F8F7F4] active:scale-[0.98] transition-all"
            >
              {t('landing.cta.login', lang)}
            </button>
          </motion.div>
          <motion.p variants={fadeUp} className="text-xs text-[#94A3B8] mt-3">{t('landing.cta.free', lang)}</motion.p>

          <motion.div variants={fadeUp} className="mt-10 sm:mt-14">
            <AppPreviewMock lang={lang} />
          </motion.div>
        </motion.div>
      </section>

      {/* Features preview — compact cards, 2-up even on small phones */}
      <section id="features" className="py-12 sm:py-16 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto"
        >
          <motion.h2 variants={fadeUp} className="text-xl sm:text-2xl font-bold text-[#1A1F36] text-center mb-2">{t('landing.features.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm text-[#64748B] text-center mb-7 sm:mb-10">{t('landing.features.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {features.map(({ key, Icon, title, desc }) => (
              <motion.div
                key={key}
                variants={fadeUp}
                className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-6 border border-[#EBEBEB] hover:shadow-sm transition-shadow"
              >
                <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#EDE9FB] flex items-center justify-center mb-2.5 sm:mb-4">
                  <Icon size={16} className="text-[#6F5AE8] sm:hidden" />
                  <Icon size={20} className="text-[#6F5AE8] hidden sm:block" />
                </div>
                <h3 className="text-[13px] sm:text-sm font-bold text-[#1A1F36] mb-1 sm:mb-1.5">{title}</h3>
                <p className="text-[12px] sm:text-sm text-[#64748B] leading-snug sm:leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How it works — three simple steps */}
      <section id="how-it-works" className="py-12 sm:py-16 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-xl sm:text-2xl font-bold text-[#1A1F36] mb-2">{t('landing.how.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm text-[#64748B] mb-7 sm:mb-10">{t('landing.how.subtitle', lang)}</motion.p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            {steps.map(({ step, title, desc }) => (
              <motion.div key={step} variants={fadeUp} className="text-center">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#6F5AE8] text-white font-bold text-sm flex items-center justify-center mx-auto mb-2.5 sm:mb-3">
                  {step}
                </div>
                <h3 className="text-sm font-bold text-[#1A1F36] mb-1">{title}</h3>
                <p className="text-sm text-[#64748B]">{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* About — short and to the point */}
      <section id="about" className="py-12 sm:py-16 px-4 sm:px-6 scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="max-w-2xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-xl sm:text-2xl font-bold text-[#1A1F36] mb-2">{t('landing.about.title', lang)}</motion.h2>
          <motion.p variants={fadeUp} className="text-sm font-semibold text-[#6F5AE8] mb-5 sm:mb-6">{t('landing.about.tagline', lang)}</motion.p>

          <motion.div variants={fadeUp} className="space-y-3 mb-6">
            <p className="text-sm sm:text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p1', lang)}</p>
            <p className="text-sm sm:text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p2', lang)}</p>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-2 mb-7">
            {principles.map((principle) => (
              <span
                key={principle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#EBEBEB] text-xs font-medium text-[#1A1F36]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#6F5AE8] flex-shrink-0" />
                {principle}
              </span>
            ))}
          </motion.div>

          <motion.p variants={fadeUp} className="text-lg sm:text-xl font-bold text-[#1A1F36]">
            {t('landing.finalTagline', lang)}
          </motion.p>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className="py-14 sm:py-20 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="max-w-2xl mx-auto text-center bg-white rounded-2xl border border-[#EBEBEB] px-6 py-10 sm:px-8 sm:py-12"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-[#1A1F36] mb-3">{t('landing.cta2.title', lang)}</h2>
          <p className="text-sm text-[#64748B] mb-6">{t('landing.cta2.subtitle', lang)}</p>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] active:scale-[0.98] transition-all inline-flex items-center gap-2"
          >
            {t('landing.cta.start', lang)}
            <ArrowRight size={16} />
          </button>
        </motion.div>
      </section>

      <PublicFooter />
    </div>
  )
}
