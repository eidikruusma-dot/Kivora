import { useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { getEffectivePreferences } from '@/lib/userProfile'
import {
  START_OF_WEEK_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DATE_FORMAT_OPTIONS,
  SUPPORTED_LANGUAGES,
} from '@/lib/profileConstants'
import type { UserProfile, StartOfWeek, TimeFormat, DateFormat } from '@/types'
import type { UserPreferencesUpdate } from '@/lib/userProfile'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface PreferencesEditFormProps {
  profile: UserProfile
  saving: boolean
  onSave: (preferences: UserPreferencesUpdate) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Tallinn'
  } catch {
    return 'Europe/Tallinn'
  }
}

export default function PreferencesEditForm({
  profile,
  saving,
  onSave,
  onCancel,
  onDirtyChange,
}: PreferencesEditFormProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const current = getEffectivePreferences(profile)
  const [startOfWeek, setStartOfWeek] = useState<StartOfWeek>(current.startOfWeek)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(current.timeFormat)
  const [dateFormat, setDateFormat] = useState<DateFormat>(current.dateFormat)
  const [preferredLanguage, setPreferredLanguage] = useState(profile.preferredLanguage || 'et')
  const [timezone, setTimezone] = useState(profile.timezone || detectTimezone())

  const isDirty =
    startOfWeek !== current.startOfWeek ||
    timeFormat !== current.timeFormat ||
    dateFormat !== current.dateFormat ||
    preferredLanguage !== (profile.preferredLanguage || 'et') ||
    timezone !== (profile.timezone || detectTimezone())

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ startOfWeek, timeFormat, dateFormat, preferredLanguage, timezone })
  }

  const inputClass = useMemo(
    () =>
      'w-full h-11 px-3.5 text-sm bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors',
    [],
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="px-6 py-5 border-b border-[#F0F0F0]">
        <h2 className="text-base font-semibold text-[#1A1F36]">{t('profile.pref.title', lang)}</h2>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.pref.language', lang)}</label>
          <select
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
            className={inputClass}
          >
            {SUPPORTED_LANGUAGES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.pref.timezone.label', lang)}</label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Tallinn"
            className={inputClass}
          />
          <p className="text-xs text-[#94A3B8] mt-1">
            {t('profile.pref.timezone.detected', lang).replace('{tz}', detectTimezone())}
          </p>
        </div>

        {/* Start of week */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.pref.weekStart', lang)}</label>
          <select
            value={startOfWeek}
            onChange={(e) => setStartOfWeek(e.target.value as StartOfWeek)}
            className={inputClass}
          >
            {START_OF_WEEK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Time format */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.pref.timeFormat', lang)}</label>
          <select
            value={timeFormat}
            onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
            className={inputClass}
          >
            {TIME_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Date format */}
        <div>
          <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{t('profile.pref.dateFormat', lang)}</label>
          <select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            className={inputClass}
          >
            {DATE_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

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
          disabled={saving || !isDirty}
          className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? t('profile.savingBtn', lang) : t('profile.saveBtn', lang)}
        </button>
      </div>
    </form>
  )
}
