import { type ReactNode } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { FocusTimerProvider } from '@/context/FocusTimerContext'
import FocusTimerModal from '@/components/timer/FocusTimerModal'
import FocusTimerIndicator from '@/components/timer/FocusTimerIndicator'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <FocusTimerProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-[#F4F3EF] text-[#1A1F36]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <FocusTimerModal />
      <FocusTimerIndicator />
    </FocusTimerProvider>
  )
}
