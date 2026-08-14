import { useState, useEffect } from 'react'
import { Camera, Check, Image as ImageIcon, Pencil, Phone, Cake, User, X as XIcon } from 'lucide-react'
import Avatar from '@/components/ui/AppAvatar'
import { formatCreatedAt, formatLastLogin } from '@/lib/userProfile'
import { LANGUAGE_LABELS, PLAN_LABEL } from '@/lib/profileConstants'
import type { UserProfile } from '@/types'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface ProfileOverviewProps {
  profile: UserProfile
  emailVerified: boolean
  lastLoginAt: unknown
  onEdit: () => void
  onPhotoClick: () => void
}

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
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const completeness = calcCompleteness(profile)

  const missingItems: { icon: React.ReactNode; label: string }[] = []
  if (!profile.photoURL) missingItems.push({ icon: <ImageIcon size={14} strokeWidth={1.8} className="text-[#60A5FA]" />, label: t('profile.photo.title', lang) })
  if (!profile.phone?.trim()) missingItems.push({ icon: <Phone size={14} strokeWidth={1.8} className="text-[#A78BFA]" />, label: t('profile.field.phone', lang) })
  if (!profile.birthday?.trim()) missingItems.push({ icon: <Cake size={14} strokeWidth={1.8} className="text-[#FB923C]" />, label: t('profile.field.birthday', lang) })
  if (!profile.displayName?.trim()) missingItems.push({ icon: <User size={14} strokeWidth={1.8} className="text-[#94A3B8]" />, label: t('profile.field.name', lang) })

  const isComplete = completeness === 100

  const personalFields = [
    { label: t('profile.field.name', lang), value: profile.displayName?.trim() || t('profile.missing', lang), missing: !profile.displayName?.trim() },
    { label: t('profile.field.email', lang), value: profile.email, missing: false },
    { label: t('profile.field.phone', lang), value: profile.phone?.trim() || t('profile.missing', lang), missing: !profile.phone?.trim(), actionLabel: t('profile.action.addPhone', lang) },
    { label: t('profile.field.birthday', lang), value: profile.birthday?.trim() || t('profile.missing', lang), missing: !profile.birthday?.trim(), actionLabel: t('profile.action.addBirthday', lang) },
  ]

  const accountFields = [
    {
      label: t('profile.field.emailStatus', lang),
      value: emailVerified ? (
        <span className="inline-flex items-center gap-1 text-green-600">
          <Check size={14} /> {t('profile.field.emailVerified', lang)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <XIcon size={14} /> {t('profile.field.emailUnverified', lang)}
        </span>
      ),
    },
    { label: t('profile.field.lastLogin', lang), value: formatLastLogin(lastLoginAt) },
    { label: t('profile.field.timezone', lang), value: profile.timezone || '—' },
    {
      label: t('profile.field.plan', lang),
      value: (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F4F2FF] border border-[#E0DCFF] text-xs font-medium text-[#6F5AE8]">
          {PLAN_LABEL}
        </span>
      ),
    },
    { label: t('profile.field.created', lang), value: formatCreatedAt(profile.createdAt), dim: true },
  ]

  return (
    <div className="space-y-6">
      {/* Photo card */}
      <div className="relative bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        <div className="profile-card-accent absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E9E5FF] via-[#D8D0FF] to-[#E9E5FF]" />
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 px-6 py-6">
          <div className="relative group flex-shrink-0">
            <Avatar
              photoURL={profile.photoURL}
              fallbackName={profile.displayName}
              fallbackEmail={profile.email}
              size="lg"
              className="profile-avatar"
            />
            <button
              type="button"
              onClick={onPhotoClick}
              aria-label={t('profile.photo.changeAria', lang)}
              className="absolute inset-0 rounded-full bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={20} className="text-white" />
              <span className="text-[10px] text-white font-medium mt-0.5">{t('profile.photo.changeLabel', lang)}</span>
            </button>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-lg font-semibold text-[#1A1F36] truncate">{profile.displayName || t('profile.fallback', lang)}</h2>
            <p className="text-sm text-[#94A3B8] truncate">{profile.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F4F2FF] border border-[#E0DCFF] text-xs font-medium text-[#6F5AE8]">
                {PLAN_LABEL}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8]">
                {t('profile.memberSince', lang)} {formatCreatedAt(profile.createdAt)}
              </span>
            </div>
            {/* Completeness indicator */}
            <div className="mt-3 flex flex-col gap-2 justify-center sm:justify-start sm:flex-row sm:items-center sm:gap-3">
              <div className="flex flex-col gap-1">
                <span className={`text-[11px] font-medium whitespace-nowrap ${
                  isComplete ? 'text-[#10B981]' : 'text-[#64748B]'
                }`}>
                  {t('profile.completeness', lang).replace('{n}', String(completeness))}
                </span>
                <div className="profile-progress-track w-full h-1.5 rounded-full bg-[#F0EEFF] overflow-hidden">
                  <div
                    className={`profile-progress-fill h-full rounded-full transition-all duration-500 ${
                      isComplete
                        ? 'bg-gradient-to-r from-[#34D399] to-[#10B981]'
                        : 'bg-gradient-to-r from-[#A99BFF] to-[#6F5AE8]'
                    }`}
                    style={{ width: `${completeness}%` }}
                  />
                </div>
              </div>
            </div>
            {isComplete ? (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#10B981]">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#10B981]">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </span>
                {t('profile.complete', lang)}
              </div>
            ) : (
              missingItems.length > 0 && (
                <div className="mt-2">
                  <p className="text-[12px] font-semibold text-[#334155] mb-1.5">{t('profile.complete.prompt', lang)}</p>
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
            <Pencil size={14} />
            {t('profile.editBtn', lang)}
          </button>
        </div>
      </div>

      {/* Personal data + Account data — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal data card */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#F0F0F0]">
            <h2 className="text-base font-semibold text-[#1A1F36]">{t('profile.personal.title', lang)}</h2>
            <button
              onClick={onEdit}
              className="h-9 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-1.5 hover:bg-[#5B4AD5] transition-colors"
            >
              <Pencil size={14} />
              {t('profile.editBtn', lang)}
            </button>
          </div>
          <div className="divide-y divide-[#F0F0F0]">
            {personalFields.map((field) => (
              <div key={field.label} className="flex items-center justify-between px-6 py-4">
                <span className="text-sm text-[#64748B]">{field.label}</span>
                {field.missing && field.actionLabel ? (
                  <button
                    onClick={onEdit}
                    className="text-sm font-medium text-[#6F5AE8] hover:text-[#5B4AD5] transition-colors"
                  >
                    {field.actionLabel}
                  </button>
                ) : (
                  <span className={`text-sm font-medium text-right ${field.missing ? 'text-[#C4C9D4] italic' : 'text-[#1A1F36]'}`}>
                    {field.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Account data card */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden h-full">
          <div className="px-6 py-5 border-b border-[#F0F0F0]">
            <h2 className="text-base font-semibold text-[#1A1F36]">{t('profile.account.title', lang)}</h2>
          </div>
          <div className="divide-y divide-[#F0F0F0]">
            {accountFields.map((field) => (
              <div key={field.label} className="flex items-center justify-between px-6 py-4">
                <span className="text-sm text-[#64748B]">{field.label}</span>
                <span className={`text-sm font-medium text-right ${'dim' in field && field.dim ? 'text-[#94A3B8]' : 'text-[#1A1F36]'}`}>{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
