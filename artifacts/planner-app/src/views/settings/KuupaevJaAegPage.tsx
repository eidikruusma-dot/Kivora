import { useState, useEffect } from 'react'
import { ArrowLeft, Clock, Calendar, Globe, Eye } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface Props {
  onBack: () => void
}

// ── Time zone list (extend here as needed) ─────────────────────────────────
const TIME_ZONES = [
  { value: 'Europe/Tallinn',   label: 'Europe/Tallinn (EET/EEST)' },
  { value: 'Europe/Helsinki',  label: 'Europe/Helsinki (EET/EEST)' },
  { value: 'Europe/Riga',      label: 'Europe/Riga (EET/EEST)' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm (CET/CEST)' },
  { value: 'Europe/London',    label: 'Europe/London (GMT/BST)' },
  { value: 'UTC',              label: 'UTC' },
]

// ── Local types ────────────────────────────────────────────────────────────
type FirstDay  = 'monday' | 'sunday'
type TimeFormat = '24h' | '12h'
type DateFormat = 'dd.mm.yyyy' | 'yyyy-mm-dd' | 'dd/mm/yyyy'

interface DateTimeSettings {
  tzAuto:       boolean
  timezone:     string
  firstDay:     FirstDay
  timeFormat:   TimeFormat
  dateFormat:   DateFormat
}

const DETECTED_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const DEFAULT: DateTimeSettings = {
  tzAuto:     true,
  timezone:   DETECTED_TZ,
  firstDay:   'monday',
  timeFormat: '24h',
  dateFormat: 'dd.mm.yyyy',
}

function loadSettings(): DateTimeSettings {
  try {
    const raw = localStorage.getItem('kivora:datetime')
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT
}

// ── Formatting helpers ─────────────────────────────────────────────────────
// Use 'en-GB' for part extraction – its part types ('day','month','year') are
// stable and unambiguous across environments, unlike Estonian locale.
function formatDate(date: Date, fmt: DateFormat, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  }).formatToParts(date)
  const p: Record<string, string> = {}
  parts.forEach(({ type, value }) => { p[type] = value })

  // en-GB parts: day='29', month='07', year='2026'
  if (fmt === 'dd.mm.yyyy') return `${p.day}.${p.month}.${p.year}`
  if (fmt === 'yyyy-mm-dd') return `${p.year}-${p.month}-${p.day}`
  return `${p.day}/${p.month}/${p.year}`
}

function formatTime(date: Date, fmt: TimeFormat, tz: string): string {
  if (fmt === '12h') {
    // 'en-US' guarantees "4:07 PM" / "12:00 AM" output
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  }
  // 'en-GB' guarantees "16:07" output (ISO 24-hour)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatWeekday(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('et-EE', {
    timeZone: tz,
    weekday: 'long',
  }).format(date)
}

