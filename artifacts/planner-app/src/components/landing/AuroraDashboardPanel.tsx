import { CheckSquare, Target, Flame } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * The hero's main, substantial dashboard preview from the approved
 * Kavand D mockup (`.dash`) — a plain elevated "app window" card (a thin
 * top bar with three small colored dots and a label, no laptop/tablet/
 * phone bezel) showing a greeting, three stat tiles and two widgets
 * (a short task checklist and a goal-progress bar). Sample data only;
 * the "NÄIDIS"/"Sample" badge labels it explicitly, same convention as
 * the rest of the landing page's illustrative previews.
 *
 * Sizes use `clamp(floor, cqw, ceiling)` — proportional to this
 * component's own rendered width via a container query — because the
 * same panel renders both large on desktop (~540px) and much smaller,
 * full-width, on mobile (~340-390px): a plain cqw value alone would drop
 * under comfortable reading size at the small end, and a fixed px value
 * would look oversized or wrap awkwardly at the large end.
 */
export default function AuroraDashboardPanel({ lang }: { lang: AppLang }) {
  return (
    <div className="w-full h-full bg-white rounded-[clamp(16px,3cqw,26px)] shadow-[0_50px_90px_-26px_rgba(60,40,130,0.34),0_10px_26px_-8px_rgba(60,40,130,0.15)] border border-[#F1ECFF] overflow-hidden [container-type:inline-size]">
      {/* top bar — plain browser-chrome dots, no device frame */}
      <div className="flex items-center gap-[7px] px-[clamp(14px,4cqw,22px)] py-[clamp(11px,3cqw,16px)] border-b border-[#F1ECFF]">
        <span className="w-[9px] h-[9px] rounded-full bg-[#FFADAD] flex-shrink-0" />
        <span className="w-[9px] h-[9px] rounded-full bg-[#FFD98E] flex-shrink-0" />
        <span className="w-[9px] h-[9px] rounded-full bg-[#A8E6C1] flex-shrink-0" />
        <span className="ml-[10px] text-[clamp(10px,2.3cqw,12.5px)] font-semibold text-[#9A94B8] truncate">{t('landing.aurora.dashLabel', lang)}</span>
      </div>

      <div className="px-[clamp(16px,5.5cqw,30px)] pt-[clamp(14px,5cqw,28px)] pb-[clamp(16px,5.5cqw,32px)]">
        <div className="flex items-center justify-between mb-[clamp(14px,4cqw,22px)]">
          <div className="text-[clamp(15px,3.7cqw,20px)] font-bold text-[#1A1F36] truncate">{t('landing.preview.greeting', lang)}</div>
          <span className="text-[clamp(9px,2cqw,11px)] font-extrabold tracking-wide uppercase text-[#6D28D9] bg-[#8B5CF6]/10 px-[clamp(8px,2cqw,11px)] py-[clamp(3px,1cqw,5px)] rounded-full flex-shrink-0 ml-2">
            {t('landing.preview.sampleBadge', lang)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-[clamp(8px,2.6cqw,14px)] mb-[clamp(14px,4cqw,22px)]">
          <div className="bg-[#FAF8FF] border border-[#F1ECFF] rounded-[clamp(10px,3cqw,16px)] p-[clamp(8px,2.6cqw,14px)]">
            <CheckSquare className="w-[clamp(13px,3.3cqw,18px)] h-[clamp(13px,3.3cqw,18px)] text-[#6D28D9] mb-[clamp(5px,1.5cqw,8px)]" />
            <div className="text-[clamp(13px,3.9cqw,21px)] font-extrabold text-[#1A1F36] leading-none">12/15</div>
            <div className="text-[clamp(9px,2.2cqw,12px)] font-semibold text-[#4A4F6A] mt-1 truncate">{t('hero.tasks', lang)}</div>
          </div>
          <div className="bg-[#FAF8FF] border border-[#F1ECFF] rounded-[clamp(10px,3cqw,16px)] p-[clamp(8px,2.6cqw,14px)]">
            <Target className="w-[clamp(13px,3.3cqw,18px)] h-[clamp(13px,3.3cqw,18px)] text-[#DC6B9C] mb-[clamp(5px,1.5cqw,8px)]" />
            <div className="text-[clamp(13px,3.9cqw,21px)] font-extrabold text-[#1A1F36] leading-none">68%</div>
            <div className="text-[clamp(9px,2.2cqw,12px)] font-semibold text-[#4A4F6A] mt-1 truncate">{t('hero.goals', lang)}</div>
          </div>
          <div className="bg-[#FAF8FF] border border-[#F1ECFF] rounded-[clamp(10px,3cqw,16px)] p-[clamp(8px,2.6cqw,14px)]">
            <Flame className="w-[clamp(13px,3.3cqw,18px)] h-[clamp(13px,3.3cqw,18px)] text-[#F59E0B] mb-[clamp(5px,1.5cqw,8px)]" />
            <div className="text-[clamp(13px,3.9cqw,21px)] font-extrabold text-[#1A1F36] leading-none">84%</div>
            <div className="text-[clamp(9px,2.2cqw,12px)] font-semibold text-[#4A4F6A] mt-1 truncate">{t('hero.habits', lang)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-[clamp(10px,2.6cqw,14px)]">
          <div className="bg-[#FAF8FF] border border-[#F1ECFF] rounded-[clamp(10px,3cqw,16px)] p-[clamp(11px,3.3cqw,18px)]">
            <p className="text-[clamp(11px,2.4cqw,13px)] font-bold text-[#1A1F36] mb-[clamp(8px,2.2cqw,12px)]">{t('dash.tasks.title', lang)}</p>
            <div className="flex items-center gap-[clamp(7px,1.8cqw,10px)] text-[clamp(11px,2.5cqw,13.5px)] text-[#B6B1CF] line-through py-[clamp(4px,1cqw,6px)]">
              <span className="w-[clamp(13px,3cqw,16px)] h-[clamp(13px,3cqw,16px)] rounded-[5px] flex items-center justify-center bg-[#2FBE8F] flex-shrink-0">
                <CheckSquare className="w-[65%] h-[65%] text-white" strokeWidth={3} />
              </span>
              <span className="truncate">{t('landing.aurora.task1', lang)}</span>
            </div>
            <div className="flex items-center gap-[clamp(7px,1.8cqw,10px)] text-[clamp(11px,2.5cqw,13.5px)] text-[#4A4F6A] py-[clamp(4px,1cqw,6px)]">
              <span className="w-[clamp(13px,3cqw,16px)] h-[clamp(13px,3cqw,16px)] rounded-[5px] border-[1.6px] border-[#D9D2F2] flex-shrink-0" />
              <span className="truncate">{t('landing.aurora.task2', lang)}</span>
            </div>
            <div className="hidden sm:flex items-center gap-[clamp(7px,1.8cqw,10px)] text-[clamp(11px,2.5cqw,13.5px)] text-[#4A4F6A] py-[clamp(4px,1cqw,6px)]">
              <span className="w-[clamp(13px,3cqw,16px)] h-[clamp(13px,3cqw,16px)] rounded-[5px] border-[1.6px] border-[#D9D2F2] flex-shrink-0" />
              <span className="truncate">{t('landing.aurora.task3', lang)}</span>
            </div>
          </div>

          <div className="bg-[#FAF8FF] border border-[#F1ECFF] rounded-[clamp(10px,3cqw,16px)] p-[clamp(11px,3.3cqw,18px)]">
            <p className="text-[clamp(11px,2.4cqw,13px)] font-bold text-[#1A1F36] mb-[clamp(8px,2.2cqw,12px)] truncate">
              {t('dash.goals.title', lang)}: {t('landing.aurora.goalName', lang)}
            </p>
            <div className="w-full h-[clamp(6px,1.6cqw,9px)] rounded-full bg-[#ECE6FB] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#A78BFA] to-[#6D28D9]" style={{ width: '68%' }} />
            </div>
            <div className="flex items-center justify-between text-[clamp(9px,2.2cqw,12px)] font-semibold text-[#4A4F6A] mt-[clamp(5px,1.5cqw,8px)]">
              <span>68% {t('landing.aurora.goalDoneSuffix', lang)}</span>
              <span>17 / 25 {t('landing.aurora.goalDaysUnit', lang)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
