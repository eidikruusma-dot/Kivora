import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Loader2,
  Info,
} from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { useAuth } from '@/context/AuthContext'
import { loadSettings, saveSettings } from '@/lib/settingsStore'

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1A1F36]">{label}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative flex-shrink-0 w-10 h-[22px] rounded-full transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-1"
        style={{ background: checked ? '#6F5AE8' : '#D1D5DB' }}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// ── Settings shape ────────────────────────────────────────────────────────────

interface PrivacySettings {
  aiData: boolean
}

const DEFAULTS: PrivacySettings = {
  aiData: true,
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function PrivaatsusPage({ onBack }: Props) {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load from Firestore on mount
  useEffect(() => {
    if (!uid) return
    loadSettings<PrivacySettings>(uid, 'privacy', DEFAULTS).then(setSettings)
  }, [uid])

  const update = <K extends keyof PrivacySettings>(
    key: K,
    val: PrivacySettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!uid) return
    setSaving(true)

    try {
      await saveSettings(uid, 'privacy', settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="privacy-page p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t('privacySettings.title', lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('privacySettings.subtitle', lang)}
          </p>
        </div>

        {/* ── AI privacy ── */}
        <SectionCard
          icon={<Sparkles size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('privacySettings.ai.title', lang)}
          description={t('privacySettings.ai.desc', lang)}
        >
          <ToggleRow
            label={t('privacySettings.ai.toggle', lang)}
            description={t('privacySettings.ai.toggle.desc', lang)}
            checked={settings.aiData}
            onChange={(v) => update('aiData', v)}
          />

          <div className="privacy-info-panel flex items-start gap-2.5 mt-4 px-4 py-3 rounded-xl bg-[#F8F7FC] border border-[#E0DCFF]">
            <Info
              size={14}
              className="text-[#6F5AE8] flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-[#64748B] leading-relaxed">
              {t('privacySettings.ai.note', lang)}
            </p>
          </div>
        </SectionCard>

        {/* ── Save bar ── */}
        <div className="privacy-save-bar flex items-center justify-end gap-3 pb-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} />
              {t('privacySettings.saved', lang)}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !uid}
            className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving
              ? t('privacySettings.saving', lang)
              : t('privacySettings.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
