import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Clock, Calendar, Repeat, ArrowRight } from 'lucide-react'
import { initialNotifications, getLocalizedNotifications, type Notification } from '@/lib/notifications'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const ICON_MAP = {
  clock: Clock,
  calendar: Calendar,
  repeat: Repeat,
} as const

interface Props {
  open: boolean
  onToggle: () => void
  onClose: () => void
}

export default function NotificationsPanel({ open, onToggle, onClose }: Props) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const panelRef = useRef<HTMLDivElement>(null)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleSeeAll = () => {
    onClose()
    navigate('/app/notifications')
  }

  // Localize notification text without losing read-state
  const displayed = getLocalizedNotifications(notifications, lang)

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={onToggle}
        className="relative flex items-center justify-center text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
        style={{ width: '20px', height: '20px' }}
        aria-label={t('notif.ariaLabel', lang)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute rounded-full"
            style={{
              backgroundColor: '#6F5AE8',
              width: '7px',
              height: '7px',
              top: '-1px',
              right: '-1px',
              border: '1.5px solid #ffffff',
            }}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#E8E6E0] shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1F36]">{t('notif.title', lang)}</h3>
            {unreadCount > 0 && (
              <span className="text-[11px] font-medium text-white rounded-full px-2 py-0.5" style={{ backgroundColor: '#6F5AE8' }}>
                {t('notif.newBadge', lang).replace('{n}', String(unreadCount))}
              </span>
            )}
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {displayed.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#94A3B8]">{t('notif.empty', lang)}</p>
            ) : (
              displayed.map((n) => {
                const Icon = ICON_MAP[n.icon]
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F8F7F4] transition-colors border-b border-[#F7F7F5] last:border-b-0"
                  >
                    <span
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${n.accent}1A`, color: n.accent }}
                    >
                      <Icon size={15} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#1A1F36] truncate">{n.title}</p>
                        {!n.read && (
                          <span
                            className="flex-shrink-0 rounded-full"
                            style={{ backgroundColor: '#6F5AE8', width: '6px', height: '6px' }}
                          />
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] leading-relaxed mt-0.5">{n.description}</p>
                      <p className="text-[11px] text-[#94A3B8] mt-1">{n.timeLabel}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <button
            onClick={handleSeeAll}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7F4] transition-colors border-t border-[#F0F0F0]"
          >
            {t('notif.viewAll', lang)} <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
