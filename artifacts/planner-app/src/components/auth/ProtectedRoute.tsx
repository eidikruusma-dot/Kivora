import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useModules } from '@/lib/modulesStore'

export function ProtectedRoute({
  children,
  skipOnboarding = false,
}: {
  children: ReactNode
  skipOnboarding?: boolean
}) {
  const { user, loading } = useAuth()
  const { settings: modules, loading: modulesLoading } = useModules()
  const location = useLocation()

  if (loading || (user?.emailVerified && modulesLoading)) return <AuthLoading />
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />

  // Redirect new users to onboarding (only once, never from /onboarding itself)
  if (
    !skipOnboarding &&
    !modules.onboardingComplete &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />
  }

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
