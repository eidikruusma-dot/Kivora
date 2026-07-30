import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import AppearancePage from '@/views/AppearancePage'
import TurvalisusPage from '@/views/settings/TurvalisusPage'
import TeavitusedPage from '@/views/settings/TeavitusedPage'
import KuupaevJaAegPage from '@/views/settings/KuupaevJaAegPage'
import KeelPage from '@/views/settings/KeelPage'
import { useAuth } from '@/context/AuthContext'
import {
  getUserProfile,
  updateUserPreferences,
  type UserPreferencesUpdate,
} from '@/lib/userProfile'
import type { UserProfile } from '@/types'
import PreferencesSection from '@/components/profile/PreferencesSection'
import PreferencesEditForm from '@/components/profile/PreferencesEditForm'
import {
  User,
  Shield,
  Mail,
  Lock,
  Palette,
  Bell,
  Clock,
  Globe,
  UploadCloud,
  Cloud,
  Download,
  Trash2,
  HelpCircle,
  Sparkles,
  MessageSquare,
  Info,
  ChevronRight,
  HardDrive,
  RefreshCw,
  Headphones,
  ArrowLeft,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface SettingsCard {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  routeKey: string   // always the Estonian key used for routing — stable across languages
  title: string      // translated display title
  description: string
}

interface Section {
  heading: string
  cards: SettingsCard[]
}

interface UsageStat {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  used: string
  total: string
  pct: number
  barColor: string
}

interface QuickAction {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
}

// ── Data helpers (language-aware) ──────────────────────────────────────────

function getSections(lang: AppLang): Section[] {
  return [
    {
      heading: t('settings.section.account', lang),
      cards: [
        {
          icon: <User size={22} strokeWidth={1.8} />,
          iconBg: '#EDE9FB', iconColor: '#6F5AE8',
          routeKey: 'Profiil ja konto',
          title: t('settings.card.profile', lang),
          description: 'Vaata ja muuda oma isikuandmeid, profiilipilti ja konto seadeid.',
        },
        {
          icon: <Shield size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Turvalisus',
          title: t('settings.card.security', lang),
          description: 'Parool, kaheastmeline tuvastus ja sisselogimise seaded.',
        },
        {
          icon: <Mail size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'E-posti seaded',
          title: t('settings.card.email', lang),
          description: 'Halda e-posti teavitusi ja kinnituseelistusi.',
        },
        {
          icon: <Lock size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Privaatsus',
          title: t('settings.card.privacy', lang),
          description: 'Andmete privaatsus, nähtavus ja jagamise seaded.',
        },
      ],
    },
    {
      heading: t('settings.section.app', lang),
      cards: [
        {
          icon: <Palette size={22} strokeWidth={1.8} />,
          iconBg: '#EDE9FB', iconColor: '#6F5AE8',
          routeKey: 'Välimus',
          title: t('settings.card.appearance', lang),
          description: 'Vali teema, värvid ja rakenduse kujunduse seaded.',
        },
        {
          icon: <Bell size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Teavitused',
          title: t('settings.card.notifications', lang),
          description: 'Halda märguandeid, meeldetuletusi ja teavituste kanaleid.',
        },
        {
          icon: <Clock size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Kuupäev ja aeg',
          title: t('settings.card.datetime', lang),
          description: 'Vali ajavöönd, kuupäevavorming ja kellaaja formaat.',
        },
        {
          icon: <Globe size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Keel',
          title: t('settings.card.language', lang),
          description: 'Rakenduse keel ja piirkonna seaded.',
        },
      ],
    },
    {
      heading: t('settings.section.data', lang),
      cards: [
        {
          icon: <RefreshCw size={22} strokeWidth={1.8} />,
          iconBg: '#EDE9FB', iconColor: '#6F5AE8',
          routeKey: 'Sünkroonimine',
          title: t('settings.card.sync', lang),
          description: 'Sünkrooni andmeid seadmete vahel ja vaata staatust.',
        },
        {
          icon: <UploadCloud size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Varundamine',
          title: t('settings.card.backup', lang),
          description: 'Loo varukoopia oma andmetest ja taasta neid vajadusel.',
        },
        {
          icon: <Download size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Andmete eksport',
          title: t('settings.card.export', lang),
          description: 'Ekspordi oma andmed erinevates vormingutes.',
        },
        {
          icon: <Trash2 size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Andmete kustutamine',
          title: t('settings.card.delete', lang),
          description: 'Kustuta oma konto või erinevaid andmeid.',
        },
      ],
    },
    {
      heading: t('settings.section.support', lang),
      cards: [
        {
          icon: <HelpCircle size={22} strokeWidth={1.8} />,
          iconBg: '#EDE9FB', iconColor: '#6F5AE8',
          routeKey: 'Abi ja tugi',
          title: t('settings.card.helpSupport', lang),
          description: 'Korduma kippuvad küsimused, juhendid ja tugi.',
        },
        {
          icon: <Sparkles size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Mis on uut?',
          title: t('settings.card.whatsNew', lang),
          description: 'Vaata viimaseid uuendusi ja parandusi.',
        },
        {
          icon: <MessageSquare size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Tagasiside',
          title: t('settings.card.feedback', lang),
          description: 'Jaga oma ideid või anna meile tagasisidet.',
        },
        {
          icon: <Info size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Rakenduse info',
          title: t('settings.card.appInfo', lang),
          description: 'Vaata versiooni, litsentse ja seaduslikku infot.',
        },
      ],
    },
  ]
}

function getUsageStats(lang: AppLang): UsageStat[] {
  return [
    {
      icon: <HardDrive size={16} strokeWidth={1.8} />,
      iconBg: '#EDE9FB', iconColor: '#6F5AE8',
      label: t('settings.usage.storage', lang),
      used: '2.4 GB', total: '10 GB',
      pct: 24,
      barColor: '#6F5AE8',
    },
    {
      icon: <Sparkles size={16} strokeWidth={1.8} />,
      iconBg: '#DCFCE7', iconColor: '#16A34A',
      label: t('settings.usage.ai', lang),
      used: '156', total: '500',
      pct: 31,
      barColor: '#16A34A',
    },
    {
      icon: <Cloud size={16} strokeWidth={1.8} />,
      iconBg: '#FEF9C3', iconColor: '#CA8A04',
      label: t('settings.usage.projects', lang),
      used: '7', total: '20',
      pct: 38,
      barColor: '#CA8A04',
    },
  ]
}

function getQuickActions(lang: AppLang): QuickAction[] {
  return [
    {
      icon: <Lock size={15} strokeWidth={1.8} />,
      iconBg: '#EDE9FB', iconColor: '#6F5AE8',
      label: t('settings.quick.changePassword', lang),
    },
    {
      icon: <Download size={15} strokeWidth={1.8} />,
      iconBg: '#DCFCE7', iconColor: '#16A34A',
      label: t('settings.quick.downloadData', lang),
    },
    {
      icon: <RefreshCw size={15} strokeWidth={1.8} />,
      iconBg: '#FEF9C3', iconColor: '#CA8A04',
      label: t('settings.quick.checkSync', lang),
    },
    {
      icon: <Headphones size={15} strokeWidth={1.8} />,
      iconBg: '#FEE2E2', iconColor: '#DC2626',
      label: t('settings.quick.contactSupport', lang),
    },
  ]
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [openView, setOpenView] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => {
    return subscribeToLanguage((s) => setLang(s.appLang))
  }, [])

  // Reset the open sub-view whenever the user navigates to /app/settings,
  // including when they click "Seaded" in the sidebar from inside a sub-view.
  useEffect(() => {
    setOpenView(null)
  }, [location.key])

  // ── Preferences state ───────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editingPrefs, setEditingPrefs] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsDirty, setPrefsDirty] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserProfile(user.uid)
      .then((data) => { if (data) setProfile(data) })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!prefsDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [prefsDirty])

  const handlePrefsDirtyChange = useCallback((d: boolean) => setPrefsDirty(d), [])

  const handleEditPrefs = () => setEditingPrefs(true)

  const handleCancelPrefs = () => {
    if (prefsDirty) {
      const confirmed = window.confirm('Kas soovid loobuda? Salvestamata muudatused lähevad kaotsi.')
      if (!confirmed) return
    }
    setEditingPrefs(false)
    setPrefsDirty(false)
  }

  const handleSavePrefs = async (preferences: UserPreferencesUpdate) => {
    if (!user) return
    setSavingPrefs(true)
    try {
      await updateUserPreferences(user.uid, preferences)
      setProfile((prev) => prev ? { ...prev, preferences, updatedAt: new Date() } : prev)
      setEditingPrefs(false)
      setPrefsDirty(false)
    } catch {
      // error is surfaced by PreferencesEditForm internally
    } finally {
      setSavingPrefs(false)
    }
  }

  if (openView === 'Välimus') {
    return <AppearancePage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Turvalisus') {
    return <TurvalisusPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Teavitused') {
    return <TeavitusedPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Kuupäev ja aeg') {
    return <KuupaevJaAegPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Keel') {
    return <KeelPage onBack={() => setOpenView(null)} />
  }

  if (openView) {
    return <PlaceholderView title={openView} onBack={() => setOpenView(null)} />
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-[#1A1F36]">{t('nav.settings', lang)}</h1>

        {getSections(lang).map((section) => (
          <section key={section.heading}>
            <h2 className="text-sm font-semibold text-[#1A1F36] mb-4">{section.heading}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {section.cards.map((card) => (
                <SettingCard
                  key={card.routeKey}
                  card={card}
                  onClick={() =>
                    card.routeKey === 'Profiil ja konto'
                      ? navigate('/app/profile')
                      : setOpenView(card.routeKey)
                  }
                />
              ))}
            </div>
          </section>
        ))}

        {/* Eelistused */}
        {profile && (
          <section>
            {editingPrefs ? (
              <PreferencesEditForm
                profile={profile}
                saving={savingPrefs}
                onSave={handleSavePrefs}
                onCancel={handleCancelPrefs}
                onDirtyChange={handlePrefsDirtyChange}
              />
            ) : (
              <PreferencesSection
                profile={profile}
                onEdit={handleEditPrefs}
              />
            )}
          </section>
        )}
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-4">
        <UsageCard title={t('settings.usage.title', lang)} stats={getUsageStats(lang)} />
        <QuickActionsCard
          title={t('settings.quick.title', lang)}
          actions={getQuickActions(lang)}
          onAction={(label) => setOpenView(label)}
        />
      </aside>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PlaceholderView({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        Tagasi seadetesse
      </button>
      <div className="bg-white rounded-2xl border border-[#ECECF2] p-10 flex flex-col items-center text-center">
        <h1 className="text-xl font-bold text-[#1A1F36] mb-3">{title}</h1>
        <p className="text-sm text-[#94A3B8]">See seadete vaade on arendamisel.</p>
      </div>
    </div>
  )
}

function SettingCard({ card, onClick }: { card: SettingsCard; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-2xl border border-[#ECECF2] p-5 text-left hover:border-[#6F5AE8]/30 hover:shadow-sm transition-all duration-150 flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: card.iconBg, color: card.iconColor }}
        >
          {card.icon}
        </div>
        <ChevronRight
          size={16}
          strokeWidth={2}
          className="text-[#CBD5E1] group-hover:text-[#6F5AE8] transition-colors mt-1 flex-shrink-0"
        />
      </div>
      <p className="text-sm font-semibold text-[#1A1F36] mb-1">{card.title}</p>
      <p className="text-xs text-[#94A3B8] leading-relaxed">{card.description}</p>
    </button>
  )
}

function UsageCard({ title, stats }: { title: string; stats: UsageStat[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{title}</h3>
      <div className="flex flex-col gap-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: s.iconBg, color: s.iconColor }}
              >
                {s.icon}
              </div>
              <span className="text-xs font-medium text-[#1A1F36] flex-1">{s.label}</span>
              <span className="text-xs text-[#94A3B8] font-medium">
                {s.used} / {s.total}
              </span>
              <span className="text-xs font-semibold" style={{ color: s.iconColor }}>
                {s.pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#F1F0F8] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${s.pct}%`, background: s.barColor }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickActionsCard({
  title,
  actions,
  onAction,
}: {
  title: string
  actions: QuickAction[]
  onAction: (label: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-3">{title}</h3>
      <div className="flex flex-col divide-y divide-[#F3F3F8]">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.label)}
            className="flex items-center gap-3 py-3 group hover:opacity-80 transition-opacity text-left"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: action.iconBg, color: action.iconColor }}
            >
              {action.icon}
            </div>
            <span className="flex-1 text-xs font-semibold text-[#1A1F36]">{action.label}</span>
            <ChevronRight
              size={14}
              className="text-[#CBD5E1] group-hover:text-[#6F5AE8] transition-colors flex-shrink-0"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
