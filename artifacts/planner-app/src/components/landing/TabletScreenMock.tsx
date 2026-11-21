import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A clearly-illustrative, static preview of the real calendar month
 * view (src/components/calendar/MonthView.tsx: weekday header + day
 * grid with colour-coded events) — never a live screenshot, no account
 * created or read. Shown on the tablet screen in the hero's
 * three-device composition. Sample data only; the "Näidis" badge
 * labels it explicitly. Colours match the real CALENDARS palette used
 * across the app (purple "mine", blue "work/school", pink "training").
 *
 * Sizes use `clamp(floor, cqw, ceiling)` rather than plain `cqw`: the
 * tablet is the narrowest device in the composition (as little as
 * ~90px wide on mobile), where the pure proportional value alone drops
 * under comfortable reading size — the floor keeps the title, weekday
 * letters and day numbers legible there.
 *
 * `compact` additionally drops the grid from 5 weeks to 4 — needed to
 * leave room for the bigger day numbers/dots at mobile width without
 * the fixed-aspect screen clipping the last row. At `sm` and up
 * `compact` is always false and the full 5-week month (unchanged)
 * renders as before.
 */
const WEEKDAYS: Record<AppLang, string[]> = {
  et: ['E', 'T', 'K', 'N', 'R', 'L', 'P'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
}

// A 5x7 sample month grid. `today` gets the purple ring; `events` lists
// which colour dots appear on that cell (purely illustrative data).
const DAYS: { n: number; muted?: boolean; today?: boolean; events?: string[] }[] = [
  { n: 29, muted: true }, { n: 30, muted: true }, { n: 1 }, { n: 2 }, { n: 3, events: ['#6F5AE8'] }, { n: 4 }, { n: 5 },
  { n: 6 }, { n: 7 }, { n: 8, events: ['#3B82F6'] }, { n: 9 }, { n: 10 }, { n: 11 }, { n: 12, events: ['#EC4899'] },
  { n: 13 }, { n: 14 }, { n: 15, today: true, events: ['#6F5AE8', '#EC4899'] }, { n: 16 }, { n: 17 }, { n: 18, events: ['#10B981'] }, { n: 19 },
  { n: 20 }, { n: 21, events: ['#3B82F6'] }, { n: 22 }, { n: 23 }, { n: 24 }, { n: 25, events: ['#6F5AE8'] }, { n: 26 },
  { n: 27 }, { n: 28 }, { n: 29 }, { n: 30 }, { n: 31, events: ['#F59E0B'] }, { n: 1, muted: true }, { n: 2, muted: true },
]

export default function TabletScreenMock({ lang, compact = false }: { lang: AppLang; compact?: boolean }) {
  const days = compact ? DAYS.slice(0, 28) : DAYS

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden [container-type:inline-size]">
      <div className="flex items-center justify-between px-[3.2cqw] py-[2.1cqw] border-b border-[#F1EFFB] flex-shrink-0">
        <span className="text-[clamp(10px,3.2cqw,16px)] font-bold text-[#1A1F36] whitespace-nowrap">{t('dash.calendar.title', lang)}</span>
        <span className="inline-flex items-center px-[1.4cqw] py-[0.7cqw] rounded-full bg-[#2E1065] text-white text-[clamp(6px,2.1cqw,10px)] font-bold tracking-wide uppercase whitespace-nowrap">
          {t('landing.preview.sampleBadge', lang)}
        </span>
      </div>

      <div className="grid grid-cols-7 border-b border-[#F1EFFB] flex-shrink-0">
        {WEEKDAYS[lang].map((d, i) => (
          <div key={i} className="text-center text-[clamp(8px,2.3cqw,12px)] font-semibold text-[#475569] py-[1.1cqw]">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 min-h-0">
        {days.map((day, i) => (
          <div key={i} className="border-b border-r border-[#F6F4FC] flex flex-col items-center justify-start pt-[1.1cqw] gap-[0.5cqw]">
            <span
              className={`text-[clamp(8px,2.3cqw,12px)] w-[clamp(15px,6.4cqw,24px)] h-[clamp(15px,6.4cqw,24px)] flex items-center justify-center rounded-full ${
                day.today ? 'bg-[#6F5AE8] text-white font-bold' : day.muted ? 'text-[#D1D5DB]' : 'text-[#1A1F36]'
              }`}
            >
              {day.n}
            </span>
            {day.events && (
              <div className="flex items-center gap-[0.9cqw]">
                {day.events.map((c, j) => (
                  <span key={j} className="w-[clamp(2.5px,1.1cqw,4px)] h-[clamp(2.5px,1.1cqw,4px)] rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
