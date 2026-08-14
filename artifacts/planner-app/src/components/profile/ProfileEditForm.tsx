import { useState, useEffect } from 'react'
import { Loader2, Lock } from 'lucide-react'
import Avatar from '@/components/ui/AppAvatar'
import { formatCreatedAt } from '@/lib/userProfile'
import { PLAN_LABEL } from '@/lib/profileConstants'
import type { UserProfile } from '@/types'
import type { UserProfileUpdate } from '@/lib/userProfile'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ---------------------------------------------------------------------------
// Country calling codes — ordered longest-first so parsing never short-circuits
// ---------------------------------------------------------------------------
const COUNTRY_CODES: { code: string; flag: string }[] = [
  { code: '+372', flag: '🇪🇪' },
  { code: '+358', flag: '🇫🇮' },
  { code: '+371', flag: '🇱🇻' },
  { code: '+370', flag: '🇱🇹' },
  { code: '+46',  flag: '🇸🇪' },
  { code: '+47',  flag: '🇳🇴' },
  { code: '+45',  flag: '🇩🇰' },
  { code: '+49',  flag: '🇩🇪' },
  { code: '+44',  flag: '🇬🇧' },
  { code: '+1',   flag: '🇺🇸' },
]

/** Split a stored normalized string (e.g. "+37251234567") into { code, local }. */
function parseStoredPhone(stored: string): { code: string; local: string } {
  if (!stored) return { code: '', local: '' }
  for (const entry of COUNTRY_CODES) {
    if (stored.startsWith(entry.code)) {
      return { code: entry.code, local: stored.slice(entry.code.length) }
    }
  }
  // Unknown or legacy format — put everything in local, leave code empty
  return { code: '', local: stored }
}

/** Compose a normalized phone string from parts, or "" if incomplete. */
function composePhone(code: string, local: string): string {
  const digits = local.replace(/\D/g, '')
  if (!code || !digits) return ''
  return code + digits
}

// ---------------------------------------------------------------------------

interface ProfileEditFormProps {
  profile: UserProfile
  saving: boolean
  onSave: (changes: UserProfileUpdate) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}

interface FieldErrors {
  displayName?: string
  phone?: string
  birthday?: string
}

