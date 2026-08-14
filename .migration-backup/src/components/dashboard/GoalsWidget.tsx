import { ArrowRight, Target, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'
import { useGoals } from '@/lib/goalsStore'

const goalIcons = [Target, Star]
const goalColors = ['#6F5AE8', '#F97316']

export default function GoalsWidget() {
  const navigate = useNavigate()
  const goals = useGoals()
  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1F36]">Eesmärgid</h2>
        <button onClick={() => navigate('/app/goals')} className="text-[11px] text-[#6F5AE8] font-medium flex items-center gap-0.5 hover:underline">
          Vaata kõiki <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 px-5 pb-4 space-y-3 overflow-y-auto scrollbar-thin">
        {goals.slice(0, 4).map((goal, i) => {
          const Icon = goalIcons[i % goalIcons.length]
          const color = goalColors[i % goalColors.length]
          const pct = Math.round((goal.progressValue / goal.progressMax) * 100)
          return (
            <div key={goal.id}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <span className="flex-1 text-sm font-medium text-[#1A1F36] truncate">{goal.title}</span>
                <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{pct}%</span>
              </div>
              <ProgressBar value={pct} color={color} className="mb-1.5" />
              {goal.deadlineShort && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#94A3B8]">
                    <span className="font-medium">Tähtaeg:</span> {goal.deadline}
                  </p>
                  <span className="text-xs text-[#94A3B8] flex-shrink-0">{goal.progressValue}/{goal.progressMax}</span>
                </div>
              )}
            </div>
          )
        })}
        {goals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-[#94A3B8]">Eesmärke pole veel lisatud</p>
          </div>
        )}
      </div>
    </Card>
  )
}
