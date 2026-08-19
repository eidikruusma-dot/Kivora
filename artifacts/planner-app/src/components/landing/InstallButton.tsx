import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

interface InstallButtonProps {
  lang: AppLang
  className?: string
  onAction?: () => void
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6F5AE8]">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6F5AE8]">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6F5AE8]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// ── Step row ──────────────────────────────────────────────────────────────────

function Step({ num, icon, text }: { num: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-xs font-bold flex items-center justify-center mt-0.5">
        {num}
      </span>
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <span className="text-sm text-[#374151] leading-snug">{text}</span>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ── iOS dialog ────────────────────────────────────────────────────────────────

function IOSDialog({ lang, onClose }: { lang: AppLang; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <img src="/kivora-symbol.png" alt="" aria-hidden style={{ height: 28, width: 'auto' }} />
        <h3 className="text-base font-bold text-[#1A1F36]">{t('pub.install.ios.title', lang)}</h3>
      </div>
      <div className="space-y-4">
        <Step num={1} icon={<ShareIcon />} text={t('pub.install.ios.step1', lang)} />
        <Step num={2} icon={<AddIcon />}   text={t('pub.install.ios.step2', lang)} />
        <Step num={3} icon={<CheckIcon />} text={t('pub.install.ios.step3', lang)} />
      </div>
      <button
        onClick={onClose}
        className="mt-6 w-full py-2.5 rounded-xl bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors text-white text-sm font-semibold"
      >
        {t('pub.install.ios.close', lang)}
      </button>
    </Modal>
  )
}

// ── "Not ready" dialog (Android Chrome: prompt captured too late) ──────────────

function NotReadyDialog({
  lang,
  onRetry,
  onClose,
}: {
  lang: AppLang
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <img src="/kivora-symbol.png" alt="" aria-hidden style={{ height: 28, width: 'auto' }} />
        <h3 className="text-base font-bold text-[#1A1F36]">{t('pub.install.notready.title', lang)}</h3>
      </div>
      <p className="text-sm text-[#64748B] leading-relaxed mb-5">
        {t('pub.install.notready.body', lang)}
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onRetry}
          className="w-full py-2.5 rounded-xl bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors text-white text-sm font-semibold"
        >
          {t('pub.install.notready.retry', lang)}
        </button>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl text-[#64748B] hover:text-[#374151] transition-colors text-sm"
        >
          {t('pub.install.notready.close', lang)}
        </button>
      </div>
    </Modal>
  )
}

// ── Unsupported-browser dialog ────────────────────────────────────────────────

function UnsupportedDialog({ lang, onClose }: { lang: AppLang; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <img src="/kivora-symbol.png" alt="" aria-hidden style={{ height: 28, width: 'auto' }} />
        <h3 className="text-base font-bold text-[#1A1F36]">{t('pub.install.other.title', lang)}</h3>
      </div>
      <p className="text-sm text-[#64748B] leading-relaxed mb-5">
        {t('pub.install.other.body', lang)}
      </p>
      <button
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-[#6F5AE8] hover:bg-[#5B4AD5] transition-colors text-white text-sm font-semibold"
      >
        {t('pub.install.other.close', lang)}
      </button>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstallButton({ lang, className = '', onAction }: InstallButtonProps) {
  const { state, triggerPrompt } = useInstallPrompt()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'ios' | 'notready' | 'unsupported' | null>(null)

  // ── Already installed ──────────────────────────────────────────────────────
  if (state === 'installed') {
    return (
      <button
        onClick={() => { onAction?.(); navigate('/app') }}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#6F5AE8] hover:text-[#5B4AD5] transition-colors ${className}`}
      >
        {t('pub.install.open', lang)}
      </button>
    )
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  const handleClick = async () => {
    onAction?.()

    if (state === 'ios') {
      setDialog('ios')
      return
    }

    if (state === 'promptable') {
      const outcome = await triggerPrompt()
      // 'accepted' → store marks installed, state re-renders to 'installed'
      // 'dismissed' → prompt cleared, state falls back to 'pending'
      // 'not-ready' → shouldn't happen when state === 'promptable', but guard anyway
      if (outcome === 'not-ready') setDialog('notready')
      return
    }

    // state === 'pending': browser may support PWA but prompt hasn't fired yet
    setDialog('notready')
  }

  // Retry handler inside the "not ready" dialog
  const handleRetry = async () => {
    if (state === 'promptable') {
      setDialog(null)
      const outcome = await triggerPrompt()
      if (outcome === 'not-ready') setDialog('notready')
    }
    // If still pending, keep the dialog open — user sees the manual instructions
  }

  return (
    <>
      {/* Button always rendered — no waiting for beforeinstallprompt */}
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#6F5AE8] hover:text-[#5B4AD5] transition-colors ${className}`}
      >
        <DownloadIcon />
        {t('pub.install.btn', lang)}
      </button>

      {dialog === 'ios' && (
        <IOSDialog lang={lang} onClose={() => setDialog(null)} />
      )}
      {dialog === 'notready' && (
        <NotReadyDialog
          lang={lang}
          onRetry={handleRetry}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'unsupported' && (
        <UnsupportedDialog lang={lang} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
