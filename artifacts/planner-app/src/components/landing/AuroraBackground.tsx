/**
 * Rich lavender-to-pink "aurora" light wash behind the Aurora Living
 * Premium hero — four large blurred radial-gradient washes (two of them
 * slowly "breathing": opacity + scale) plus a few tiny sparkle dots.
 * Ported directly from the approved Kavand D mockup's `.aurora`/`.a1-4`/
 * `.spark` rules, converted to Tailwind + the shared kv-aurora-breathe
 * keyframe (src/index.css), which is disabled under
 * prefers-reduced-motion like the rest of the landing page's motion.
 * Purely decorative — aria-hidden, no layout impact.
 */
export default function AuroraBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <span
        className="absolute rounded-full blur-[70px] opacity-70 w-[420px] h-[420px] -top-40 -left-40 max-[720px]:w-[420px] max-[720px]:h-[420px] max-[720px]:-top-40 max-[720px]:-left-40 sm:w-[820px] sm:h-[820px] sm:-top-80 sm:-left-56"
        style={{ background: 'radial-gradient(circle at 42% 40%, #8B5CF6 0%, rgba(139,92,246,.42) 48%, transparent 76%)' }}
      />
      <span
        className="kv-aurora-breathe absolute rounded-full blur-[70px] opacity-[.65] w-[400px] h-[400px] -top-28 -right-44 sm:w-[760px] sm:h-[760px] sm:-top-64 sm:-right-64"
        style={{ background: 'radial-gradient(circle at 56% 42%, #F3B4D6 0%, rgba(243,180,214,.4) 50%, transparent 76%)', animationDuration: '10s' }}
      />
      <span
        className="kv-aurora-breathe absolute rounded-full blur-[70px] opacity-55 w-[460px] h-[460px] -bottom-64 -left-16 sm:w-[820px] sm:h-[820px] sm:-bottom-[26rem] sm:left-[18%]"
        style={{ background: 'radial-gradient(circle at 50% 50%, #BFDBFE 0%, rgba(191,219,254,.38) 50%, transparent 78%)', animationDuration: '12.5s', animationDelay: '1.2s' }}
      />
      <span
        className="hidden sm:block absolute rounded-full blur-[70px] opacity-50 w-[520px] h-[520px] top-[140px] right-[10%]"
        style={{ background: 'radial-gradient(circle at 50% 50%, #C4B5FD 0%, rgba(196,181,253,.34) 52%, transparent 80%)' }}
      />
      <span className="absolute rounded-full bg-white blur-[1px] w-1.5 h-1.5 top-[210px] left-[48%] shadow-[0_0_16px_5px_rgba(167,139,250,0.5)]" />
      <span className="absolute rounded-full bg-white blur-[1px] w-[5px] h-[5px] top-[560px] left-[6%] shadow-[0_0_16px_5px_rgba(167,139,250,0.5)]" />
      <span className="absolute rounded-full bg-white blur-[1px] w-[5px] h-[5px] top-[120px] left-[60%] shadow-[0_0_16px_5px_rgba(167,139,250,0.5)]" />
    </div>
  )
}
