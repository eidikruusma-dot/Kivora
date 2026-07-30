import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTasks, addTask, toggleTask as storeToggleTask, deleteTask as storeDeleteTask } from '@/lib/tasksStore'
import type { Task, Priority, TaskCategory } from '@/types'
import { CATEGORY_MAP } from '@/lib/taskCategories'
import AddTaskModal from '@/components/tasks/AddTaskModal'

const CATEGORY_CONFIG: Record<TaskCategory, { color: string; label: string }> = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([k, v]) => [k, { color: v.color, label: v.label }])
) as Record<TaskCategory, { color: string; label: string }>

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; text: string; bg: string; border: string }> = {
  high:   { label: 'Kõrge',   dot: '#EF4444', text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  medium: { label: 'Keskmine', dot: '#F59E0B', text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  low:    { label: 'Madal',    dot: '#3B82F6', text: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
}

export default function TasksPage() {
  const tasks = useTasks()
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [modalOpen, setModalOpen] = useState(false)

  const toggleTask = (id: string) => storeToggleTask(id)

  const deleteTask = (id: string) => storeDeleteTask(id)

  const handleAddTask = (task: Task) => {
    addTask(task)
    setModalOpen(false)
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed
    if (filter === 'completed') return t.completed
    return true
  })

  const activeCount = tasks.filter((t) => !t.completed).length
  const completedCount = tasks.filter((t) => t.completed).length
  const highPriorityCount = tasks.filter((t) => t.priority === 'high' && !t.completed).length
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">
      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36]">Ülesanded</h1>
            <p className="text-sm text-[#64748B] mt-0.5">{activeCount} aktiivset · {completedCount} tehtud</p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            onClick={() => setModalOpen(true)}
          >
            <span className="text-lg leading-none">+</span>
            Lisa ülesanne
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#ECECF2] w-fit">
          {([
            { key: 'all', label: `Kõik (${tasks.length})` },
            { key: 'active', label: `Aktiivsed (${activeCount})` },
            { key: 'completed', label: `Tehtud (${completedCount})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                  : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="text-sm font-medium text-[#1A1F36]">Ülesandeid pole</p>
              <p className="text-xs text-[#94A3B8] mt-1">Siia ilmuvad sinu ülesanded.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredTasks.map((task, idx) => {
                const p = PRIORITY_CONFIG[task.priority]
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-5 py-4 hover:bg-[#FAFAF8] transition-colors group ${
                      idx !== filteredTasks.length - 1 ? 'border-b border-[#F0F0F0]' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        task.completed
                          ? 'bg-[#6F5AE8] border-[#6F5AE8]'
                          : 'border-[#D1D5DB] hover:border-[#6F5AE8]'
                      }`}
                    >
                      {task.completed && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                          {task.title}
                        </p>
                        {task.time && (
                          <p className={`text-xs mt-0.5 ${task.completed ? 'text-[#CBD5E1]' : 'text-[#94A3B8]'}`}>
                            {task.time}
                          </p>
                        )}
                      </div>
                      {task.category && (() => {
                        const cat = CATEGORY_CONFIG[task.category]
                        return (
                          <span
                            className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: `${cat.color}18`, color: cat.color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                            {cat.label}
                          </span>
                        )
                      })()}
                    </div>

                    {/* Priority badge */}
                    <span
                      className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ color: p.text, background: p.bg, border: `1px solid ${p.border}` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.dot }} />
                      {p.label}
                    </span>

                    {/* Delete button */}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right info panel */}
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Progress card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Edenemine</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F1F0EB" strokeWidth="3.5" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="#6F5AE8" strokeWidth="3.5"
                  strokeDasharray={`${(progress / 100) * 97.4} 97.4`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-[#1A1F36]">{progress}%</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Tehtud</span>
                <span className="font-semibold text-[#1A1F36]">{completedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Aktiivsed</span>
                <span className="font-semibold text-[#1A1F36]">{activeCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Kokku</span>
                <span className="font-semibold text-[#1A1F36]">{tasks.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Prioriteedid</h3>
          <div className="flex flex-col gap-3">
            {(['high', 'medium', 'low'] as const).map((prio) => {
              const p = PRIORITY_CONFIG[prio]
              const count = tasks.filter((t) => t.priority === prio && !t.completed).length
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

        {/* AI suggestion card */}
        <div className="bg-gradient-to-br from-[#6F5AE8] to-[#7C6BF0] rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} strokeWidth={2} />
            <h3 className="text-sm font-semibold">AI soovitus</h3>
          </div>
          <p className="text-sm leading-relaxed text-white/90">
            Sul on täna 1 kõrge prioriteediga ülesanne ja 2 tänase tähtajaga ülesannet. Soovitan alustada projektiraportist.
          </p>
        </div>
      </aside>

      <AddTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleAddTask} />
    </div>
  )
}
