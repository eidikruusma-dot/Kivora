import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <AuthLoading />
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />

  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <AuthLoading />
  if (user && user.emailVerified) return <Navigate to="/app" replace />

  return <>{children}</>
}

export function AuthLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#F4F3EF] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#6F5AE8] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
