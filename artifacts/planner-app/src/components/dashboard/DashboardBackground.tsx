/**
 * Soft, subtle pearl/lavender wash behind the whole "Minu päev" view —
 * scoped entirely to Dashboard.tsx (absolutely positioned inside its own
 * scroll container) so it never leaks into AppLayout's shared background
 * or any other route. Much lower-key than the landing page's
 * AuroraBackground: low opacity, no "breathing" scale, just two gently
 * drifting blurred washes (kv-aurora-float-a/-b, already
 * prefers-reduced-motion-safe) so widget content stays the clear focus.
 * Purely decorative — aria-hidden, fixed behind content via z-0, no
 * layout impact (absolute + inset-0, pointer-events-none).
 */
export default function DashboardBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <span
        className="kv-aurora-float-a absolute rounded-full blur-[100px] opacity-45 dark:opacity-30 w-[460px] h-[460px] -top-32 -left-32 sm:w-[680px] sm:h-[680px] sm:-top-52 sm:-left-52"
        style={{ background: 'radial-gradient(circle at 42% 40%, #C4B5FD 0%, rgba(196,181,253,.4) 50%, transparent 78%)', animationDuration: '22s' }}
      />
      <span
        className="kv-aurora-float-b absolute rounded-full blur-[100px] opacity-35 dark:opacity-22 w-[400px] h-[400px] -bottom-32 -right-24 sm:w-[640px] sm:h-[640px] sm:-bottom-52 sm:-right-44"
        style={{ background: 'radial-gradient(circle at 56% 42%, #F3B4D6 0%, rgba(243,180,214,.35) 50%, transparent 78%)', animationDuration: '26s' }}
      />
      <span
        className="hidden sm:block absolute rounded-full blur-[90px] opacity-25 dark:opacity-15 w-[420px] h-[420px] top-[20%] right-[8%]"
        style={{ background: 'radial-gradient(circle at 50% 50%, #FDE68A 0%, rgba(253,230,138,.3) 50%, transparent 78%)' }}
      />
    </div>
  )
}
