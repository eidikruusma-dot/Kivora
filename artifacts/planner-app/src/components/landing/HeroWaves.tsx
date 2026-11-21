/**
 * Soft, flowing "silk ribbon" background shapes for the hero — a
 * stylised, fully-vector take on the reference illustration's purple
 * 3D waves. True photographic 3D isn't achievable in hand-written CSS/
 * SVG, so depth here comes from layering: several overlapping gradient
 * ribbons at different blur amounts (each a separate <svg>, blurred via
 * the same plain CSS `blur-*` utility the rest of this page already
 * uses for its glow blobs — SVG-native <filter> elements turned out to
 * render unreliably here, so this avoids them entirely), plus thin
 * brighter "gloss" strokes with almost no blur running along each
 * ribbon's upper edge. Purely decorative: aria-hidden, no layout
 * impact, tall enough to flow behind the phone and the floating cards
 * below it.
 */
export default function HeroWaves({ className = '' }: { className?: string }) {
  const defs = (
    <defs>
      <linearGradient id="kv-wave-1" x1="0%" y1="0%" x2="100%" y2="60%">
        <stop offset="0%" stopColor="#DDD3FE" />
        <stop offset="45%" stopColor="#A78BFA" />
        <stop offset="100%" stopColor="#6F5AE8" />
      </linearGradient>
      <linearGradient id="kv-wave-2" x1="100%" y1="0%" x2="0%" y2="80%">
        <stop offset="0%" stopColor="#8B5CF6" />
        <stop offset="60%" stopColor="#7C5CF0" />
        <stop offset="100%" stopColor="#C4B5FD" />
      </linearGradient>
      <linearGradient id="kv-wave-3" x1="0%" y1="20%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E9E2FF" />
        <stop offset="100%" stopColor="#B8A6FB" />
      </linearGradient>
      <radialGradient id="kv-wave-glow" cx="50%" cy="28%" r="55%">
        <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
      </radialGradient>
    </defs>
  )

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 1200 1400" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 w-full h-full">
        {defs}
        <rect x="0" y="0" width="1200" height="1400" fill="url(#kv-wave-glow)" />
      </svg>

      {/* back ribbon — widest, softest, sits furthest back, concentrated
          around the phone rather than directly behind the headline so
          the text up top stays easy to read. Oversized slightly (-4%
          inset) and given the page's existing slow float animation
          (the same kv-landing-float-1 keyframe used elsewhere, not a
          new one) so the gentle motion never reveals an edge. */}
      <svg
        viewBox="0 0 1200 1400"
        preserveAspectRatio="xMidYMin slice"
        className="kv-landing-float-1 absolute -inset-[4%] w-[108%] h-[108%] blur-3xl"
      >
        {defs}
        <path
          d="M -150 420 C 150 280, 420 620, 760 420 S 1250 280, 1400 460"
          fill="none"
          stroke="url(#kv-wave-1)"
          strokeWidth="260"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>

      {/* middle ribbon — flows down the right side, past the phone */}
      <svg
        viewBox="0 0 1200 1400"
        preserveAspectRatio="xMidYMin slice"
        className="kv-landing-float-2 absolute -inset-[4%] w-[108%] h-[108%] blur-3xl"
      >
        {defs}
        <path
          d="M 650 300 C 950 440, 880 700, 1100 900 S 1300 1180, 1050 1360"
          fill="none"
          stroke="url(#kv-wave-2)"
          strokeWidth="220"
          strokeLinecap="round"
          opacity="0.42"
        />
      </svg>

      {/* front, lighter ribbon — flows down the left side */}
      <svg viewBox="0 0 1200 1400" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 w-full h-full blur-3xl">
        {defs}
        <path
          d="M 180 360 C 60 540, 260 620, 120 860 S -40 1180, 180 1340"
          fill="none"
          stroke="url(#kv-wave-3)"
          strokeWidth="200"
          strokeLinecap="round"
          opacity="0.35"
        />
      </svg>

      {/* gloss highlights — thin, bright, soft-edged strokes along each
          ribbon's upper edge; kept subtle so they read as a sheen, not
          a second set of shapes competing with the content */}
      <svg viewBox="0 0 1200 1400" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 w-full h-full blur-xl">
        <path
          d="M -140 350 C 160 220, 430 540, 770 350 S 1250 220, 1400 400"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M 610 260 C 900 370, 840 630, 1050 820 S 1260 1080, 1020 1260"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.25"
        />
      </svg>
    </div>
  )
}
