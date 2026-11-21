import { RefreshCw } from 'lucide-react'

/**
 * Simple, clean device-sync row (laptop · sync badge · tablet+phone) used
 * under the hero to illustrate "synced across your devices" — a
 * truthful claim given the app is a Firebase-backed PWA (the same
 * account's data follows you to any browser/device you sign into, no
 * separate native-platform integration implied or required). Built from
 * plain gradient shapes rather than photographic 3D renders, kept in
 * the same soft purple-gradient language as the rest of the page.
 * Purely decorative — aria-hidden, no layout impact.
 */
export default function DeviceSyncIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 460 180" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kv-device-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#5531D6" />
        </linearGradient>
        <filter id="kv-device-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#2F1F6B" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* dotted connector lines */}
      <line x1="120" y1="100" x2="195" y2="100" stroke="#C9BBFC" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
      <line x1="265" y1="100" x2="330" y2="100" stroke="#C9BBFC" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />

      {/* laptop */}
      <g filter="url(#kv-device-shadow)" transform="translate(10 52)">
        <rect x="0" y="0" width="108" height="72" rx="10" fill="url(#kv-device-grad)" />
        <rect x="7" y="7" width="94" height="58" rx="4" fill="#F5F3FF" />
        <rect x="7" y="7" width="94" height="22" rx="4" fill="#FFFFFF" opacity="0.5" />
        <path d="M-12 72 L120 72 L128 84 C 128 90 -20 90 -20 84 Z" fill="#4B2FCB" />
      </g>

      {/* sync badge, centered */}
      <circle cx="230" cy="100" r="36" fill="#FFFFFF" filter="url(#kv-device-shadow)" />
      <circle cx="230" cy="100" r="36" fill="none" stroke="#E4DEFB" strokeWidth="2" />
      <foreignObject x="210" y="80" width="40" height="40">
        <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={22} color="#6F5AE8" strokeWidth={2.5} />
        </div>
      </foreignObject>

      {/* tablet + phone */}
      <g filter="url(#kv-device-shadow)" transform="translate(340 44)">
        <rect x="0" y="0" width="86" height="104" rx="12" fill="url(#kv-device-grad)" />
        <rect x="7" y="10" width="72" height="84" rx="4" fill="#F5F3FF" />
        <rect x="7" y="10" width="72" height="26" rx="4" fill="#FFFFFF" opacity="0.4" />
        <g transform="translate(56 48)">
          <rect x="0" y="0" width="40" height="70" rx="9" fill="#4B2FCB" />
          <rect x="4" y="6" width="32" height="52" rx="3" fill="#F5F3FF" />
          <rect x="4" y="6" width="32" height="16" rx="3" fill="#FFFFFF" opacity="0.35" />
        </g>
      </g>
    </svg>
  )
}
