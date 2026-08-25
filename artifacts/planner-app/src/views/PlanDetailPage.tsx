import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Check, Loader2, Copy } from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import AppCard from '@/components/ui/AppCard'
import ProgressBar from '@/components/ui/ProgressBar'
import PlanFormModal, { type PlanFormValues } from '@/components/plans/PlanFormModal'
import { getTemplateIcon } from '@/data/planTemplates'
import {
  usePlan,
  usePlansLoading,
  computePlanProgress,
  formatDateRange,
  isValidItemLabel,
  addPlanItem,
  updatePlanItem,
  togglePlanItem,
  deletePlanItem,
  updatePlanDetails,
  deletePlan,
  addPlan,
  clonePlanForCreation,
  type PlanItem,
  type Plan,
} from '@/lib/plansStore'

const inputClass =
  'w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors'

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const plan = usePlan(planId)
  const plansLoading = usePlansLoading()

  const [itemError, setItemError] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNote, setEditNote] = useState('')

  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null)

  const [addingItem, setAddingItem] = useState(false)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemNote, setNewItemNote] = useState('')
  const [addItemSaving, setAddItemSaving] = useState(false)
  const [addItemError, setAddItemError] = useState('')

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deletePlanConfirmOpen, setDeletePlanConfirmOpen] = useState(false)
  const [deletingPlan, setDeletingPlan] = useState(false)
  const [deletePlanError, setDeletePlanError] = useState('')

  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyDraft, setCopyDraft] = useState<Plan | null>(null)

  function markSaving(id: string, saving: boolean) {
    setSavingItemIds((prev) => {
      const next = new Set(prev)
      if (saving) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleToggle(item: PlanItem) {
    if (!plan || savingItemIds.has(item.id)) return
    markSaving(item.id, true)
    setItemError('')
    try {
      await togglePlanItem(plan.id, item.id)
    } catch {
      setItemError(t('plans.detail.errorToggle', lang))
    } finally {
      markSaving(item.id, false)
    }
  }

  function startEditItem(item: PlanItem) {
    setEditingItemId(item.id)
    setEditLabel(item.label)
    setEditNote(item.note ?? '')
    setItemError('')
  }

  function cancelEditItem() {
    setEditingItemId(null)
    setEditLabel('')
    setEditNote('')
  }

  async function saveEditItem() {
    if (!plan || !editingItemId) return
    if (savingItemIds.has(editingItemId)) return
    if (!isValidItemLabel(editLabel)) {
      setItemError(t('plans.detail.errorItemLabel', lang))
      return
    }
    const id = editingItemId
    markSaving(id, true)
    setItemError('')
    try {
      await updatePlanItem(plan.id, id, { label: editLabel, note: editNote })
      setEditingItemId(null)
    } catch {
      setItemError(t('plans.detail.errorSaveItem', lang))
    } finally {
      markSaving(id, false)
    }
  }

  async function confirmDeleteItem() {
    if (!plan || !deleteConfirmItemId) return
    const id = deleteConfirmItemId
    if (savingItemIds.has(id)) return
    markSaving(id, true)
    setItemError('')
    try {
      await deletePlanItem(plan.id, id)
      setDeleteConfirmItemId(null)
    } catch {
      setItemError(t('plans.detail.errorDeleteItem', lang))
    } finally {
      markSaving(id, false)
    }
  }

  function openAddItem() {
    setAddingItem(true)
    setNewItemLabel('')
    setNewItemNote('')
    setAddItemError('')
  }

  function cancelAddItem() {
    if (addItemSaving) return
    setAddingItem(false)
    setNewItemLabel('')
    setNewItemNote('')
    setAddItemError('')
  }

  async function handleAddItem() {
    if (!plan || addItemSaving) return
    if (!isValidItemLabel(newItemLabel)) {
      setAddItemError(t('plans.detail.errorItemLabel', lang))
      return
    }
    setAddItemSaving(true)
    setAddItemError('')
    try {
      await addPlanItem(plan.id, newItemLabel, newItemNote)
      setNewItemLabel('')
      setNewItemNote('')
      setAddingItem(false)
    } catch {
      setAddItemError(t('plans.detail.errorSaveItem', lang))
    } finally {
      setAddItemSaving(false)
    }
  }

  async function handleDeletePlan() {
    if (!plan || deletingPlan) return
    setDeletingPlan(true)
    setDeletePlanError('')
    try {
      await deletePlan(plan.id)
      navigate('/app/plans')
    } catch {
      setDeletePlanError(t('plans.detail.errorDeletePlan', lang))
      setDeletingPlan(false)
    }
  }

  function openCopyModal() {
    if (!plan) return
    // Computed once up front (fresh ids, cloned items, shifted dates) — the
    // modal only lets the user adjust title/color/dates before this exact
    // draft is written; nothing is saved to Firestore yet.
    setCopyDraft(clonePlanForCreation(plan, lang))
    setCopyModalOpen(true)
  }

  function closeCopyModal() {
    setCopyModalOpen(false)
    setCopyDraft(null)
  }

  if (plansLoading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[#6F5AE8]" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full flex flex-col items-center justify-center text-center gap-3 py-16">
        <p className="text-sm font-semibold text-[#1A1F36]">{t('plans.detail.notFound.title', lang)}</p>
        <p className="text-sm text-[#94A3B8]">{t('plans.detail.notFound.desc', lang)}</p>
        <button
          onClick={() => navigate('/app/plans')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
          {t('plans.detail.backToPlans', lang)}
        </button>
      </div>
    )
  }

  const Icon = getTemplateIcon(plan.type)
  const { done, total, percent } = computePlanProgress(plan)
  const dateRange = formatDateRange(plan, lang)

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
      <button
        onClick={() => navigate('/app/plans')}
        className="flex items-center gap-1.5 -ml-1 px-1 py-2 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 rounded-lg"
      >
        <ArrowLeft size={16} />
        {t('plans.detail.backToPlans', lang)}
      </button>

      {/* Plan header */}
      <AppCard className="border border-[#ECECF2] p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${plan.color}1A`, color: plan.color }}
            >
              <Icon size={24} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#1A1F36] truncate">{plan.title}</h1>
              {dateRange && <p className="text-sm text-[#94A3B8] mt-0.5">{dateRange}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={openCopyModal}
              aria-label={t('plans.detail.copyPlan', lang)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={() => setEditModalOpen(true)}
              aria-label={t('plans.detail.editPlan', lang)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => { setDeletePlanConfirmOpen(true); setDeletePlanError('') }}
              aria-label={t('plans.detail.deletePlan', lang)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <div>
          <ProgressBar value={percent} color={plan.color} />
          <p className="text-xs text-[#94A3B8] mt-1.5">
            {t('plans.detail.progressCount', lang).replace('{done}', String(done)).replace('{total}', String(total))}
            {' · '}
            {t('plans.card.progressLabel', lang).replace('{percent}', String(percent))}
          </p>
        </div>
      </AppCard>

      {/* Items */}
      <AppCard className="border border-[#ECECF2]">
        <div className="px-5 py-4 border-b border-[#F4F4F0] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1A1F36]">{t('plans.detail.itemsHeading', lang)}</h2>
          {!addingItem && (
            <button
              onClick={openAddItem}
              className="flex items-center gap-1.5 text-sm text-[#6F5AE8] font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 rounded-lg px-1"
            >
              <Plus size={15} />
              {t('plans.detail.addItem', lang)}
            </button>
          )}
        </div>

        {itemError && <p className="px-5 pt-3 text-xs text-[#E11D48]">{itemError}</p>}

        <div className="divide-y divide-[#F4F4F0]">
          {plan.items.length === 0 && !addingItem && (
            <p className="px-5 py-8 text-sm text-[#94A3B8] text-center">{t('plans.detail.noItems', lang)}</p>
          )}

          {plan.items.map((item) => {
            const isEditing = editingItemId === item.id
            const isSaving = savingItemIds.has(item.id)

            if (isEditing) {
              return (
                <div key={item.id} className="px-5 py-3.5 flex flex-col gap-2">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder={t('plans.detail.itemLabelPlaceholder', lang)}
                    className={inputClass}
                  />
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder={t('plans.detail.itemNotePlaceholder', lang)}
                    className={inputClass}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={cancelEditItem}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
                    >
                      {t('plans.modal.cancel', lang)}
                    </button>
                    <button
                      onClick={saveEditItem}
                      disabled={isSaving || !isValidItemLabel(editLabel)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving && <Loader2 size={13} className="animate-spin" />}
                      {t('plans.detail.save', lang)}
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={item.id} className="px-5 py-3.5 flex items-start gap-3">
                <button
                  onClick={() => handleToggle(item)}
                  disabled={isSaving}
                  aria-pressed={item.done}
                  aria-label={t('plans.detail.toggleItem', lang)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 ${
                    item.done ? 'bg-[#6F5AE8] border-[#6F5AE8]' : 'border-[#D1D5DB] hover:border-[#6F5AE8]'
                  }`}
                >
                  {item.done && <Check size={13} className="text-white" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${item.done ? 'line-through text-[#94A3B8]' : 'text-[#1A1F36]'}`}>
                    {item.label}
                  </p>
                  {item.note && <p className="text-xs text-[#94A3B8] mt-0.5">{item.note}</p>}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEditItem(item)}
                    aria-label={t('plans.detail.editItem', lang)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmItemId(item.id)}
                    aria-label={t('plans.detail.deleteItem', lang)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}

          {addingItem && (
            <div className="px-5 py-3.5 flex flex-col gap-2 bg-[#FAFAF8]">
              <input
                autoFocus
                value={newItemLabel}
                onChange={(e) => { setNewItemLabel(e.target.value); setAddItemError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAddItem() }}
                placeholder={t('plans.detail.itemLabelPlaceholder', lang)}
                className={inputClass}
              />
              <input
                value={newItemNote}
                onChange={(e) => setNewItemNote(e.target.value)}
                placeholder={t('plans.detail.itemNotePlaceholder', lang)}
                className={inputClass}
              />
              {addItemError && <p className="text-xs text-[#E11D48]">{addItemError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelAddItem}
                  disabled={addItemSaving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
                >
                  {t('plans.modal.cancel', lang)}
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={addItemSaving || !isValidItemLabel(newItemLabel)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addItemSaving && <Loader2 size={13} className="animate-spin" />}
                  {t('plans.detail.addItem', lang)}
                </button>
              </div>
            </div>
          )}
        </div>
      </AppCard>

      {/* Copy plan */}
      {copyModalOpen && copyDraft && (
        <PlanFormModal
          lang={lang}
          headerTitleKey="plans.detail.copyPlan"
          submitLabelKey="plans.modal.create"
          saveErrorKey="plans.modal.errorSave"
          initialValues={{
            title: copyDraft.title,
            color: copyDraft.color,
            startDate: copyDraft.startDate ?? '',
            endDate: copyDraft.endDate ?? '',
          }}
          onCancel={closeCopyModal}
          onSubmit={async (values: PlanFormValues) => {
            const finalPlan: Plan = {
              ...copyDraft,
              title: values.title,
              color: values.color,
              startDate: values.startDate || undefined,
              endDate: values.endDate || undefined,
            }
            await addPlan(finalPlan)
          }}
          onSuccess={() => {
            const newPlanId = copyDraft.id
            closeCopyModal()
            navigate(`/app/plans/${newPlanId}`)
          }}
        />
      )}

      {/* Edit plan details */}
      {editModalOpen && (
        <PlanFormModal
          lang={lang}
          headerTitleKey="plans.detail.editPlan"
          submitLabelKey="plans.detail.saveChanges"
          saveErrorKey="plans.detail.errorSaveDetails"
          initialValues={{
            title: plan.title,
            color: plan.color,
            startDate: plan.startDate ?? '',
            endDate: plan.endDate ?? '',
          }}
          onCancel={() => setEditModalOpen(false)}
          onSubmit={async (values: PlanFormValues) => {
            await updatePlanDetails(plan.id, values)
          }}
          onSuccess={() => setEditModalOpen(false)}
        />
      )}

      {/* Delete plan confirmation */}
      {deletePlanConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => { if (!deletingPlan) setDeletePlanConfirmOpen(false) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-plan-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center gap-2">
              <p id="delete-plan-title" className="text-sm font-semibold text-[#1A1F36]">
                {t('plans.detail.deletePlanConfirmTitle', lang).replace('{title}', plan.title)}
              </p>
              <p className="text-xs text-[#94A3B8]">{t('plans.detail.deletePlanConfirmDesc', lang)}</p>
              {deletePlanError && <p className="text-xs text-[#E11D48] mt-1">{deletePlanError}</p>}
            </div>
            <div className="flex items-center justify-center gap-2 px-5 pb-5">
              <button
                onClick={() => setDeletePlanConfirmOpen(false)}
                disabled={deletingPlan}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors disabled:opacity-50"
              >
                {t('plans.modal.cancel', lang)}
              </button>
              <button
                onClick={handleDeletePlan}
                disabled={deletingPlan}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] transition-colors disabled:opacity-50"
              >
                {deletingPlan && <Loader2 size={13} className="animate-spin" />}
                {t('plans.detail.confirmDelete', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete item confirmation */}
      {deleteConfirmItemId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => { if (!savingItemIds.has(deleteConfirmItemId)) setDeleteConfirmItemId(null) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-item-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center gap-2">
              <p id="delete-item-title" className="text-sm font-semibold text-[#1A1F36]">
                {t('plans.detail.deleteConfirmTitle', lang)}
              </p>
              <p className="text-xs text-[#94A3B8]">{t('plans.detail.deleteConfirmDesc', lang)}</p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 pb-5">
              <button
                onClick={() => setDeleteConfirmItemId(null)}
                disabled={savingItemIds.has(deleteConfirmItemId)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors disabled:opacity-50"
              >
                {t('plans.modal.cancel', lang)}
              </button>
              <button
                onClick={confirmDeleteItem}
                disabled={savingItemIds.has(deleteConfirmItemId)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] transition-colors disabled:opacity-50"
              >
                {savingItemIds.has(deleteConfirmItemId) && <Loader2 size={13} className="animate-spin" />}
                {t('plans.detail.confirmDelete', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
