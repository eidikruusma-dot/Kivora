import type { ReactNode } from 'react'

/**
 * A simple, clean tablet bezel wrapper — positioned smaller and behind
 * the laptop in the hero's three-device composition. All content
 * inside is real Kivora UI (an illustrative, static calendar preview),
 * never a photographic render. Width is driven entirely by the parent.
 */
export default function TabletFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative rounded-2xl bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[4%] shadow-[0_30px_70px_-25px_rgba(76,47,203,0.45)]">
        <div className="absolute top-[2%] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#3A4268]" />
        <div className="relative rounded-md overflow-hidden bg-white aspect-[3/4]">
          <div className="absolute inset-0">{children}</div>
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 25%, rgba(255,255,255,0) 75%, rgba(255,255,255,0.06) 100%)' }}
          />
        </div>
      </div>
    </div>
  )
}
