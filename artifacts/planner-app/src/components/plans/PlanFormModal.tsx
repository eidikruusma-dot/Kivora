import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t, type TranslationKey } from '@/lib/translations'
import { isValidPlanTitle, isValidPlanDateRange } from '@/lib/plansStore'

export const PLAN_COLOR_SWATCHES = [
  { color: '#6F5AE8', bg: '#EDE9FB' },
  { color: '#16A34A', bg: '#DCFCE7' },
  { color: '#2563EB', bg: '#DBEAFE' },
  { color: '#CA8A04', bg: '#FEF9C3' },
  { color: '#0D9488', bg: '#CCFBF1' },
  { color: '#DC2626', bg: '#FEE2E2' },
  { color: '#F97316', bg: '#FFF0E6' },
  { color: '#64748B', bg: '#F1F5F9' },
]

export interface PlanFormValues {
  title: string
  color: string
  startDate: string
  endDate: string
}

interface PlanFormModalProps {
  lang: AppLang
  headerTitleKey: TranslationKey
  submitLabelKey: TranslationKey
  saveErrorKey: TranslationKey
  initialValues: PlanFormValues
  onCancel: () => void
  onSubmit: (values: PlanFormValues) => Promise<void>
  onSuccess: () => void
}

/**
 * The one shared plan name/color/dates form — used both to create a plan
 * (blank or from a template) and to edit an existing plan's general
 * details. Owns its own field state, validation, saving/error state, and
 * double-submit guard, so neither caller re-implements any of it.
 */
export default function PlanFormModal({
  lang,
  headerTitleKey,
  submitLabelKey,
  saveErrorKey,
  initialValues,
  onCancel,
  onSubmit,
  onSuccess,
}: PlanFormModalProps) {
  const [form, setForm] = useState<PlanFormValues>(initialValues)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleCancel() {
    if (saving) return
    onCancel()
  }

  async function handleSubmit() {
    if (saving) return

    if (!isValidPlanTitle(form.title)) {
      setFormError(t('plans.modal.errorName', lang))
      return
    }
    if (!isValidPlanDateRange(form.startDate, form.endDate)) {
      setFormError(t('plans.modal.errorDateRange', lang))
      return
    }

    setSaving(true)
    setFormError('')
    try {
      await onSubmit({
        title: form.title.trim(),
        color: form.color,
        startDate: form.startDate,
        endDate: form.endDate,
      })
      onSuccess()
    } catch {
      setFormError(t(saveErrorKey, lang))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.4)' }}
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-form-modal-title"
        className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
          <h2 id="plan-form-modal-title" className="text-base font-semibold text-[#1A1F36]">
            {t(headerTitleKey, lang)}
          </h2>
          <button
            onClick={handleCancel}
            aria-label="Close"
            disabled={saving}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Name */}
          <div>
            <label htmlFor="plan-form-name" className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('plans.modal.nameLabel', lang)} <span className="text-[#E11D48]">*</span>
            </label>
            <input
              id="plan-form-name"
              type="text"
              value={form.title}
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setFormError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
              placeholder={t('plans.modal.namePlaceholder', lang)}
              className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('plans.modal.colorLabel', lang)}
            </label>
            <div className="flex flex-wrap gap-2">
              {PLAN_COLOR_SWATCHES.map((c) => (
                <button
                  key={c.color}
                  onClick={() => setForm({ ...form, color: c.color })}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    form.color === c.color ? 'ring-2 ring-offset-2 ring-[#1A1F36] scale-110' : 'hover:scale-110'
                  }`}
                  style={{ background: c.color }}
                />
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('plans.modal.startDateLabel', lang)}
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setFormError('') }}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('plans.modal.endDateLabel', lang)}
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => { setForm({ ...form, endDate: e.target.value }); setFormError('') }}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-[#E11D48]">{formError}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
          >
            {t('plans.modal.cancel', lang)}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValidPlanTitle(form.title) || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t(submitLabelKey, lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
