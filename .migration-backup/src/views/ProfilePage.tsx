import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  getUserProfile,
  updateUserProfile,
  updateUserPreferences,
  type UserProfileUpdate,
  type UserPreferencesUpdate,
} from '@/lib/userProfile'
import type { UserProfile } from '@/types'
import ProfileHeader from '@/components/profile/ProfileHeader'
import ProfileOverview from '@/components/profile/ProfileOverview'
import ProfileEditForm from '@/components/profile/ProfileEditForm'
import PreferencesSection from '@/components/profile/PreferencesSection'
import PreferencesEditForm from '@/components/profile/PreferencesEditForm'
import ProfilePhotoUploader from '@/components/profile/ProfilePhotoUploader'

type LoadState = 'loading' | 'loaded' | 'error'

export default function ProfilePage() {
  const { user, reloadUser } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingPrefs, setEditingPrefs] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const [prefsDirty, setPrefsDirty] = useState(false)
  const [showPhotoUploader, setShowPhotoUploader] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  // Load profile
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoadState('loading')
    getUserProfile(user.uid)
      .then((data) => {
        if (cancelled) return
        if (data) {
          setProfile(data)
          setLoadState('loaded')
        } else {
          setLoadState('error')
          setMessage({ type: 'error', text: 'Profiili ei leitud' })
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoadState('error')
        setMessage({ type: 'error', text: 'Profiili laadimine ebaõnnestus' })
      })
    return () => { cancelled = true }
  }, [user])

  const isDirty = profileDirty || prefsDirty

  // beforeunload guard for unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleProfileDirtyChange = useCallback((d: boolean) => {
    setProfileDirty(d)
  }, [])

  const handlePrefsDirtyChange = useCallback((d: boolean) => {
    setPrefsDirty(d)
  }, [])

  // --- Profile (personal data) handlers ---

  const handleEditProfile = () => {
    setEditingProfile(true)
    setMessage(null)
  }

  const handleCancelProfile = () => {
    if (profileDirty) {
      const confirmed = window.confirm('Kas soovid loobuda? Salvestamata muudatused lähevad kaotsi.')
      if (!confirmed) return
    }
    setEditingProfile(false)
    setProfileDirty(false)
    setMessage(null)
  }

  const handleSaveProfile = async (changes: UserProfileUpdate) => {
    if (!user) return
    setSavingProfile(true)
    setMessage(null)

    try {
      await updateUserProfile(user.uid, changes)

      // Try to sync Firebase Auth displayName
      let authSyncFailed = false
      try {
        if (user.displayName !== changes.displayName) {
          await updateProfile(user, { displayName: changes.displayName })
          await reloadUser()
        }
      } catch {
        authSyncFailed = true
      }

      // Update local state
      setProfile((prev) =>
        prev ? { ...prev, ...changes, updatedAt: new Date() } : prev
      )
      setEditingProfile(false)
      setProfileDirty(false)

      if (authSyncFailed) {
        setMessage({
          type: 'warning',
          text: 'Profiiliandmed salvestati, kuid kasutajanime uuendamine vajab uut sisselogimist.',
        })
      } else {
        setMessage({ type: 'success', text: 'Profiil salvestatud' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Salvestamine ebaõnnestus. Proovi uuesti.' })
    } finally {
      setSavingProfile(false)
    }
  }

  // --- Preferences handlers ---

  const handleEditPrefs = () => {
    setEditingPrefs(true)
    setMessage(null)
  }

  const handleCancelPrefs = () => {
    if (prefsDirty) {
      const confirmed = window.confirm('Kas soovid loobuda? Salvestamata muudatused lähevad kaotsi.')
      if (!confirmed) return
    }
    setEditingPrefs(false)
    setPrefsDirty(false)
    setMessage(null)
  }

  const handleSavePrefs = async (preferences: UserPreferencesUpdate) => {
    if (!user) return
    setSavingPrefs(true)
    setMessage(null)

    try {
      await updateUserPreferences(user.uid, preferences)

      setProfile((prev) =>
        prev ? { ...prev, preferences, updatedAt: new Date() } : prev
      )
      setEditingPrefs(false)
      setPrefsDirty(false)
      setMessage({ type: 'success', text: 'Eelistused salvestatud' })
    } catch {
      setMessage({ type: 'error', text: 'Eelistuste salvestamine ebaõnnestus. Proovi uuesti.' })
    } finally {
      setSavingPrefs(false)
    }
  }

  // --- Photo handler ---

  const handlePhotoChange = async (newPhotoURL: string | null) => {
    if (!user || !profile) return

    setProfile((prev) => prev ? { ...prev, photoURL: newPhotoURL, updatedAt: new Date() } : prev)

    let authSyncFailed = false
    try {
      await updateProfile(user, { photoURL: newPhotoURL })
      await reloadUser()
    } catch {
      authSyncFailed = true
    }

    if (authSyncFailed) {
      setMessage({
        type: 'warning',
        text: 'Pilt salvestati, kuid Headeri uuendamine vajab uut sisselogimist.',
      })
    } else {
      setMessage({ type: 'success', text: newPhotoURL ? 'Profiilipilt salvestatud' : 'Profiilipilt eemaldatud' })
    }

    setShowPhotoUploader(false)
  }

  // Loading state
  if (loadState === 'loading' || !profile) {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl mx-auto">
          <ProfileHeader editing={false} />
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#6F5AE8]" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (loadState === 'error') {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl mx-auto">
          <ProfileHeader editing={false} />
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-8 text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-[#64748B] mb-4">Profiili laadimine ebaõnnestus</p>
          <button
            onClick={() => navigate('/app')}
            className="h-10 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors"
          >
            Tagasi
          </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <ProfileHeader editing={editingProfile || editingPrefs} />

          {/* Message banner */}
          {message && (
            <div
              role="alert"
              aria-live="assertive"
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : message.type === 'warning'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.type === 'success' && <Check size={16} />}
              {message.type === 'error' && <AlertCircle size={16} />}
              <span>{message.text}</span>
              <button
                onClick={() => setMessage(null)}
                aria-label="Sulge teade"
                className="ml-auto text-current opacity-60 hover:opacity-100 flex items-center justify-center w-6 h-6"
              >
                ×
              </button>
            </div>
          )}

          {showPhotoUploader ? (
            <ProfilePhotoUploader
              uid={user!.uid}
              photoURL={profile.photoURL}
              displayName={profile.displayName}
              email={profile.email}
              onPhotoChange={handlePhotoChange}
              onClose={() => setShowPhotoUploader(false)}
            />
          ) : (
            <>
              {/* Personal data section */}
              {editingProfile ? (
                <ProfileEditForm
                  profile={profile}
                  saving={savingProfile}
                  onSave={handleSaveProfile}
                  onCancel={handleCancelProfile}
                  onDirtyChange={handleProfileDirtyChange}
                />
              ) : (
                <ProfileOverview
                  profile={profile}
                  emailVerified={user?.emailVerified ?? false}
                  lastLoginAt={profile.lastLoginAt ?? user?.metadata?.lastSignInTime ?? null}
                  onEdit={handleEditProfile}
                  onPhotoClick={() => setShowPhotoUploader(true)}
                />
              )}

              {/* Preferences section */}
              {editingPrefs ? (
                <PreferencesEditForm
                  profile={profile}
                  saving={savingPrefs}
                  onSave={handleSavePrefs}
                  onCancel={handleCancelPrefs}
                  onDirtyChange={handlePrefsDirtyChange}
                />
              ) : (
                <PreferencesSection
                  profile={profile}
                  onEdit={handleEditPrefs}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
