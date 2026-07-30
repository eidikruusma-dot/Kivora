import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { StartOfWeek } from '@/types'
import {
  getMonthMatrix,
  isToday,
  isSameMonth,
  formatMonthYear,
  addMonths,
  WEEKDAYS_ET,
} from '@/lib/calendar/dateUtils'

interface MiniCalendarProps {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  startOfWeek: StartOfWeek
}

interface MiniCalendarState {
  viewMonth: Date
}

import { useState } from 'react'

export default function MiniCalendar({ selectedDate, onDateSelect, startOfWeek }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))

  const weeks = getMonthMatrix(viewMonth.getFullYear(), viewMonth.getMonth(), startOfWeek)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-[#1A1F36]">{formatMonthYear(viewMonth)}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            className="w-6 h-6 rounded-md hover:bg-[#F8F7F4] flex items-center justify-center text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            className="w-6 h-6 rounded-md hover:bg-[#F8F7F4] flex items-center justify-center text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS_ET.map((day, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-[#94A3B8] py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((date) => {
          const inMonth = isSameMonth(date, viewMonth)
          const selected = isToday(date) || date.toDateString() === selectedDate.toDateString()
          const today = isToday(date)

          return (
            <button
              key={date.toISOString()}
              onClick={() => onDateSelect(date)}
              className={`h-7 w-7 flex items-center justify-center text-xs rounded-lg transition-colors ${
                today
                  ? 'bg-[#6F5AE8] text-white font-bold'
                  : selected
                    ? 'bg-[#EDE9FB] text-[#6F5AE8] font-semibold'
                    : inMonth
                      ? 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                      : 'text-[#C4C9D4] hover:bg-[#F8F7F4]'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
