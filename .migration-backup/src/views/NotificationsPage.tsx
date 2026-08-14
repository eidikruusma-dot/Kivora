import { Bell } from 'lucide-react'
import { useState } from 'react'
import { initialNotifications, type Notification } from '@/lib/notifications'
import { Clock, Calendar, Repeat } from 'lucide-react'

const ICON_MAP = {
  clock: Clock,
  calendar: Calendar,
  repeat: Repeat,
} as const

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#EDE9FB] flex items-center justify-center">
          <Bell size={20} className="text-[#6F5AE8]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1A1F36]">Teavitused</h1>
          <p className="text-sm text-[#94A3B8]">
            {unreadCount > 0 ? `${unreadCount} lugemata teavitust` : 'Kõik teavitused loetud'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E8E6E0] overflow-hidden">
        {notifications.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[#94A3B8]">Uusi teavitusi pole.</p>
        ) : (
          notifications.map((n) => {
            const Icon = ICON_MAP[n.icon]
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className="w-full flex items-start gap-3 px-6 py-4 text-left hover:bg-[#F8F7F4] transition-colors border-b border-[#F7F7F5] last:border-b-0"
              >
                <span
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${n.accent}1A`, color: n.accent }}
                >
                  <Icon size={17} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#1A1F36]">{n.title}</p>
                    {!n.read && (
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{ backgroundColor: '#6F5AE8', width: '7px', height: '7px' }}
                      />
                    )}
                  </div>
                  <p className="text-sm text-[#64748B] leading-relaxed mt-1">{n.description}</p>
                  <p className="text-xs text-[#94A3B8] mt-1.5">{n.timeLabel}</p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
