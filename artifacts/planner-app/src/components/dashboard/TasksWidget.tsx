import { useState, useEffect } from 'react'
import { ArrowRight, ListChecks, CheckSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from '@/components/dashboard/DashboardCard'
import { useTasks, toggleTask, addTask } from '@/lib/tasksStore'
import TaskDetailModal from '@/components/dashboard/TaskDetailModal'
import AddTaskModal from '@/components/tasks/AddTaskModal'
import type { Priority, Task } from '@/types'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const priorityColor: Record<Priority, string> = {
  high: 'text-orange-500 dark:text-orange-300',
  medium: 'text-orange-400 dark:text-orange-300/80',
  low: 'text-slate-400 dark:text-slate-500',
}

export default function TasksWidget() {
  const navigate = useNavigate()
  const allTasks = useTasks()
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTasks = allTasks.filter((t) => !t.date || t.date === todayStr)

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handleAddTask = async (task: Task) => {
    await addTask(task)
    setAddOpen(false)
  }

  return (
    <>
      <DashboardCard className={todayTasks.length === 0 ? 'flex flex-col self-start' : 'h-full flex flex-col'}>
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#1A1F36] dark:text-[#F1EFFB]">
            <CheckSquare size={17} className="text-[#6F5AE8] dark:text-[#A78BFA]" />
            {t('dash.tasks.title', lang)}
          </h2>
          <button
            onClick={() => navigate('/app/tasks')}
            className="text-[11px] text-[#6F5AE8] dark:text-[#A78BFA] font-medium flex items-center gap-0.5 hover:underline"
          >
            {t('dash.viewAll', lang)} <ArrowRight size={11} />
          </button>
        </div>

        <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
          {todayTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className="flex items-center gap-3 py-1.5 rounded-lg px-1 -mx-1 cursor-pointer hover:bg-[#F8F7F4] dark:hover:bg-white/5 transition-colors group"
            >
              {/* Checkbox — toggles directly, does not open the modal */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleTask(task.id)
                }}
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  task.completed
                    ? 'bg-[#6F5AE8] border-[#6F5AE8]'
                    : 'border-[#D1D5DB] dark:border-white/20 bg-white dark:bg-transparent hover:border-[#6F5AE8]'
                }`}
              >
                {task.completed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Title — wraps instead of truncating so no task name is ever cut off */}
              <span className={`flex-1 min-w-0 text-sm break-words ${task.completed ? 'text-[#94A3B8] dark:text-[#6B6485] line-through' : 'text-[#1A1F36] dark:text-[#F1EFFB]'}`}>
                {task.title}
              </span>

              {/* Priority */}
              {!task.completed && (
                <span className={`text-xs font-medium flex-shrink-0 ${priorityColor[task.priority]}`}>
                  {t(`tasks.priority.${task.priority}` as Parameters<typeof t>[0], lang)}
                </span>
              )}

              {/* Time */}
              {task.time && (
                <span className="text-xs text-[#94A3B8] dark:text-[#9C96C2] flex-shrink-0">{task.time}</span>
              )}
            </div>
          ))}

          {todayTasks.length === 0 && (
            <div className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-[#EDE9FB] dark:bg-[#A78BFA]/15 flex items-center justify-center flex-shrink-0">
                <ListChecks size={16} className="text-[#6F5AE8] dark:text-[#A78BFA]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#94A3B8] dark:text-[#9C96C2] leading-snug">{t('dash.tasks.empty', lang)}</p>
                <button
                  onClick={() => setAddOpen(true)}
                  className="text-xs font-semibold text-[#6F5AE8] dark:text-[#C4B5FD] hover:underline py-1"
                >
                  {t('dash.tasks.emptyCta', lang)}
                </button>
              </div>
            </div>
          )}
        </div>
      </DashboardCard>

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />

      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddTask} lang={lang} />
    </>
  )
}
