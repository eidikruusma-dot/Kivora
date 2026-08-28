import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, ClipboardList } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t, type TranslationKey } from '@/lib/translations'
import AppCard from '@/components/ui/AppCard'
import ProgressBar from '@/components/ui/ProgressBar'
import PlanFormModal, { PLAN_COLOR_SWATCHES, type PlanFormValues } from '@/components/plans/PlanFormModal'
import WorkScheduleFormModal, { type WorkScheduleFormValues } from '@/components/plans/WorkScheduleFormModal'
import { PLAN_TEMPLATES, getTemplateIcon, type PlanTemplate } from '@/data/planTemplates'
import {
  usePlans,
  usePlansLoading,
  addPlan,
  generatePlanId,
  computePlanProgress,
  createPlanItemsFromTemplate,
  buildWorkScheduleItems,
  formatDateRange,
  type Plan,
} from '@/lib/plansStore'

type PlansTab = 'myPlans' | 'templates'

const TABS: { id: PlansTab; labelKey: TranslationKey }[] = [
  { id: 'myPlans', labelKey: 'plans.tab.myPlans' },
  { id: 'templates', labelKey: 'plans.tab.templates' },
]

export default function PlansPage() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [activeTab, setActiveTab] = useState<PlansTab>('myPlans')
  const [modalOpen, setModalOpen] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState<PlanTemplate | null>(null)
  const [workScheduleModalOpen, setWorkScheduleModalOpen] = useState(false)

  const plans = usePlans()
  const plansLoading = usePlansLoading()

  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  function openCreateModal(template: PlanTemplate | null) {
    setCreatingTemplate(template)
    setModalOpen(true)
  }

  function closeCreateModal() {
    setModalOpen(false)
    setCreatingTemplate(null)
  }

  const createInitialValues: PlanFormValues = creatingTemplate
    ? { title: t(creatingTemplate.titleKey, lang), color: creatingTemplate.defaultColor, startDate: '', endDate: '' }
    : { title: '', color: PLAN_COLOR_SWATCHES[0].color, startDate: '', endDate: '' }

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
              <div className="rounded-2xl bg-[#F8F7FC] flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-[#EDE9FB] flex items-center justify-center">
                  <ClipboardList size={28} className="text-[#6F5AE8]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1F36]">{t('plans.empty.title', lang)}</p>
                  <p className="text-xs text-[#94A3B8] mt-1">{t('plans.empty.desc', lang)}</p>
                </div>
                <button
                  onClick={() => setActiveTab('templates')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#EDE9FB] text-[#6F5AE8] rounded-xl text-sm font-semibold hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
                >
                  <Plus size={14} />
                  {t('plans.empty.cta', lang)}
                </button>
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
                      onClick={() => {
                        if (type === 'workSchedule') { setWorkScheduleModalOpen(true); return }
                        openCreateModal(isBlank ? null : template)
                      }}
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

      {modalOpen && (
        <PlanFormModal
          lang={lang}
          headerTitleKey={creatingTemplate ? 'plans.modal.createFromTemplateTitle' : 'plans.modal.title'}
          submitLabelKey="plans.modal.create"
          saveErrorKey="plans.modal.errorSave"
          initialValues={createInitialValues}
          onCancel={closeCreateModal}
          onSubmit={async (values) => {
            const now = Date.now()
            const newPlan: Plan = {
              id: generatePlanId(),
              type: creatingTemplate ? creatingTemplate.type : 'blank',
              title: values.title,
              color: values.color,
              startDate: values.startDate || undefined,
              endDate: values.endDate || undefined,
              items: creatingTemplate ? createPlanItemsFromTemplate(creatingTemplate, lang) : [],
              createdAt: now,
              updatedAt: now,
            }
            await addPlan(newPlan)
          }}
          onSuccess={() => {
            setModalOpen(false)
            setCreatingTemplate(null)
            setActiveTab('myPlans')
          }}
        />
      )}

      {workScheduleModalOpen && (
        <WorkScheduleFormModal
          lang={lang}
          onCancel={() => setWorkScheduleModalOpen(false)}
          onSubmit={async (values: WorkScheduleFormValues) => {
            const now = Date.now()
            const newPlan: Plan = {
              id: generatePlanId(),
              type: 'workSchedule',
              title: values.title,
              color: values.color,
              startDate: values.startDate || undefined,
              endDate: values.endDate || undefined,
              items: buildWorkScheduleItems(values.shifts, values.workplaceNote),
              addShiftsToCalendar: values.addShiftsToCalendar,
              createdAt: now,
              updatedAt: now,
            }
            await addPlan(newPlan)
          }}
          onSuccess={() => {
            setWorkScheduleModalOpen(false)
            setActiveTab('myPlans')
          }}
        />
      )}
    </div>
  )
}