export default function ProfileEditForm({
  profile,
  saving,
  onSave,
  onCancel,
  onDirtyChange,
}: ProfileEditFormProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const parsed = parseStoredPhone(profile.phone || '')
  const [phoneCode, setPhoneCode] = useState(parsed.code)
  const [phoneLocal, setPhoneLocal] = useState(parsed.local)
  const [birthday, setBirthday] = useState(profile.birthday || '')
  const [touched, setTouched] = useState(false)

  const composedPhone = composePhone(phoneCode, phoneLocal)

  function validate(values: { displayName: string; birthday: string }): FieldErrors {
    const errors: FieldErrors = {}
    const trimmed = values.displayName.trim()
    if (trimmed.length === 0) {
      errors.displayName = t('profile.edit.err.nameEmpty', lang)
    } else if (trimmed.length > 40) {
      errors.displayName = t('profile.edit.err.nameLong', lang)
    }
    const digits = phoneLocal.replace(/\D/g, '')
    if (digits && !phoneCode) {
      errors.phone = t('profile.edit.err.phoneCountryRequired', lang)
    } else if (digits && digits.length < 5) {
      errors.phone = t('profile.edit.err.phoneMinDigits', lang)
    }
    if (values.birthday && isNaN(new Date(values.birthday).getTime())) {
      errors.birthday = t('profile.edit.err.dateInvalid', lang)
    }
    return errors
  }

  const errors = validate({ displayName, birthday })
  const hasErrors = Object.keys(errors).length > 0

  const isDirty =
    displayName !== (profile.displayName || '') ||
    composedPhone !== (profile.phone || '') ||
    birthday !== (profile.birthday || '')

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (hasErrors) return
    onSave({
      displayName: displayName.trim(),
      phone: composedPhone,
      birthday: birthday || '',
    })
  }

  const inputClass =
    'w-full h-11 px-3.5 text-sm bg-[#F8F7F4] border rounded-xl text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors'

  const borderClass = (hasError: boolean) =>
    hasError ? 'border-red-400' : 'border-[#E8E6E0]'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      {/* Avatar section */}
      <div className="flex items-center gap-4 px-6 py-6 border-b border-[#F0F0F0]">
        <Avatar
          photoURL={profile.photoURL}
          fallbackName={profile.displayName}
          fallbackEmail={profile.email}
          size="md"
        />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-[#1A1F36] truncate">{profile.displayName || t('profile.fallback', lang)}</p>
          <p className="text-sm text-[#94A3B8] truncate">{profile.email}</p>
        </div>
      </div>

      {/* Fields */}
      <div className="px-6 py-5 space-y-5">
        {/* Display name */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.field.name', lang)}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className={`${inputClass} ${borderClass(touched && !!errors.displayName)}`}
            placeholder={t('profile.edit.name.ph', lang)}
          />
          {touched && errors.displayName && (
            <p className="text-xs text-red-500 mt-1">{errors.displayName}</p>
          )}
        </div>

        {/* Email — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.field.email', lang)}</label>
          <input
            type="email"
            value={profile.email}
            readOnly
            className="w-full h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#94A3B8] cursor-not-allowed"
          />
          <p className="text-xs text-[#94A3B8] mt-1">{t('profile.edit.email.readonly', lang)}</p>
        </div>

        {/* Phone — country code selector + local number input */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
            {t('profile.field.phone', lang)}{' '}
            <span className="text-[#94A3B8] font-normal">({t('profile.edit.optional', lang)})</span>
          </label>
          <div className="flex gap-2">
            {/* Country code selector */}
            <select
              value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value)}
              className={`h-11 px-2.5 text-sm bg-[#F8F7F4] border rounded-xl text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors flex-shrink-0 w-[118px] ${borderClass(touched && !!errors.phone)}`}
            >
              <option value="">{t('profile.edit.phone.codePh', lang)}</option>
              {COUNTRY_CODES.map(({ code, flag }) => (
                <option key={code} value={code}>{flag} {code}</option>
              ))}
            </select>
            {/* Local number input — digits only */}
            <input
              type="tel"
              inputMode="numeric"
              value={phoneLocal}
              onChange={(e) => setPhoneLocal(e.target.value.replace(/\D/g, ''))}
              maxLength={15}
              className={`${inputClass} flex-1 ${borderClass(touched && !!errors.phone)}`}
              placeholder={t('profile.edit.phone.numberPh', lang)}
            />
          </div>
          {touched && errors.phone && (
            <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
          )}
        </div>

        {/* Birthday */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
            {t('profile.field.birthday', lang)}{' '}
            <span className="text-[#94A3B8] font-normal">({t('profile.edit.optional', lang)})</span>
          </label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className={`${inputClass} ${borderClass(touched && !!errors.birthday)}`}
          />
          {touched && errors.birthday && (
            <p className="text-xs text-red-500 mt-1">{errors.birthday}</p>
          )}
        </div>

        {/* Plan — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.field.plan', lang)}</label>
          <div className="flex items-center gap-2 h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#94A3B8]">
            <Lock size={14} className="flex-shrink-0" />
            <span>{PLAN_LABEL}</span>
          </div>
        </div>

        {/* Account created — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.field.created', lang)}</label>
          <div className="flex items-center gap-2 h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#94A3B8]">
            <Lock size={14} className="flex-shrink-0" />
            <span>{formatCreatedAt(profile.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#F0F0F0] bg-[#FAFAF8]">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-10 px-4 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F0F0F0] transition-colors disabled:opacity-50"
        >
          {t('profile.cancelBtn', lang)}
        </button>
        <button
          type="submit"
          disabled={saving || !isDirty || (touched && hasErrors)}
          className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? t('profile.savingBtn', lang) : t('profile.saveBtn', lang)}
        </button>
      </div>
    </form>
  )
}
