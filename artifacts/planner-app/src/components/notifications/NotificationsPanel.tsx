import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Clock, Calendar, Repeat, ArrowRight,
  Check, Target, Shield, Bot, Database, Download, X,
} from 'lucide-react'
import {
  useNotificationItems,
  markRead as storeMarkRead,
  markAllRead as storeMarkAllRead,
  deleteNotification as storeDeleteOne,
} from '@/lib/notificationItemsStore'
import type { NotifIcon } from '@/lib/notificationItemsStore'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

const ICON_MAP: Record<NotifIcon, React.ComponentType<{ size?: number }>> = {
  clock: Clock,
  calendar: Calendar,
  repeat: Repeat,
  check: Check,
  target: Target,
  shield: Shield,
  bot: Bot,
  database: Database,
  download: Download,
}

type PanelToast = { type: 'success' | 'error'; text: string } | null

interface Props {
  open: boolean
  onToggle: () => void
  onClose: () => void
}

export default function NotificationsPanel({ open, onToggle, onClose }: Props) {
  const navigate = useNavigate()
  const notifications = useNotificationItems()
  const panelRef = useRef<HTMLDivElement>(null)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [panelToast, setPanelToast] = useState<PanelToast>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Clear toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const showToast = (toast: PanelToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setPanelToast(toast)
    toastTimer.current = setTimeout(() => setPanelToast(null), 2500)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await storeDeleteOne(id)
      showToast({
        type: 'success',
        text: lang === 'et' ? 'Teavitus kustutatud.' : 'Notification deleted.',
      })
    } catch {
      showToast({
        type: 'error',
        text: lang === 'et' ? 'Kustutamine ebaõnnestus.' : 'Failed to delete.',
      })
    }
  }

  const handleSeeAll = () => {
    onClose()
    navigate('/app/notifications')
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button with numeric badge */}
      <button
        onClick={onToggle}
        className="relative flex items-center justify-center text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
        style={{ width: '20px', height: '20px' }}
        aria-label={t('notif.ariaLabel', lang)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full text-white font-bold leading-none select-none"
            style={{
              backgroundColor: '#EF4444',
              fontSize: '9px',
              minWidth: '14px',
              height: '14px',
              top: '-5px',
              right: '-6px',
              border: '1.5px solid white',
              padding: '0 2px',
              letterSpacing: '-0.01em',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#E8E6E0] shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1F36]">{t('notif.title', lang)}</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium text-white rounded-full px-2 py-0.5" style={{ backgroundColor: '#6F5AE8' }}>
                  {t('notif.newBadge', lang).replace('{n}', String(unreadCount))}
                </span>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={() => storeMarkAllRead()}
                  className="text-[11px] font-medium text-[#6F5AE8] hover:underline"
                >
                  {t('notif.markAllRead', lang)}
                </button>
              )}
            </div>
          </div>

          {/* Inline toast (success / error feedback) */}
          {panelToast && (
            <div
              className={`px-4 py-2 text-xs font-medium border-b border-[#F0F0F0] ${
                panelToast.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {panelToast.text}
            </div>
          )}

          {/* Notification list */}
          <div className="max-h-[320px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#94A3B8]">{t('notif.empty', lang)}</p>
            ) : (
              notifications.map((n) => {
                const Icon = ICON_MAP[n.icon] ?? Clock
                return (
                  <div
                    key={n.id}
                    className="flex items-stretch border-b border-[#F7F7F5] last:border-b-0 hover:bg-[#F8F7F4] transition-colors"
                  >
                    {/* Main click area — mark read + navigate */}
                    <button
                      onClick={() => {
                        storeMarkRead(n.id)
                        if (n.link) { onClose(); navigate(n.link) }
                      }}
                      className="flex items-start gap-3 px-4 py-3 text-left flex-1 min-w-0"
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

                    {/* Delete button — always visible, easy to tap */}
                    <button
                      onClick={(e) => handleDelete(e, n.id)}
                      className="flex-shrink-0 self-start mt-2.5 mr-2 w-7 h-7 flex items-center justify-center rounded-full text-[#C0C8D4] hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
                      aria-label={lang === 'et' ? 'Kustuta teavitus' : 'Delete notification'}
                      title={lang === 'et' ? 'Kustuta' : 'Delete'}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
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
