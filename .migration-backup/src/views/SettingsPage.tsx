import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppearancePage from '@/views/AppearancePage'
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
  title: string
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

// ── Data ───────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    heading: 'Konto ja profiil',
    cards: [
      {
        icon: <User size={22} strokeWidth={1.8} />,
        iconBg: '#EDE9FB', iconColor: '#6F5AE8',
        title: 'Profiil ja konto',
        description: 'Vaata ja muuda oma isikuandmeid, profiilipilti ja konto seadeid.',
      },
      {
        icon: <Shield size={22} strokeWidth={1.8} />,
        iconBg: '#DCFCE7', iconColor: '#16A34A',
        title: 'Turvalisus',
        description: 'Parool, kaheastmeline tuvastus ja sisselogimise seaded.',
      },
      {
        icon: <Mail size={22} strokeWidth={1.8} />,
        iconBg: '#FEF9C3', iconColor: '#CA8A04',
        title: 'E-posti seaded',
        description: 'Halda e-posti teavitusi ja kinnituseelistusi.',
      },
      {
        icon: <Lock size={22} strokeWidth={1.8} />,
        iconBg: '#FEE2E2', iconColor: '#DC2626',
        title: 'Privaatsus',
        description: 'Andmete privaatsus, nähtavus ja jagamise seaded.',
      },
    ],
  },
  {
    heading: 'Rakenduse seaded',
    cards: [
      {
        icon: <Palette size={22} strokeWidth={1.8} />,
        iconBg: '#EDE9FB', iconColor: '#6F5AE8',
        title: 'Välimus',
        description: 'Vali teema, värvid ja rakenduse kujunduse seaded.',
      },
      {
        icon: <Bell size={22} strokeWidth={1.8} />,
        iconBg: '#DCFCE7', iconColor: '#16A34A',
        title: 'Teavitused',
        description: 'Halda märguandeid, meeldetuletusi ja teavituste kanaleid.',
      },
      {
        icon: <Clock size={22} strokeWidth={1.8} />,
        iconBg: '#FEF9C3', iconColor: '#CA8A04',
        title: 'Kuupäev ja aeg',
        description: 'Vali ajavöönd, kuupäevavorming ja kellaaja formaat.',
      },
      {
        icon: <Globe size={22} strokeWidth={1.8} />,
        iconBg: '#FEE2E2', iconColor: '#DC2626',
        title: 'Keel',
        description: 'Rakenduse keel ja piirkonna seaded.',
      },
    ],
  },
  {
    heading: 'Andmed ja sünkroonimine',
    cards: [
      {
        icon: <RefreshCw size={22} strokeWidth={1.8} />,
        iconBg: '#EDE9FB', iconColor: '#6F5AE8',
        title: 'Sünkroonimine',
        description: 'Sünkrooni andmeid seadmete vahel ja vaata staatust.',
      },
      {
        icon: <UploadCloud size={22} strokeWidth={1.8} />,
        iconBg: '#DCFCE7', iconColor: '#16A34A',
        title: 'Varundamine',
        description: 'Loo varukoopia oma andmetest ja taasta neid vajadusel.',
      },
      {
        icon: <Download size={22} strokeWidth={1.8} />,
        iconBg: '#FEF9C3', iconColor: '#CA8A04',
        title: 'Andmete eksport',
        description: 'Ekspordi oma andmed erinevates vormingutes.',
      },
      {
        icon: <Trash2 size={22} strokeWidth={1.8} />,
        iconBg: '#FEE2E2', iconColor: '#DC2626',
        title: 'Andmete kustutamine',
        description: 'Kustuta oma konto või erinevaid andmeid.',
      },
    ],
  },
  {
    heading: 'Tugi ja lisainfo',
    cards: [
      {
        icon: <HelpCircle size={22} strokeWidth={1.8} />,
        iconBg: '#EDE9FB', iconColor: '#6F5AE8',
        title: 'Abi ja tugi',
        description: 'Korduma kippuvad küsimused, juhendid ja tugi.',
      },
      {
        icon: <Sparkles size={22} strokeWidth={1.8} />,
        iconBg: '#DCFCE7', iconColor: '#16A34A',
        title: 'Mis on uut?',
        description: 'Vaata viimaseid uuendusi ja parandusi.',
      },
      {
        icon: <MessageSquare size={22} strokeWidth={1.8} />,
        iconBg: '#FEF9C3', iconColor: '#CA8A04',
        title: 'Tagasiside',
        description: 'Jaga oma ideid või anna meile tagasisidet.',
      },
      {
        icon: <Info size={22} strokeWidth={1.8} />,
        iconBg: '#FEE2E2', iconColor: '#DC2626',
        title: 'Rakenduse info',
        description: 'Vaata versiooni, litsentse ja seaduslikku infot.',
      },
    ],
  },
]

const USAGE_STATS: UsageStat[] = [
  {
    icon: <HardDrive size={16} strokeWidth={1.8} />,
    iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    label: 'Pilvesalvestus',
    used: '2.4 GB', total: '10 GB',
    pct: 24,
    barColor: '#6F5AE8',
  },
  {
    icon: <Sparkles size={16} strokeWidth={1.8} />,
    iconBg: '#DCFCE7', iconColor: '#16A34A',
    label: 'AI päringud',
    used: '156', total: '500',
    pct: 31,
    barColor: '#16A34A',
  },
  {
    icon: <Cloud size={16} strokeWidth={1.8} />,
    iconBg: '#FEF9C3', iconColor: '#CA8A04',
    label: 'Projektid',
    used: '7', total: '20',
    pct: 38,
    barColor: '#CA8A04',
  },
]

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <Lock size={15} strokeWidth={1.8} />,
    iconBg: '#EDE9FB', iconColor: '#6F5AE8',
    label: 'Muuda parooli',
  },
  {
    icon: <Download size={15} strokeWidth={1.8} />,
    iconBg: '#DCFCE7', iconColor: '#16A34A',
    label: 'Laadi alla andmed',
  },
  {
    icon: <RefreshCw size={15} strokeWidth={1.8} />,
    iconBg: '#FEF9C3', iconColor: '#CA8A04',
    label: 'Kontrolli sünkroonimist',
  },
  {
    icon: <Headphones size={15} strokeWidth={1.8} />,
    iconBg: '#FEE2E2', iconColor: '#DC2626',
    label: 'Võta ühendust toega',
  },
]

// ── Main component ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [openView, setOpenView] = useState<string | null>(null)
  const navigate = useNavigate()

  if (openView === 'Välimus') {
    return <AppearancePage onBack={() => setOpenView(null)} />
  }

  if (openView) {
    return <PlaceholderView title={openView} onBack={() => setOpenView(null)} />
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-[#1A1F36]">Seaded</h1>

        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-sm font-semibold text-[#1A1F36] mb-4">{section.heading}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {section.cards.map((card) => (
                <SettingCard
                  key={card.title}
                  card={card}
                  onClick={() =>
                    card.title === 'Profiil ja konto'
                      ? navigate('/app/profile')
                      : setOpenView(card.title)
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-4">
        <UsageCard stats={USAGE_STATS} />
        <QuickActionsCard
          actions={QUICK_ACTIONS}
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

function UsageCard({ stats }: { stats: UsageStat[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Kasutus</h3>
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
  actions,
  onAction,
}: {
  actions: QuickAction[]
  onAction: (label: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-3">Kiirtoimingud</h3>
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
