import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Clock, Calendar, Repeat,
  Check, Target, Shield, Bot, Database, Download,
  Trash2, X, Loader2,
} from 'lucide-react'
import {
  useNotificationItems,
  markRead as storeMarkRead,
  markAllRead as storeMarkAllRead,
  deleteNotification as storeDeleteOne,
  deleteAllNotifications as storeDeleteAll,
} from '@/lib/notificationItemsStore'
import type { NotifIcon } from '@/lib/notificationItemsStore'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
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

type Toast = { type: 'success' | 'error'; text: string } | null

export default function NotificationsPage() {
  const notifications = useNotificationItems()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [toast, setToast] = useState<Toast>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const showToast = (t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
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
        text: lang === 'et' ? 'Kustutamine ebaõnnestus.' : 'Failed to delete notification.',
      })
    }
  }

  const handleDeleteAll = async () => {
    setDeletingAll(true)
    try {
      await storeDeleteAll()
      setConfirmDeleteAll(false)
      showToast({
        type: 'success',
        text: lang === 'et' ? 'Kõik teavitused kustutatud.' : 'All notifications deleted.',
      })
    } catch {
      showToast({
        type: 'error',
        text: lang === 'et' ? 'Kustutamine ebaõnnestus.' : 'Failed to delete notifications.',
      })
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0">
            <Bell size={20} className="text-[#6F5AE8]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1F36]">{t('notif.title', lang)}</h1>
            <p className="text-sm text-[#94A3B8]">
              {unreadCount > 0
                ? t('notif.unread', lang).replace('{n}', String(unreadCount))
                : t('notif.allRead', lang)}
            </p>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {unreadCount > 0 && !confirmDeleteAll && (
            <button
              onClick={() => storeMarkAllRead()}
              className="text-sm font-medium text-[#6F5AE8] hover:underline whitespace-nowrap"
            >
              {t('notif.markAllRead', lang)}
            </button>
          )}

          {/* Delete all — triggers inline confirmation */}
          {notifications.length > 0 && !confirmDeleteAll && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="flex items-center gap-1 text-sm font-medium text-[#94A3B8] hover:text-red-500 transition-colors whitespace-nowrap"
            >
              <Trash2 size={14} />
              {lang === 'et' ? 'Kustuta kõik' : 'Delete all'}
            </button>
          )}

          {/* Inline confirmation */}
          {confirmDeleteAll && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-red-700 whitespace-nowrap">
                {lang === 'et' ? 'Kustutada kõik?' : 'Delete all?'}
              </span>
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll}
                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                {deletingAll
                  ? <Loader2 size={12} className="animate-spin" />
                  : null}
                {lang === 'et' ? 'Jah, kustuta' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDeleteAll(false)}
                disabled={deletingAll}
                className="text-xs font-medium text-[#64748B] hover:underline disabled:opacity-50"
              >
                {lang === 'et' ? 'Tühista' : 'Cancel'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast banner */}
      {toast && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm font-medium border ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Notification list */}
      <div className="bg-white rounded-2xl border border-[#E8E6E0] overflow-hidden">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center">
              <Bell size={20} className="text-[#94A3B8]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1F36]">{t('notif.empty', lang)}</p>
              <p className="text-xs text-[#94A3B8] mt-1">
                {lang === 'et' ? 'Kõik on korras — midagi uut pole.' : "You're all caught up — nothing new."}
              </p>
            </div>
          </div>
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
                    if (n.link) navigate(n.link)
                  }}
                  className="flex items-start gap-3 px-6 py-4 text-left flex-1 min-w-0"
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

                {/* Delete button — always visible, sized for touch */}
                <button
                  onClick={(e) => handleDelete(e, n.id)}
                  className="flex-shrink-0 self-start mt-3 mr-4 w-9 h-9 flex items-center justify-center rounded-full text-[#C0C8D4] hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
                  aria-label={lang === 'et' ? 'Kustuta teavitus' : 'Delete notification'}
                  title={lang === 'et' ? 'Kustuta' : 'Delete'}
                >
                  <X size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
