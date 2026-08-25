import { useState, useRef } from 'react'
import { X, Loader2, Sparkles, Plus, Trash2, ArrowLeft } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { fetchAIReply, buildPlanGenerationMessages } from '@/lib/aiClient'
import { executeAction } from '@/lib/aiActions'
import {
  PLAN_DRAFT_LIMITS,
  isPlanDraftUsable,
  type PlanDraft,
  type PlanDraftItem,
} from '@/lib/planDraftValidation'
import { PLAN_COLOR_SWATCHES } from '@/components/plans/PlanFormModal'
import { PLAN_TEMPLATES } from '@/data/planTemplates'
import {
  addPlan,
  buildPlanFromDraft,
  isValidPlanTitle,
  isValidPlanDateRange,
} from '@/lib/plansStore'
import { runExclusive } from '@/lib/asyncLock'

interface AIPlanGeneratorModalProps {
  lang: AppLang
  /** When set (e.g. opened from AIAssistantPage after a chat already produced a draft), skip the prompt phase and open straight into the editable preview. */
  initialDraft?: PlanDraft | null
  onClose: () => void
  onSaved: (planId: string) => void
}

type Phase = 'prompt' | 'preview'

/**
 * The one AI-assisted plan creation flow, embedded directly in the Plans
 * module (also reusable from AIAssistantPage via `initialDraft`). Nothing
 * is written to Firestore during generation or preview — only the final
 * "Save plan" click builds a trusted Plan object (fresh id, fresh item
 * ids, done: false, fresh timestamps — all assigned here, never taken from
 * the model) and calls addPlan() exactly once.
 */
