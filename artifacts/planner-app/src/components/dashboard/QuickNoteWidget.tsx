import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/AppCard'
import {
  getLatestQuickNotes,
  addQuickNote,
  subscribeNotes,
} from '@/lib/quickNotesStore'
import type { Note } from '@/data/notesData'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

export default function QuickNoteWidget() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [notes, setNotes] = useState<Note[]>(getLatestQuickNotes(3))
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => {
    return subscribeNotes(() => {
      setNotes(getLatestQuickNotes(3))
    })
  }, [])

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handleAdd = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    addQuickNote(trimmed)
    setText('')
  }, [text])

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.notes.title', lang)}</h2>
        <button onClick={() => navigate('/app/notes')} className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline">
          {t('dash.viewNotes', lang)} <ArrowRight size={11} />
        </button>
      </div>
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder={t('dash.notes.placeholder', lang)}
            className="flex-1 h-9 px-3 text-sm bg-[#F8F7F4] border border-[#EBEBEB] rounded-lg text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            className="w-9 h-9 bg-[#EDE9FB] rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[#6F5AE8] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} className="text-[#6F5AE8] group-hover:text-white" />
          </button>
        </div>
      </div>
      <div className="flex-1 px-5 overflow-y-auto scrollbar-thin pb-3">
        <p className="text-xs text-[#94A3B8] font-medium mb-2">{t('dash.notes.recentLabel', lang)}</p>
        {notes.length > 0 ? (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm text-[#64748B] leading-relaxed flex gap-2">
                <span className="text-[#C4B5FD] flex-shrink-0 mt-0.5">•</span>
                <span className="line-clamp-2">{n.preview}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#94A3B8] leading-relaxed italic">
            {t('dash.notes.emptyHint', lang)}
          </p>
        )}
      </div>
    </Card>
  )
}
