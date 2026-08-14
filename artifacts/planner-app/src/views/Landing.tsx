import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
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
    <div className="min-h-[100dvh] bg-[#F4F3EF]">
      <PublicHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-xs font-semibold mb-6">
            <Sparkles size={14} />
            {t('landing.badge', lang)}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1A1F36] leading-tight mb-5">
            {t('landing.hero.title', lang)}
          </h1>
          <p className="text-lg text-[#64748B] leading-relaxed mb-8 max-w-xl mx-auto">
            {t('landing.hero.subtitle', lang)}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors flex items-center justify-center gap-2"
            >
              {t('landing.cta.start', lang)}
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white border border-[#E8E6E0] text-[#1A1F36] text-sm font-semibold hover:bg-[#F8F7F4] transition-colors"
            >
              {t('landing.cta.login', lang)}
            </button>
          </div>
          <p className="text-xs text-[#94A3B8] mt-4">{t('landing.cta.free', lang)}</p>
        </div>
      </section>

      {/* Features preview */}
      <section id="features" className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">{t('landing.features.title', lang)}</h2>
          <p className="text-sm text-[#64748B] text-center mb-10">{t('landing.features.subtitle', lang)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ key, Icon, title, desc }) => (
              <div key={key} className="bg-white rounded-2xl p-6 border border-[#EBEBEB] hover:shadow-sm transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-[#EDE9FB] flex items-center justify-center mb-4">
                  <Icon size={20} className="text-[#6F5AE8]" />
                </div>
                <h3 className="text-sm font-bold text-[#1A1F36] mb-1.5">{title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1A1F36] mb-3">{t('landing.how.title', lang)}</h2>
          <p className="text-sm text-[#64748B] mb-10">{t('landing.how.subtitle', lang)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {steps.map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#6F5AE8] text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
                  {step}
                </div>
                <h3 className="text-sm font-bold text-[#1A1F36] mb-1">{title}</h3>
                <p className="text-sm text-[#64748B]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-16 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">{t('landing.about.title', lang)}</h2>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-12">{t('landing.about.tagline', lang)}</p>

          <div className="space-y-8 mb-12">
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p1', lang)}</p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p2', lang)}</p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p3', lang)}</p>
            <div className="border-l-[5px] border-[#6F5AE8] pl-7 py-1 rounded-r-lg bg-[#6F5AE8]/[0.04]">
              <p className="text-[15px] text-[#1A1F36] font-semibold leading-relaxed">
                {t('landing.about.quote', lang)}
              </p>
            </div>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p4', lang)}</p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.about.p5', lang)}</p>
          </div>

          {/* Principles */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-4">{t('landing.principles.title', lang)}</h3>
            <ul className="space-y-3">
              {principles.map((principle) => (
                <li key={principle} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#6F5AE8] flex-shrink-0" />
                  <span className="text-[15px] text-[#64748B] leading-relaxed">{principle}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mission */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 sm:p-5 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">{t('landing.mission.title', lang)}</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.mission.text', lang)}</p>
          </div>

          {/* Vision */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 sm:p-5 mb-8">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">{t('landing.vision.title', lang)}</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">{t('landing.vision.text', lang)}</p>
          </div>

          <p className="text-center text-xl font-bold text-[#1A1F36]">
            {t('landing.finalTagline', lang)}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl border border-[#EBEBEB] px-8 py-12">
          <h2 className="text-2xl font-bold text-[#1A1F36] mb-3">{t('landing.cta2.title', lang)}</h2>
          <p className="text-sm text-[#64748B] mb-6">{t('landing.cta2.subtitle', lang)}</p>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors inline-flex items-center gap-2"
          >
            {t('landing.cta.start', lang)}
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
