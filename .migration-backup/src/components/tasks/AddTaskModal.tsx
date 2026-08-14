import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Check } from 'lucide-react'
import type { Task, Priority, TaskCategory } from '@/types'
import { TASK_CATEGORIES, CATEGORY_MAP } from '@/lib/taskCategories'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (task: Task) => void
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Madal' },
  { value: 'medium', label: 'Keskmine' },
  { value: 'high', label: 'Kõrge' },
]

export default function AddTaskModal({ open, onClose, onSave }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<TaskCategory>('Töö')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [error, setError] = useState('')
  const categoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setDate('')
      setTime('')
      setPriority('medium')
      setCategory('Töö')
      setCategoryOpen(false)
      setError('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!categoryOpen) return
    const onClick = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [categoryOpen])

  if (!open) return null

  const handleSave = () => {
    if (!title.trim()) {
      setError('Sisesta ülesande pealkiri.')
      return
    }
    onSave({
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      date: date || undefined,
      time: time || undefined,
      priority,
      category,
      completed: false,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECF2]">
          <h2 className="text-base font-semibold text-[#1A1F36]">Lisa ülesanne</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Pealkiri <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="Ülesande pealkiri"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kirjeldus</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valikuline kirjeldus"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kuupäev</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kellaaeg</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Prioriteet</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    priority === p.value
                      ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]'
                      : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kategooria</label>
            <div className="relative" ref={categoryRef}>
              <button
                type="button"
                onClick={() => setCategoryOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{CATEGORY_MAP[category].emoji}</span>
                  {CATEGORY_MAP[category].label}
                </span>
                <ChevronDown size={16} className={`text-[#94A3B8] transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
              </button>
              {categoryOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                  {TASK_CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => { setCategory(c.value); setCategoryOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                        category === c.value
                          ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                          : 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{c.emoji}</span>
                        {c.label}
                      </span>
                      {category === c.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            Tühista
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            Salvesta
          </button>
        </div>
      </div>
    </div>
  )
}
