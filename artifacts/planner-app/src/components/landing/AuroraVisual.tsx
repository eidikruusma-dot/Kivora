import type { AppLang } from '@/lib/languageStore'
import OrganicBlob from '@/components/landing/OrganicBlob'
import AuroraDashboardPanel from '@/components/landing/AuroraDashboardPanel'
import { AiFragment, CalendarFragment, TaskFragment, GoalFragment, HabitFragment } from '@/components/landing/AuroraGlassFragments'

/**
 * The hero's right-side "interlocked scene" from the approved Kavand D
 * mockup (`.visual`) — organic 3D blobs, floating glass UI fragments and
 * the main dashboard panel overlapping into one composition, not three
 * stacked layers. Every element's position/size is a percentage of this
 * box (converted from the mockup's exact 820×840px reference
 * coordinates), so the whole scene scales fluidly with its container
 * instead of being pinned to one reference width — the box keeps the
 * mockup's own aspect ratio (820/840) so the percentages stay correct at
 * any rendered size.
 *
 * Used above the hero's `sm` breakpoint; AuroraVisualMobile (below)
 * is the separate, simplified composition used under it, exactly as the
 * approved mockup's own `.visual` / `.visual-mobile` split.
 */
export function AuroraVisualDesktop({ lang }: { lang: AppLang }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: '820 / 840' }}>
      <OrganicBlob
        className="kv-aurora-float-a z-[1]"
        style={{
          left: '-4.878%', top: '-4.762%', width: '36.585%', height: '38.095%',
          borderRadius: '58% 42% 63% 37% / 46% 55% 42% 58%',
          background: 'radial-gradient(circle at 32% 26%, #ECE2FF 0%, #A78BFA 46%, #7C3AED 80%, #5B21B6 100%)',
          animationDuration: '8.5s', ['--r' as string]: '-6deg',
        }}
      />

      <OrganicBlob
        className="kv-aurora-float-a z-[1]"
        style={{
          left: '68.293%', top: '51.190%', width: '34.146%', height: '35.714%',
          borderRadius: '48% 52% 55% 45% / 52% 48% 45% 55%',
          background: 'radial-gradient(circle at 34% 30%, #FBE4F1 0%, #E8A9D1 42%, #C77DB0 76%, #9D5B8D 100%)',
          animationDuration: '10s', animationDelay: '1.1s', ['--r' as string]: '4deg',
        }}
      />
      <OrganicBlob
        className="kv-aurora-float-b z-[1]"
        style={{
          left: '75.366%', top: '7.143%', width: '17.073%', height: '15.476%',
          borderRadius: '50% 50% 42% 58% / 55% 55% 45% 45%',
          background: 'radial-gradient(circle at 34% 30%, #EAF1FD 0%, #AFC9F6 42%, #7FA3E8 78%, #5E7FC9 100%)',
          animationDuration: '7s', animationDelay: '.4s',
        }}
      />
      <OrganicBlob
        className="kv-aurora-float-b z-[1]"
        style={{
          left: '34.146%', top: '-1.190%', width: '10.976%', height: '10%',
          borderRadius: '50% 50% 40% 60% / 60% 50% 50% 40%',
          background: 'radial-gradient(circle at 30% 24%, #F8E7F2 0%, #F0B9DE 44%, #D683B8 80%, #B2608F 100%)',
          animationDuration: '6.5s', animationDelay: '2s',
        }}
      />

      <AiFragment
        lang={lang}
        className="absolute kv-aurora-float-a z-[7] w-[23.171%]"
        style={{ left: '7.317%', top: '0%', transform: 'rotate(-4deg)', animationDuration: '7.5s', animationDelay: '.2s', ['--r' as string]: '-4deg' }}
      />
      <CalendarFragment
        lang={lang}
        className="absolute kv-aurora-float-a z-[8] w-[17.073%]"
        style={{ left: '0%', top: '16.667%', transform: 'rotate(-7deg)', animationDuration: '9s', animationDelay: '.8s', ['--r' as string]: '-7deg' }}
      />
      <TaskFragment
        lang={lang}
        className="absolute kv-aurora-float-b z-[9] w-[15.854%]"
        style={{ left: '84.146%', top: '4.762%', transform: 'rotate(5deg)', animationDuration: '6.8s', animationDelay: '1.3s' }}
      />
      <GoalFragment
        lang={lang}
        className="absolute kv-aurora-float-a z-[7] w-[20.732%]"
        style={{ left: '7.317%', top: '77.381%', transform: 'rotate(6deg)', animationDuration: '9.5s', animationDelay: '.5s', ['--r' as string]: '6deg' }}
      />
      <HabitFragment
        lang={lang}
        className="absolute kv-aurora-float-b z-[8] w-[26.829%]"
        style={{ left: '56.098%', top: '79.762%', transform: 'rotate(-4deg)', animationDuration: '8s', animationDelay: '.9s' }}
      />

      <OrganicBlob
        className="kv-aurora-float-b z-[6] shadow-[0_14px_24px_-8px_rgba(124,92,252,0.4)]"
        style={{
          left: '81.098%', top: '63.690%', width: '6.098%', height: '5.476%',
          borderRadius: '46% 54% 60% 40% / 50% 50% 50% 50%',
          background: 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #CBB8FF 55%, #9574F5 100%)',
          animationDuration: '6s', animationDelay: '1.6s',
        }}
      />

      <div className="absolute z-[4]" style={{ left: '17.073%', top: '8.571%', width: '65.854%' }}>
        <AuroraDashboardPanel lang={lang} />
      </div>
    </div>
  )
}

/**
 * Simplified mobile scene (`.visual-mobile` in the mockup): two small
 * background blobs behind a full-width dashboard panel, then a plain
 * non-overlapping row of two glass fragments below — the full desktop
 * cluster has no room to stay legible or non-overlapping this narrow.
 */
export function AuroraVisualMobile({ lang }: { lang: AppLang }) {
  return (
    <div className="relative w-full max-w-[420px] mx-auto pt-[10px]">
      <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none opacity-90">
        <OrganicBlob
          className="kv-aurora-float-b"
          style={{
            top: '-30px', left: '-40px', width: '170px', height: '190px',
            borderRadius: '58% 42% 63% 37% / 46% 55% 42% 58%',
            background: 'radial-gradient(circle at 32% 26%, #ECE2FF 0%, #A78BFA 46%, #7C3AED 80%, #5B21B6 100%)',
            animationDuration: '8s',
          }}
        />
        <OrganicBlob
          className="kv-aurora-float-b"
          style={{
            bottom: '-40px', right: '-40px', width: '150px', height: '140px',
            borderRadius: '48% 52% 55% 45% / 52% 48% 45% 55%',
            background: 'radial-gradient(circle at 34% 30%, #FBE4F1 0%, #E8A9D1 42%, #C77DB0 76%, #9D5B8D 100%)',
            animationDuration: '9.5s', animationDelay: '.6s',
          }}
        />
      </div>

      <div className="relative z-[2]">
        <AuroraDashboardPanel lang={lang} compact />
      </div>

      <div className="relative z-[2] flex gap-[10px] justify-center mt-[10px]">
        <GoalFragment lang={lang} className="flex-1 max-w-[150px]" compact />
        <AiFragment lang={lang} className="flex-1 max-w-[150px]" compact />
      </div>
    </div>
  )
}
