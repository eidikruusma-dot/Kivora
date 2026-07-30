import { User as UserIcon } from 'lucide-react'

interface AvatarProps {
  photoURL?: string | null
  fallbackName?: string | null
  fallbackEmail?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-8 h-8',
  sm: 'w-9 h-9',
  md: 'w-16 h-16',
  lg: 'w-32 h-32',
}

const textSizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-4xl',
}

const iconSizes: Record<NonNullable<AvatarProps['size']>, number> = {
  xs: 14,
  sm: 16,
  md: 24,
  lg: 40,
}

export default function Avatar({
  photoURL,
  fallbackName,
  fallbackEmail,
  size = 'md',
  className = '',
  onClick,
}: AvatarProps) {
  const initial = (fallbackName || fallbackEmail || '?')
    .charAt(0)
    .toUpperCase()
  const displayName = fallbackName || fallbackEmail || undefined

  return (
    <div
      onClick={onClick}
      className={`relative rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center bg-[#6F5AE8] ${sizeClasses[size]} ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {photoURL ? (
        <img
          src={photoURL}
          alt={fallbackName || 'Avatar'}
          className="w-full h-full object-cover"
        />
      ) : fallbackName || fallbackEmail ? (
        <span className={`text-white font-semibold ${textSizeClasses[size]}`}>
          {initial}
        </span>
      ) : (
        <UserIcon size={iconSizes[size]} className="text-white" />
      )}
    </div>
  )
}
