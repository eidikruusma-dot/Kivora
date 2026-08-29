import { useState, useEffect } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ── Release data ──────────────────────────────────────────────────────────────
// To add a new release: prepend an entry to this array.
// The first entry automatically receives the "Latest" badge.

interface ReleaseEntry {
  version: string
  date: string          // ISO date string, displayed as-is
  title: { et: string; en: string }
  description: { et: string; en: string }
  items: { et: string; en: string }[]
}

const RELEASES: ReleaseEntry[] = [
  {
    version: '1.0.0',
    date: '2026-08-06',
    title: {
      et: 'Ametlik avalik väljalase',
      en: 'Official Public Release',
    },
    description: {
      et: 'Kivora on nüüd ametlikult saadaval. Haldage ülesandeid, märkmeid, harjumusi, eesmärke, kalendrit, rahandust ja palju muud ühes kohas.',
      en: 'Kivora is now officially available. Manage your tasks, notes, habits, goals, calendar, finances and more in one place.',
    },
    items: [
      { et: 'Ülesannete haldus prioriteetide, tähtaegade ja alamülesannetega', en: 'Task management with priorities, due dates and subtasks' },
      { et: 'Kalender päeva-, nädala- ja kuuvaadetega', en: 'Calendar with day, week and month views' },
      { et: 'Rikkaliku tekstiga märkmete redaktor', en: 'Rich text notes editor' },
      { et: 'Harjumuste jälgimine', en: 'Habit tracking' },
      { et: 'Eesmärgid edusammude jälgimisega', en: 'Goals with progress tracking' },
      { et: 'Isikliku rahanduse moodul (tulud, kulud ja eelarved)', en: 'Personal finance module (income, expenses and budgets)' },
      { et: 'AI-assistent', en: 'AI Assistant' },
      { et: 'Täielik seadete süsteem', en: 'Complete Settings system' },
      { et: 'Andmete eksport ja varundamine', en: 'Data export and backup' },
      { et: 'Mitmekeelne tugi (eesti ja inglise keel)', en: 'Multi-language support (Estonian & English)' },
      { et: 'Tume ja hele teema', en: 'Dark mode and Light mode' },
      { et: 'Privaatsuse, turvalisuse ja teavituste seaded', en: 'Privacy, Security and Notifications settings' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-01',
    title: {
      et: 'Seaded ja lokaliseerimine',
      en: 'Settings & Localization',
    },
    description: {
      et: 'Seadete sektsiooni põhjalik ümberkujundamine täieliku lokaliseerimistoe ja isikupärastamisvõimalustega.',
      en: 'Major redesign of the Settings section with full localization support and personalization options.',
    },
    items: [
      { et: 'Täielik eesti ja inglise keele lokaliseerimine', en: 'Full Estonian and English localization' },
      { et: 'Teema ja välimuse seaded', en: 'Theme and appearance settings' },
      { et: 'Kuupäeva ja kellaaja eelistused', en: 'Date & time preferences' },
      { et: 'Teavituste seaded', en: 'Notification settings' },
      { et: 'Turvalisuse ja privaatsuse seaded', en: 'Security & privacy settings' },
      { et: 'Andmete eksport', en: 'Data export' },
      { et: 'Varundamise haldus', en: 'Backup management' },
      { et: 'Abi ja tugi', en: 'Help & Support' },
      { et: 'Mis on uut leht', en: 'What\'s New page' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-05-01',
    title: {
      et: 'Põhilised tootlikkuse moodulid',
      en: 'Core Productivity Modules',
    },
    description: {
      et: 'Kivora esimene avalik eelvaade põhiliste tootlikkuse moodulitega.',
      en: 'First public preview of Kivora with the essential productivity modules.',
    },
    items: [
      { et: 'Ülesanded', en: 'Tasks' },
      { et: 'Märkmed', en: 'Notes' },
      { et: 'Kalender', en: 'Calendar' },
      { et: 'Harjumused', en: 'Habits' },
      { et: 'Eesmärgid', en: 'Goals' },
      { et: 'Firebase autentimine', en: 'Firebase Authentication' },
      { et: 'Külgriba navigatsioon', en: 'Sidebar navigation' },
      { et: 'Kasutajaprofiil', en: 'User profile' },
    ],
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function MisOnUutPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t('whatsNew.title', lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('whatsNew.subtitle', lang)}
          </p>
        </div>

        {/* Release list */}
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="whatsnew-timeline-line absolute left-[19px] top-6 bottom-6 w-px bg-[#F0F0F0]" aria-hidden />

          <div className="space-y-4">
            {RELEASES.map((release, index) => {
              const isLatest = index === 0
              return (
                <div key={release.version} className="relative flex gap-5">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 flex flex-col items-center pt-5">
                    <div
                      className={`w-[10px] h-[10px] rounded-full border-2 z-10 ${
                        isLatest
                          ? 'bg-[#6F5AE8] border-[#6F5AE8]'
                          : 'bg-white border-[#CBD5E1]'
                      }`}
                    />
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden mb-1">
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[#F0F0F0]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isLatest ? '#EDE9FB' : '#F8FAFC',
                            color: isLatest ? '#6F5AE8' : '#94A3B8',
                          }}
                        >
                          <Sparkles size={18} strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-[#1A1F36]">
                              v{release.version}
                            </span>
                            {isLatest && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-[11px] font-semibold border border-[#D8D1F8]">
                                {t('whatsNew.badge.latest', lang)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-[#1A1F36] mt-0.5 truncate">
                            {release.title[lang]}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-6 py-5 space-y-4">
                      <p className="text-sm text-[#475569] leading-relaxed">
                        {release.description[lang]}
                      </p>

                      <div>
                        <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide mb-2.5">
                          {t('whatsNew.improvements', lang)}
                        </p>
                        <ul className="space-y-1.5">
                          {release.items.map((item, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2.5 text-sm text-[#475569]"
                            >
                              <span
                                className="mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background: isLatest ? '#6F5AE8' : '#CBD5E1',
                                }}
                                aria-hidden
                              />
                              {item[lang]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
