import { CheckSquare, Calendar as CalendarIcon, Target, Flame } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A clearly-illustrative, static preview of the real desktop dashboard
 * (src/views/Dashboard.tsx: a greeting/stat strip followed by a grid of
 * widget cards) — never a live screenshot, no account created or read.
 * Shown on the laptop screen in the hero's three-device composition to
 * make clear Kivora works as a full desktop app, not just on a phone.
 * Sample data only; the "Näidis" badge labels it explicitly.
 *
 * All text/spacing uses `cqw` (container-query width units, relative to
 * this component's own rendered width) rather than fixed px, because the
 * laptop frame renders at very different absolute sizes depending on
 * context — large standalone on desktop, much smaller as one of three
 * devices on mobile. Fixed px sizing looked fine at one scale and broke
 * (wrapped/truncated) at the other; cqw keeps every line proportioned
 * the same way at any rendered width.
 */
export default function DesktopScreenMock({ lang }: { lang: AppLang }) {
  const stats = [
    { icon: CheckSquare, color: 'text-blue-500', bg: 'bg-blue-50', value: '6/8', label: t('hero.tasks', lang) },
    { icon: CalendarIcon, color: 'text-sky-500', bg: 'bg-sky-50', value: '2', label: t('hero.events', lang) },
    { icon: Target, color: 'text-orange-500', bg: 'bg-orange-50', value: '78%', label: t('hero.goals', lang) },
    { icon: Flame, color: 'text-emerald-500', bg: 'bg-emerald-50', value: '80%', label: t('hero.habits', lang) },
  ]

  return (
    <div className="h-full w-full bg-[#F8F7FC] flex flex-col overflow-hidden [container-type:inline-size]">
      {/* top bar */}
      <div className="flex items-center justify-between px-[2.8cqw] py-[1.4cqw] bg-white border-b border-[#F1EFFB] flex-shrink-0">
        <span className="text-[1.75cqw] font-bold text-[#1A1F36] whitespace-nowrap">{t('landing.preview.greeting', lang)}</span>
        <span className="inline-flex items-center px-[1cqw] py-[0.5cqw] rounded-full bg-[#2E1065] text-white text-[1.05cqw] font-bold tracking-wide uppercase whitespace-nowrap">
          {t('landing.preview.sampleBadge', lang)}
        </span>
      </div>

      <div className="p-[2.1cqw] flex flex-col gap-[1.75cqw] flex-1 min-h-0">
        {/* hero strip — mirrors the real HeroCard's stat row */}
        <div className="bg-white rounded-lg px-[2.1cqw] py-[1.4cqw] grid grid-cols-4 gap-[1.4cqw] flex-shrink-0">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-[1.05cqw] min-w-0">
              <div className={`w-[3.5cqw] h-[3.5cqw] rounded-md ${s.bg} flex items-center justify-center flex-shrink-0 p-[0.7cqw]`}>
                <s.icon className={`w-full h-full ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[1.6cqw] font-bold text-[#1A1F36] leading-none whitespace-nowrap">{s.value}</p>
                <p className="text-[1.05cqw] text-[#94A3B8] truncate leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* widget grid — mirrors the real Dashboard's two-row card grid */}
        <div className="grid grid-cols-2 gap-[1.4cqw] flex-1 min-h-0">
          <div className="bg-white rounded-lg p-[1.75cqw] flex flex-col min-h-0">
            <p className="text-[1.4cqw] font-bold text-[#1A1F36] mb-[1.05cqw] whitespace-nowrap">{t('dash.tasks.title', lang)}</p>
            <div className="space-y-[0.7cqw]">
              <div className="flex items-center gap-[0.7cqw]">
                <span className="w-[1.4cqw] h-[1.4cqw] rounded-sm border border-[#D1D5DB] flex-shrink-0" />
                <span className="text-[1.25cqw] text-[#1A1F36] truncate">{t('landing.preview.task1', lang)}</span>
              </div>
              <div className="flex items-center gap-[0.7cqw]">
                <span className="w-[1.4cqw] h-[1.4cqw] rounded-sm border border-[#D1D5DB] flex-shrink-0" />
                <span className="text-[1.25cqw] text-[#1A1F36] truncate">{t('landing.preview.task2', lang)}</span>
              </div>
              <div className="flex items-center gap-[0.7cqw]">
                <span className="w-[1.4cqw] h-[1.4cqw] rounded-sm bg-[#6F5AE8] flex-shrink-0" />
                <span className="text-[1.25cqw] text-[#94A3B8] line-through truncate">{t('landing.preview.task3', lang)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-[1.75cqw] flex flex-col min-h-0">
            <p className="text-[1.4cqw] font-bold text-[#1A1F36] mb-[1.05cqw] whitespace-nowrap">{t('dash.calendar.title', lang)}</p>
            <div className="space-y-[0.7cqw]">
              <div className="flex items-center gap-[0.7cqw]">
                <span className="w-[0.7cqw] h-[0.7cqw] rounded-full bg-[#6F5AE8] flex-shrink-0" />
                <span className="text-[1.15cqw] text-[#94A3B8] flex-shrink-0 whitespace-nowrap">10:00</span>
                <span className="text-[1.25cqw] text-[#1A1F36] truncate">{t('landing.preview.event1', lang)}</span>
              </div>
              <div className="flex items-center gap-[0.7cqw]">
                <span className="w-[0.7cqw] h-[0.7cqw] rounded-full bg-[#EC4899] flex-shrink-0" />
                <span className="text-[1.15cqw] text-[#94A3B8] flex-shrink-0 whitespace-nowrap">18:30</span>
                <span className="text-[1.25cqw] text-[#1A1F36] truncate">{t('landing.preview.event2', lang)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-[1.75cqw] flex flex-col min-h-0">
            <p className="text-[1.4cqw] font-bold text-[#1A1F36] mb-[1.05cqw] whitespace-nowrap">{t('dash.goals.title', lang)}</p>
            <div className="flex items-center justify-between mb-[0.7cqw]">
              <span className="text-[1.25cqw] text-[#1A1F36] truncate pr-[0.7cqw]">{t('landing.preview.goal1', lang)}</span>
              <span className="text-[1.25cqw] font-bold text-[#6F5AE8] whitespace-nowrap">65%</span>
            </div>
            <div className="h-[0.7cqw] rounded-full bg-[#F1EFFB] overflow-hidden">
              <div className="h-full rounded-full bg-[#6F5AE8]" style={{ width: '65%' }} />
            </div>
          </div>

          <div className="bg-white rounded-lg p-[1.75cqw] flex flex-col min-h-0">
            <p className="text-[1.4cqw] font-bold text-[#1A1F36] mb-[1.05cqw] whitespace-nowrap">{t('dash.habits.title', lang)}</p>
            <div className="flex items-center gap-[0.7cqw]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`w-[1.75cqw] h-[1.75cqw] rounded-full ${i < 4 ? 'bg-emerald-500' : 'bg-[#F1EFFB]'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
