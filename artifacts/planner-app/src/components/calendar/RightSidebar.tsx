import { type ReactNode } from 'react'

interface RightSidebarProps {
  children: ReactNode
}

export default function RightSidebar({ children }: RightSidebarProps) {
  return (
    /*
     * Responsive behaviour:
     *   mobile  (<md)  — hidden entirely (space is precious)
     *   tablet  (md–lg) — shown below the calendar, border on top
     *   desktop (lg+)   — right column, border on left, fixed 300 px width
     */
    <aside
      className={[
        'hidden md:flex flex-col bg-white p-4',
        'border-t border-[#EBEBEB]',
        'lg:border-t-0 lg:border-l lg:border-[#EBEBEB]',
        'lg:w-[300px] lg:flex-shrink-0',
      ].join(' ')}
    >
      {children}
    </aside>
  )
}