export default function AIPlanGeneratorModal({
  lang,
  initialDraft = null,
  onClose,
  onSaved,
}: AIPlanGeneratorModalProps) {
  const [phase, setPhase] = useState<Phase>(initialDraft ? 'preview' : 'prompt')
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [draft, setDraft] = useState<PlanDraft | null>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Synchronous double-click guards — React state alone isn't synchronous
  // enough to block two same-tick clicks (both can read stale state before
  // either setState is applied). These refs are checked/set synchronously
  // via runExclusive (lib/asyncLock.ts) before any async work starts, and
  // released in a finally, so a failed generate/save always permits retry.
  // `generating`/`saving` state remains for UI rendering (spinners, disabled
  // buttons) — the refs are the actual lock.
  const generatingLockRef = useRef(false)
  const savingLockRef = useRef(false)

  function handleClose() {
    if (generatingLockRef.current || savingLockRef.current) return
    onClose()
  }

  async function handleGenerate() {
    const trimmed = prompt.trim().slice(0, PLAN_DRAFT_LIMITS.maxPromptLength)
    if (!trimmed) return

    await runExclusive(generatingLockRef, async () => {
      setGenerating(true)
      setGenError('')
      try {
        // No app-wide context needed for plan generation — omit it entirely.
        // The raw, trimmed description is sent verbatim as the sole message
        // (buildPlanGenerationMessages — no prefix/wrapper), so the length
        // the backend measures against PLAN_DRAFT_LIMITS.maxPromptLength is
        // exactly what the user typed; the backend's own mode: "plan_creation"
        // system prompt supplies the "generate a plan" instruction instead.
        const res = await fetchAIReply(buildPlanGenerationMessages(trimmed), lang, '', 'plan_creation')
        const found = res.actions.find((a) => a.type === 'preview_plan_creation')
        if (!found) {
          setGenError(t('plans.ai.errorNoDraft', lang))
          return
        }

        let capturedDraft: PlanDraft | null = null
        const result = await executeAction(found, {
          uid: '',
          getFile: () => null,
          getAllDocuments: () => [],
          setPendingPlanDraft: (d) => {
            capturedDraft = d
          },
        })

        if (!result.success || !isPlanDraftUsable(capturedDraft)) {
          setGenError(t('plans.ai.errorEmptyDraft', lang))
          return
        }
        setDraft(capturedDraft)
        setPhase('preview')
      } catch {
        setGenError(t('plans.ai.errorGenerate', lang))
      } finally {
        setGenerating(false)
      }
    })
  }

  function backToPrompt() {
    if (savingLockRef.current) return
    setDraft(null)
    setSaveError('')
    setPhase('prompt')
  }

  function updateDraft(patch: Partial<PlanDraft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setSaveError('')
  }

  function updateItem(index: number, patch: Partial<PlanDraftItem>) {
    setDraft((d) => {
      if (!d) return d
      return { ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }
    })
  }

  function removeItem(index: number) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== index) } : d))
  }

  function addItem() {
    setDraft((d) => {
      if (!d || d.items.length >= PLAN_DRAFT_LIMITS.maxItems) return d
      return { ...d, items: [...d.items, { label: '' }] }
    })
  }

  async function handleSave() {
    if (!draft) return

    if (!isValidPlanTitle(draft.title)) {
      setSaveError(t('plans.modal.errorName', lang))
      return
    }
    if (!isValidPlanDateRange(draft.startDate || '', draft.endDate || '')) {
      setSaveError(t('plans.modal.errorDateRange', lang))
      return
    }

    await runExclusive(savingLockRef, async () => {
      const newPlan = buildPlanFromDraft(draft)
      if (newPlan.items.length === 0) {
        setSaveError(t('plans.ai.errorNoItems', lang))
        return
      }

      setSaving(true)
      setSaveError('')
      try {
        await addPlan(newPlan)
        onSaved(newPlan.id)
      } catch {
        setSaveError(t('plans.modal.errorSave', lang))
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.4)' }}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-plan-modal-title"
        className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} className="text-[#6F5AE8] flex-shrink-0" />
            <h2 id="ai-plan-modal-title" className="text-base font-semibold text-[#1A1F36] truncate">
              {t('plans.ai.modalTitle', lang)}
            </h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            disabled={generating || saving}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {phase === 'prompt' ? (
          <>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label htmlFor="ai-plan-prompt" className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('plans.ai.promptLabel', lang)}
                </label>
                <textarea
                  id="ai-plan-prompt"
                  rows={4}
                  value={prompt}
                  maxLength={PLAN_DRAFT_LIMITS.maxPromptLength}
                  onChange={(e) => {
                    setPrompt(e.target.value)
                    setGenError('')
                  }}
                  placeholder={t('plans.ai.promptPlaceholder', lang)}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors resize-none"
                />
              </div>
              {genError && (
                <p className="text-xs text-[#E11D48]">
                  {genError}{' '}
                  <button onClick={handleGenerate} className="underline font-medium">
                    {t('plans.ai.generate', lang)}
                  </button>
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={handleClose}
                disabled={generating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('plans.modal.cancel', lang)}
              </button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating && <Loader2 size={14} className="animate-spin" />}
                {generating ? t('plans.ai.generating', lang) : t('plans.ai.generate', lang)}
              </button>
            </div>
          </>
        ) : draft ? (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-xs text-[#94A3B8]">{t('plans.ai.previewSubtitle', lang)}</p>

              {/* Title */}
              <div>
                <label htmlFor="ai-plan-title" className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('plans.modal.nameLabel', lang)} <span className="text-[#E11D48]">*</span>
                </label>
                <input
                  id="ai-plan-title"
                  type="text"
                  value={draft.title}
                  maxLength={PLAN_DRAFT_LIMITS.maxTitleLength}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Type */}
              <div>
                <label htmlFor="ai-plan-type" className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t('plans.ai.typeLabel', lang)}
                </label>
                <select
                  id="ai-plan-type"
                  value={draft.type}
                  onChange={(e) => updateDraft({ type: e.target.value as PlanDraft['type'] })}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                >
                  {PLAN_TEMPLATES.map((tpl) => (
                    <option key={tpl.type} value={tpl.type}>
                      {t(tpl.titleKey, lang)}
                    </option>
                  ))}
                </select>
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
                      onClick={() => updateDraft({ color: c.color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        draft.color === c.color ? 'ring-2 ring-offset-2 ring-[#1A1F36] scale-110' : 'hover:scale-110'
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
                    value={draft.startDate || ''}
                    onChange={(e) => updateDraft({ startDate: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                    {t('plans.modal.endDateLabel', lang)}
                  </label>
                  <input
                    type="date"
                    value={draft.endDate || ''}
                    onChange={(e) => updateDraft({ endDate: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-[#64748B]">
                    {t('plans.ai.itemsLabel', lang)}
                  </label>
                  <button
                    onClick={addItem}
                    disabled={draft.items.length >= PLAN_DRAFT_LIMITS.maxItems}
                    className="flex items-center gap-1 text-xs font-medium text-[#6F5AE8] hover:text-[#5B48D8] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    {t('plans.detail.addItem', lang)}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {draft.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-1.5 p-3 rounded-xl border border-[#ECECF2] bg-[#FAFAFA]"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={item.label}
                          maxLength={PLAN_DRAFT_LIMITS.maxLabelLength}
                          onChange={(e) => updateItem(index, { label: e.target.value })}
                          placeholder={t('plans.detail.itemLabelPlaceholder', lang)}
                          className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                        />
                        <button
                          onClick={() => removeItem(index)}
                          aria-label={t('plans.detail.deleteItem', lang)}
                          className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#E11D48] transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={item.note || ''}
                        maxLength={PLAN_DRAFT_LIMITS.maxNoteLength}
                        onChange={(e) => updateItem(index, { note: e.target.value })}
                        placeholder={t('plans.detail.itemNotePlaceholder', lang)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#ECECF2] rounded-lg text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] transition-colors resize-none whitespace-pre-wrap"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {saveError && <p className="text-xs text-[#E11D48]">{saveError}</p>}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white rounded-b-2xl">
              {!initialDraft ? (
                <button
                  onClick={backToPrompt}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  {t('plans.ai.backToPrompt', lang)}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClose}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
                >
                  {t('plans.modal.cancel', lang)}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isValidPlanTitle(draft.title) || saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? t('plans.ai.saving', lang) : t('plans.ai.save', lang)}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
