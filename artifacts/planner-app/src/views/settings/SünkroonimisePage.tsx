import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  RefreshCw,
  Wifi,
  Smartphone,
  CheckCircle2,
  Circle,
  Loader2,
  CloudOff,
  Cloud,
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
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#1A1F36]">{label}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors duration-200 ${
          checked ? 'bg-[#6F5AE8]' : 'bg-[#CBD5E1]'
        }`}
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

interface SyncSettings {
  autoSync: boolean
  mobileData: boolean
  lastSyncedAt: string | null
}

const DEFAULTS: SyncSettings = {
  autoSync: true,
  mobileData: false,
  lastSyncedAt: null,
}

function formatLastSync(d: Date, lang: AppLang): string {
  return d.toLocaleString(lang === 'et' ? 'et-EE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function SünkroonimisePage({ onBack }: Props) {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [settings, setSettings] = useState<SyncSettings>(DEFAULTS)

  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [syncing, setSyncing]   = useState(false)
  const [syncDone, setSyncDone] = useState(false)

  // Load from Firestore on mount
  useEffect(() => {
    if (!uid) return
    loadSettings<SyncSettings>(uid, 'sync', DEFAULTS).then(setSettings)
  }, [uid])

  const lastSync = settings.lastSyncedAt ? new Date(settings.lastSyncedAt) : null

  function update<K extends keyof SyncSettings>(key: K, value: SyncSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!uid) return
    setSaving(true)
    await saveSettings(uid, 'sync', settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSyncNow() {
    if (!uid) return
    setSyncing(true)
    const now = new Date().toISOString()
    const next: SyncSettings = { ...settings, lastSyncedAt: now }
    await saveSettings(uid, 'sync', next)
    setSettings(next)
    setSyncing(false)
    setSyncDone(true)
    setTimeout(() => setSyncDone(false), 3000)
  }

  const isActive = settings.autoSync

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('sync.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t('sync.subtitle', lang)}</p>
        </div>

        {/* ── 1. Sync status ── */}
        <SectionCard
          icon={isActive ? <Cloud size={20} strokeWidth={1.8} /> : <CloudOff size={20} strokeWidth={1.8} />}
          iconBg={isActive ? '#DCFCE7' : '#F1F5F9'}
          iconColor={isActive ? '#16A34A' : '#64748B'}
          title={t('sync.status.title', lang)}
          description={t('sync.status.desc', lang)}
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {isActive ? (
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              ) : (
                <Circle size={16} className="text-[#94A3B8] flex-shrink-0" />
              )}
              <span className={`text-sm font-medium ${isActive ? 'text-green-700' : 'text-[#64748B]'}`}>
                {isActive ? t('sync.status.active', lang) : t('sync.status.inactive', lang)}
              </span>
            </div>

            <div className="w-px h-4 bg-[#E2E8F0]" />

            <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <RefreshCw size={12} strokeWidth={2} />
              <span>
                {t('sync.status.lastSync', lang)}:{' '}
                <span className="text-[#64748B] font-medium">
                  {lastSync ? formatLastSync(lastSync, lang) : t('sync.status.never', lang)}
                </span>
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Automatic synchronization ── */}
        <SectionCard
          icon={<RefreshCw size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('sync.auto.title', lang)}
          description={t('sync.auto.desc', lang)}
        >
          <div className="-my-1">
            <ToggleRow
              label={t('sync.auto.toggle', lang)}
              description={t('sync.auto.toggle.desc', lang)}
              checked={settings.autoSync}
              onChange={(v) => update('autoSync', v)}
            />
          </div>
        </SectionCard>

        {/* ── 3. Sync over mobile data ── */}
        <SectionCard
          icon={<Smartphone size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('sync.mobile.title', lang)}
          description={t('sync.mobile.desc', lang)}
        >
          <div className="-my-1">
            <ToggleRow
              label={t('sync.mobile.toggle', lang)}
              description={t('sync.mobile.toggle.desc', lang)}
              checked={settings.mobileData}
              onChange={(v) => update('mobileData', v)}
            />
          </div>
        </SectionCard>

        {/* ── 4. Manual sync ── */}
        <SectionCard
          icon={<Wifi size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t('sync.manual.title', lang)}
          description={t('sync.manual.desc', lang)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSyncNow}
                disabled={syncing || !uid}
                className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} strokeWidth={2} />
                )}
                {syncing ? t('sync.manual.syncing', lang) : t('sync.manual.button', lang)}
              </button>

              {syncDone && (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 size={15} />
                  {t('sync.manual.done', lang)}
                </div>
              )}
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {t('sync.manual.note', lang)}
            </p>
          </div>
        </SectionCard>

        {/* ── Save bar ── */}
        <div className="flex items-center justify-end gap-3 pb-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} />
              {t('sync.saved', lang)}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !uid}
            className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? t('sync.saving', lang) : t('sync.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
