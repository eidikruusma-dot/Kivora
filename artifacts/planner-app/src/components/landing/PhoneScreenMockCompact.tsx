import { CheckSquare, Sparkles } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A simplified, static stand-in for the phone screen, used only when the
 * phone renders very small (mobile hero, one of three overlapping
 * devices — commonly under ~100px wide). The full interactive demo
 * (AppPreviewMock, with its tab row, AI banner, animated task list and
 * pause/play control) is built for a much wider screen and becomes
 * illegible or overlapping at that size, so below the hero's `sm`
 * breakpoint we swap in this instead. AppPreviewMock itself is untouched
 * and still renders standalone at `sm` and up (both on its own and as
 * the front device in the desktop three-device composition).
 *
 * Content reuses the same real translation keys/sample data as the full
 * demo and DesktopScreenMock — never invented copy — just fewer rows.
 * Sizes use `clamp(floor, cqw, ceiling)` rather than plain `cqw` so text
 * stays legible even at this phone's smallest rendered widths (320–430px
 * viewports put the screen itself at roughly 70–100px wide).
 */
export default function PhoneScreenMockCompact({ lang }: { lang: AppLang }) {
  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden [container-type:inline-size]">
      {/* top padding clears the PhoneFrame's camera notch, which overlaps
          roughly the top ~11cqw of the screen area */}
      <div className="flex items-center justify-between px-[8cqw] pt-[13cqw] pb-[2cqw] flex-shrink-0">
        <span className="text-[clamp(10px,9cqw,15px)] font-bold text-[#1A1F36] truncate leading-none">{t('landing.preview.greeting', lang)}</span>
      </div>
      <div className="px-[6cqw] flex-shrink-0">
        <span className="inline-flex items-center px-[3cqw] py-[1.4cqw] rounded-full bg-[#2E1065] text-white text-[clamp(6.5px,5.5cqw,9px)] font-bold tracking-wide uppercase whitespace-nowrap">
          {t('landing.preview.sampleBadge', lang)}
        </span>
      </div>

      <div className="px-[6cqw] pt-[5cqw] flex-1 min-h-0 flex flex-col gap-[3.5cqw]">
        <div className="bg-[#F8F7FC] rounded-[3cqw] p-[4.5cqw] flex flex-col gap-[3cqw]">
          <div className="flex items-center gap-[2.5cqw]">
            <CheckSquare className="w-[clamp(9px,7cqw,13px)] h-[clamp(9px,7cqw,13px)] text-[#6F5AE8] flex-shrink-0" />
            <span className="text-[clamp(8.5px,7cqw,12px)] font-bold text-[#1A1F36] leading-none">{t('dash.tasks.title', lang)}</span>
          </div>
          <div className="flex items-center gap-[2cqw]">
            <span className="w-[clamp(6px,5cqw,8px)] h-[clamp(6px,5cqw,8px)] rounded-[1cqw] border border-[#D1D5DB] flex-shrink-0" />
            <span className="text-[clamp(7.5px,6cqw,10px)] text-[#1A1F36] truncate leading-tight">{t('landing.preview.task1', lang)}</span>
          </div>
        </div>

        <div className="bg-[#F8F7FC] rounded-[3cqw] p-[4.5cqw] flex flex-col gap-[2.5cqw]">
          <span className="text-[clamp(8.5px,7cqw,12px)] font-bold text-[#1A1F36] leading-none">{t('dash.calendar.title', lang)}</span>
          <div className="flex items-center gap-[2cqw]">
            <span className="w-[clamp(2.5px,2.5cqw,4px)] h-[clamp(2.5px,2.5cqw,4px)] rounded-full bg-[#6F5AE8] flex-shrink-0" />
            <span className="text-[clamp(7px,5.5cqw,9px)] text-[#475569] flex-shrink-0 whitespace-nowrap">10:00</span>
            <span className="text-[clamp(7.5px,6cqw,10px)] text-[#1A1F36] truncate leading-tight">{t('landing.preview.event1', lang)}</span>
          </div>
        </div>

        {/* compact AI-assistant pill — fills what used to be dead space
            at the bottom of the small phone, mirroring the full demo's
            AI banner style/colors/keys without its animation. */}
        <div className="rounded-[3cqw] bg-gradient-to-r from-[#6F5AE8] to-[#8B5CF6] p-[3.5cqw] flex items-center gap-[2.5cqw] flex-shrink-0">
          <div className="w-[clamp(14px,11cqw,20px)] h-[clamp(14px,11cqw,20px)] rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-[60%] h-[60%] text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[clamp(8px,6.5cqw,11px)] font-bold text-white leading-tight truncate">{t('nav.assistant', lang)}</p>
            <p className="text-[clamp(6.5px,5.5cqw,9px)] text-white/85 leading-tight truncate">{t('landing.preview.aiBannerPlanning', lang)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
