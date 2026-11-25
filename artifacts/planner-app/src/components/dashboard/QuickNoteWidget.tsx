import { useState, useEffect, useCallback } from 'react'
import { Send, ArrowRight, Lightbulb, StickyNote } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from '@/components/dashboard/DashboardCard'
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
    <DashboardCard className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">
          <StickyNote size={17} className="text-[#F97316] dark:text-orange-300" />
          {t('dash.notes.title', lang)}
        </h2>
        <button onClick={() => navigate('/app/notes')} className="text-[11px] text-[#6F5AE8] dark:text-[#A78BFA] font-medium flex items-center gap-0.5 hover:underline">
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
            className="flex-1 h-9 px-3 text-sm bg-[#F8F7F4] dark:bg-white/5 border border-[#EBEBEB] dark:border-white/10 rounded-lg text-[#1A1F36] dark:text-[#F1EFFB] placeholder:text-[#C4C9D4] dark:placeholder:text-[#6B6485] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            className="w-9 h-9 bg-[#6F5AE8] dark:bg-[#7C5FE0] rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#5B48D8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
      <div className="flex-1 px-5 overflow-y-auto scrollbar-thin pb-3">
        <p className="text-xs text-[#94A3B8] dark:text-[#9C96C2] font-medium mb-2">{t('dash.notes.recentLabel', lang)}</p>
        {notes.length > 0 ? (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm text-[#64748B] dark:text-[#B4AFD1] leading-relaxed flex gap-2">
                <span className="text-[#C4B5FD] dark:text-[#A78BFA] flex-shrink-0 mt-0.5">•</span>
                <span className="line-clamp-2">{n.preview}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <div className="w-10 h-10 rounded-full bg-[#FFEDD5] dark:bg-orange-400/15 flex items-center justify-center">
              <Lightbulb size={18} className="text-[#F97316] dark:text-orange-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1F36] dark:text-[#F1EFFB]">{t('dash.notes.emptyTitle', lang)}</p>
              <p className="text-xs text-[#94A3B8] dark:text-[#9C96C2] mt-0.5">{t('dash.notes.emptyHint', lang)}</p>
            </div>
          </div>
        )}
      </div>
    </DashboardCard>
  )
}
