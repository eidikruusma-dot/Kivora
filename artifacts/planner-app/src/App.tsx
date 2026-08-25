import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import { AuthProvider } from '@/context/AuthContext'
import { Toaster } from '@/components/ui/sonner'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/views/Dashboard'
import Placeholder from '@/views/Placeholder'
import Landing from '@/views/Landing'
import Contact from '@/views/Contact'
import Privacy from '@/views/Privacy'
import Terms from '@/views/Terms'
import Login from '@/views/Login'
import Register from '@/views/Register'
import ForgotPassword from '@/views/ForgotPassword'
import ResetPassword from '@/views/ResetPassword'
import VerifyEmail from '@/views/VerifyEmail'
import ProfilePage from '@/views/ProfilePage'
import CalendarPage from '@/views/CalendarPage'
import TasksPage from '@/views/TasksPage'
import NotesPage from '@/views/NotesPage'
import HabitsPage from '@/views/HabitsPage'
import GoalsPage from '@/views/GoalsPage'
import PlansPage from '@/views/PlansPage'
import PlanDetailPage from '@/views/PlanDetailPage'
import AIAssistantPage from '@/views/AIAssistantPage'
import SchoolPage from '@/views/SchoolPage'
import FinancePage from '@/views/finance/FinancePage'
import SettingsPage from '@/views/SettingsPage'
import HelpPage from '@/views/HelpPage'
import NotificationsPage from '@/views/NotificationsPage'
import ModuleSelectionPage from '@/views/onboarding/ModuleSelectionPage'
import { useNotificationGenerators } from '@/lib/notificationGenerators'
import { CheckSquare, Calendar, StickyNote, Repeat, Target, Sparkles, Settings } from 'lucide-react'

function NotificationBootstrap() {
  useNotificationGenerators()

  // SW is already registered in main.tsx before React renders.
  // Nothing to do here — push subscription is handled by pushNotifications.ts.

  return null
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="bottom-right" richColors />
        <NotificationBootstrap />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/app" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/app/tasks" element={<ProtectedRoute><AppLayout><TasksPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/calendar" element={<ProtectedRoute><AppLayout><CalendarPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/notes" element={<ProtectedRoute><AppLayout><NotesPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/habits" element={<ProtectedRoute><AppLayout><HabitsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/goals" element={<ProtectedRoute><AppLayout><GoalsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/plans" element={<ProtectedRoute><AppLayout><PlansPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/plans/:planId" element={<ProtectedRoute><AppLayout><PlanDetailPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/assistant" element={<ProtectedRoute><AppLayout><AIAssistantPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/finance" element={
            MONEY_MODULE_ENABLED
              ? <ProtectedRoute><AppLayout><FinancePage /></AppLayout></ProtectedRoute>
              : <Navigate to="/app" replace />
          } />
          <Route path="/app/school" element={<ProtectedRoute><AppLayout><SchoolPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/help" element={<ProtectedRoute><AppLayout><HelpPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/notifications" element={<ProtectedRoute><AppLayout><NotificationsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/app/profile" element={<ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />
          <Route path="/onboarding" element={<ProtectedRoute skipOnboarding><ModuleSelectionPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
