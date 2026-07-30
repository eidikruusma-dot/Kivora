import { getEffectivePreferences } from '@/lib/userProfile'
import {
  START_OF_WEEK_LABELS,
  TIME_FORMAT_LABELS,
  DATE_FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '@/lib/profileConstants'
import type { UserProfile } from '@/types'

interface PreferencesSectionProps {
  profile: UserProfile
  onEdit: () => void
}

export default function PreferencesSection({ profile, onEdit }: PreferencesSectionProps) {
  const prefs = getEffectivePreferences(profile)

  const fields = [
    { label: 'Rakenduse keel', value: LANGUAGE_LABELS[profile.preferredLanguage] || profile.preferredLanguage },
    { label: 'Ajavöönd', value: profile.timezone || '—', hint: 'Tuvastatud automaatselt' },
    { label: 'Nädala algus', value: START_OF_WEEK_LABELS[prefs.startOfWeek] || prefs.startOfWeek },
    { label: 'Kellaaja vorming', value: TIME_FORMAT_LABELS[prefs.timeFormat] || prefs.timeFormat },
    { label: 'Kuupäeva vorming', value: DATE_FORMAT_LABELS[prefs.dateFormat] || prefs.dateFormat },
  ]

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#F0F0F0]">
        <h2 className="text-base font-semibold text-[#1A1F36]">Eelistused</h2>
        <button
          onClick={onEdit}
          className="h-9 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-1.5 hover:bg-[#5B4AD5] transition-colors"
        >
          Muuda
        </button>
      </div>
      <div className="divide-y divide-[#F0F0F0]">
        {fields.map((field) => (
          <div key={field.label} className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-[#64748B]">{field.label}</span>
            <div className="text-right">
              <span className="text-sm font-medium text-[#1A1F36]">{field.value}</span>
              {field.hint && (
                <p className="text-xs text-[#94A3B8] mt-0.5">{field.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
