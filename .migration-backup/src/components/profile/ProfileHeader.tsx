import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface ProfileHeaderProps {
  editing: boolean
}

export default function ProfileHeader({ editing }: ProfileHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/app')}
          className="w-9 h-9 rounded-xl bg-white border border-[#E8E6E0] flex items-center justify-center text-[#64748B] hover:text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-[#1A1F36]">
          {editing ? 'Muuda profiili' : 'Minu profiil'}
        </h1>
      </div>
    </div>
  )
}
