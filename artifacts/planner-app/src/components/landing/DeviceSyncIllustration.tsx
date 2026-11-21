import { RefreshCw } from 'lucide-react'

/**
 * Glass card illustrating that Kivora's own layout adapts to whatever
 * screen it's shown on — three mini device silhouettes (laptop, tablet,
 * phone) each with a correctly-proportioned screen shape (wide
 * landscape vs. narrow portrait) showing the same abstract row-of-bars
 * "content", plus a small sync badge. This replaces an earlier, much
 * plainer flat-icon row that visually repeated the hero's three-device
 * composition one-to-one; this one is deliberately smaller, flatter and
 * schematic (no real screenshots) so it reads as a distinct supporting
 * graphic, in the same glassy/lavender language as the floating feature
 * cards (FloatingFeatureCard) rather than the hero's photographic bezels.
 *
 * Purely decorative — aria-hidden, no layout impact. The adjacent
 * `syncTitle`/`syncSubtitle` copy ("Synced across all your devices" /
 * "On your phone, tablet, and computer") is the actual accessible
 * description, and was already checked against what the app can
 * actually promise: Kivora is a Firebase-backed account, so the same
 * data is genuinely available on any device signed into that account —
 * this illustration does not add any further claim beyond that.
 */
export default function DeviceSyncIllustration({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[28px] bg-white/55 backdrop-blur-xl border border-white/70 shadow-[0_30px_60px_-25px_rgba(111,90,232,0.45)] px-5 py-6 ${className}`}
    >
      <div className="flex items-end justify-center gap-3">
        {/* laptop — wide, landscape screen. Fixed (not %) padding: these
            icons have a fixed width smaller than their flex-row parent,
            and percentage padding resolves against that parent's width,
            not the icon's own — at these sizes that made the padding
            many times too large and swallowed the inner screen. */}
        <div className="w-16 rounded-[10px] bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[4px] pb-[6px] flex-shrink-0">
          <div className="rounded-[3px] bg-white aspect-[16/10] flex flex-col justify-center gap-[8%] p-[10%]">
            <span className="h-[14%] w-[55%] rounded-full bg-[#EDE9FB]" />
            <span className="h-[14%] w-[75%] rounded-full bg-[#F1EFFB]" />
            <span className="h-[14%] w-[40%] rounded-full bg-[#EDE9FB]" />
          </div>
        </div>

        {/* sync badge */}
        <div className="mb-2.5 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_12px_24px_-10px_rgba(111,90,232,0.5)] ring-1 ring-[#E4DEFB] flex-shrink-0">
          <RefreshCw size={14} className="text-[#6F5AE8]" strokeWidth={2.5} />
        </div>

        {/* tablet — medium, portrait screen */}
        <div className="w-11 rounded-[10px] bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[3px] flex-shrink-0">
          <div className="rounded-[3px] bg-white aspect-[3/4] flex flex-col justify-center gap-[8%] p-[10%]">
            <span className="h-[10%] w-[60%] rounded-full bg-[#EDE9FB]" />
            <span className="h-[10%] w-[80%] rounded-full bg-[#F1EFFB]" />
            <span className="h-[10%] w-[45%] rounded-full bg-[#EDE9FB]" />
          </div>
        </div>

        {/* phone — narrowest, tallest portrait screen */}
        <div className="w-7 rounded-[16%] bg-gradient-to-br from-[#2A3150] via-[#1A1F36] to-[#0F1220] p-[2px] flex-shrink-0">
          <div className="rounded-[10%] bg-white aspect-[9/18.5] flex flex-col justify-center gap-[10%] p-[12%]">
            <span className="h-[10%] w-[70%] rounded-full bg-[#EDE9FB]" />
            <span className="h-[10%] w-[55%] rounded-full bg-[#F1EFFB]" />
          </div>
        </div>
      </div>
    </div>
  )
}
