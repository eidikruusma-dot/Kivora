import { Camera, Check, Image as ImageIcon, Phone, Cake, User, X as XIcon } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { formatCreatedAt, formatLastLogin } from '@/lib/userProfile'
import { LANGUAGE_LABELS, PLAN_LABEL } from '@/lib/profileConstants'
import type { UserProfile } from '@/types'

interface ProfileOverviewProps {
  profile: UserProfile
  emailVerified: boolean
  lastLoginAt: unknown
  onEdit: () => void
  onPhotoClick: () => void
}

const MISSING = 'Pole lisatud'

function calcCompleteness(profile: UserProfile): number {
  const checks = [
    Boolean(profile.displayName?.trim()),
    Boolean(profile.email?.trim()),
    Boolean(profile.phone?.trim()),
    Boolean(profile.birthday?.trim()),
    Boolean(profile.photoURL),
  ]
  const filled = checks.filter(Boolean).length
  return Math.round((filled / checks.length) * 100)
}

export default function ProfileOverview({
  profile,
  emailVerified,
  lastLoginAt,
  onEdit,
  onPhotoClick,
}: ProfileOverviewProps) {
  const completeness = calcCompleteness(profile)

  const missingItems: { icon: React.ReactNode; label: string }[] = []
  if (!profile.photoURL) missingItems.push({ icon: <ImageIcon size={14} strokeWidth={1.8} className="text-[#94A3B8]" />, label: 'Profiilipilt' })
  if (!profile.phone?.trim()) missingItems.push({ icon: <Phone size={14} strokeWidth={1.8} className="text-[#94A3B8]" />, label: 'Telefon' })
  if (!profile.birthday?.trim()) missingItems.push({ icon: <Cake size={14} strokeWidth={1.8} className="text-[#94A3B8]" />, label: 'Sünnipäev' })
  if (!profile.displayName?.trim()) missingItems.push({ icon: <User size={14} strokeWidth={1.8} className="text-[#94A3B8]" />, label: 'Kuvatav nimi' })

  const isComplete = completeness === 100

  const personalFields = [
    { label: 'Kuvatav nimi', value: profile.displayName?.trim() || MISSING, missing: !profile.displayName?.trim() },
    { label: 'E-post', value: profile.email, missing: false },
    { label: 'Telefon', value: profile.phone?.trim() || MISSING, missing: !profile.phone?.trim() },
    { label: 'Sünnipäev', value: profile.birthday?.trim() || MISSING, missing: !profile.birthday?.trim() },
  ]

  const accountFields = [
    {
      label: 'E-posti staatus',
      value: emailVerified ? (
        <span className="inline-flex items-center gap-1 text-green-600">
          <Check size={14} /> Kinnitatud
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <XIcon size={14} /> Kinnitamata
        </span>
      ),
    },
    { label: 'Viimane sisselogimine', value: formatLastLogin(lastLoginAt) },
    { label: 'Ajavöönd', value: profile.timezone || '—' },
    { label: 'Pakett', value: PLAN_LABEL },
    { label: 'Konto loodud', value: formatCreatedAt(profile.createdAt) },
  ]

  return (
    <div className="space-y-6">
      {/* Photo card */}
      <div className="relative bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E9E5FF] via-[#D8D0FF] to-[#E9E5FF]" />
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 px-6 py-6">
          <div className="relative group flex-shrink-0">
            <Avatar
              photoURL={profile.photoURL}
              fallbackName={profile.displayName}
              fallbackEmail={profile.email}
              size="lg"
            />
            <button
              type="button"
              onClick={onPhotoClick}
              aria-label="Muuda profiilipilti"
              className="absolute inset-0 rounded-full bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={20} className="text-white" />
              <span className="text-[10px] text-white font-medium mt-0.5">Muuda pilti</span>
            </button>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-lg font-semibold text-[#1A1F36] truncate">{profile.displayName || 'Kasutaja'}</h2>
            <p className="text-sm text-[#94A3B8] truncate">{profile.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F4F2FF] border border-[#E0DCFF] text-xs font-medium text-[#6F5AE8]">
                {PLAN_LABEL}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8]">
                Liige alates {formatCreatedAt(profile.createdAt)}
              </span>
            </div>
            {/* Completeness indicator */}
            <div className="mt-3 flex flex-col gap-2 justify-center sm:justify-start sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-[#F0EEFF] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isComplete
                        ? 'bg-gradient-to-r from-[#34D399] to-[#10B981]'
                        : 'bg-gradient-to-r from-[#A99BFF] to-[#6F5AE8]'
                    }`}
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <span className={`text-[11px] font-medium whitespace-nowrap ${
                  isComplete ? 'text-[#10B981]' : 'text-[#64748B]'
                }`}>
                  Profiil {completeness}% täidetud
                </span>
              </div>
            </div>
            {isComplete ? (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#10B981]">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#10B981]">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </span>
                Profiil täielikult täidetud
              </div>
            ) : (
              missingItems.length > 0 && (
                <div className="mt-2">
                  <p className="text-[12px] font-semibold text-[#334155] mb-1.5">Täienda profiili</p>
                  <ul className="space-y-1">
                    {missingItems.map((item) => (
                      <li key={item.label} className="flex items-center gap-2 h-5 text-[12px] text-[#94A3B8]">
                        {item.icon}
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
          <button
            onClick={onEdit}
            className="h-9 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-1.5 hover:bg-[#5B4AD5] transition-colors flex-shrink-0"
          >
            Muuda
          </button>
        </div>
      </div>

      {/* Personal data card */}
      <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#F0F0F0]">
          <h2 className="text-base font-semibold text-[#1A1F36]">Isiklikud andmed</h2>
          <button
            onClick={onEdit}
            className="h-9 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-1.5 hover:bg-[#5B4AD5] transition-colors"
          >
            Muuda
          </button>
        </div>
        <div className="divide-y divide-[#F0F0F0]">
          {personalFields.map((field) => (
            <div key={field.label} className="flex items-center justify-between px-6 py-4">
              <span className="text-sm text-[#64748B]">{field.label}</span>
              <span className={`text-sm font-medium text-right ${field.missing ? 'text-[#C4C9D4] italic' : 'text-[#1A1F36]'}`}>
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Account data card */}
      <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#F0F0F0]">
          <h2 className="text-base font-semibold text-[#1A1F36]">Konto andmed</h2>
        </div>
        <div className="divide-y divide-[#F0F0F0]">
          {accountFields.map((field) => (
            <div key={field.label} className="flex items-center justify-between px-6 py-4">
              <span className="text-sm text-[#64748B]">{field.label}</span>
              <span className="text-sm font-medium text-[#1A1F36] text-right">{field.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
