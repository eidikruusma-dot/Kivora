import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, Pencil, Loader2, Plus, CheckSquare, Calendar, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTasks, useTasksLoading, addTask, updateTask as storeUpdateTask, toggleTask as storeToggleTask, deleteTask as storeDeleteTask } from '@/lib/tasksStore'
import type { Task, Priority, TaskCategory } from '@/types'
import { getTaskCategories } from '@/lib/taskCategories'
import AddTaskModal from '@/components/tasks/AddTaskModal'
import PostSaveLinkSuggestionsDialog from '@/components/links/PostSaveLinkSuggestionsDialog'
import AutoLinkToast from '@/components/links/AutoLinkToast'
import { runAutomaticLinking, syncTaskCalendarEvent, type AutoLinkResult } from '@/lib/automaticLinking'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { useIsDark } from '@/lib/themeColors'
import { t } from '@/lib/translations'

// Compact "26 Aug" / "26. aug" style date for the task row — parsed via
// local midnight (never UTC) to match the calendar day the string
// represents, same convention as dateUtils.ts's other formatters.
export function formatTaskDate(dateStr: string, lang: AppLang): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(lang === 'et' ? 'et-EE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export default function TasksPage() {
  const tasks = useTasks()
  const tasksLoading = useTasksLoading()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [postSave, setPostSave] = useState<{ type: 'task'; id: string } | null>(null)
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const location = useLocation()

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  useEffect(() => {
    setFilter('all')
    setModalOpen(false)
    setEditingTask(undefined)
    setDeleteId(null)
  }, [location.key])

  // Deep-link: open specific task navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId
    if (!openId) return
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')
    const task = tasks.find(t => t.id === openId)
    if (task) setEditingTask(task)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (task && !task.completed) {
      setFlashId(id)
      setTimeout(() => setFlashId(null), 600)
    }
    storeToggleTask(id)
  }
  const deleteTask = async (id: string) => {
    try {
      // storeDeleteTask cascades to the task's auto-created calendar event
      // and its EntityLinks in one atomic batch (tasksStore.ts) — awaited so
      // we only report success once the whole operation has actually landed.
      await storeDeleteTask(id)
      toast.success(lang === 'et' ? 'Ülesanne kustutatud' : 'Task deleted')
    } catch {
      toast.error(lang === 'et' ? 'Ülesande kustutamine ebaõnnestus' : 'Failed to delete task')
    }
  }

  // Confirmation dialog: the trash icon only opens it (setDeleteId); the
  // dialog's own Confirm button is the sole caller of deleteTask, guarded
  // against a second click while the first delete is still in flight.
  const handleConfirmDelete = async () => {
    if (!deleteId || deleting) return
    setDeleting(true)
    try {
      await deleteTask(deleteId)
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const handleAddTask = async (task: Task) => {
    await addTask(task)
    toast.success(lang === 'et' ? 'Ülesanne salvestatud' : 'Task saved')
    setModalOpen(false)
    const result = await runAutomaticLinking('task', task.id, lang, {
      title: task.title,
      date: task.date,
      time: task.time,
      description: task.description,
      category: task.category,
    })
    if (result.linkIds.length > 0) setAutoLink(result)
    setPostSave({ type: 'task', id: task.id })
  }
  const handleEditTask = async (task: Task) => {
    await storeUpdateTask(task)
    // Keep the task's auto-created calendar event (if any) in sync — same
    // event, no duplicate; converts between timed/all-day as the task's own
    // time comes and goes. No-ops for tasks with no such event.
    await syncTaskCalendarEvent(task)
    toast.success(lang === 'et' ? 'Ülesanne uuendatud' : 'Task updated')
    setEditingTask(undefined)
  }
  const openEdit = (task: Task) => setEditingTask(task)
  const closeEdit = () => setEditingTask(undefined)

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return !task.completed
    if (filter === 'completed') return task.completed
    return true
  })

  const activeCount    = tasks.filter((task) => !task.completed).length
  const completedCount = tasks.filter((task) => task.completed).length
  const progress       = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0
  const isDark         = useIsDark()

  const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; text: string; bg: string; border: string }> = isDark ? {
    high:   { label: t('tasks.priority.high',   lang), dot: '#F87171', text: '#FCA5A5', bg: '#200A0A', border: '#3D1010' },
    medium: { label: t('tasks.priority.medium', lang), dot: '#FBBF24', text: '#FDE68A', bg: '#1F1507', border: '#3A2505' },
    low:    { label: t('tasks.priority.low',    lang), dot: '#60A5FA', text: '#93C5FD', bg: '#0A1628', border: '#1E3A5F' },
  } : {
    high:   { label: t('tasks.priority.high',   lang), dot: '#EF4444', text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
    medium: { label: t('tasks.priority.medium', lang), dot: '#F59E0B', text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
    low:    { label: t('tasks.priority.low',    lang), dot: '#3B82F6', text: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  }

  const categories = getTaskCategories(lang)
  const catMap = Object.fromEntries(categories.map(c => [c.value, { label: c.label, color: c.color }])) as Record<TaskCategory, { label: string; color: string }>

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Page header — stacks vertically below sm: so the title never gets
            clipped and the Add-task button never overflows on narrow phones;
            reverts to the original single-row layout at sm: and up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#1A1F36] break-words">{t('tasks.title', lang)}</h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              {t('tasks.subtitle', lang).replace('{active}', String(activeCount)).replace('{done}', String(completedCount))}
            </p>
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm sm:w-auto"
            onClick={() => setModalOpen(true)}
          >
            <span className="text-lg leading-none">+</span>
            {t('tasks.add', lang)}
          </button>
        </div>

        {/* Filter tabs.
            Mobile-only: max-w-full + overflow-x-auto lets the strip
            scroll horizontally within itself instead of pushing the
            whole page wider — same defect and same fix already applied
            to Habits/Goals (commit aeb44fd): at 320-360px this w-fit
            strip was wider than the available content width. sm:
            restores the original fit-content sizing (already fits
            there, unchanged). */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#ECECF2] max-w-full overflow-x-auto sm:w-fit">
          {([
            { key: 'all',       label: t('tasks.filter.all',    lang).replace('{n}', String(tasks.length))    },
            { key: 'active',    label: t('tasks.filter.active', lang).replace('{n}', String(activeCount))     },
            { key: 'completed', label: t('tasks.filter.done',   lang).replace('{n}', String(completedCount))  },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === key ? 'bg-[#EDE9FB] text-[#6F5AE8]' : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden">
          {tasksLoading ? (
            <div className="flex flex-col divide-y divide-[#F0F0F0]">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                  <div className="w-5 h-5 rounded-md bg-[#F1F0EB] flex-shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="h-3.5 rounded-full bg-[#F1F0EB]" style={{ width: `${55 + (i * 11) % 30}%` }} />
                  </div>
                  <div className="w-16 h-5 rounded-md bg-[#F1F0EB] flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="m-4 rounded-2xl bg-[#F8F7FC] flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-[#EDE9FB] flex items-center justify-center">
                <CheckSquare size={28} className="text-[#6F5AE8]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1F36]">{t('tasks.empty.title', lang)}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{t('tasks.empty.body', lang)}</p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#EDE9FB] text-[#6F5AE8] rounded-xl text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                <Plus size={14} />
                {t('tasks.add', lang)}
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredTasks.map((task, idx) => {
                const p   = PRIORITY_CONFIG[task.priority]
                const cat = task.category ? catMap[task.category] : null
                return (
                  // Mobile: two deliberate stacked rows (checkbox+title, then
                  // wrapping metadata+actions). At sm: and up, both wrapper
                  // rows become `display:contents` and dissolve, so their
                  // children flatten back into one flex row in the exact
                  // original order/classes — desktop layout is unchanged.
                  <div
                    key={task.id}
                    className={`flex flex-col gap-2 px-4 py-3.5 hover:bg-[#FAFAF8] transition-colors group sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4 ${
                      idx !== filteredTasks.length - 1 ? 'border-b border-[#F0F0F0]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 sm:contents">
                      <button
                        onClick={() => toggleTask(task.id)}
                        aria-label={task.completed ? (lang === 'et' ? 'Märgi lõpetamata' : 'Mark incomplete') : (lang === 'et' ? 'Märgi lõpetatuks' : 'Mark complete')}
                        className={`flex-shrink-0 w-5 h-5 mt-0.5 sm:mt-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                          task.completed ? 'bg-[#6F5AE8] border-[#6F5AE8]' : 'border-[#D1D5DB] hover:border-[#6F5AE8]'
                        } ${flashId === task.id ? 'kv-flash-complete' : ''}`}
                      >
                        {task.completed && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium break-words ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                          {task.title}
                        </p>
                        {task.date && (
                          <p className={`flex items-center gap-1 text-xs mt-0.5 ${task.completed ? 'text-[#CBD5E1]' : 'text-[#94A3B8]'}`}>
                            <Calendar size={11} className="flex-shrink-0" />
                            <span>{formatTaskDate(task.date, lang)}</span>
                            {task.time ? (
                              <span>· {task.time}</span>
                            ) : (
                              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#EDE9FB] text-[#6F5AE8]">
                                {t('taskModal.allDayLabel', lang)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0 sm:contents">
                      {cat && (
                        <span
                          className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: isDark ? `${cat.color}28` : `${cat.color}18`, color: cat.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                          {cat.label}
                        </span>
                      )}

                      <span
                        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
                        style={{ color: p.text, background: p.bg, border: `1px solid ${p.border}` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.dot }} />
                        {p.label}
                      </span>

                      {/* Edit+Delete grouped as one flex item so flex-wrap
                          on the row above never splits them apart onto
                          separate wrapped lines on narrow phones (e.g.
                          320px) — they either both fit on the badges' line
                          or both wrap together to the next one. Dissolves
                          via sm:contents at sm: so desktop's flat row is
                          unchanged. */}
                      <div className="flex items-center gap-1 ml-auto sm:ml-0 sm:contents">
                        <button
                          onClick={() => openEdit(task)}
                          aria-label={t('tasks.action.edit', lang)}
                          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Pencil size={14} />
                        </button>

                        <button
                          onClick={() => setDeleteId(task.id)}
                          aria-label={t('tasks.action.delete', lang)}
                          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right info panel */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Progress card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('tasks.progress.title', lang)}</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F1F0EB" strokeWidth="3.5" className="kv-chart-track" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="#6F5AE8" strokeWidth="3.5"
                  strokeDasharray={`${(progress / 100) * 97.4} 97.4`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-[#1A1F36]">{progress}%</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {[
                { label: t('tasks.stat.done',   lang), count: completedCount },
                { label: t('tasks.stat.active', lang), count: activeCount    },
                { label: t('tasks.stat.total',  lang), count: tasks.length   },
              ].map(({ label, count }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-[#64748B]">{label}</span>
                  <span className="font-semibold text-[#1A1F36]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('tasks.priorities.title', lang)}</h3>
          <div className="flex flex-col gap-3">
            {(['high', 'medium', 'low'] as const).map((prio) => {
              const p     = PRIORITY_CONFIG[prio]
              const count = tasks.filter((task) => task.priority === prio && !task.completed).length
              return (
                <div key={prio} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.dot }} />
                    <span className="text-sm text-[#64748B]">{p.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1A1F36]">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* AI placeholder — no real AI yet */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.8} className="text-[#6F5AE8] flex-shrink-0" />
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {lang === 'et' ? 'Personaliseeritud nõuanded tulemas' : 'Personalized insights coming soon'}
            </h3>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {lang === 'et'
              ? 'Kivora õpib sinu harjumusi, ülesandeid, eesmärke ja rutiine. Personaliseeritud soovitused ilmuvad automaatselt, kui piisavalt andmeid on kogutud.'
              : 'Kivora is learning about your habits, tasks, goals and routines. Personalized recommendations will appear automatically once enough information has been collected.'}
          </p>
        </div>
      </aside>

      <AddTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleAddTask} lang={lang} />
      <AddTaskModal open={editingTask !== undefined} onClose={closeEdit} onSave={handleEditTask} initialTask={editingTask} lang={lang} />

      {/* Delete confirmation — reuses the same pattern as HabitsPage/NotesPage */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => { if (!deleting) setDeleteId(null) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-3">
                <Trash2 size={20} className="text-[#E11D48]" />
              </div>
              <h3 id="delete-task-title" className="text-base font-semibold text-[#1A1F36] mb-1">
                {t('tasks.deleteConfirm.title', lang)}
              </h3>
              <p className="text-sm text-[#64748B]">
                {t('tasks.deleteConfirm.body', lang)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('tasks.deleteConfirm.cancel', lang)}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm disabled:opacity-50"
              >
                {t('tasks.deleteConfirm.confirm', lang)}
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
