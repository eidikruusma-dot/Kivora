import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t, type TranslationKey } from '@/lib/translations'
import AppCard from '@/components/ui/AppCard'
import { PLAN_TEMPLATES } from '@/data/planTemplates'

type PlansTab = 'myPlans' | 'templates'

const TABS: { id: PlansTab; labelKey: TranslationKey }[] = [
  { id: 'myPlans', labelKey: 'plans.tab.myPlans' },
  { id: 'templates', labelKey: 'plans.tab.templates' },
]

export default function PlansPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [activeTab, setActiveTab] = useState<PlansTab>('myPlans')

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('plans.title', lang)}</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{t('plans.subtitle', lang)}</p>
        </div>
        <button
          onClick={() => setActiveTab('templates')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} />
          {t('plans.create', lang)}
        </button>
      </div>

      {/* Tabs + content */}
      <AppCard className="border border-[#ECECF2]">
        <div className="flex border-b border-[#ECECF2] px-5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative whitespace-nowrap px-3 py-4 text-sm font-medium transition-colors mr-2 ${
                activeTab === tab.id
                  ? 'text-[#6F5AE8]'
                  : 'text-[#94A3B8] hover:text-[#1A1F36]'
              }`}
            >
              {t(tab.labelKey, lang)}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6F5AE8] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'myPlans' ? (
            <div className="flex flex-col items-center justify-center text-center py-16 gap-1.5">
              <p className="text-sm font-semibold text-[#1A1F36]">{t('plans.empty.title', lang)}</p>
              <p className="text-sm text-[#94A3B8]">{t('plans.empty.desc', lang)}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wide mb-3">
                {t('plans.templates.heading', lang)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PLAN_TEMPLATES.map(({ type, icon: Icon, titleKey, descriptionKey, accentColor, accentBg }) => (
                  <AppCard
                    key={type}
                    className={`flex items-start gap-3 p-4 border ${
                      type === 'blank' ? 'border-dashed border-[#D1D5DB]' : 'border-[#E8ECF0]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: accentBg, color: accentColor }}
                    >
                      <Icon size={20} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1A1F36]">{t(titleKey, lang)}</p>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{t(descriptionKey, lang)}</p>
                    </div>
                  </AppCard>
                ))}
              </div>
            </div>
          )}
        </div>
      </AppCard>
    </div>
  )
}
