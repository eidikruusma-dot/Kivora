import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Bell,
  CheckSquare,
  Calendar,
  Repeat,
  Target,
  GraduationCap,
  Sparkles,
  Monitor,
  Smartphone,
  Clock,
  Moon,
  SendHorizonal,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  saveNotificationSettings,
  REMINDER_OPTIONS,
} from '@/lib/notificationsStore'
import type { NotificationSettings, NotificationModules } from '@/lib/notificationsStore'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

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

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        width: '38px',
        height: '22px',
        backgroundColor: checked ? '#6F5AE8' : '#D1D5DB',
      }}
    >
      <div
        className="absolute top-0.5 bg-white rounded-full shadow-sm transition-all"
        style={{
          width: '18px',
          height: '18px',
          left: checked ? 'calc(100% - 20px)' : '2px',
        }}
      />
    </button>
  )
}

function ToggleRow({
  icon,
  iconBg,
  iconColor,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#F4F4F0] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1F36]">{label}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

// ── Module config ─────────────────────────────────────────────────────────────

type ModuleKey = keyof NotificationModules

function makeModuleConfig(lang: AppLang): {
  key: ModuleKey
  label: string
  desc: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
}[] {
  return [
    { key: 'tasks', label: t('teavit.mod.tasks', lang), desc: t('teavit.mod.tasks.desc', lang), icon: <CheckSquare size={16} strokeWidth={1.8} />, iconBg: '#EDE9FB', iconColor: '#6F5AE8' },
    { key: 'calendar', label: t('teavit.mod.calendar', lang), desc: t('teavit.mod.calendar.desc', lang), icon: <Calendar size={16} strokeWidth={1.8} />, iconBg: '#DBEAFE', iconColor: '#2563EB' },
    { key: 'habits', label: t('teavit.mod.habits', lang), desc: t('teavit.mod.habits.desc', lang), icon: <Repeat size={16} strokeWidth={1.8} />, iconBg: '#DCFCE7', iconColor: '#16A34A' },
    { key: 'goals', label: t('teavit.mod.goals', lang), desc: t('teavit.mod.goals.desc', lang), icon: <Target size={16} strokeWidth={1.8} />, iconBg: '#FEF9C3', iconColor: '#CA8A04' },
    { key: 'school', label: t('teavit.mod.school', lang), desc: t('teavit.mod.school.desc', lang), icon: <GraduationCap size={16} strokeWidth={1.8} />, iconBg: '#FEE2E2', iconColor: '#DC2626' },
    { key: 'assistant', label: t('teavit.mod.ai', lang), desc: t('teavit.mod.ai.desc', lang), icon: <Sparkles size={16} strokeWidth={1.8} />, iconBg: '#F0FDF4', iconColor: '#16A34A' },
  ]
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

type ToastState = { type: 'success' | 'error' | 'info'; text: string } | null

export default function TeavitusedPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const MODULE_CONFIG = makeModuleConfig(lang)
  const { user } = useAuth()

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Toast for inline feedback (save result, test notification, permission errors)
  const [toast, setToast] = useState<ToastState>(null)
  const [testSending, setTestSending] = useState(false)

  // System notification permission state
  const [sysPermission, setSysPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getNotificationSettings(user.uid)
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // ── Update helpers ────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }, [])

  const updateModule = useCallback((key: ModuleKey, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      modules: { ...prev.modules, [key]: value },
    }))
    setSaved(false)
  }, [])

  // ── System notifications permission ──────────────────────────────────────
  const handleSystemToggle = async (enabled: boolean) => {
    if (!enabled) {
      update({ systemNotifications: false })
      return
    }
    if (typeof Notification === 'undefined') {
      setToast({ type: 'error', text: t('teavit.err.noSupport', lang) })
      return
    }
    if (Notification.permission === 'denied') {
      setToast({ type: 'error', text: t('teavit.err.blocked', lang) })
      return
    }
    if (Notification.permission === 'granted') {
      update({ systemNotifications: true })
      setSysPermission('granted')
      return
    }
    // Request permission
    const result = await Notification.requestPermission()
    setSysPermission(result)
    if (result === 'granted') {
      update({ systemNotifications: true })
    } else {
      setToast({ type: 'error', text: t('teavit.err.noPermission', lang) })
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setToast(null)
    try {
      await saveNotificationSettings(user.uid, settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setToast({ type: 'error', text: t('teavit.err.saveFailed', lang) })
    } finally {
      setSaving(false)
    }
  }

  // ── Test notification ─────────────────────────────────────────────────────
  const handleTestNotification = async () => {
    setTestSending(true)
    setToast(null)

    await new Promise((r) => setTimeout(r, 600)) // brief delay for UX

    const isVisible = document.visibilityState === 'visible'

    if (!isVisible && settings.systemNotifications && sysPermission === 'granted') {
      // App in background → system notification
      new Notification('Kivora', {
        body: t('teavit.test.body', lang),
        icon: '/favicon.ico',
      })
      setToast({ type: 'success', text: t('teavit.test.sent', lang) })
    } else if (settings.inApp) {
      // App in focus → in-app notification
      setToast({ type: 'info', text: t('teavit.test.inApp', lang) })
    } else {
      setToast({ type: 'error', text: t('teavit.test.noChannel', lang) })
    }

    setTestSending(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto w-full flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-[#6F5AE8]" />
      </div>
    )
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
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('notifSettings.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('notifSettings.subtitle', lang)}
          </p>
        </div>

        {/* Global toast / feedback banner */}
        {toast && (
          <div
            role="alert"
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : toast.type === 'info'
                  ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#C4B8F8]'
                  : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.type === 'info' ? (
              <Bell size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="flex-1">{toast.text}</span>
            <button
              onClick={() => setToast(null)}
              className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        )}

        {/* ── 1. App notifications ── */}
        <SectionCard
          icon={<Bell size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('notifSettings.modules.title', lang)}
          description={t('notifSettings.modules.desc', lang)}
        >
          <div>
            {MODULE_CONFIG.map((m) => (
              <ToggleRow
                key={m.key}
                icon={m.icon}
                iconBg={m.iconBg}
                iconColor={m.iconColor}
                label={m.label}
                description={m.desc}
                checked={settings.modules[m.key]}
                onChange={(v) => updateModule(m.key, v)}
              />
            ))}
          </div>
        </SectionCard>

        {/* ── 2. Notification channels ── */}
        <SectionCard
          icon={<Monitor size={20} strokeWidth={1.8} />}
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          title={t('notifSettings.channels.title', lang)}
          description={t('notifSettings.channels.desc', lang)}
        >
          <div>
            <ToggleRow
              icon={<Smartphone size={16} strokeWidth={1.8} />}
              iconBg="#EDE9FB"
              iconColor="#6F5AE8"
              label="Rakendusesisesed teavitused"
              description="Näita teavitusi otse Kivora sees"
              checked={settings.inApp}
              onChange={(v) => update({ inApp: v })}
            />
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: '#DBEAFE', color: '#2563EB' }}
                >
                  <Monitor size={16} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1A1F36]">Süsteemi märguanded</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Brauseri / Windowsi märguanded, kui rakendus on taustal
                  </p>
                  {sysPermission === 'denied' && (
                    <p className="text-xs text-red-500 mt-0.5">
                      Brauser on märguanded blokeerinud — luba need brauseri seadetes
                    </p>
                  )}
                </div>
              </div>
              <Toggle
                checked={settings.systemNotifications}
                onChange={handleSystemToggle}
                disabled={sysPermission === 'denied'}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── 3. Default reminder time ── */}
        <SectionCard
          icon={<Clock size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title="Vaikimisi meeldetuletus"
          description="Globaalne vaikeväärtus kõigi uute sündmuste ja ülesannete jaoks"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[#64748B]">
              Üksikud sündmused saavad seda hiljem alistada.
            </p>
            <select
              value={settings.defaultReminder}
              onChange={(e) =>
                update({ defaultReminder: e.target.value as NotificationSettings['defaultReminder'] })
              }
              className="h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-3 pr-8 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors flex-shrink-0 appearance-none cursor-pointer"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        {/* ── 4. Quiet hours ── */}
        <SectionCard
          icon={<Moon size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title="Vaikne aeg"
          description="Selle perioodi jooksul teavitusi ei saadeta"
        >
          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1A1F36]">Luba vaikne aeg</p>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Kõik teavitused peatatakse valitud perioodi vältel
                </p>
              </div>
              <Toggle
                checked={settings.quietHoursEnabled}
                onChange={(v) => update({ quietHoursEnabled: v })}
              />
            </div>

            {/* Time pickers — only shown when enabled */}
            {settings.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[#F4F4F0]">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                    Algusaeg
                  </label>
                  <input
                    type="time"
                    value={settings.quietStart}
                    onChange={(e) => update({ quietStart: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                    Lõpuaeg
                  </label>
                  <input
                    type="time"
                    value={settings.quietEnd}
                    onChange={(e) => update({ quietEnd: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  />
                </div>
                <p className="col-span-2 text-xs text-[#94A3B8] -mt-2">
                  Kui lõpuaeg on enne algusaega, kestab vaikne aeg üle südaöö (nt 22:00 – 08:00).
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── 5. Test notification ── */}
        <SectionCard
          icon={<SendHorizonal size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title="Testrip"
          description="Kontrolli, et teavitused töötavad õigesti"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[#64748B]">
              Kui rakendus on fookuses, ilmub rakendusesisene märguanne. Kui rakendus on taustal, saadetakse süsteemi märguanne.
            </p>
            <button
              onClick={handleTestNotification}
              disabled={testSending || (!settings.inApp && !settings.systemNotifications)}
              className="h-10 px-4 rounded-xl bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] text-sm font-medium hover:bg-[#BBF7D0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
            >
              {testSending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <SendHorizonal size={15} />
              )}
              Saada testrip
            </button>
          </div>
        </SectionCard>

        {/* ── Save button ── */}
        <div className="flex items-center justify-end gap-3 pb-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} />
              Salvestatud
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-6 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Salvesta
          </button>
        </div>
      </div>
    </div>
  )
}
