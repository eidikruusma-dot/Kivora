/**
 * Stylised decorative coffee cup — a small warm accent near the phone
 * mockup, echoing the reference composition. Purely decorative —
 * aria-hidden, no layout impact.
 */
export default function CoffeeCupIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 170" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kv-cup-grad" x1="0%" y1="0%" x2="20%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#ECE6FA" />
        </linearGradient>
        <linearGradient id="kv-coffee-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9C6B48" />
          <stop offset="100%" stopColor="#5E3B23" />
        </linearGradient>
        <radialGradient id="kv-saucer-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2F1F6B" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2F1F6B" stopOpacity="0" />
        </radialGradient>
        <filter id="kv-cup-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="14" stdDeviation="10" floodColor="#2F1F6B" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* soft contact shadow under the saucer */}
      <ellipse cx="80" cy="134" rx="60" ry="14" fill="url(#kv-saucer-shadow)" />

      <g filter="url(#kv-cup-shadow)">
        {/* saucer */}
        <ellipse cx="80" cy="128" rx="54" ry="10" fill="#F2EEFC" stroke="#E4DEFB" strokeWidth="1" />

        {/* cup body */}
        <path d="M34 60 L46 118 C 48 124 56 128 80 128 C 104 128 112 124 114 118 L126 60 Z" fill="url(#kv-cup-grad)" stroke="#E4DEFB" strokeWidth="1.5" />
        {/* glossy highlight down the cup's left side */}
        <path d="M42 66 L50 110" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.8" />

        {/* handle */}
        <path d="M126 70 C 148 70 148 104 126 104" fill="none" stroke="#E4DEFB" strokeWidth="7" strokeLinecap="round" />
        <path d="M126 70 C 148 70 148 104 126 104" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />

        {/* coffee surface + crema swirl + a few foam flecks */}
        <ellipse cx="80" cy="60" rx="46" ry="11" fill="url(#kv-coffee-grad)" />
        <path d="M60 59 C 68 53 76 65 86 59 C 94 53 100 65 106 59" fill="none" stroke="#F3D9B5" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        <circle cx="68" cy="56" r="1.6" fill="#F3D9B5" opacity="0.7" />
        <circle cx="96" cy="57" r="1.3" fill="#F3D9B5" opacity="0.6" />
        <circle cx="86" cy="54" r="1.1" fill="#F3D9B5" opacity="0.5" />
      </g>

      {/* steam */}
      <path d="M64 42 C 56 32 70 24 62 12" fill="none" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <path d="M96 42 C 88 32 102 24 94 12" fill="none" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}
