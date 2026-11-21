/**
 * Stylised decorative plant — a small potted cluster of leaf blades,
 * echoing the leaf motif used in the new Kivora symbol. Purely
 * decorative — aria-hidden, no layout impact.
 */
const LEAF_PATH =
  'M0 0 C -4 -34 -2 -62 10 -92 C 24 -64 26 -34 18 -2 C 12 8 6 8 0 0 Z'

export default function PlantIllustration({ className = '' }: { className?: string }) {
  const leaves: { rotate: number; scale: number; gradient: string; opacity?: number }[] = [
    { rotate: -46, scale: 0.9, gradient: 'kv-leafC', opacity: 0.95 },
    { rotate: -24, scale: 1.1, gradient: 'kv-leafA' },
    { rotate: -2, scale: 1.2, gradient: 'kv-leafB' },
    { rotate: 20, scale: 1.05, gradient: 'kv-leafA', opacity: 0.95 },
    { rotate: 42, scale: 0.85, gradient: 'kv-leafC', opacity: 0.85 },
  ]

  return (
    <svg viewBox="0 0 220 300" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kv-leafA" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4C9A6A" />
          <stop offset="100%" stopColor="#7FC99A" />
        </linearGradient>
        <linearGradient id="kv-leafB" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3F7F58" />
          <stop offset="100%" stopColor="#6BBE8A" />
        </linearGradient>
        <linearGradient id="kv-leafC" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5BAE7D" />
          <stop offset="100%" stopColor="#8FD6AC" />
        </linearGradient>
        <linearGradient id="kv-pot" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#5531D6" />
        </linearGradient>
        <filter id="kv-plant-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#2F1F6B" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter="url(#kv-plant-shadow)">
        {/* pot */}
        <path d="M70 250 L150 250 L140 296 C 140 300 80 300 80 296 Z" fill="url(#kv-pot)" />
        <ellipse cx="110" cy="250" rx="40" ry="8" fill="#6F46E0" />

        {/* leaves fanning from the pot's rim */}
        {leaves.map((leaf, i) => (
          <g key={i} transform={`translate(110 246) rotate(${leaf.rotate}) scale(${leaf.scale})`} opacity={leaf.opacity ?? 1}>
            <path d={LEAF_PATH} fill={`url(#${leaf.gradient})`} />
            <path d="M0 -4 L12 -70" stroke="#F5FFF9" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          </g>
        ))}
      </g>
    </svg>
  )
}
