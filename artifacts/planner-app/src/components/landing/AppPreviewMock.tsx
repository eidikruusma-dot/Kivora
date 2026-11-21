import { CheckSquare } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

/**
 * A clearly-illustrative, static preview of the real Tasks list UI —
 * never a live screenshot (no account is created or read to produce
 * this), but styled to match the real app's own TasksWidget exactly
 * (checkbox shape/colour, priority label colour, row layout), so it
 * accurately represents how the feature actually looks. The caption
 * underneath labels it explicitly as a sample view.
 */
const SAMPLE_ROWS: { key: 'landing.preview.task1' | 'landing.preview.task2' | 'landing.preview.task3'; priority: 'high' | 'medium' | 'low'; done: boolean }[] = [
  { key: 'landing.preview.task1', priority: 'high', done: false },
  { key: 'landing.preview.task2', priority: 'medium', done: false },
  { key: 'landing.preview.task3', priority: 'low', done: true },
]

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-orange-500',
  medium: 'text-orange-400',
  low: 'text-slate-400',
}

export default function AppPreviewMock({ lang }: { lang: AppLang }) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-[0_20px_50px_-20px_rgba(111,90,232,0.35)] overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[#F1F0EC]">
          <div className="w-6 h-6 rounded-lg bg-[#EDE9FB] flex items-center justify-center">
            <CheckSquare size={13} className="text-[#6F5AE8]" />
          </div>
          <span className="text-xs font-bold text-[#1A1F36]">{t('landing.feat.tasks.title', lang)}</span>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {SAMPLE_ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-2.5">
              <div
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                  row.done ? 'bg-[#6F5AE8] border-[#6F5AE8]' : 'border-[#D1D5DB] bg-white'
                }`}
              >
                {row.done && (
                  <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className={`flex-1 text-[13px] truncate ${row.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                {t(row.key, lang)}
              </span>
              {!row.done && (
                <span className={`text-[11px] font-medium flex-shrink-0 ${PRIORITY_COLOR[row.priority]}`}>
                  {t(`tasks.priority.${row.priority}`, lang)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-[11px] text-[#94A3B8] mt-2.5">{t('landing.preview.caption', lang)}</p>
    </div>
  )
}
