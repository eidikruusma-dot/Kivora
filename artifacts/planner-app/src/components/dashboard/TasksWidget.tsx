import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/AppCard'
import { useTasks, toggleTask } from '@/lib/tasksStore'
import TaskDetailModal from '@/components/dashboard/TaskDetailModal'
import type { Priority } from '@/types'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const priorityColor: Record<Priority, string> = {
  high: 'text-orange-500',
  medium: 'text-orange-400',
  low: 'text-slate-400',
}

export default function TasksWidget() {
  const navigate = useNavigate()
  const allTasks = useTasks()
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTasks = allTasks.filter((t) => !t.date || t.date === todayStr)

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <>
      <Card className="h-full flex flex-col">
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#1A1F36]">{t('dash.tasks.title', lang)}</h2>
          <button
            onClick={() => navigate('/app/tasks')}
            className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline"
          >
            {t('dash.viewAll', lang)} <ArrowRight size={11} />
          </button>
        </div>

        <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
          {todayTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className="flex items-center gap-3 py-1.5 rounded-lg px-1 -mx-1 cursor-pointer hover:bg-[#F8F7F4] transition-colors group"
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
                    : 'border-[#D1D5DB] bg-white hover:border-[#6F5AE8]'
                }`}
              >
                {task.completed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Title */}
              <span className={`flex-1 text-sm truncate ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
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
                <span className="text-xs text-[#94A3B8] flex-shrink-0">{task.time}</span>
              )}
            </div>
          ))}

          {todayTasks.length === 0 && (
            <p className="text-xs text-[#94A3B8] py-4 text-center">{t('dash.tasks.empty', lang)}</p>
          )}
        </div>
      </Card>

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  )
}
