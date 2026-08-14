import { useState, useEffect } from 'react'
import {
  X,
  Calendar,
  Clock,
  CheckCircle,
  Pencil,
  Trash2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'

export interface ExamItem {
  id: number
  subject: string
  title: string
  type: 'kontrolltöö' | 'eksam'
  date: string
  daysLeft: number
  status: 'ootel' | 'tehtud'
  iconBg: string
  iconColor: string
  notes?: string
  moodleUrl?: string
  time?: string
  location?: string
}

type Props = {
  open: boolean
  exams: ExamItem[]
  onClose: () => void
  onUpdate: (id: number, patch: Partial<ExamItem>) => void
  onDelete: (id: number) => void
}

function daysLeftLabel(days: number, status: string) {
  if (status === 'tehtud') return 'Tehtud'
  if (days <= 0) return 'Täna'
  if (days === 1) return '1 päev'
  return `${days} päeva`
}

function daysLeftColor(days: number, status: string) {
  if (status === 'tehtud') return { bg: '#DCFCE7', color: '#15803D' }
  if (days <= 0) return { bg: '#FEE2E2', color: '#B91C1C' }
  if (days <= 10) return { bg: '#FEF9C3', color: '#854D0E' }
  if (days <= 20) return { bg: '#DCFCE7', color: '#15803D' }
  return { bg: '#EDE9FB', color: '#6F5AE8' }
}

export default function AllExamsModal({ open, exams, onClose, onUpdate, onDelete }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'kontrolltöö' | 'eksam'>('kontrolltöö')
  const [editDate, setEditDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const startEdit = (exam: ExamItem) => {
    setEditingId(exam.id)
    setEditSubject(exam.subject)
    setEditTitle(exam.title)
    setEditType(exam.type)
    setEditDate(exam.date)
    setExpandedId(exam.id)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = (id: number) => {
    if (!editTitle.trim() || !editSubject.trim()) return
    onUpdate(id, {
      subject: editSubject.trim(),
      title: editTitle.trim(),
      type: editType,
      date: editDate,
    })
    setEditingId(null)
  }

  const toggleStatus = (exam: ExamItem) => {
    onUpdate(exam.id, { status: exam.status === 'tehtud' ? 'ootel' : 'tehtud' })
  }

  const sorted = [...exams].sort((a, b) => {
    if (a.status === 'tehtud' && b.status !== 'tehtud') return 1
    if (a.status !== 'tehtud' && b.status === 'tehtud') return -1
    return a.daysLeft - b.daysLeft
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EDE9FB] flex items-center justify-center">
              <Calendar size={16} strokeWidth={1.8} className="text-[#6F5AE8]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#1A1F36]">Kõik kontrolltööd ja eksamid</h2>
              <p className="text-xs text-[#94A3B8]">{exams.length} kirjet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
                <Calendar size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
              </div>
              <p className="text-sm font-semibold text-[#1A1F36]">Kirjed puuduvad</p>
              <p className="text-xs text-[#94A3B8] mt-1">Lähenevaid kontrolltöid ega eksameid pole.</p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {sorted.map((exam) => {
              const isExpanded = expandedId === exam.id
              const isEditing = editingId === exam.id
              const dl = daysLeftColor(exam.daysLeft, exam.status)
              const isConfirmingDelete = confirmDeleteId === exam.id

              return (
                <div
                  key={exam.id}
                  className={`rounded-xl border transition-colors ${
                    isExpanded ? 'border-[#6F5AE8]/30 bg-[#FAF9FD]' : 'border-[#ECECF2] bg-white'
                  }`}
                >
                  {/* Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : exam.id)}
                    className="w-full flex items-center gap-3 p-3.5 text-left"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: exam.iconBg, color: exam.iconColor }}
                    >
                      {exam.type === 'eksam' ? <AlertCircle size={16} strokeWidth={1.8} /> : <Calendar size={16} strokeWidth={1.8} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1A1F36] truncate">{exam.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium text-[#6F5AE8]">{exam.subject}</span>
                        <span className="text-xs text-[#94A3B8]">·</span>
                        <span className="text-xs text-[#94A3B8]">
                          {exam.type === 'eksam' ? 'Eksam' : 'Kontrolltöö'}
                        </span>
                      </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end flex-shrink-0">
                      <span className="text-xs font-medium text-[#1A1F36]">{exam.date}</span>
                      <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
                        <Clock size={10} strokeWidth={2} />
                        {daysLeftLabel(exam.daysLeft, exam.status)}
                      </span>
                    </div>

                    <span
                      className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: dl.bg, color: dl.color }}
                    >
                      {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} p`}
                    </span>

                    <ChevronRight
                      size={16}
                      strokeWidth={2}
                      className={`text-[#94A3B8] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && !isEditing && !isConfirmingDelete && (
                    <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-[#94A3B8] font-medium mb-0.5">Aine</p>
                          <p className="text-[#1A1F36] font-medium">{exam.subject}</p>
                        </div>
                        <div>
                          <p className="text-[#94A3B8] font-medium mb-0.5">Tüüp</p>
                          <p className="text-[#1A1F36] font-medium">
                            {exam.type === 'eksam' ? 'Eksam' : 'Kontrolltöö'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#94A3B8] font-medium mb-0.5">Kuupäev</p>
                          <p className="text-[#1A1F36] font-medium">{exam.date}</p>
                        </div>
                        <div>
                          <p className="text-[#94A3B8] font-medium mb-0.5">Tähtajani</p>
                          <p className="text-[#1A1F36] font-medium">{daysLeftLabel(exam.daysLeft, exam.status)}</p>
                        </div>
                        <div>
                          <p className="text-[#94A3B8] font-medium mb-0.5">Staatus</p>
                          <p className="font-medium" style={{ color: exam.status === 'tehtud' ? '#15803D' : '#854D0E' }}>
                            {exam.status === 'tehtud' ? 'Tehtud' : 'Ootel'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-[#F3F3F8]">
                        <button
                          onClick={() => toggleStatus(exam)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#1A1F36] bg-[#F8F7FC] border border-[#ECECF2] hover:border-[#6F5AE8]/30 transition-colors"
                        >
                          <CheckCircle size={13} strokeWidth={2} className={exam.status === 'tehtud' ? 'text-[#16A34A]' : 'text-[#94A3B8]'} />
                          {exam.status === 'tehtud' ? 'Märgi ootele' : 'Märgi tehtuks'}
                        </button>
                        <button
                          onClick={() => startEdit(exam)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#1A1F36] bg-[#F8F7FC] border border-[#ECECF2] hover:border-[#6F5AE8]/30 transition-colors"
                        >
                          <Pencil size={13} strokeWidth={2} className="text-[#6F5AE8]" />
                          Muuda
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(exam.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#DC2626] bg-[#FEF2F2] border border-[#FEE2E2] hover:bg-[#FEE2E2] transition-colors"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                          Kustuta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit form */}
                  {isExpanded && isEditing && (
                    <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Aine</label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Pealkiri</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Tüüp</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditType('kontrolltöö')}
                              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                editType === 'kontrolltöö'
                                  ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]'
                                  : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4]'
                              }`}
                            >
                              Kontrolltöö
                            </button>
                            <button
                              onClick={() => setEditType('eksam')}
                              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                editType === 'eksam'
                                  ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]'
                                  : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4]'
                              }`}
                            >
                              Eksam
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Kuupäev</label>
                          <input
                            type="text"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            placeholder="nt. 4. august 2026"
                            className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                        >
                          Tühista
                        </button>
                        <button
                          onClick={() => saveEdit(exam.id)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                        >
                          Salvesta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete confirmation */}
                  {isExpanded && isConfirmingDelete && (
                    <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-3">
                      <p className="text-sm text-[#1A1F36]">
                        Kas oled kindel, et soovid kustutada kirje <strong>„{exam.title}”</strong>?
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                        >
                          Tühista
                        </button>
                        <button
                          onClick={() => { onDelete(exam.id); setConfirmDeleteId(null); setExpandedId(null) }}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                        >
                          Kustuta
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
