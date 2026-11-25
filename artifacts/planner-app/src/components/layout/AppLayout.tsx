import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileBottomNav from './MobileBottomNav'
import { FocusTimerProvider } from '@/context/FocusTimerContext'
import FocusTimerModal from '@/components/timer/FocusTimerModal'
import FocusTimerIndicator from '@/components/timer/FocusTimerIndicator'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <FocusTimerProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-[#F4F3EF] dark:bg-[#0E0B1A] text-[#1A1F36] dark:text-[#F1EFFB]">
        {/* Translucent backdrop — tapping it closes the drawer on mobile/tablet */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />
          {/* pb-16: clears the fixed MobileBottomNav (< lg only) so the
              last bit of every page's content is never hidden behind it. */}
          <main key={location.pathname} className="flex-1 overflow-y-auto kv-page-enter pb-16 lg:pb-0">{children}</main>
        </div>

        {/* Fixed bottom nav — mobile/tablet only (component itself is lg:hidden).
            "Rohkem" opens the exact same Sidebar drawer the header's
            hamburger button already opens — no separate "more" screen. */}
        <MobileBottomNav onOpenMore={() => setSidebarOpen(true)} />
      </div>
      <FocusTimerModal />
      <FocusTimerIndicator />
    </FocusTimerProvider>
  )
}
