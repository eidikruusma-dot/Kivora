import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, CalendarPlus, CalendarDays } from 'lucide-react'
import type { CalendarViewType } from '@/types'
import { formatWeekRange, formatDaySingle, formatMonthYear } from '@/lib/calendar/dateUtils'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface CalendarHeaderProps {
  currentDate: Date
  viewType: CalendarViewType
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (type: CalendarViewType) => void
  onNewEvent: () => void
  onNewCalendar: () => void
}

export default function CalendarHeader({
  currentDate,
  viewType,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onNewEvent,
  onNewCalendar,
}: CalendarHeaderProps) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
    { value: 'month',  label: t('cal.view.month',  lang) },
    { value: 'week',   label: t('cal.view.week',   lang) },
    { value: 'day',    label: t('cal.view.day',    lang) },
    { value: 'agenda', label: t('cal.view.agenda', lang) },
  ]

  const dateLabel =
    viewType === 'week'
      ? formatWeekRange(currentDate, lang)
      : viewType === 'month'
        ? formatMonthYear(currentDate, lang)
        : formatDaySingle(currentDate, lang)

  return (
    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 border-b border-[#EBEBEB] px-4 py-2.5 lg:px-5 lg:py-0 lg:h-[58px]">
      {/* Left group: navigation controls + date label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onToday}
          className="rounded-md border border-[#D1D5DB] text-sm font-medium text-[#374151] bg-white hover:bg-[#F9FAFB] transition-colors flex-shrink-0 px-3"
          style={{ height: '34px' }}
        >
          {t('cal.today', lang)}
        </button>
        <button
          onClick={onPrev}
          className="rounded-md flex items-center justify-center text-[#6B7280] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors flex-shrink-0"
          style={{ width: '34px', height: '34px' }}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={onNext}
          className="rounded-md flex items-center justify-center text-[#6B7280] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors flex-shrink-0"
          style={{ width: '34px', height: '34px' }}
        >
          <ChevronRight size={16} />
        </button>
        <span className="text-[15px] font-semibold text-[#1A1F36] flex-shrink-0 min-w-[130px]">
          {dateLabel}
        </span>
      </div>

      {/* Right group: view switcher + New button — both push to right on wider screens */}
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        {/* View switcher — hidden on mobile to save space, shown from sm: */}
        <div className="hidden sm:flex items-center border border-[#D1D5DB] rounded-md" style={{ height: '34px' }}>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={`px-2.5 rounded-md text-sm font-medium transition-colors h-full ${
                viewType === opt.value
                  ? 'bg-[#6F5AE8] text-white'
                  : 'text-[#6B7280] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* On mobile: compact view selector (dropdown-style via the existing menu) */}
        <div className="sm:hidden relative">
          <button
            onClick={() => onViewChange(
              viewType === 'week' ? 'month'
              : viewType === 'month' ? 'day'
              : viewType === 'day' ? 'agenda'
              : 'week'
            )}
            className="rounded-md border border-[#D1D5DB] text-sm font-medium text-[#374151] bg-white hover:bg-[#F9FAFB] transition-colors px-3 flex-shrink-0"
            style={{ height: '34px' }}
          >
            {VIEW_OPTIONS.find(o => o.value === viewType)?.label}
          </button>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg bg-[#6F5AE8] text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[#5B4AD5] transition-colors flex-shrink-0 px-3"
            style={{ height: '36px' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden xs:inline">{t('cal.new', lang)}</span>
            <ChevronDown size={13} className="opacity-80" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden z-20">
              <button
                onClick={() => { setMenuOpen(false); onNewEvent() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors text-left"
              >
                <CalendarPlus size={15} className="text-[#6F5AE8]" />
                {t('cal.newEvent', lang)}
              </button>
              <button
                onClick={() => { setMenuOpen(false); onNewCalendar() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors text-left"
              >
                <CalendarDays size={15} className="text-[#6F5AE8]" />
                {t('cal.newCalendar', lang)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
