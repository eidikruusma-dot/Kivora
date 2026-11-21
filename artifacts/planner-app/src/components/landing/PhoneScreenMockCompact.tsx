import { CheckSquare } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A simplified, static stand-in for the phone screen, used only when the
 * phone renders very small (mobile hero, one of three overlapping
 * devices — commonly under ~90px wide). The full interactive demo
 * (AppPreviewMock, with its tab row, AI banner, animated task list and
 * pause/play control) is built for a much wider screen and becomes
 * illegible or overlapping at that size, so below the hero's `sm`
 * breakpoint we swap in this instead. AppPreviewMock itself is untouched
 * and still renders standalone at `sm` and up (both on its own and as
 * the front device in the desktop three-device composition).
 *
 * Content reuses the same real translation keys/sample data as the full
 * demo and DesktopScreenMock — never invented copy — just fewer rows.
 * Sized with `cqw` so it stays legible across 320–430px viewports.
 */
export default function PhoneScreenMockCompact({ lang }: { lang: AppLang }) {
  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden [container-type:inline-size]">
      {/* top padding clears the PhoneFrame's camera notch, which overlaps
          roughly the top ~11cqw of the screen area */}
      <div className="flex items-center justify-between px-[8cqw] pt-[13cqw] pb-[2cqw] flex-shrink-0">
        <span className="text-[9cqw] font-bold text-[#1A1F36] truncate leading-none">{t('landing.preview.greeting', lang)}</span>
      </div>
      <div className="px-[6cqw] flex-shrink-0">
        <span className="inline-flex items-center px-[3cqw] py-[1.4cqw] rounded-full bg-[#2E1065] text-white text-[5.5cqw] font-bold tracking-wide uppercase whitespace-nowrap">
          {t('landing.preview.sampleBadge', lang)}
        </span>
      </div>

      <div className="px-[6cqw] pt-[6cqw] flex-1 min-h-0 flex flex-col gap-[4cqw]">
        <div className="bg-[#F8F7FC] rounded-[3cqw] p-[5cqw] flex flex-col gap-[3.5cqw]">
          <div className="flex items-center gap-[3cqw]">
            <CheckSquare className="w-[7cqw] h-[7cqw] text-[#6F5AE8] flex-shrink-0" />
            <span className="text-[7cqw] font-bold text-[#1A1F36] leading-none">{t('dash.tasks.title', lang)}</span>
          </div>
          <div className="flex items-center gap-[2.5cqw]">
            <span className="w-[5cqw] h-[5cqw] rounded-[1cqw] border border-[#D1D5DB] flex-shrink-0" />
            <span className="text-[6cqw] text-[#1A1F36] truncate leading-tight">{t('landing.preview.task1', lang)}</span>
          </div>
          <div className="flex items-center gap-[2.5cqw]">
            <span className="w-[5cqw] h-[5cqw] rounded-[1cqw] border border-[#D1D5DB] flex-shrink-0" />
            <span className="text-[6cqw] text-[#1A1F36] truncate leading-tight">{t('landing.preview.task2', lang)}</span>
          </div>
        </div>

        <div className="bg-[#F8F7FC] rounded-[3cqw] p-[5cqw] flex flex-col gap-[3cqw]">
          <span className="text-[7cqw] font-bold text-[#1A1F36] leading-none">{t('dash.calendar.title', lang)}</span>
          <div className="flex items-center gap-[2.5cqw]">
            <span className="w-[2.5cqw] h-[2.5cqw] rounded-full bg-[#6F5AE8] flex-shrink-0" />
            <span className="text-[5.5cqw] text-[#94A3B8] flex-shrink-0 whitespace-nowrap">10:00</span>
            <span className="text-[6cqw] text-[#1A1F36] truncate leading-tight">{t('landing.preview.event1', lang)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
