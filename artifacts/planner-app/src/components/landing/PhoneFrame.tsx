import type { ReactNode } from 'react'

/**
 * A phone bezel wrapper for the hero's front-left device. All content
 * inside is real, live React (AppPreviewMock), never a static
 * screenshot. Chrome is sized in percentages (not fixed pixels) so it
 * stays proportionate whether the phone renders large (standalone) or
 * small (as the front device in the three-device composition). Width
 * is driven entirely by the parent.
 */
export default function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative rounded-[14%] bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[3%] shadow-[0_40px_90px_-25px_rgba(76,47,203,0.5)]">
        {/* camera notch */}
        <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[38%] h-[5%] bg-[#0F1220] rounded-b-[40%] z-10 flex items-center justify-center">
          <div className="w-[12%] aspect-square rounded-full bg-[#2A3150]" />
        </div>

        <div className="relative rounded-[10%] bg-white overflow-hidden aspect-[9/18.5]">
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
