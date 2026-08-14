import { Plus } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface CalendarItem {
  id: string
  label: string
  color: string
}

interface MyCalendarsProps {
  visible: Record<string, boolean>
  onToggle: (id: string) => void
  calendars: CalendarItem[]
  lang: AppLang
}

export default function MyCalendars({ visible, onToggle, calendars, lang }: MyCalendarsProps) {
  return (
    <div>
      {/* Heading row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#1A1F36]">{t('cal.myCalendars', lang)}</span>
        <button className="w-5 h-5 rounded flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#6F5AE8] transition-colors">
          <Plus size={14} />
        </button>
      </div>

      {/* Calendar list */}
      <div className="space-y-2.5">
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => onToggle(cal.id)}
          >
            <div
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
              style={{
                backgroundColor: visible[cal.id] ? cal.color : 'transparent',
                border: `1.5px solid ${visible[cal.id] ? cal.color : '#D1D5DB'}`,
              }}
            >
              {visible[cal.id] && (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span
              className={`text-sm ${
                visible[cal.id] ? 'text-[#1A1F36]' : 'text-[#C4C9D4]'
              }`}
            >
              {cal.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
