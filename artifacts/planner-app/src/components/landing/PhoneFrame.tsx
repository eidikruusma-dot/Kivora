import type { ReactNode } from 'react'

/**
 * A phone bezel wrapper for the hero's centrepiece preview. All content
 * inside is real, live React (AppPreviewMock), never a static
 * screenshot. The frame itself is a stylised metallic-gradient bezel
 * with side buttons and a subtle glass sheen over the screen — plain
 * CSS/SVG, not a photographic render, but closer to a real device than
 * a flat border.
 */
export default function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[320px] sm:max-w-[340px] lg:max-w-[368px] ${className}`}>
      {/* side buttons */}
      <div className="absolute -left-[3px] top-24 w-[3px] h-8 rounded-l bg-[#0F1220]" />
      <div className="absolute -left-[3px] top-36 w-[3px] h-12 rounded-l bg-[#0F1220]" />
      <div className="absolute -right-[3px] top-28 w-[3px] h-16 rounded-r bg-[#0F1220]" />

      <div className="relative rounded-[46px] bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-3 shadow-[0_60px_120px_-30px_rgba(76,47,203,0.55)]">
        {/* camera notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#0F1220] rounded-b-2xl z-10 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-[#2A3150] ring-1 ring-[#3A4268]" />
        </div>

        <div className="relative rounded-[34px] bg-white overflow-hidden aspect-[9/18.5]">
          <div className="absolute inset-0">{children}</div>

          {/* glass sheen — a soft diagonal highlight, purely decorative,
              sits above the screen content but never blocks interaction
              (it's inside a preview, so there's nothing to click anyway) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 78%, rgba(255,255,255,0.08) 100%)' }}
          />
        </div>
      </div>
    </div>
  )
}
