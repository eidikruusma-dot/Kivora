import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, X } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t, type TranslationKey } from '@/lib/translations'
import AppCard from '@/components/ui/AppCard'
import ProgressBar from '@/components/ui/ProgressBar'
import { PLAN_TEMPLATES, getTemplateIcon, type PlanTemplate } from '@/data/planTemplates'
import {
  usePlans,
  usePlansLoading,
  addPlan,
  computePlanProgress,
  createPlanItemsFromTemplate,
  formatDateRange,
  isValidPlanTitle,
  isValidPlanDateRange,
  type Plan,
} from '@/lib/plansStore'

type PlansTab = 'myPlans' | 'templates'

const TABS: { id: PlansTab; labelKey: TranslationKey }[] = [
  { id: 'myPlans', labelKey: 'plans.tab.myPlans' },
  { id: 'templates', labelKey: 'plans.tab.templates' },
]

const COLOR_SWATCHES = [
  { color: '#6F5AE8', bg: '#EDE9FB' },
  { color: '#16A34A', bg: '#DCFCE7' },
  { color: '#2563EB', bg: '#DBEAFE' },
  { color: '#CA8A04', bg: '#FEF9C3' },
  { color: '#0D9488', bg: '#CCFBF1' },
  { color: '#DC2626', bg: '#FEE2E2' },
  { color: '#F97316', bg: '#FFF0E6' },
  { color: '#64748B', bg: '#F1F5F9' },
]

interface CreateForm {
  title: string
  color: string
  startDate: string
  endDate: string
}

const EMPTY_FORM: CreateForm = {
  title: '',
  color: COLOR_SWATCHES[0].color,
  startDate: '',
  endDate: '',
}

export default function PlansPage() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [activeTab, setActiveTab] = useState<PlansTab>('myPlans')
  const [modalOpen, setModalOpen] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState<PlanTemplate | null>(null)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const plans = usePlans()
  const plansLoading = usePlansLoading()

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  function openCreateModal(template: PlanTemplate | null) {
    setCreatingTemplate(template)
    setForm(
      template
        ? { title: t(template.titleKey, lang), color: template.defaultColor, startDate: '', endDate: '' }
        : EMPTY_FORM,
    )
    setFormError('')
    setModalOpen(true)
  }

  function closeCreateModal() {
    if (saving) return
    setModalOpen(false)
    setCreatingTemplate(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleCreatePlan() {
    if (saving) return

    const title = form.title.trim()
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
      const now = Date.now()
      const newPlan: Plan = {
        id: `plan-${now}-${Math.random().toString(36).slice(2, 7)}`,
        type: creatingTemplate ? creatingTemplate.type : 'blank',
        title,
        color: form.color,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        items: creatingTemplate ? createPlanItemsFromTemplate(creatingTemplate, lang) : [],
        createdAt: now,
        updatedAt: now,
      }
      await addPlan(newPlan)
      setModalOpen(false)
      setCreatingTemplate(null)
      setForm(EMPTY_FORM)
      setActiveTab('myPlans')
    } catch {
      setFormError(t('plans.modal.errorSave', lang))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('plans.title', lang)}</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{t('plans.subtitle', lang)}</p>
        </div>
        <button
          onClick={() => setActiveTab('templates')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} />
          {t('plans.create', lang)}
        </button>
      </div>

      {/* Tabs + content */}
      <AppCard className="border border-[#ECECF2]">
        <div className="flex border-b border-[#ECECF2] px-5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative whitespace-nowrap px-3 py-4 text-sm font-medium transition-colors mr-2 ${
                activeTab === tab.id
                  ? 'text-[#6F5AE8]'
                  : 'text-[#94A3B8] hover:text-[#1A1F36]'
              }`}
            >
              {t(tab.labelKey, lang)}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6F5AE8] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'myPlans' ? (
            plansLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[#6F5AE8]" />
              </div>
            ) : plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 gap-1.5">
                <p className="text-sm font-semibold text-[#1A1F36]">{t('plans.empty.title', lang)}</p>
                <p className="text-sm text-[#94A3B8]">{t('plans.empty.desc', lang)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {plans.map((plan) => {
                  const Icon = getTemplateIcon(plan.type)
                  const { percent } = computePlanProgress(plan)
                  const dateRange = formatDateRange(plan, lang)
                  return (
                    <button
                      key={plan.id}
                      onClick={() => navigate(`/app/plans/${plan.id}`)}
                      className="bg-white rounded-2xl overflow-hidden p-4 border border-[#E8ECF0] flex flex-col gap-3 text-left transition-colors hover:border-[#6F5AE8] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${plan.color}1A`, color: plan.color }}
                        >
                          <Icon size={20} strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1A1F36] truncate">{plan.title}</p>
                          {dateRange && (
                            <p className="text-xs text-[#94A3B8] mt-0.5">{dateRange}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <ProgressBar value={percent} color={plan.color} />
                        <p className="text-xs text-[#94A3B8] mt-1.5">
                          {t('plans.card.progressLabel', lang).replace('{percent}', String(percent))}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <div>
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wide mb-3">
                {t('plans.templates.heading', lang)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PLAN_TEMPLATES.map((template) => {
                  const { type, icon: Icon, titleKey, descriptionKey, accentColor, accentBg } = template
                  const isBlank = type === 'blank'
                  return (
                    <button
                      key={type}
                      onClick={() => openCreateModal(isBlank ? null : template)}
                      className={`flex items-start gap-3 p-4 rounded-2xl border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 ${
                        isBlank
                          ? 'border-dashed border-[#D1D5DB] hover:border-[#6F5AE8] hover:bg-[#F8F7FF]'
                          : 'border-[#E8ECF0] hover:border-[#6F5AE8] hover:shadow-sm'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: accentBg, color: accentColor }}
                      >
                        <Icon size={20} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1A1F36]">{t(titleKey, lang)}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{t(descriptionKey, lang)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </AppCard>

      {/* Create blank plan modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={closeCreateModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-modal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
              <h2 id="plan-modal-title" className="text-base font-semibold text-[#1A1F36]">
                {t(creatingTemplate ? 'plans.modal.createFromTemplateTitle' : 'plans.modal.title', lang)}
              </h2>
              <button
                onClick={closeCreateModal}
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
                <label htmlFor="plan-modal-name" className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('plans.modal.nameLabel', lang)} <span className="text-[#E11D48]">*</span>
                </label>
                <input
                  id="plan-modal-name"
                  type="text"
                  value={form.title}
                  onChange={(e) => { setForm({ ...form, title: e.target.value }); setFormError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleCreatePlan() }}
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
                  {COLOR_SWATCHES.map((c) => (
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
                onClick={closeCreateModal}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('plans.modal.cancel', lang)}
              </button>
              <button
                onClick={handleCreatePlan}
                disabled={!isValidPlanTitle(form.title) || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {t('plans.modal.create', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
