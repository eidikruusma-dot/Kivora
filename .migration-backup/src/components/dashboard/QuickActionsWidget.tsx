import { CheckSquare, Calendar, StickyNote, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import { useFocusTimer } from '@/context/FocusTimerContext'

const actions = [
  { icon: CheckSquare, label: 'Uus ülesanne', to: '/app/tasks' },
  { icon: Calendar, label: 'Uus sündmus', to: '/app/calendar' },
  { icon: StickyNote, label: 'Kiire märge', to: '/app/notes' },
] as const

export default function QuickActionsWidget() {
  const navigate = useNavigate()
  const { openModal } = useFocusTimer()

  return (
    <Card className="h-full flex flex-col">
      <div className="px-5 py-4">
        <h2 className="text-sm font-bold text-[#1A1F36]">Kiired tegevused</h2>
      </div>
      <div className="flex-1 px-4 pb-4 grid grid-cols-2 gap-2.5 content-center">
        {actions.map(({ icon: Icon, label, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="flex items-center gap-2.5 px-3.5 h-[52px] rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
          >
            <Icon size={18} className="text-[#6F5AE8] flex-shrink-0" />
            <span className="text-sm font-medium text-[#1A1F36] truncate">{label}</span>
          </button>
        ))}
        <button
          onClick={openModal}
          className="flex items-center gap-2.5 px-3.5 h-[52px] rounded-xl bg-[#F8F7F4] hover:bg-[#EDE9FB] transition-colors text-left"
        >
          <Timer size={18} className="text-[#6F5AE8] flex-shrink-0" />
          <span className="text-sm font-medium text-[#1A1F36] truncate">Alusta taimerit</span>
        </button>
      </div>
    </Card>
  )
}
