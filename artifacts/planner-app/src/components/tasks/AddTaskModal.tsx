import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Check, Loader2 } from 'lucide-react'
import type { Task, Priority, TaskCategory } from '@/types'
import { TASK_CATEGORIES, getTaskCategories } from '@/lib/taskCategories'
import { getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import LinkedItemsPanel from '@/components/links/LinkedItemsPanel'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (task: Task) => void
  /** When provided the modal opens in edit mode pre-filled with this task's data */
  initialTask?: Task
  /** Optional lang override — defaults to getLocalLanguage() */
  lang?: AppLang
}

export default function AddTaskModal({ open, onClose, onSave, initialTask, lang: langProp }: Props) {
  const lang = langProp ?? getLocalLanguage()
  const isEdit = Boolean(initialTask)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<TaskCategory>('Töö')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(initialTask?.title ?? '')
      setDescription(initialTask?.description ?? '')
      setDate(initialTask?.date ?? '')
      setTime(initialTask?.time ?? '')
      setPriority(initialTask?.priority ?? 'medium')
      setCategory(initialTask?.category ?? 'Töö')
      setCategoryOpen(false)
      setError('')
    }
  }, [open, initialTask])

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

  const categories = getTaskCategories(lang)
  const currentCat = categories.find(c => c.value === category) ?? categories[0]

  const PRIORITIES: { value: Priority; label: string }[] = [
    { value: 'low',    label: t('tasks.priority.low',    lang) },
    { value: 'medium', label: t('tasks.priority.medium', lang) },
    { value: 'high',   label: t('tasks.priority.high',   lang) },
  ]

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t('taskModal.error', lang))
      return
    }
    setSaving(true)
    try {
      await (onSave as (task: Parameters<typeof onSave>[0]) => void | Promise<void>)({
        id: initialTask?.id ?? crypto.randomUUID(),
        completed: initialTask?.completed ?? false,
        title: title.trim(),
        description: description.trim() || undefined,
        date: date || undefined,
        time: time || undefined,
        priority,
        category,
      })
    } catch { /* parent handles errors */ } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="kv-modal-enter w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECF2] flex-shrink-0">
          <h2 id="task-modal-title" className="text-base font-semibold text-[#1A1F36]">
            {isEdit ? t('taskModal.editTitle', lang) : t('taskModal.addTitle', lang)}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          <div>
            <label htmlFor="task-modal-input" className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('taskModal.titleLabel', lang)} <span className="text-red-500">*</span>
            </label>
            <input
              id="task-modal-input"
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSave() }}
              placeholder={t('taskModal.titlePlaceholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('taskModal.descLabel', lang)}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('taskModal.descPlaceholder', lang)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('taskModal.dateLabel', lang)}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('taskModal.timeLabel', lang)}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('taskModal.priorityLabel', lang)}
            </label>
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('taskModal.categoryLabel', lang)}
            </label>
            <div className="relative" ref={categoryRef}>
              <button
                type="button"
                onClick={() => setCategoryOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] bg-white focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: currentCat.color }} />
                  {currentCat.label}
                </span>
                <ChevronDown size={16} className={`text-[#94A3B8] transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
              </button>
              {categoryOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                  {categories.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => { setCategory(c.value); setCategoryOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                        category === c.value ? 'bg-[#EDE9FB] text-[#6F5AE8]' : 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
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

        {initialTask && (
          <LinkedItemsPanel
            type="task"
            entityId={initialTask.id}
            lang={lang}
            className="px-5 pb-2"
          />
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors disabled:opacity-50"
          >
            {t('taskModal.cancel', lang)}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('taskModal.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
