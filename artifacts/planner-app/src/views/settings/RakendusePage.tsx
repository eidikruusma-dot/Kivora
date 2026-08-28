import { useState, useEffect } from 'react'
import { ArrowLeft, Info, ShieldCheck, FileText, ChevronRight } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { BUILD_COMMIT } from '@/lib/buildInfo'

// ── App constants ──────────────────────────────────────────────────────────────
// Update these when the app version or branding changes.

const APP_NAME = 'Kivora'
const APP_VERSION = '1.0.0'
const APP_DEVELOPER = 'Eidi Kruusmaa'
const APP_COPYRIGHT = `© ${new Date().getFullYear()} Eidi Kruusmaa`

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#F0F0F0]">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F36]">{title}</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-[#F0F0F0]">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <span className="text-sm text-[#64748B]">{label}</span>
      <span className="text-sm font-medium text-[#1A1F36] text-right">{value}</span>
    </div>
  )
}

function LinkRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-[#FAFAFA] transition-colors group text-left"
    >
      <div className="flex items-center gap-3">
        <span className="text-[#94A3B8] group-hover:text-[#6F5AE8] transition-colors">
          {icon}
        </span>
        <span className="text-sm font-medium text-[#1A1F36]">{label}</span>
      </div>
      <ChevronRight
        size={15}
        strokeWidth={2}
        className="text-[#CBD5E1] group-hover:text-[#6F5AE8] transition-colors flex-shrink-0"
      />
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function RakendusePage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const handlePrivacyPolicy = () => {
    // TODO: navigate to Privacy Policy page
    window.open('/privacy', '_blank', 'noopener,noreferrer')
  }

  const handleTermsOfService = () => {
    // TODO: navigate to Terms of Service page
    window.open('/terms', '_blank', 'noopener,noreferrer')
  }

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
            {t('appInfo.title', lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t('appInfo.subtitle', lang)}
          </p>
        </div>

        {/* About card */}
        <SectionCard
          icon={<Info size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t('appInfo.about.title', lang)}
          description={t('appInfo.about.desc', lang)}
        >
          <InfoRow label={t('appInfo.app.name', lang)} value={APP_NAME} />
          <InfoRow label={t('appInfo.app.version', lang)} value={APP_VERSION} />
          <InfoRow label={t('appInfo.app.build', lang)} value={BUILD_COMMIT} />
          <InfoRow label={t('appInfo.app.developer', lang)} value={APP_DEVELOPER} />
          <InfoRow label={t('appInfo.app.copyright', lang)} value={APP_COPYRIGHT} />
        </SectionCard>

        {/* Legal card */}
        <SectionCard
          icon={<ShieldCheck size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t('appInfo.legal.title', lang)}
          description={t('appInfo.legal.desc', lang)}
        >
          <LinkRow
            icon={<ShieldCheck size={17} strokeWidth={1.8} />}
            label={t('appInfo.legal.privacy', lang)}
            onClick={handlePrivacyPolicy}
          />
          <LinkRow
            icon={<FileText size={17} strokeWidth={1.8} />}
            label={t('appInfo.legal.terms', lang)}
            onClick={handleTermsOfService}
          />
        </SectionCard>
      </div>
    </div>
  )
}
