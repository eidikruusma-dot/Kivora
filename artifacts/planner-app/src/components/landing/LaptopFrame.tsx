import type { ReactNode } from 'react'

/**
 * A simple, clean laptop bezel wrapper — the hero's dominant, central
 * device. All content inside is real Kivora UI (an illustrative, static
 * dashboard preview), never a photographic render. Width is driven
 * entirely by the parent; this component only owns its own proportions
 * and chrome.
 */
export default function LaptopFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-full ${className}`}>
      {/* screen */}
      <div className="relative rounded-t-2xl bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[3%] shadow-[0_40px_90px_-25px_rgba(76,47,203,0.5)]">
        <div className="absolute top-[2%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#2A3150] ring-1 ring-[#3A4268]" />
        <div className="relative rounded-md overflow-hidden bg-white aspect-[16/10]">
          <div className="absolute inset-0">{children}</div>
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 20%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.06) 100%)' }}
          />
        </div>
      </div>

      {/* hinge */}
      <div className="h-[3px] bg-[#0F1220]" />

      {/* keyboard deck / base — slightly wider than the screen, tapered,
          to read as a laptop base seen from a front angle */}
      <div
        aria-hidden="true"
        className="h-[5%] min-h-[8px] mx-[-4%] bg-gradient-to-b from-[#2A3150] to-[#0F1220] rounded-b-md"
        style={{ clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0% 100%)' }}
      />
      <div aria-hidden="true" className="h-[2px] mx-[12%] bg-[#0F1220] rounded-b-full opacity-70" />
    </div>
  )
}
