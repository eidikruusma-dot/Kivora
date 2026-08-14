import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import { useTasks } from '@/lib/tasksStore'
import type { Priority } from '@/types'

const priorityLabel: Record<Priority, string> = {
  high: 'Kõrge',
  medium: 'Keskmine',
  low: 'Madal',
}

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
  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1F36]">Tänased ülesanded</h2>
        <button onClick={() => navigate('/app/tasks')} className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline">
          Vaata kõiki <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-thin pb-3">
        {todayTasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 py-1.5">
            {/* Checkbox */}
            <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
              task.completed
                ? 'bg-[#6F5AE8] border-[#6F5AE8]'
                : 'border-[#D1D5DB] bg-white'
            }`}>
              {task.completed && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            {/* Title */}
            <span className={`flex-1 text-sm truncate ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
              {task.title}
            </span>
            {/* Priority */}
            {!task.completed && (
              <span className={`text-xs font-medium flex-shrink-0 ${priorityColor[task.priority]}`}>
                {priorityLabel[task.priority]}
              </span>
            )}
            {/* Time */}
            {task.time && (
              <span className="text-xs text-[#94A3B8] flex-shrink-0">{task.time}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
