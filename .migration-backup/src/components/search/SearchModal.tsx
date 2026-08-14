import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight } from 'lucide-react'
import { buildSearchIndex, searchItems, SOURCE_META, type SearchItem } from '@/lib/searchIndex'

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  tasks:    { bg: '#FEF9C3', color: '#CA8A04' },
  calendar: { bg: '#DBEAFE', color: '#2563EB' },
  notes:    { bg: '#EDE9FB', color: '#6F5AE8' },
  habits:   { bg: '#DCFCE7', color: '#16A34A' },
  goals:    { bg: '#FEE2E2', color: '#DC2626' },
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SearchModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const index = useMemo(() => buildSearchIndex(), [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const results = useMemo(() => searchItems(index, query), [index, query])
  const trimmed = query.trim().length > 0

  const handleSelect = useCallback(
    (item: SearchItem) => {
      navigate(item.route)
      onClose()
    },
    [navigate, onClose],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[80px] px-4"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[560px] bg-white rounded-2xl border border-[#E8E6E0] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F0F0F0]">
          <Search size={18} className="text-[#94A3B8] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Otsi ülesandeid, sündmusi, märkmeid, harjumusi, eesmärke..."
            className="flex-1 text-sm text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none bg-transparent"
          />
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {trimmed && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[#94A3B8]">Vasteid ei leitud.</p>
            </div>
          )}

          {!trimmed && (
            <div className="px-4 py-6">
              <p className="text-xs text-[#94A3B8] font-medium mb-3">Otsib moodulitest</p>
              <div className="flex flex-wrap gap-2">
                {(['tasks', 'calendar', 'notes', 'habits', 'goals'] as const).map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: SOURCE_COLORS[s].bg,
                      color: SOURCE_COLORS[s].color,
                    }}
                  >
                    {SOURCE_META[s].label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {results.map((item) => {
                const meta = SOURCE_META[item.source]
                const colors = SOURCE_COLORS[item.source]
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F8F7F4] transition-colors"
                  >
                    <span
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold"
                      style={{ backgroundColor: colors.bg, color: colors.color }}
                    >
                      {meta.label.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1A1F36] font-medium truncate">{item.title}</p>
                      <p className="text-xs text-[#94A3B8] truncate">
                        {meta.label}
                        {item.subtitle ? ' · ' + item.subtitle : ''}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-[#C4C9D4] flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
