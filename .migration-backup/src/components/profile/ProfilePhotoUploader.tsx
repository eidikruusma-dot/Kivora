import { useRef, useState, useCallback } from 'react'
import { Loader2, Upload, Trash2, X, AlertCircle } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { uploadProfilePhoto, deleteProfilePhoto } from '@/lib/profilePhoto'
import { ImageValidationError } from '@/lib/processImage'

interface ProfilePhotoUploaderProps {
  uid: string
  photoURL: string | null
  displayName: string
  email: string
  onPhotoChange: (photoURL: string | null) => void
  onClose: () => void
}

type UploadState = 'idle' | 'processing' | 'uploading' | 'done' | 'error'

export default function ProfilePhotoUploader({
  uid,
  photoURL,
  displayName,
  email,
  onPhotoChange,
  onClose,
}: ProfilePhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const resetPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPendingFile(null)
    setError(null)
    setUploadState('idle')
  }, [previewUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploadState('processing')

    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new ImageValidationError('Lubatud on ainult JPEG, PNG või WebP failid')
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new ImageValidationError('Faili suurus ei tohi ületada 5 MB')
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setPendingFile(file)
      setUploadState('idle')
    } catch (err) {
      const msg = err instanceof ImageValidationError ? err.message : 'Faili lugemine ebaõnnestus'
      setError(msg)
      setUploadState('error')
    }

    e.target.value = ''
  }

  const handleSave = async () => {
    if (!pendingFile) return
    setUploadState('uploading')
    setError(null)

    try {
      const newUrl = await uploadProfilePhoto(uid, pendingFile, photoURL)
      await onPhotoChange(newUrl)
      setUploadState('done')
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setPendingFile(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Üleslaadimine ebaõnnestus'
      setError(msg)
      setUploadState('error')
    }
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    setError(null)
    try {
      await deleteProfilePhoto(uid, photoURL)
      onPhotoChange(null)
      setUploadState('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pildi eemaldamine ebaõnnestus'
      setError(msg)
      setUploadState('error')
    } finally {
      setIsRemoving(false)
    }
  }

  const handleCancel = () => {
    resetPreview()
    onClose()
  }

  const busy = uploadState === 'uploading' || uploadState === 'processing' || isRemoving

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0]">
        <h2 className="text-base font-semibold text-[#1A1F36]">Profiilipilt</h2>
        <button
          onClick={handleCancel}
          disabled={busy}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] transition-colors disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6 py-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <Avatar
            photoURL={previewUrl || photoURL}
            fallbackName={displayName}
            fallbackEmail={email}
            size="lg"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-10 px-4 rounded-xl bg-[#F8F7F4] border border-[#E8E6E0] text-sm font-medium text-[#1A1F36] flex items-center gap-2 hover:bg-[#F0F0F0] transition-colors disabled:opacity-50"
          >
            <Upload size={16} />
            {photoURL ? 'Vali uus pilt' : 'Vali fail'}
          </button>
        </div>

        {pendingFile && (
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#F0F0F0]">
            <button
              onClick={resetPreview}
              disabled={busy}
              className="h-10 px-4 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F0F0F0] transition-colors disabled:opacity-50"
            >
              Loobu eelvaatest
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadState === 'uploading' && <Loader2 size={16} className="animate-spin" />}
              {uploadState === 'processing' && <Loader2 size={16} className="animate-spin" />}
              {busy ? 'Salvestan...' : 'Salvesta pilt'}
            </button>
          </div>
        )}

        {photoURL && !pendingFile && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#F0F0F0]">
            <p className="text-sm text-[#64748B]">Praegune pilt</p>
            <button
              onClick={handleRemove}
              disabled={busy}
              className="h-10 px-4 rounded-xl text-sm font-medium text-red-600 flex items-center gap-2 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Eemalda pilt
            </button>
          </div>
        )}

        <div className="flex items-center justify-end pt-4 border-t border-[#F0F0F0]">
          <button
            onClick={handleCancel}
            disabled={busy}
            className="h-10 px-4 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F0F0F0] transition-colors disabled:opacity-50"
          >
            Sulge
          </button>
        </div>
      </div>
    </div>
  )
}
