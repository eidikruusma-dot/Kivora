import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Sun, Moon, Monitor, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  DEFAULT_APPEARANCE,
  PRIMARY_COLORS,
  THEME_MODES,
  CARD_RADII,
  DENSITIES,
  applyAppearance,
  getAppearanceSettings,
  saveAppearanceSettings,
} from '@/lib/appearanceStore'
import type { AppearanceSettings, ThemeMode, PrimaryColor, CardRadius, Density } from '@/types'

export default function AppearancePage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getAppearanceSettings(user.uid)
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        applyAppearance(s)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [user])

  const update = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      applyAppearance(next)
      return next
    })
    setSaved(false)
  }, [])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await saveAppearanceSettings(user.uid, settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const themeIcon = (icon: string) => {
    if (icon === 'sun') return <Sun size={18} strokeWidth={1.8} />
    if (icon === 'moon') return <Moon size={18} strokeWidth={1.8} />
    return <Monitor size={18} strokeWidth={1.8} />
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        Tagasi seadetesse
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">Välimus</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Kohanda Kivora kujundust oma eelistuste järgi. Kõik muudatused rakenduvad kohe.
          </p>
        </div>

        {/* Theme mode */}
        <Section title="Teema" description="Vali rakenduse põhitaust">
          <div className="grid grid-cols-3 gap-3">
            {THEME_MODES.map((opt) => {
              const active = settings.themeMode === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => update({ themeMode: opt.value as ThemeMode })}
                  className={`relative flex flex-col items-center gap-2 py-5 rounded-xl border-2 transition-all ${
                    active
                      ? 'border-[#6F5AE8] bg-[#F4F2FF]'
                      : 'border-[#ECECF2] bg-white hover:border-[#CBD5E1]'
                  }`}
                >
                  {themeIcon(opt.icon)}
                  <span className="text-sm font-medium text-[#1A1F36]">{opt.label}</span>
                  {active && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6F5AE8] flex items-center justify-center">
                      <Check size={12} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Section>

        {/* Primary color */}
        <Section title="Põhivärv" description="Vali rakenduse aktsentvärv. Lilla on vaikimisi.">
          <div className="flex flex-wrap gap-3">
            {(Object.keys(PRIMARY_COLORS) as PrimaryColor[]).map((key) => {
              const c = PRIMARY_COLORS[key]
              const active = settings.primaryColor === key
              return (
                <button
                  key={key}
                  onClick={() => update({ primaryColor: key })}
                  className={`relative flex items-center gap-2.5 h-12 px-4 rounded-xl border-2 transition-all ${
                    active ? 'border-transparent' : 'border-[#ECECF2] hover:border-[#CBD5E1]'
                  }`}
                  style={active ? { background: hexToRgba(c.value, 0.1), boxShadow: `inset 0 0 0 2px ${c.value}` } : undefined}
                >
                  <span
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: c.value }}
                  >
                    {active && <Check size={13} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm font-medium text-[#1A1F36]">{c.label}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Card radius */}
        <Section title="Kaartide ümardus" description="Määra, kui ümarad on kaardid ja nupud">
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(CARD_RADII) as CardRadius[]).map((key) => {
              const r = CARD_RADII[key]
              const active = settings.cardRadius === key
              return (
                <button
                  key={key}
                  onClick={() => update({ cardRadius: key })}
                  className={`flex flex-col items-center gap-2 py-4 px-3 border-2 transition-all ${
                    active
                      ? 'border-[#6F5AE8] bg-[#F4F2FF]'
                      : 'border-[#ECECF2] bg-white hover:border-[#CBD5E1]'
                  }`}
                  style={{ borderRadius: r.value }}
                >
                  <div
                    className="w-12 h-8 bg-[#6F5AE8]/15 border border-[#6F5AE8]/30"
                    style={{ borderRadius: r.value }}
                  />
                  <span className="text-xs font-medium text-[#1A1F36]">{r.label}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Density */}
        <Section title="Vaate tihedus" description="Vali, kui kompaktselt elemente kuvatakse">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(DENSITIES) as Density[]).map((key) => {
              const d = DENSITIES[key]
              const active = settings.density === key
              return (
                <button
                  key={key}
                  onClick={() => update({ density: key })}
                  className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all ${
                    active
                      ? 'border-[#6F5AE8] bg-[#F4F2FF]'
                      : 'border-[#ECECF2] bg-white hover:border-[#CBD5E1]'
                  }`}
                >
                  <span className="text-sm font-semibold text-[#1A1F36]">{d.label}</span>
                  <span className="text-xs text-[#94A3B8] leading-relaxed">{d.description}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Live preview */}
        <Section title="Eelvaade" description="Nii näeb rakendus sinu valikutega välja">
          <div className="rounded-xl border border-[#ECECF2] bg-[#F4F3EF] p-5">
            <div
              className="bg-white border border-[#ECECF2] p-5"
              style={{
                borderRadius: 'var(--kv-radius-card, 0.75rem)',
                padding: 'var(--kv-density-pad, 1.25rem)',
              }}
            >
              <div className="flex items-center justify-between mb-4" style={{ gap: 'var(--kv-density-gap, 0.75rem)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                    style={{ background: 'var(--kv-primary, #6F5AE8)' }}
                  >
                    K
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1F36]">Kivora ülesanne</p>
                    <p className="text-xs text-[#94A3B8]">Tähtaeg: täna</p>
                  </div>
                </div>
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{
                    background: 'var(--kv-primary-soft, rgba(111,90,232,0.12))',
                    color: 'var(--kv-primary, #6F5AE8)',
                  }}
                >
                  Prioriteet
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#F1F0F8] overflow-hidden mb-4">
                <div
                  className="h-full rounded-full"
                  style={{ width: '65%', background: 'var(--kv-primary, #6F5AE8)' }}
                />
              </div>
              <button
                className="h-9 px-4 text-white text-sm font-medium transition-colors"
                style={{
                  background: 'var(--kv-primary, #6F5AE8)',
                  borderRadius: 'var(--kv-radius-card, 0.75rem)',
                }}
              >
                Salvesta
              </button>
            </div>
          </div>
        </Section>

        {/* Save bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <Check size={16} />
              Salvestatud
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !loaded}
            className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Salvestan...' : 'Salvesta eelistused'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-6">
      <h2 className="text-base font-semibold text-[#1A1F36]">{title}</h2>
      {description && <p className="text-xs text-[#94A3B8] mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