// ── Sub-components ─────────────────────────────────────────────────────────
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
    <label className="flex items-center gap-3 cursor-pointer group py-2">
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? 'border-[#6F5AE8] bg-[#6F5AE8]'
            : 'border-[#CBD5E1] bg-white group-hover:border-[#6F5AE8]'
        }`}
      >
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div onClick={onChange} className="flex-1">
        <span className="text-sm text-[#1A1F36] font-medium">{label}</span>
        {sublabel && <p className="text-xs text-[#94A3B8] mt-0.5">{sublabel}</p>}
      </div>
    </label>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function KuupaevJaAegPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const [settings, setSettings] = useState<DateTimeSettings>(loadSettings)
  const [saved, setSaved]       = useState(false)
  const [now, setNow]           = useState(new Date())

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const activeTimezone = settings.tzAuto ? DETECTED_TZ : settings.timezone

  function patch(partial: Partial<DateTimeSettings>) {
    setSettings(prev => ({ ...prev, ...partial }))
    setSaved(false)
  }

  function handleSave() {
    try {
      localStorage.setItem('kivora:datetime', JSON.stringify(settings))
    } catch { /* ignore */ }
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
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('dt.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('dt.subtitle', lang)}
          </p>
        </div>

        {/* ── 1. Time Zone ──────────────────────────────────────────────── */}
        <SectionCard
          icon={<Globe size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('dt.tz.title', lang)}
          description={t('dt.tz.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label={t('dt.tz.auto', lang)}
              sublabel={t('dt.tz.detected', lang).replace('{tz}', DETECTED_TZ)}
              checked={settings.tzAuto}
              onChange={() => patch({ tzAuto: true })}
            />
            <RadioRow
              label={t('dt.tz.manual', lang)}
              checked={!settings.tzAuto}
              onChange={() => patch({ tzAuto: false })}
            />
          </div>

          {/* Timezone dropdown */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              Ajavöönd
            </label>
            <select
              disabled={settings.tzAuto}
              value={settings.timezone}
              onChange={e => patch({ timezone: e.target.value })}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-3 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
            >
              {TIME_ZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </SectionCard>

        {/* ── 2. First Day of Week ──────────────────────────────────────── */}
        <SectionCard
          icon={<Calendar size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t('dt.firstDay.title', lang)}
          description={t('dt.firstDay.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label={t('dt.firstDay.monday', lang)}
              sublabel={t('dt.firstDay.mondaySub', lang)}
              checked={settings.firstDay === 'monday'}
              onChange={() => patch({ firstDay: 'monday' })}
            />
            <RadioRow
              label={t('dt.firstDay.sunday', lang)}
              checked={settings.firstDay === 'sunday'}
              onChange={() => patch({ firstDay: 'sunday' })}
            />
          </div>
        </SectionCard>

        {/* ── 3. Time Format ────────────────────────────────────────────── */}
        <SectionCard
          icon={<Clock size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('dt.timeFormat.title', lang)}
          description={t('dt.timeFormat.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label={t('dt.timeFormat.24h', lang)}
              sublabel={t('dt.timeFormat.24hSub', lang)}
              checked={settings.timeFormat === '24h'}
              onChange={() => patch({ timeFormat: '24h' })}
            />
            <RadioRow
              label={t('dt.timeFormat.12h', lang)}
              sublabel={t('dt.timeFormat.12hSub', lang)}
              checked={settings.timeFormat === '12h'}
              onChange={() => patch({ timeFormat: '12h' })}
            />
          </div>
        </SectionCard>

        {/* ── 4. Date Format ────────────────────────────────────────────── */}
        <SectionCard
          icon={<Calendar size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t('dt.dateFormat.title', lang)}
          description={t('dt.dateFormat.desc', lang)}
        >
          <div className="space-y-1">
            <RadioRow
              label="29.07.2026"
              sublabel={t('dt.dateFormat.dmy', lang)}
              checked={settings.dateFormat === 'dd.mm.yyyy'}
              onChange={() => patch({ dateFormat: 'dd.mm.yyyy' })}
            />
            <RadioRow
              label="2026-07-29"
              sublabel={t('dt.dateFormat.iso', lang)}
              checked={settings.dateFormat === 'yyyy-mm-dd'}
              onChange={() => patch({ dateFormat: 'yyyy-mm-dd' })}
            />
            <RadioRow
              label="29/07/2026"
              sublabel={t('dt.dateFormat.dmy2', lang)}
              checked={settings.dateFormat === 'dd/mm/yyyy'}
              onChange={() => patch({ dateFormat: 'dd/mm/yyyy' })}
            />
          </div>
        </SectionCard>

        {/* ── 5. Live Preview ───────────────────────────────────────────── */}
        <SectionCard
          icon={<Eye size={20} strokeWidth={1.8} />}
          iconBg="#F0F9FF"
          iconColor="#0EA5E9"
          title={t('dt.preview.title', lang)}
          description={t('dt.preview.desc', lang)}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t('dt.preview.date', lang),
                value: formatDate(now, settings.dateFormat, activeTimezone),
              },
              {
                label: t('dt.preview.time', lang),
                value: formatTime(now, settings.timeFormat, activeTimezone),
              },
              {
                label: t('dt.preview.weekday', lang),
                value: (() => {
                  const wd = formatWeekday(now, activeTimezone)
                  return wd.charAt(0).toUpperCase() + wd.slice(1)
                })(),
              },
              {
                label: t('dt.preview.tz', lang),
                value: activeTimezone,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-[#F8FAFC] rounded-xl px-4 py-3 border border-[#F0F0F0]"
              >
                <p className="text-xs font-medium text-[#94A3B8] mb-1">{label}</p>
                <p className="text-sm font-semibold text-[#1A1F36] break-all">{value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Save button ───────────────────────────────────────────────── */}
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
