import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import Avatar from '@/components/ui/AppAvatar'
import SearchModal from '@/components/search/SearchModal'
import NotificationsPanel from '@/components/notifications/NotificationsPanel'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'
import type { TranslationKey } from '@/lib/translations'

// Maps each route path to a translation key — kept at module level (stable)
const PAGE_TITLE_KEYS: Record<string, TranslationKey> = {
  '/app':            'nav.myDay',
  '/app/tasks':      'nav.tasks',
  '/app/calendar':   'nav.calendar',
  '/app/notes':      'nav.notes',
  '/app/habits':     'nav.habits',
  '/app/goals':      'nav.goals',
  '/app/assistant':  'nav.assistant',
  '/app/school':     'nav.school',
  '/app/settings':   'nav.settings',
}

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  useEffect(() => {
    return subscribeToLanguage((s) => setLang(s.appLang))
  }, [])

  const displayName = user?.displayName || user?.email?.split('@')[0] || t('header.user', lang)
  const titleKey = PAGE_TITLE_KEYS[location.pathname]
  const pageTitle = titleKey ? t(titleKey, lang) : 'Kivora'

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between bg-white"
      style={{ height: '61px', paddingLeft: '30px', paddingRight: '22px' }}
    >
      <h1 className="text-xl font-bold text-[#1A1F36]">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
          style={{ width: '20px', height: '20px' }}
        >
          <Search size={20} />
        </button>

        <NotificationsPanel
          open={notifOpen}
          onToggle={() => setNotifOpen((o) => !o)}
          onClose={() => setNotifOpen(false)}
        />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 py-1 rounded-lg hover:bg-[#F8F7F4] transition-colors"
          >
            <Avatar
              photoURL={user?.photoURL || null}
              fallbackName={displayName}
              fallbackEmail={user?.email}
              size="xs"
            />
            <ChevronDown size={14} className={`text-[#94A3B8] transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-[#E8E6E0] shadow-lg py-1.5 z-50">
              <div className="px-4 py-2.5 border-b border-[#F0F0F0]">
                <p className="text-sm font-medium text-[#1A1F36] truncate">{displayName}</p>
                <p className="text-xs text-[#94A3B8] truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/app/profile') }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
              >
                <User size={16} className="text-[#94A3B8]" />
                {t('header.myProfile', lang)}
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                {t('header.logout', lang)}
              </button>
            </div>
          )}
        </div>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
