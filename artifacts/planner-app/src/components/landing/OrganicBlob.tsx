import type { CSSProperties } from 'react'

/**
 * One glossy, dimensional "organic 3D" blob shape from the approved
 * Kavand D mockup (`.blob` / `.blob::after`): an asymmetric border-radius
 * shape filled with a layered radial gradient (light centre fading to a
 * deep tone) plus a soft blurred white highlight ellipse for gloss, and a
 * slow independent float animation (`kv-aurora-float-a`/`-b`, defined in
 * src/index.css, disabled under prefers-reduced-motion).
 *
 * All sizing/position/gradient/animation timing is passed in via `style`
 * so each usage can reproduce the mockup's exact per-blob values —
 * percentages of its positioned ancestor, so the whole composition
 * scales fluidly instead of being pinned to one reference width.
 */
export default function OrganicBlob({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute pointer-events-none shadow-[0_30px_55px_-14px_rgba(91,33,182,0.34),0_10px_22px_rgba(91,33,182,0.18)] ${className}`}
      style={style}
    >
      <div
        className="absolute rounded-full bg-white/65 blur-[8px]"
        style={{ top: '16%', left: '18%', width: '40%', height: '28%' }}
      />
    </div>
  )
}
