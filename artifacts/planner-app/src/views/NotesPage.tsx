import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Search,
  Plus,
  FileText,
  GraduationCap,
  ShoppingCart,
  Lightbulb,
  Heart,
  Briefcase,
  Star,
  MoreHorizontal,
  Sparkles,
  FolderPlus,
  X,
  Trash2,
  Pencil,
  FolderInput,
  Eye,
} from 'lucide-react'
import { FOLDER_CONFIG, FOLDER_LIST } from '@/data/notesData'
import type { Note, NoteFolder } from '@/data/notesData'
import {
  getAllNotes,
  addNote,
  updateNote,
  moveNote,
  toggleStar,
  deleteNote,
  subscribeNotes,
} from '@/lib/quickNotesStore'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { TranslationKey } from '@/lib/translations'
import LinkedItemsPanel from '@/components/links/LinkedItemsPanel'
import { removeLinksForEntity } from '@/lib/entityLinksStore'
import PostSaveLinkSuggestionsDialog from '@/components/links/PostSaveLinkSuggestionsDialog'
import AutoLinkToast from '@/components/links/AutoLinkToast'
import { runAutomaticLinking, type AutoLinkResult } from '@/lib/automaticLinking'

const ICON_MAP = {
  document:    FileText,
  graduation:  GraduationCap,
  cart:        ShoppingCart,
  bulb:        Lightbulb,
  heart:       Heart,
  briefcase:   Briefcase,
} as const

const FOLDER_OPTIONS: NoteFolder[] = ['Isiklik', 'Kool', 'Töö', 'Kodu', 'Ideed']

const FOLDER_KEY: Record<NoteFolder, TranslationKey> = {
  Isiklik: 'notes.folder.personal',
  Kool:    'notes.folder.school',
  Töö:     'notes.folder.work',
  Kodu:    'notes.folder.home',
  Ideed:   'notes.folder.ideas',
  Päevik:  'notes.folder.diary',
}

function getFolderLabel(folder: NoteFolder, lang: AppLang): string {
  return t(FOLDER_KEY[folder], lang)
}

interface NoteFormState {
  title: string
  content: string
  folder: NoteFolder
  starred: boolean
}

const EMPTY_FORM: NoteFormState = {
  title: '',
  content: '',
  folder: 'Isiklik',
  starred: false,
}

