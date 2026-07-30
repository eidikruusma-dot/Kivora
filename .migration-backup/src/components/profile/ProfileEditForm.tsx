import { useState, useEffect } from 'react'
import { Loader2, Lock } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { formatCreatedAt } from '@/lib/userProfile'
import { PLAN_LABEL } from '@/lib/profileConstants'
import type { UserProfile } from '@/types'
import type { UserProfileUpdate } from '@/lib/userProfile'

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

function validate(values: { displayName: string; phone: string; birthday: string }): FieldErrors {
  const errors: FieldErrors = {}
  const trimmed = values.displayName.trim()
  if (trimmed.length === 0) {
    errors.displayName = 'Nimi ei tohi olla tühi'
  } else if (trimmed.length > 40) {
    errors.displayName = 'Nimi võib olla kuni 40 tähemärki'
  }
  const phoneTrimmed = values.phone.trim()
  if (phoneTrimmed && !/^[+\d][\d\s()-]{4,20}$/.test(phoneTrimmed)) {
    errors.phone = 'Sisesta kehtiv telefoninumber'
  }
  if (values.birthday && isNaN(new Date(values.birthday).getTime())) {
    errors.birthday = 'Sisesta kehtiv kuupäev'
  }
  return errors
}

export default function ProfileEditForm({
  profile,
  saving,
  onSave,
  onCancel,
  onDirtyChange,
}: ProfileEditFormProps) {
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [birthday, setBirthday] = useState(profile.birthday || '')
  const [touched, setTouched] = useState(false)

  const values = { displayName, phone, birthday }
  const errors = validate(values)
  const hasErrors = Object.keys(errors).length > 0

  const isDirty =
    displayName !== (profile.displayName || '') ||
    phone !== (profile.phone || '') ||
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
      phone: phone.trim(),
      birthday: birthday || '',
    })
  }

  const inputClass =
    'w-full h-11 px-3.5 text-sm bg-[#F8F7F4] border rounded-xl text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors'

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
          <p className="text-lg font-semibold text-[#1A1F36] truncate">{profile.displayName || 'Kasutaja'}</p>
          <p className="text-sm text-[#94A3B8] truncate">{profile.email}</p>
        </div>
      </div>

      {/* Fields */}
      <div className="px-6 py-5 space-y-5">
        {/* Display name */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Kuvatav nimi</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className={`${inputClass} ${touched && errors.displayName ? 'border-red-400' : 'border-[#E8E6E0]'}`}
            placeholder="Sinu nimi"
          />
          {touched && errors.displayName && (
            <p className="text-xs text-red-500 mt-1">{errors.displayName}</p>
          )}
        </div>

        {/* Email — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">E-post</label>
          <input
            type="email"
            value={profile.email}
            readOnly
            className="w-full h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#94A3B8] cursor-not-allowed"
          />
          <p className="text-xs text-[#94A3B8] mt-1">E-posti muutmine pole selles etapis saadaval</p>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
            Telefon <span className="text-[#94A3B8] font-normal">(valikuline)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={22}
            className={`${inputClass} ${touched && errors.phone ? 'border-red-400' : 'border-[#E8E6E0]'}`}
            placeholder="+372 5xxx xxxx"
          />
          {touched && errors.phone && (
            <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
          )}
        </div>

        {/* Birthday */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">
            Sünnipäev <span className="text-[#94A3B8] font-normal">(valikuline)</span>
          </label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className={`${inputClass} ${touched && errors.birthday ? 'border-red-400' : 'border-[#E8E6E0]'}`}
          />
          {touched && errors.birthday && (
            <p className="text-xs text-red-500 mt-1">{errors.birthday}</p>
          )}
        </div>

        {/* Plan — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Pakett</label>
          <div className="flex items-center gap-2 h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#94A3B8]">
            <Lock size={14} className="flex-shrink-0" />
            <span>{PLAN_LABEL}</span>
          </div>
        </div>

        {/* Account created — readonly */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Konto loodud</label>
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
          Loobu
        </button>
        <button
          type="submit"
          disabled={saving || !isDirty || (touched && hasErrors)}
          className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Salvestan...' : 'Salvesta'}
        </button>
      </div>
    </form>
  )
}
