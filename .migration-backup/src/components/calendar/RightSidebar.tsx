import { type ReactNode } from 'react'

interface RightSidebarProps {
  children: ReactNode
}

export default function RightSidebar({ children }: RightSidebarProps) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col bg-white"
      style={{ width: '300px', borderLeft: '1px solid #EBEBEB', padding: '16px' }}
    >
      {children}
    </aside>
  )
}