export default function NotesPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Note[]>(getAllNotes())

  useEffect(() => {
    return subscribeNotes(() => {
      setNotes(getAllNotes())
    })
  }, [])

  const [activeFolder, setActiveFolder] = useState<string>('Kõik')

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [postSave, setPostSave] = useState<{ type: 'note'; id: string } | null>(null)
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null)
  const [form, setForm] = useState<NoteFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  // Detail view
  const [detailNote, setDetailNote] = useState<Note | null>(null)

  // Action menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const location = useLocation()

  // Reset to default view whenever the user navigates to Notes
  useEffect(() => {
    setSearch('')
    setActiveFolder('Kõik')
    setDetailNote(null)
    setModalOpen(false)
    setMenuOpenId(null)
    setMoveMenuId(null)
    setDeleteId(null)
  }, [location.key])

  // Deep-link: open specific note navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId
    if (!openId) return
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')
    const note = notes.find(n => n.id === openId)
    if (note) setDetailNote(note)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close menus on outside click / Escape
  useEffect(() => {
    if (!menuOpenId && !moveMenuId) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      const openId = moveMenuId || menuOpenId
      if (openId && menuRefs.current[openId] && !menuRefs.current[openId]!.contains(target)) {
        setMenuOpenId(null)
        setMoveMenuId(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenId(null)
        setMoveMenuId(null)
        setDetailNote(null)
        setDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpenId, moveMenuId])

  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.preview.toLowerCase().includes(search.toLowerCase())
    const matchesFolder = activeFolder === 'Kõik' || n.folder === activeFolder
    return matchesSearch && matchesFolder
  })

  // Dynamic counts derived from current notes
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of notes) {
      counts[n.folder] = (counts[n.folder] || 0) + 1
    }
    return counts
  }, [notes])

  const donutSegments = useMemo(() => {
    return FOLDER_LIST.map((f) => ({
      label: f.name,
      count: folderCounts[f.name] || 0,
      color: f.iconColor,
    }))
  }, [folderCounts])

  const totalNotes = notes.length

  const openCreateModal = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEditModal = (note: Note) => {
    setEditingId(note.id)
    setForm({
      title: note.title,
      content: note.preview,
      folder: note.folder,
      starred: note.starred,
    })
    setFormError('')
    setMenuOpenId(null)
    setMoveMenuId(null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError(t('notes.error.title', lang))
      return
    }
    if (!form.content.trim()) {
      setFormError(t('notes.error.content', lang))
      return
    }
    if (editingId) {
      updateNote(editingId, {
        title: form.title,
        preview: form.content,
        folder: form.folder,
        starred: form.starred,
      })
    } else {
      const note = await addNote(form.title, form.content, form.folder, form.starred)
      setPostSave({ type: 'note', id: note.id })
      runAutomaticLinking('note', note.id, lang, {
        title: form.title,
        description: form.content,
        category: form.folder,
      }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) })
    }
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingId(null)
  }

  const handleCancelForm = () => {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingId(null)
  }

  const handleToggleStar = (id: string) => {
    toggleStar(id)
  }

  const handleMove = (id: string, folder: NoteFolder) => {
    moveNote(id, folder)
    setMoveMenuId(null)
    setMenuOpenId(null)
  }

  const handleDelete = (id: string) => {
    removeLinksForEntity('note', id)
    deleteNote(id)
    setDeleteId(null)
    setMenuOpenId(null)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36]">{t('notes.title', lang)}</h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              {t('notes.subtitle', lang)
                .replace('{n}', String(notes.length))
                .replace('{f}', String(FOLDER_LIST.length))}
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            onClick={openCreateModal}
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('notes.add', lang)}
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('notes.searchPlaceholder', lang)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#ECECF2] rounded-xl text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
          />
        </div>

        {/* Folder chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveFolder('Kõik')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeFolder === 'Kõik'
                ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                : 'notes-category-btn bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
            }`}
          >
            {t('notes.all', lang)} ({notes.length})
          </button>
          {FOLDER_LIST.map((f) => (
            <button
              key={f.name}
              onClick={() => setActiveFolder(f.name)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeFolder === f.name
                  ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                  : 'notes-category-btn bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: f.iconColor }} />
              {getFolderLabel(f.name, lang)} ({folderCounts[f.name] || 0})
            </button>
          ))}
        </div>

        {/* Notes grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            // Guard against Firestore documents that have an unrecognised icon or
            // folder value (e.g. notes created under an old schema). Fall back to
            // the default 'Isiklik' / FileText style instead of crashing.
            const Icon = ICON_MAP[note.icon] ?? FileText
            const folder = FOLDER_CONFIG[note.folder] ?? FOLDER_CONFIG['Isiklik']
            return (
              <div
                key={note.id}
                className="group bg-white rounded-2xl border border-[#ECECF2] p-4 hover:border-[#6F5AE8]/30 hover:shadow-md transition-all cursor-pointer flex flex-col"
              >
                {/* Top row: icon + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: note.iconBg }}
                  >
                    <Icon size={18} strokeWidth={2} style={{ color: note.iconColor }} />
                  </div>
                  <div className="flex items-center gap-1 relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleStar(note.id)
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F8F7F4]"
                      title={note.starred ? t('notes.star.remove', lang) : t('notes.star.mark', lang)}
                    >
                      <Star
                        size={14}
                        className={
                          note.starred
                            ? 'text-[#F59E0B] fill-[#F59E0B]'
                            : 'text-[#CBD5E1] hover:text-[#F59E0B]'
                        }
                      />
                    </button>
                    <div ref={(el) => { menuRefs.current[note.id] = el }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(menuOpenId === note.id ? null : note.id)
                          setMoveMenuId(null)
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal size={15} />
                      </button>

                      {/* Action menu */}
                      {menuOpenId === note.id && moveMenuId !== note.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-[#ECECF2] shadow-lg z-20 py-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailNote(note)
                              setMenuOpenId(null)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                          >
                            <Eye size={14} /> {t('notes.menu.open', lang)}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditModal(note)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                          >
                            <Pencil size={14} /> {t('notes.menu.edit', lang)}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setMoveMenuId(note.id)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                          >
                            <FolderInput size={14} /> {t('notes.menu.move', lang)}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteId(note.id)
                              setMenuOpenId(null)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 size={14} /> {t('notes.menu.delete', lang)}
                          </button>
                        </div>
                      )}

                      {/* Move submenu */}
                      {moveMenuId === note.id && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg z-30 py-1">
                          <div className="px-3 py-1.5 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                            {t('notes.menu.moveTo', lang)}
                          </div>
                          {FOLDER_OPTIONS.map((f) => (
                            <button
                              key={f}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMove(note.id, f)
                              }}
                              disabled={f === note.folder}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                f === note.folder
                                  ? 'text-[#CBD5E1] cursor-default'
                                  : 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ background: FOLDER_CONFIG[f].color }} />
                              {getFolderLabel(f, lang)}
                              {f === note.folder && (
                                <span className="ml-auto text-[10px]">{t('notes.menu.current', lang)}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-[#1A1F36] mb-1.5 line-clamp-1">
                  {note.title}
                </h3>

                {/* Preview */}
                <p className="text-xs text-[#64748B] leading-relaxed line-clamp-2 whitespace-pre-line flex-1">
                  {note.preview}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F4F4F0]">
                  <span
                    className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: folder.bg, color: folder.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: folder.color }} />
                    {getFolderLabel(note.folder, lang)}
                  </span>
                  <span className="text-xs text-[#94A3B8]">{note.timestamp}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Empty state */}
        {filteredNotes.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#ECECF2] flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center mb-3">
              <Search size={20} className="text-[#94A3B8]" />
            </div>
            <p className="text-sm font-medium text-[#1A1F36]">{t('notes.empty.title', lang)}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{t('notes.empty.body', lang)}</p>
          </div>
        )}
      </div>

      {/* Right info panel */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Distribution card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('notes.overview.title', lang)}</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                {(() => {
                  let offset = 0
                  return donutSegments.map((seg) => {
                    const fraction = totalNotes > 0 ? seg.count / totalNotes : 0
                    const dash = fraction * 97.4
                    const circle = (
                      <circle
                        key={seg.label}
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke={seg.color} strokeWidth="3.5"
                        strokeDasharray={`${dash} ${97.4 - dash}`}
                        strokeDashoffset={-offset}
                      />
                    )
                    offset += dash
                    return circle
                  })
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-[#1A1F36]">{totalNotes}</span>
                <span className="text-[10px] text-[#94A3B8] -mt-0.5">{t('notes.label', lang)}</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {donutSegments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                    <span className="text-[#64748B]">{getFolderLabel(seg.label as NoteFolder, lang)}</span>
                  </div>
                  <span className="font-semibold text-[#1A1F36]">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Folders card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1A1F36]">{t('notes.folders.title', lang)}</h3>
            <button
              onClick={() => {}}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#6F5AE8] transition-colors"
            >
              <FolderPlus size={15} />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {FOLDER_LIST.map((f) => (
              <button
                key={f.name}
                onClick={() => setActiveFolder(f.name)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  activeFolder === f.name
                    ? 'bg-[#F8F7F4] text-[#1A1F36]'
                    : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: f.iconColor }}
                  />
                  {getFolderLabel(f.name, lang)}
                </div>
                <span className="text-xs font-medium text-[#94A3B8]">{folderCounts[f.name] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI learning state — shown until genuine AI-generated recommendations exist */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.8} className="text-[#6F5AE8] flex-shrink-0" />
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {lang === 'et' ? 'AI õpib sinu tööharjumusi' : 'AI is learning your workflow'}
            </h3>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {lang === 'et'
              ? 'Kivora AI õpib tundma sinu ülesandeid, harjumusi, eesmärke, kalendrit ja rahakasutust. Kui oled rakendust mõnda aega kasutanud, hakkavad siia ilmuma isikupärastatud soovitused.'
              : 'Kivora AI is learning your tasks, habits, goals, calendar and finances. Personalized recommendations will appear automatically after enough real activity has been collected.'}
          </p>
        </div>
      </aside>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={handleCancelForm}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] flex-shrink-0">
              <h2 className="text-base font-semibold text-[#1A1F36]">
                {editingId ? t('notes.modal.editTitle', lang) : t('notes.modal.addTitle', lang)}
              </h2>
              <button
                onClick={handleCancelForm}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('notes.modal.titleLabel', lang)} <span className="text-[#E11D48]">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value })
                    setFormError('')
                  }}
                  placeholder={t('notes.modal.titlePlaceholder', lang)}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('notes.modal.contentLabel', lang)} <span className="text-[#E11D48]">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => {
                    setForm({ ...form, content: e.target.value })
                    setFormError('')
                  }}
                  placeholder={t('notes.modal.contentPlaceholder', lang)}
                  rows={5}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('notes.modal.folderLabel', lang)}
                </label>
                <div className="flex flex-wrap gap-2">
                  {FOLDER_OPTIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setForm({ ...form, folder: f })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.folder === f
                          ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]/30'
                          : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: FOLDER_CONFIG[f].color }} />
                      {getFolderLabel(f, lang)}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setForm({ ...form, starred: !form.starred })}
                className="flex items-center gap-2 self-start text-sm text-[#1A1F36] hover:text-[#6F5AE8] transition-colors"
              >
                <Star
                  size={16}
                  className={
                    form.starred
                      ? 'text-[#F59E0B] fill-[#F59E0B]'
                      : 'text-[#CBD5E1]'
                  }
                />
                {form.starred ? t('notes.modal.markedImportant', lang) : t('notes.modal.markImportant', lang)}
              </button>

              {formError && (
                <p className="text-sm text-[#E11D48]">{formError}</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] flex-shrink-0">
              <button
                onClick={handleCancelForm}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                {t('notes.modal.cancel', lang)}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm"
              >
                {t('notes.modal.save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail view modal */}
      {detailNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setDetailNote(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] flex-shrink-0">
              <h2 className="text-base font-semibold text-[#1A1F36]">{t('notes.modal.viewTitle', lang)}</h2>
              <button
                onClick={() => setDetailNote(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 flex flex-col gap-4 flex-1 overflow-y-auto">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: detailNote.iconBg }}
                >
                  {(() => {
                    const Icon = ICON_MAP[detailNote.icon]
                    return <Icon size={18} style={{ color: detailNote.iconColor }} />
                  })()}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-[#1A1F36]">{detailNote.title}</h3>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full mt-1"
                    style={{ background: (FOLDER_CONFIG[detailNote.folder] ?? FOLDER_CONFIG['Isiklik']).bg, color: (FOLDER_CONFIG[detailNote.folder] ?? FOLDER_CONFIG['Isiklik']).color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: (FOLDER_CONFIG[detailNote.folder] ?? FOLDER_CONFIG['Isiklik']).color }} />
                    {getFolderLabel(detailNote.folder, lang)}
                  </span>
                </div>
                {detailNote.starred && (
                  <Star size={16} className="text-[#F59E0B] fill-[#F59E0B]" />
                )}
              </div>
              <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-line">
                {detailNote.preview}
              </p>
              <span className="text-xs text-[#94A3B8]">{detailNote.timestamp}</span>
              <LinkedItemsPanel type="note" entityId={detailNote.id} lang={lang} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] flex-shrink-0">
              <button
                onClick={() => {
                  openEditModal(detailNote)
                  setDetailNote(null)
                }}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#6F5AE8] bg-[#EDE9FB] hover:bg-[#E0D9F9] transition-colors"
              >
                {t('notes.modal.edit', lang)}
              </button>
              <button
                onClick={() => setDetailNote(null)}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm"
              >
                {t('notes.modal.close', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setDeleteId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-3">
                <Trash2 size={20} className="text-[#E11D48]" />
              </div>
              <h3 className="text-base font-semibold text-[#1A1F36] mb-1">{t('notes.deleteConfirm.title', lang)}?</h3>
              <p className="text-sm text-[#64748B]">{t('notes.deleteConfirm.body', lang)}</p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-[#F4F4F0] flex-shrink-0">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                {t('notes.deleteConfirm.cancel', lang)}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm"
              >
                {t('notes.deleteConfirm.confirm', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    {postSave && (
      <PostSaveLinkSuggestionsDialog
        type={postSave.type}
        entityId={postSave.id}
        lang={lang}
        onClose={() => setPostSave(null)}
      />
    )}
    {autoLink && (
      <AutoLinkToast
        linkIds={autoLink.linkIds}
        calendarEventId={autoLink.calendarEventId}
        lang={lang}
        onClose={() => setAutoLink(null)}
      />
    )}
    </div>
  )
}
