import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, CalendarPlus, CalendarDays } from 'lucide-react'
import type { CalendarViewType } from '@/types'
import { formatWeekRange, formatDaySingle, formatMonthYear } from '@/lib/calendar/dateUtils'

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

const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
  { value: 'month', label: 'Kuu' },
  { value: 'week', label: 'Nädal' },
  { value: 'day', label: 'Päev' },
  { value: 'agenda', label: 'Nimekiri' },
]

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

  const dateLabel =
    viewType === 'week'
      ? formatWeekRange(currentDate)
      : viewType === 'month'
        ? formatMonthYear(currentDate)
        : formatDaySingle(currentDate)

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 border-b border-[#EBEBEB]"
      style={{ height: '58px', paddingLeft: '20px', paddingRight: '20px' }}
    >
      {/* Left group */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToday}
          className="rounded-md border border-[#D1D5DB] text-sm font-medium text-[#374151] bg-white hover:bg-[#F9FAFB] transition-colors flex-shrink-0"
          style={{ width: '60px', height: '34px' }}
        >
          Täna
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
        <span
          className="text-[15px] font-semibold text-[#1A1F36] flex-shrink-0"
          style={{ width: '180px' }}
        >
          {dateLabel}
        </span>
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-[#D1D5DB] rounded-md" style={{ height: '34px' }}>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={`px-3 rounded-md text-sm font-medium transition-colors h-full ${
                viewType === opt.value
                  ? 'bg-[#6F5AE8] text-white'
                  : 'text-[#6B7280] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg bg-[#6F5AE8] text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[#5B4AD5] transition-colors flex-shrink-0"
            style={{ width: '106px', height: '36px' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Uus</span>
            <ChevronDown size={13} className="opacity-80" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden z-20">
              <button
                onClick={() => { setMenuOpen(false); onNewEvent() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors text-left"
              >
                <CalendarPlus size={15} className="text-[#6F5AE8]" />
                Uus sündmus
              </button>
              <button
                onClick={() => { setMenuOpen(false); onNewCalendar() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors text-left"
              >
                <CalendarDays size={15} className="text-[#6F5AE8]" />
                Uus kalender
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
