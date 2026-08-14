import { useState, useEffect } from 'react'
import { ArrowLeft, Globe, Sparkles, Eye, Info, LayoutDashboard, CheckSquare, CalendarDays, Bot } from 'lucide-react'
import {
  applyLanguage,
  getLocalLangSettings,
  subscribeToLanguage,
  getLocalLanguage,
} from '@/lib/languageStore'
import type { AppLang, LangSettings } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface Props {
  onBack: () => void
}

// ── UI strings per language ────────────────────────────────────────────────
const UI: Record<AppLang, {
  greeting:  string
  subtitle:  string
  navItems:  { icon: React.ReactNode; label: string }[]
  cardTitle: string
  cardBody:  string
}> = {
  et: {
    greeting:  'Tere tulemast',
    subtitle:  'Sinu isiklik planeerija',
    navItems: [
      { icon: <LayoutDashboard size={13} strokeWidth={1.8} />, label: 'Minu päev' },
      { icon: <CheckSquare     size={13} strokeWidth={1.8} />, label: 'Ülesanded' },
      { icon: <CalendarDays    size={13} strokeWidth={1.8} />, label: 'Kalender' },
      { icon: <Bot             size={13} strokeWidth={1.8} />, label: 'AI assistent' },
    ],
    cardTitle: 'Täna',
    cardBody:  '3 ülesannet ootel',
  },
  en: {
    greeting:  'Welcome',
    subtitle:  'Your personal planner',
    navItems: [
      { icon: <LayoutDashboard size={13} strokeWidth={1.8} />, label: 'My Day' },
      { icon: <CheckSquare     size={13} strokeWidth={1.8} />, label: 'Tasks' },
      { icon: <CalendarDays    size={13} strokeWidth={1.8} />, label: 'Calendar' },
      { icon: <Bot             size={13} strokeWidth={1.8} />, label: 'AI Assistant' },
    ],
    cardTitle: 'Today',
    cardBody:  '3 tasks pending',
  },
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SectionCard({
  icon, iconBg, iconColor, title, description, children,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#F0F0F0]">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F36]">{title}</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function RadioRow({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string
  sublabel?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onChange()}
      className="flex items-center gap-3 cursor-pointer group py-2 outline-none"
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? 'border-[#6F5AE8] bg-[#6F5AE8]'
            : 'border-[#CBD5E1] bg-white group-hover:border-[#6F5AE8]'
        }`}
      >
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div className="flex-1">
        <span className="text-sm text-[#1A1F36] font-medium">{label}</span>
        {sublabel && <p className="text-xs text-[#94A3B8] mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}

// ── Mini app preview ───────────────────────────────────────────────────────
function AppPreview({ lang }: { lang: AppLang }) {
  const t = UI[lang]
  return (
    <div className="rounded-xl border border-[#E2E8F0] overflow-hidden bg-[#F8FAFC] select-none">
      {/* Fake top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-[#F0F0F0]">
        <div className="w-2 h-2 rounded-full bg-[#6F5AE8]" />
        <span className="text-[11px] font-bold tracking-wide text-[#6F5AE8]">KIVORA</span>
        <div className="flex-1" />
        <div className="w-5 h-5 rounded-full bg-[#EDE9FB]" />
      </div>

      <div className="flex">
        {/* Fake sidebar */}
        <div className="w-36 border-r border-[#F0F0F0] bg-white px-3 py-3 space-y-0.5 flex-shrink-0">
          {t.navItems.map(({ icon, label }, i) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                i === 0
                  ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                  : 'text-[#64748B]'
              }`}
            >
              <span className={i === 0 ? 'text-[#6F5AE8]' : 'text-[#94A3B8]'}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {/* Fake content area */}
        <div className="flex-1 px-4 py-3 space-y-2.5">
          <div>
            <p className="text-sm font-bold text-[#1A1F36] leading-tight">{t.greeting}</p>
            <p className="text-[10px] text-[#94A3B8] mt-0.5">{t.subtitle}</p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold text-[#1A1F36]">{t.cardTitle}</p>
            <p className="text-[10px] text-[#94A3B8] mt-0.5">{t.cardBody}</p>
            <div className="mt-2 space-y-1.5">
              {[60, 80, 45].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded border border-[#CBD5E1] flex-shrink-0" />
                  <div
                    className="h-1.5 rounded-full bg-[#E2E8F0]"
                    style={{ width: `${w}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function KeelPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const [settings, setSettings] = useState<LangSettings>(getLocalLangSettings)
  const [saved, setSaved]       = useState(false)

  function patch(partial: Partial<LangSettings>) {
    setSettings(prev => ({ ...prev, ...partial }))
    setSaved(false)
  }

  function handleSave() {
    // applyLanguage writes to localStorage AND notifies all subscribers
    // (Sidebar, Header) so the change takes effect immediately across the app.
    applyLanguage(settings)
    setSaved(true)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('lang.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('lang.subtitle', lang)}
          </p>
        </div>

        {/* ── 1. App Language ─────────────────────────────────────────── */}
        <SectionCard
          icon={<Globe size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('lang.app.title', lang)}
          description={t('lang.app.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label={t('lang.app.et', lang)}
              sublabel={t('lang.app.etSub', lang)}
              checked={settings.appLang === 'et'}
              onChange={() => patch({ appLang: 'et' })}
            />
            <RadioRow
              label={t('lang.app.en', lang)}
              sublabel={t('lang.app.enSub', lang)}
              checked={settings.appLang === 'en'}
              onChange={() => patch({ appLang: 'en' })}
            />
          </div>
        </SectionCard>

        {/* ── 2. AI Assistant Language ────────────────────────────────── */}
        <SectionCard
          icon={<Sparkles size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t('lang.ai.title', lang)}
          description={t('lang.ai.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label={t('lang.ai.same', lang)}
              sublabel={`${t('lang.ai.sameSub', lang).replace('Praegu: Eesti', '')}${t('lang.ai.sameSub', lang).startsWith('Praegu') ? (settings.appLang === 'et' ? 'Eesti' : 'English') : (settings.appLang === 'en' ? 'English' : 'Eesti')}`}
              checked={settings.aiLang === 'same'}
              onChange={() => patch({ aiLang: 'same' })}
            />
            <RadioRow
              label="Eesti"
              checked={settings.aiLang === 'et'}
              onChange={() => patch({ aiLang: 'et' })}
            />
            <RadioRow
              label="English"
              checked={settings.aiLang === 'en'}
              onChange={() => patch({ aiLang: 'en' })}
            />
          </div>
        </SectionCard>

        {/* ── 3. Preview ──────────────────────────────────────────────── */}
        <SectionCard
          icon={<Eye size={20} strokeWidth={1.8} />}
          iconBg="#F0F9FF"
          iconColor="#0EA5E9"
          title={t('lang.preview.title', lang)}
          description={t('lang.preview.desc', lang)}
        >
          <AppPreview lang={settings.appLang} />

          {/* Refresh note */}
          <div className="mt-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-[#FEF9C3] border border-[#FDE68A]">
            <Info size={14} className="text-[#CA8A04] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#92400E]">
              {settings.appLang === 'et'
                ? 'Mõned keelemuutused võivad nõuda rakenduse uuesti laadimist.'
                : 'Some language changes may require refreshing the app.'}
            </p>
          </div>
        </SectionCard>

        {/* ── Save ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pb-2">
          <button
            onClick={handleSave}
            className="h-10 px-6 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors"
          >
            {saved ? `${t('settings.saved', lang)} ✓` : t('settings.save', lang)}
          </button>
          {saved && (
            <span className="text-xs text-[#94A3B8]">{t('settings.saved', lang)}</span>
          )}
        </div>

      </div>
    </div>
  )
}
