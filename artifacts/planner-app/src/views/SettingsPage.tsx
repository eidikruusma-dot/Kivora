import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import AppearancePage from '@/views/AppearancePage'
import TurvalisusPage from '@/views/settings/TurvalisusPage'
import TeavitusedPage from '@/views/settings/TeavitusedPage'
import KuupaevJaAegPage from '@/views/settings/KuupaevJaAegPage'
import KeelPage from '@/views/settings/KeelPage'
import EPostPage from '@/views/settings/EPostPage'
import PrivaatsusPage from '@/views/settings/PrivaatsusPage'
import VarundaminePage from '@/views/settings/VarundaminePage'
import AndmeteEksportPage from '@/views/settings/AndmeteEksportPage'
import AndmeteKustutaminePage from '@/views/settings/AndmeteKustutaminePage'
import AbiJaTugiPage from '@/views/settings/AbiJaTugiPage'
import TagasisidePage from '@/views/settings/TagasisidePage'
import MisOnUutPage from '@/views/settings/MisOnUutPage'
import RakendusePage from '@/views/settings/RakendusePage'
import ModulesPage from '@/views/settings/ModulesPage'
import { useAuth } from '@/context/AuthContext'
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
  Headphones,
  ArrowLeft,
  LayoutGrid,
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
  routeKey: string   // stable Estonian key — used for navigation, not displayed
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
          description: t('settings.desc.profile', lang),
        },
        {
          icon: <Shield size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Turvalisus',
          title: t('settings.card.security', lang),
          description: t('settings.desc.security', lang),
        },
        {
          icon: <Mail size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'E-posti seaded',
          title: t('settings.card.email', lang),
          description: t('settings.desc.email', lang),
        },
        {
          icon: <Lock size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Privaatsus',
          title: t('settings.card.privacy', lang),
          description: t('settings.desc.privacy', lang),
        },
      ],
    },
    {
      heading: t('settings.section.app', lang),
      cards: [
        {
          icon: <LayoutGrid size={22} strokeWidth={1.8} />,
          iconBg: '#EDE9FB', iconColor: '#6F5AE8',
          routeKey: 'Moodulid',
          title: t('settings.card.modules', lang),
          description: t('settings.desc.modules', lang),
        },
        {
          icon: <Palette size={22} strokeWidth={1.8} />,
          iconBg: '#F0FDF4', iconColor: '#16A34A',
          routeKey: 'Välimus',
          title: t('settings.card.appearance', lang),
          description: t('settings.desc.appearance', lang),
        },
        {
          icon: <Bell size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Teavitused',
          title: t('settings.card.notifications', lang),
          description: t('settings.desc.notifications', lang),
        },
        {
          icon: <Clock size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Kuupäev ja aeg',
          title: t('settings.card.datetime', lang),
          description: t('settings.desc.datetime', lang),
        },
        {
          icon: <Globe size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Keel',
          title: t('settings.card.language', lang),
          description: t('settings.desc.language', lang),
        },
      ],
    },
    {
      heading: t('settings.section.data', lang),
      cards: [
        {
          icon: <UploadCloud size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Varundamine',
          title: t('settings.card.backup', lang),
          description: t('settings.desc.backup', lang),
        },
        {
          icon: <Download size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Andmete eksport',
          title: t('settings.card.export', lang),
          description: t('settings.desc.export', lang),
        },
        {
          icon: <Trash2 size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Andmete kustutamine',
          title: t('settings.card.delete', lang),
          description: t('settings.desc.delete', lang),
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
          description: t('settings.desc.helpSupport', lang),
        },
        {
          icon: <Sparkles size={22} strokeWidth={1.8} />,
          iconBg: '#DCFCE7', iconColor: '#16A34A',
          routeKey: 'Mis on uut?',
          title: t('settings.card.whatsNew', lang),
          description: t('settings.desc.whatsNew', lang),
        },
        {
          icon: <MessageSquare size={22} strokeWidth={1.8} />,
          iconBg: '#FEF9C3', iconColor: '#CA8A04',
          routeKey: 'Tagasiside',
          title: t('settings.card.feedback', lang),
          description: t('settings.desc.feedback', lang),
        },
        {
          icon: <Info size={22} strokeWidth={1.8} />,
          iconBg: '#FEE2E2', iconColor: '#DC2626',
          routeKey: 'Rakenduse info',
          title: t('settings.card.appInfo', lang),
          description: t('settings.desc.appInfo', lang),
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
      used: '—', total: '—',
      pct: 0,
      barColor: '#6F5AE8',
    },
    {
      icon: <Sparkles size={16} strokeWidth={1.8} />,
      iconBg: '#DCFCE7', iconColor: '#16A34A',
      label: t('settings.usage.ai', lang),
      used: '—', total: '—',
      pct: 0,
      barColor: '#16A34A',
    },
    {
      icon: <Cloud size={16} strokeWidth={1.8} />,
      iconBg: '#FEF9C3', iconColor: '#CA8A04',
      label: t('settings.usage.projects', lang),
      used: '—', total: '—',
      pct: 0,
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
      routeKey: 'Turvalisus',
    },
    {
      icon: <Download size={15} strokeWidth={1.8} />,
      iconBg: '#DCFCE7', iconColor: '#16A34A',
      label: t('settings.quick.downloadData', lang),
      routeKey: 'Andmete eksport',
    },
    {
      icon: <Headphones size={15} strokeWidth={1.8} />,
      iconBg: '#FEE2E2', iconColor: '#DC2626',
      label: t('settings.quick.contactSupport', lang),
      routeKey: 'Abi ja tugi',
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

  if (openView === 'Moodulid') {
    return <ModulesPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Välimus') {
    return <AppearancePage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Turvalisus') {
    return <TurvalisusPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'E-posti seaded') {
    return <EPostPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Privaatsus') {
    return <PrivaatsusPage onBack={() => setOpenView(null)} />
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

  if (openView === 'Varundamine') {
    return <VarundaminePage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Andmete eksport') {
    return <AndmeteEksportPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Andmete kustutamine') {
    return <AndmeteKustutaminePage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Abi ja tugi') {
    return <AbiJaTugiPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Tagasiside') {
    return <TagasisidePage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Mis on uut?') {
    return <MisOnUutPage onBack={() => setOpenView(null)} />
  }

  if (openView === 'Rakenduse info') {
    return <RakendusePage onBack={() => setOpenView(null)} />
  }

  if (openView) {
    return <PlaceholderView title={openView} onBack={() => setOpenView(null)} />
  }

  return (
    <div className="settings-page flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">

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

      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full md:w-72 flex-shrink-0 flex flex-col gap-4">
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
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => { return subscribeToLanguage((s) => setLang(s.appLang)) }, [])
  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>
      <div className="bg-white rounded-2xl border border-[#ECECF2] p-10 flex flex-col items-center text-center">
        <h1 className="text-xl font-bold text-[#1A1F36] mb-3">{title}</h1>
        <p className="text-sm text-[#94A3B8]">{t('settings.wip', lang)}</p>
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
  onAction: (routeKey: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-3">{title}</h3>
      <div className="flex flex-col divide-y divide-[#F3F3F8]">
        {actions.map((action) => (
          <button
            key={action.routeKey}
            onClick={() => onAction(action.routeKey)}
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
