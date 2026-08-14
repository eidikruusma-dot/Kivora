import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-2xl overflow-hidden min-h-0 ${className}`}>
      {children}
    </div>
  )
}
