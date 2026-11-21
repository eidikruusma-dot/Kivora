import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AppPreviewMock from '@/components/landing/AppPreviewMock'
import PhoneFrame from '@/components/landing/PhoneFrame'
import LaptopFrame from '@/components/landing/LaptopFrame'
import TabletFrame from '@/components/landing/TabletFrame'
import DesktopScreenMock from '@/components/landing/DesktopScreenMock'
import TabletScreenMock from '@/components/landing/TabletScreenMock'
import PhoneScreenMockCompact from '@/components/landing/PhoneScreenMockCompact'
import FloatingFeatureCard from '@/components/landing/FloatingFeatureCard'
import KivoraSymbolNew from '@/components/landing/KivoraSymbolNew'
import HeroWaves from '@/components/landing/HeroWaves'
import PlantIllustration from '@/components/landing/PlantIllustration'
import CoffeeCupIllustration from '@/components/landing/CoffeeCupIllustration'
import DeviceSyncIllustration from '@/components/landing/DeviceSyncIllustration'
import { useHeroDemoSequence } from '@/components/landing/useHeroDemoSequence'
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

  // The hero's three-device composition switches layout at the same
  // breakpoint Tailwind's `sm:` prefix uses (640px). Below it, the phone
  // renders far too small for the full interactive demo (tab row, AI
  // banner, animated list) to stay legible, so it shows a simplified
  // static screen instead — tracked here (rather than pure CSS
  // show/hide) so the heavy demo never mounts on small screens.
  const [isCompactHero, setIsCompactHero] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  )
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsCompactHero(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

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

  // Single scripted demo sequence shared by the phone screen and the
  // floating feature cards around it, so they animate on the same beat.
  const demo = useHeroDemoSequence()
  const { step } = demo
  const tasksTotal = 8
  const tasksDone = step >= 2 ? 6 : 5
  const goalPct = step >= 5 ? 78 : 65
  const calendarEvents = [
    { key: 'event1', label: t('landing.preview.event1', lang), time: '10:00', color: '#6F5AE8' },
    { key: 'event2', label: t('landing.preview.event2', lang), time: '18:30', color: '#EC4899' },
    ...(step >= 4 ? [{ key: 'event3', label: t('landing.preview.event3', lang), time: '15:00', color: '#10B981' }] : []),
  ]

  const floatingTasksCard = (
    <FloatingFeatureCard icon={CheckSquare} iconColor="text-blue-600" iconBg="bg-blue-50" title={t('dash.tasks.title', lang)}>
      <p className="text-sm font-bold text-[#1A1F36] mb-1.5">
        {tasksDone}/{tasksTotal} {t('landing.hero.doneSuffix', lang)}
      </p>
      <div className="h-1.5 rounded-full bg-[#F1EFFB] overflow-hidden">
        <div className="h-full rounded-full bg-blue-500 transition-[width] duration-700 ease-out" style={{ width: `${(tasksDone / tasksTotal) * 100}%` }} />
      </div>
    </FloatingFeatureCard>
  )

  const floatingGoalsCard = (
    <FloatingFeatureCard icon={Target} iconColor="text-orange-600" iconBg="bg-orange-50" title={t('dash.goals.title', lang)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#1A1F36] truncate pr-1">{t('landing.preview.goal1', lang)}</span>
        <span className="text-xs font-bold text-orange-600 flex-shrink-0">{goalPct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#F1EFFB] overflow-hidden">
        <div className="h-full rounded-full bg-orange-500 transition-[width] duration-700 ease-out" style={{ width: `${goalPct}%` }} />
      </div>
    </FloatingFeatureCard>
  )

  const floatingCalendarCard = (
    <FloatingFeatureCard icon={Calendar} iconColor="text-sky-600" iconBg="bg-sky-50" title={t('dash.calendar.title', lang)}>
      <div className="space-y-1.5">
        {calendarEvents.map((ev) => (
          <div key={ev.key} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
            <span className="text-[10px] text-[#94A3B8] flex-shrink-0">{ev.time}</span>
            <span className="text-xs text-[#1A1F36] font-medium truncate">{ev.label}</span>
          </div>
        ))}
      </div>
    </FloatingFeatureCard>
  )

  const floatingHabitsCard = (
    <FloatingFeatureCard icon={Activity} iconColor="text-emerald-600" iconBg="bg-emerald-50" title={t('dash.habits.title', lang)}>
      <p className="text-sm font-bold text-[#1A1F36] mb-1.5">
        4/5 {t('dash.habits.done', lang)}
      </p>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded-full flex items-center justify-center ${i < 4 ? 'bg-emerald-500' : 'bg-[#F1EFFB]'}`}
          >
            {i < 4 && (
              <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        ))}
      </div>
    </FloatingFeatureCard>
  )

  const bottomChips = [
    { icon: Zap, labelKey: 'landing.hero.chip1' as const, bg: 'bg-blue-50', color: 'text-blue-600' },
    { icon: Target, labelKey: 'landing.hero.chip2' as const, bg: 'bg-orange-50', color: 'text-orange-600' },
    { icon: Sparkles, labelKey: 'landing.hero.chip3' as const, bg: 'bg-[#EDE9FB]', color: 'text-[#6F5AE8]' },
    { icon: RefreshCw, labelKey: 'landing.hero.chip4' as const, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  ]

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#FBFAFF] via-[#F8F6FD] to-[#F4F1FB] overflow-x-hidden">
      <PublicHeader />

      {/* Hero — the one "effective and modern" section; everything below stays minimal */}
      <section className="relative isolate pt-16 pb-14 px-4 sm:px-6 sm:pt-20 sm:pb-20 overflow-hidden">
        {/* Decorative background — pure CSS/SVG, no raster images, no layout
            impact. Soft lavender glow blobs + flowing wave ribbons, with a
            slow, cheap transform-only float; disabled entirely under
            prefers-reduced-motion. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <HeroWaves className="absolute inset-0 w-full h-full" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-2 mb-5">
            <KivoraSymbolNew size={34} />
            <span className="text-xl font-extrabold tracking-tight text-[#1A1F36]">Kivora</span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="text-[2.5rem] leading-[1.08] sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-3 sm:mb-5"
          >
            <span className="block text-[#1A1F36]">{t('landing.hero.title', lang)}</span>
            <span className="block bg-gradient-to-r from-[#6F5AE8] via-[#8B5CF6] to-[#6F5AE8] bg-clip-text text-transparent">
              {t('landing.hero.titleAccent', lang)}
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-base sm:text-lg text-[#64748B] leading-relaxed mb-5 sm:mb-6 max-w-xl mx-auto">
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
        </motion.div>

        {/* Three-device composition — a dominant central laptop (the real
            dashboard), a smaller tablet tucked behind-right (the real
            calendar), and the existing live-demo phone in front-left.
            Every device's position/size is a percentage of this one
            aspect-ratio box, so the whole cluster scales fluidly at any
            width — the same arrangement renders correctly from a narrow
            phone up to a wide desktop with no separate mobile layout. */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="relative mt-8 sm:mt-10 mx-auto max-w-5xl px-2"
        >
          <PlantIllustration className="hidden lg:block absolute left-[-3rem] bottom-[-1rem] w-44 pointer-events-none z-0" />
          <CoffeeCupIllustration className="hidden lg:block absolute right-[-1rem] bottom-[2rem] w-28 pointer-events-none z-0" />

          <div ref={demo.containerRef} className="relative w-full aspect-[6/5] sm:aspect-[16/11]">
            {/* tablet — behind, top-right. Mobile sizing/position is tuned
                separately from sm+ so the cluster stays tight and
                overlapping on small screens rather than reusing one
                formula that leaves dead space at small sizes. */}
            <div className="kv-card-float-2 absolute right-0 top-0 w-[32%] sm:w-[28%] z-10 opacity-95">
              <TabletFrame>
                <TabletScreenMock lang={lang} />
              </TabletFrame>
            </div>

            {/* laptop — dominant, centered */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[6%] sm:top-[2%] w-[60%] sm:w-[58%] z-20">
              <LaptopFrame>
                <DesktopScreenMock lang={lang} />
              </LaptopFrame>
            </div>

            {/* phone — front, overlapping the laptop's bottom-left corner
                on mobile (rather than pinned to the box's bottom edge,
                which left it stranded far below with a dead gap), tucked
                further down-left at sm+ as before. Below the hero's `sm`
                breakpoint it shows a simplified static screen instead of
                the full interactive demo, which is too small to stay
                legible at that size — the full demo (pause/play included)
                is untouched and still used at sm+ and on its own. */}
            <div className="absolute left-0 top-[38%] sm:top-auto sm:bottom-0 sm:left-[2%] w-[27%] sm:w-[21%] z-30">
              <PhoneFrame>
                {isCompactHero ? (
                  <PhoneScreenMockCompact lang={lang} />
                ) : (
                  <AppPreviewMock
                    lang={lang}
                    step={demo.step}
                    playing={demo.playing}
                    onTogglePlay={demo.togglePlaying}
                    shouldReduceMotion={demo.shouldReduceMotion}
                  />
                )}
              </PhoneFrame>
            </div>
          </div>

          {/* Desktop: cards float absolutely around the cluster */}
          <div className="kv-card-float-1 hidden md:block absolute left-[-2rem] top-[8%] w-60 lg:w-64 z-40">
            <div className="rotate-[-4deg]">{floatingTasksCard}</div>
          </div>
          <div className="kv-card-float-2 hidden md:block absolute left-[18%] bottom-[-14%] w-60 lg:w-64 z-40">
            <div className="rotate-[3deg]">{floatingGoalsCard}</div>
          </div>
          <div className="kv-card-float-2 hidden md:block absolute right-[-1.5rem] top-[-2%] w-60 lg:w-64 z-40">
            <div className="rotate-[4deg]">{floatingCalendarCard}</div>
          </div>
          <div className="kv-card-float-1 hidden md:block absolute right-[-2rem] bottom-[10%] w-60 lg:w-64 z-40">
            <div className="rotate-[-3deg]">{floatingHabitsCard}</div>
          </div>

          {/* Mobile: same four cards, plain 2-up grid below the cluster —
              no absolute positioning or float, so nothing can cause
              horizontal scroll on small screens. */}
          <div className="md:hidden grid grid-cols-2 gap-3 mt-8">
            {floatingTasksCard}
            {floatingGoalsCard}
            {floatingCalendarCard}
            {floatingHabitsCard}
          </div>
        </motion.div>

        {/* Synced across devices */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="mt-16 sm:mt-24 text-center max-w-sm mx-auto"
        >
          <DeviceSyncIllustration className="w-full mb-5" />
          <p className="text-base sm:text-lg font-bold text-[#1A1F36]">{t('landing.hero.syncTitle', lang)}</p>
          <p className="text-sm text-[#64748B] mt-1">{t('landing.hero.syncSubtitle', lang)}</p>
        </motion.div>

        {/* Four benefit chips */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
          className="mt-10 sm:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto"
        >
          {bottomChips.map(({ icon: Icon, labelKey, bg, color }) => (
            <motion.div
              key={labelKey}
              variants={fadeUp}
              className="flex flex-col items-center text-center gap-2 bg-white/70 backdrop-blur rounded-2xl border border-[#EEE9FB] px-3 py-4"
            >
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={17} className={color} />
              </div>
              <span className="text-xs font-semibold text-[#1A1F36]">{t(labelKey, lang)}</span>
            </motion.div>
          ))}
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
