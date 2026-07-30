import { useState, useEffect } from 'react'
import { X, ArrowRight, CheckCircle2, Circle, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTasks, toggleTask, updateTask } from '@/lib/tasksStore'
import AddTaskModal from '@/components/tasks/AddTaskModal'
import { getTaskCategories } from '@/lib/taskCategories'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { Task, Priority } from '@/types'

interface Props {
  taskId: string | null
  onClose: () => void
}

const PRIORITY_COLORS: Record<Priority, { dot: string; text: string; bg: string; border: string }> = {
  high:   { dot: '#EF4444', text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  medium: { dot: '#F59E0B', text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  low:    { dot: '#3B82F6', text: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
}

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const ET_MONTHS = [
  'jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni',
  'juuli', 'august', 'september', 'oktoober', 'november', 'detsember',
]

function formatDate(dateStr: string, lang: AppLang): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (lang === 'en') return `${EN_MONTHS[m - 1]} ${d}, ${y}`
  return `${d}. ${ET_MONTHS[m - 1]} ${y}`
}

export default function TaskDetailModal({ taskId, onClose }: Props) {
  const navigate = useNavigate()
  const allTasks = useTasks()
  const task: Task | undefined = allTasks.find((t) => t.id === taskId)

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [editOpen, setEditOpen] = useState(false)

  if (!taskId) return null
  if (!task) return null

  const pc = PRIORITY_COLORS[task.priority]
  const priorityLabel = t(`tasks.priority.${task.priority}` as Parameters<typeof t>[0], lang)

  const categories = getTaskCategories(lang)
  const cat = task.category ? categories.find((c) => c.value === task.category) : undefined

  const handleToggle = () => { toggleTask(task.id) }

  const handleEditSave = (updated: Task) => {
    updateTask(updated)
    setEditOpen(false)
    onClose()
  }

  const handleGoToTasks = () => {
    onClose()
    navigate('/app/tasks')
  }

  if (editOpen) {
    return (
      <AddTaskModal
        open={true}
        onClose={() => setEditOpen(false)}
        onSave={handleEditSave}
        initialTask={task}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#ECECF2]">
          <div className="flex-1 min-w-0 pr-3">
            <p className={`text-base font-semibold leading-snug ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
              {task.title}
            </p>
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ color: pc.text, background: pc.bg, border: `1px solid ${pc.border}` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: pc.dot }} />
                {priorityLabel}
              </span>
              {cat && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: `${cat.color}18`, color: cat.color }}
                >
                  {cat.label}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                task.completed
                  ? 'bg-green-50 text-green-600'
                  : 'bg-[#F8F7F4] text-[#64748B]'
              }`}>
                {task.completed ? t('tasks.status.done', lang) : t('tasks.status.active', lang)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Details */}
        <div className="px-5 py-4 flex flex-col gap-2.5">
          {(task.date || task.time) && (
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <span className="text-[#94A3B8] text-base">📅</span>
              <span>
                {task.date ? formatDate(task.date, lang) : ''}
                {task.date && task.time ? ', ' : ''}
                {task.time ?? ''}
              </span>
            </div>
          )}
          {task.description && (
            <div className="flex items-start gap-2 text-sm text-[#64748B] leading-relaxed">
              <span className="text-[#94A3B8] text-base mt-0.5">📝</span>
              <p>{task.description}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#ECECF2]">
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              task.completed
                ? 'text-[#64748B] hover:bg-[#F8F7F4]'
                : 'text-green-600 hover:bg-green-50'
            }`}
          >
            {task.completed ? <Circle size={14} /> : <CheckCircle2 size={14} />}
            {task.completed ? t('tasks.detail.markActive', lang) : t('tasks.detail.markDone', lang)}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToTasks}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors"
              title={t('tasks.title', lang)}
            >
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors"
            >
              <Pencil size={13} />
              {t('tasks.action.edit', lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
