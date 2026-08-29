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
  Shield,
  Smartphone,
  Moon,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  saveNotificationSettings,
} from '@/lib/notificationsStore'
import type {
  NotificationSettings,
  NotificationModules,
} from '@/lib/notificationsStore'
import {
  subscribeToLanguage,
  getLocalLanguage,
} from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import {
  isPushSupported,
  enablePush,
  disablePush,
  getActivePushSubscription,
} from '@/lib/pushNotifications'

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
          <h2 className="text-sm font-semibold text-[#1A1F36]">
            {title}
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {description}
          </p>
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
      className={`relative flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed${
        checked ? '' : ' notif-toggle-off'
      }`}
      style={{
        width: '38px',
        height: '22px',
        backgroundColor: checked ? '#6F5AE8' : undefined,
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
          <p className="text-sm font-medium text-[#1A1F36]">
            {label}
          </p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {description}
          </p>
        </div>
      </div>

      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
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
    {
      key: 'tasks',
      label: t('teavit.mod.tasks', lang),
      desc: t('teavit.mod.tasks.desc', lang),
      icon: <CheckSquare size={16} strokeWidth={1.8} />,
      iconBg: '#EDE9FB',
      iconColor: '#6F5AE8',
    },
    {
      key: 'calendar',
      label: t('teavit.mod.calendar', lang),
      desc: t('teavit.mod.calendar.desc', lang),
      icon: <Calendar size={16} strokeWidth={1.8} />,
      iconBg: '#DBEAFE',
      iconColor: '#2563EB',
    },
    {
      key: 'habits',
      label: t('teavit.mod.habits', lang),
      desc: t('teavit.mod.habits.desc', lang),
      icon: <Repeat size={16} strokeWidth={1.8} />,
      iconBg: '#DCFCE7',
      iconColor: '#16A34A',
    },
    {
      key: 'goals',
      label: t('teavit.mod.goals', lang),
      desc: t('teavit.mod.goals.desc', lang),
      icon: <Target size={16} strokeWidth={1.8} />,
      iconBg: '#FEF9C3',
      iconColor: '#CA8A04',
    },
    {
      key: 'school',
      label: t('teavit.mod.school', lang),
      desc: t('teavit.mod.school.desc', lang),
      icon: <GraduationCap size={16} strokeWidth={1.8} />,
      iconBg: '#FEE2E2',
      iconColor: '#DC2626',
    },
    {
      key: 'assistant',
      label: t('teavit.mod.ai', lang),
      desc: t('teavit.mod.ai.desc', lang),
      icon: <Sparkles size={16} strokeWidth={1.8} />,
      iconBg: '#F0FDF4',
      iconColor: '#16A34A',
    },
    {
      key: 'security',
      label: t('teavit.mod.security', lang),
      desc: t('teavit.mod.security.desc', lang),
      icon: <Shield size={16} strokeWidth={1.8} />,
      iconBg: '#FEE2E2',
      iconColor: '#DC2626',
    },
  ]
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

type ToastState = {
  type: 'success' | 'error' | 'info'
  text: string
} | null

export default function TeavitusedPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(
    () => subscribeToLanguage((s) => setLang(s.appLang)),
    [],
  )

  const MODULE_CONFIG = makeModuleConfig(lang)
  const { user } = useAuth()

  const [settings, setSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)

  // Snapshot of the last successfully saved (or freshly loaded) state.
  // Used to detect unsaved changes so the Save button is disabled when
  // nothing has changed.
  const [savedSettings, setSavedSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)

  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isDirty =
    JSON.stringify(settings) !== JSON.stringify(savedSettings)

  const [toast, setToast] = useState<ToastState>(null)

  // Push notification status
  type PushStatus =
    | 'checking'
    | 'unsupported'
    | 'denied'
    | 'inactive'
    | 'subscribing'
    | 'active'

  const [pushStatus, setPushStatus] =
    useState<PushStatus>('checking')

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    let cancelled = false

    getNotificationSettings(user.uid)
      .then((s) => {
        if (cancelled) return

        setSettings(s)
        setSavedSettings(s)
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

  // ── Push status check ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    let cancelled = false

    if (!isPushSupported()) {
      setPushStatus('unsupported')
      return
    }

    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'denied'
    ) {
      setPushStatus('denied')
      return
    }

    getActivePushSubscription()
      .then((sub) => {
        if (!cancelled) {
          setPushStatus(sub ? 'active' : 'inactive')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPushStatus('inactive')
        }
      })

    return () => {
      cancelled = true
    }
  }, [user])

  // ── Update helpers ────────────────────────────────────────────────────────

  const update = useCallback(
    (patch: Partial<NotificationSettings>) => {
      setSettings((prev) => ({
        ...prev,
        ...patch,
      }))
      setSaved(false)
    },
    [],
  )

  const updateModule = useCallback(
    (key: ModuleKey, value: boolean) => {
      setSettings((prev) => ({
        ...prev,
        modules: {
          ...prev.modules,
          [key]: value,
        },
      }))
      setSaved(false)
    },
    [],
  )

  // ── Push toggle ───────────────────────────────────────────────────────────

  const handlePushToggle = async (enabled: boolean) => {
    if (!user) return

    if (!enabled) {
      setPushStatus('subscribing')

      try {
        await disablePush(user.uid)
        setPushStatus('inactive')
      } catch {
        setPushStatus('active')
        setToast({
          type: 'error',
          text:
            lang === 'et'
              ? 'Push-teavituste väljalülitamine ebaõnnestus.'
              : 'Failed to disable push notifications.',
        })
      }

      return
    }

    if (!isPushSupported()) {
      setToast({
        type: 'error',
        text:
          lang === 'et'
            ? 'Sinu brauser ei toeta push-teavitusi.'
            : 'Your browser does not support push notifications.',
      })
      return
    }

    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'denied'
    ) {
      setPushStatus('denied')
      setToast({
        type: 'error',
        text:
          lang === 'et'
            ? 'Teavitused on blokeeritud. Luba need brauseri seadetes.'
            : 'Notifications are blocked. Enable them in browser settings.',
      })
      return
    }

    setPushStatus('subscribing')

    const result = await enablePush(user.uid)

    if (result === 'active') {
      setPushStatus('active')
      setToast({
        type: 'success',
        text:
          lang === 'et'
            ? 'Push-teavitused on aktiveeritud!'
            : 'Push notifications activated!',
      })
    } else if (result === 'denied') {
      setPushStatus('denied')
      setToast({
        type: 'error',
        text:
          lang === 'et'
            ? 'Teavituste luba keelduti.'
            : 'Notification permission was denied.',
      })
    } else {
      setPushStatus('inactive')
      setToast({
        type: 'error',
        text:
          lang === 'et'
            ? 'Push-teavituste seadistamine ebaõnnestus.'
            : 'Failed to set up push notifications.',
      })
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    setToast(null)

    try {
      await saveNotificationSettings(user.uid, settings)
      setSavedSettings(settings)
      setSaved(true)

      setTimeout(() => {
        setSaved(false)
      }, 2500)
    } catch {
      setToast({
        type: 'error',
        text: t('teavit.err.saveFailed', lang),
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto w-full flex items-center justify-center py-24">
        <Loader2
          size={24}
          className="animate-spin text-[#6F5AE8]"
        />
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
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t('notifSettings.title', lang)}
          </h1>
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
          icon={<Smartphone size={20} strokeWidth={1.8} />}
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          title={t('notifSettings.channels.title', lang)}
          description={t('notifSettings.channels.desc', lang)}
        >
          <div>
            {/* In-app notifications */}
            <ToggleRow
              icon={<Bell size={16} strokeWidth={1.8} />}
              iconBg="#EDE9FB"
              iconColor="#6F5AE8"
              label={t('notifSettings.inApp.label', lang)}
              description={t('notifSettings.inApp.desc', lang)}
              checked={settings.inApp}
              onChange={(v) => update({ inApp: v })}
            />

            {/* Push notifications */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: '#EDE9FB',
                    color: '#6F5AE8',
                  }}
                >
                  <Smartphone size={16} strokeWidth={1.8} />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1A1F36]">
                    {lang === 'et'
                      ? 'Push-teavitused'
                      : 'Push notifications'}
                  </p>

                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    {pushStatus === 'active'
                      ? lang === 'et'
                        ? 'Aktiivne — teavitused saadetakse sinu teistele seadmetele'
                        : 'Active — alerts are delivered to your other devices'
                      : pushStatus === 'unsupported'
                        ? lang === 'et'
                          ? 'Sinu brauser ei toeta push-teavitusi'
                          : 'Not supported by this browser'
                        : pushStatus === 'denied'
                          ? lang === 'et'
                            ? 'Blokeeritud — luba brauseri seadetes'
                            : 'Blocked — enable in browser settings'
                          : lang === 'et'
                            ? 'Saa teavitusi ka siis, kui rakendus pole lahti'
                            : 'Receive alerts even when the app is closed'}
                  </p>

                  {pushStatus === 'denied' && (
                    <p className="text-xs text-red-500 mt-0.5">
                      {lang === 'et'
                        ? 'Brauseri seaded → Privaatsus → Teavitused'
                        : 'Browser Settings → Privacy → Notifications'}
                    </p>
                  )}
                </div>
              </div>

              {pushStatus === 'checking' ||
              pushStatus === 'subscribing' ? (
                <Loader2
                  size={20}
                  className="animate-spin text-[#6F5AE8] flex-shrink-0"
                />
              ) : (
                <Toggle
                  checked={pushStatus === 'active'}
                  onChange={handlePushToggle}
                  disabled={
                    pushStatus === 'unsupported' ||
                    pushStatus === 'denied'
                  }
                />
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── 3. Quiet hours ── */}
        <SectionCard
          icon={<Moon size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('notifSettings.quiet.title', lang)}
          description={t('notifSettings.quiet.desc', lang)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1A1F36]">
                  {t('notifSettings.quiet.label', lang)}
                </p>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  {t('notifSettings.quiet.pauseDesc', lang)}
                </p>
              </div>

              <Toggle
                checked={settings.quietHoursEnabled}
                onChange={(v) =>
                  update({ quietHoursEnabled: v })
                }
              />
            </div>

            {settings.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[#F4F4F0]">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                    {t('notifSettings.quiet.from', lang)}
                  </label>

                  <input
                    type="time"
                    value={settings.quietStart}
                    onChange={(e) =>
                      update({ quietStart: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                    {t('notifSettings.quiet.to', lang)}
                  </label>

                  <input
                    type="time"
                    value={settings.quietEnd}
                    onChange={(e) =>
                      update({ quietEnd: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  />
                </div>

                <p className="notif-quiet-overnight col-span-2 text-xs text-[#94A3B8] -mt-2">
                  {t('notifSettings.quiet.overnight', lang)}
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Save button ── */}
        <div className="flex items-center justify-end gap-3 pb-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} />
              {t('settings.saved', lang)}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="h-10 px-6 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <Loader2 size={15} className="animate-spin" />
            )}

            {t('settings.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
