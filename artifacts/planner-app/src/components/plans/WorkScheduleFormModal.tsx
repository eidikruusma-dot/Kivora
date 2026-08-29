import { useState } from 'react'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { PLAN_COLOR_SWATCHES } from '@/components/plans/PlanFormModal'
import {
  isValidPlanTitle,
  isValidPlanDateRange,
  hasValidWorkScheduleShift,
  isValidShiftTimes,
  type WorkScheduleShiftDraft,
} from '@/lib/plansStore'

const inputClass =
  'w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors'

/** One shift row's local form state — `localId` only exists for React keys; the domain model (WorkScheduleShiftDraft) never carries it. */
interface ShiftRow extends WorkScheduleShiftDraft {
  localId: string
}

function newShiftRow(): ShiftRow {
  return { localId: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: '', startTime: '', endTime: '' }
}

export interface WorkScheduleFormValues {
  title: string
  color: string
  startDate: string
  endDate: string
  workplaceNote: string
  shifts: WorkScheduleShiftDraft[]
  addShiftsToCalendar: boolean
}

interface WorkScheduleFormModalProps {
  lang: AppLang
  onCancel: () => void
  onSubmit: (values: WorkScheduleFormValues) => Promise<void>
  onSuccess: () => void
}

/**
 * Dedicated create form for the Work Schedule plan template — the generic
 * PlanFormModal (name/color/dates only) has no fields for shifts, so this
 * mirrors its visual design and validation conventions while adding the
 * Work Schedule-specific fields (shift rows, workplace note, add-to-calendar
 * opt-in). Everything it produces is a plain Plan/PlanItem[] written via the
 * exact same addPlan() every other template uses — no parallel storage.
 */
export default function WorkScheduleFormModal({ lang, onCancel, onSubmit, onSuccess }: WorkScheduleFormModalProps) {
  const [title, setTitle] = useState(t('plans.template.workSchedule.title', lang))
  const [color, setColor] = useState(PLAN_COLOR_SWATCHES[4].color) // #0D9488 — matches the template's own accent
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [workplaceNote, setWorkplaceNote] = useState('')
  const [shifts, setShifts] = useState<ShiftRow[]>([newShiftRow()])
  const [addShiftsToCalendar, setAddShiftsToCalendar] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleCancel() {
    if (saving) return
    onCancel()
  }

  function updateShift(localId: string, patch: Partial<WorkScheduleShiftDraft>) {
    setShifts((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)))
    setFormError('')
  }

  function addShiftRow() {
    setShifts((prev) => [...prev, newShiftRow()])
  }

  function removeShiftRow(localId: string) {
    setShifts((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.localId !== localId)))
  }

  async function handleSubmit() {
    if (saving) return

    if (!isValidPlanTitle(title)) {
      setFormError(t('plans.modal.errorName', lang))
      return
    }
    if (!isValidPlanDateRange(startDate, endDate)) {
      setFormError(t('plans.modal.errorDateRange', lang))
      return
    }
    if (!hasValidWorkScheduleShift(shifts)) {
      setFormError(t('plans.workSchedule.errorNoShifts', lang))
      return
    }

    setSaving(true)
    setFormError('')
    try {
      await onSubmit({
        title: title.trim(),
        color,
        startDate,
        endDate,
        workplaceNote,
        shifts,
        addShiftsToCalendar,
      })
      onSuccess()
    } catch {
      setFormError(t('plans.modal.errorSave', lang))
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
        aria-labelledby="work-schedule-modal-title"
        className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
          <h2 id="work-schedule-modal-title" className="text-base font-semibold text-[#1A1F36]">
            {t('plans.workSchedule.modalTitle', lang)}
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
            <label htmlFor="work-schedule-name" className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('plans.modal.nameLabel', lang)} <span className="text-[#E11D48]">*</span>
            </label>
            <input
              id="work-schedule-name"
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setFormError('') }}
              placeholder={t('plans.modal.namePlaceholder', lang)}
              className={inputClass}
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
                  onClick={() => setColor(c.color)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c.color ? 'ring-2 ring-offset-2 ring-[#1A1F36] scale-110' : 'hover:scale-110'
                  }`}
                  style={{ background: c.color }}
                />
              ))}
            </div>
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('plans.modal.startDateLabel', lang)}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setFormError('') }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('plans.modal.endDateLabel', lang)}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setFormError('') }}
                className={inputClass}
              />
            </div>
          </div>

          {/* Workplace / note */}
          <div>
            <label htmlFor="work-schedule-workplace" className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('plans.workSchedule.workplaceLabel', lang)}
            </label>
            <input
              id="work-schedule-workplace"
              type="text"
              value={workplaceNote}
              onChange={(e) => setWorkplaceNote(e.target.value)}
              placeholder={t('plans.workSchedule.workplacePlaceholder', lang)}
              className={inputClass}
            />
          </div>

          {/* Shifts */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-[#64748B]">
                {t('plans.workSchedule.shiftsHeading', lang)} <span className="text-[#E11D48]">*</span>
              </label>
              <button
                onClick={addShiftRow}
                className="flex items-center gap-1 text-xs text-[#6F5AE8] font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8] focus-visible:ring-offset-2 rounded-lg px-1"
              >
                <Plus size={13} />
                {t('plans.workSchedule.addShift', lang)}
              </button>
            </div>
            {/* Column header — only at widths wide enough for one row (matches the
                shift row's own sm: grid breakpoint below); on narrow/mobile widths
                the stacked row layout makes each field's purpose clear without it. */}
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_2.25rem] sm:gap-2 sm:px-0.5 sm:mb-1">
              <span className="text-[11px] font-medium text-[#94A3B8]">{t('plans.workSchedule.shiftDateLabel', lang)}</span>
              <span className="text-[11px] font-medium text-[#94A3B8]">{t('plans.workSchedule.shiftStartLabel', lang)}</span>
              <span className="text-[11px] font-medium text-[#94A3B8]">{t('plans.workSchedule.shiftEndLabel', lang)}</span>
              <span aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-2">
              {shifts.map((row) => {
                const timesInvalid = row.startTime && row.endTime && !isValidShiftTimes(row.startTime, row.endTime)
                return (
                  <div
                    key={row.localId}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_2.25rem] sm:items-center"
                  >
                    <input
                      type="date"
                      aria-label={t('plans.workSchedule.shiftDateLabel', lang)}
                      value={row.date}
                      onChange={(e) => updateShift(row.localId, { date: e.target.value })}
                      className={`${inputClass} col-span-2 min-w-0 sm:col-span-1`}
                    />
                    <input
                      type="time"
                      aria-label={t('plans.workSchedule.shiftStartLabel', lang)}
                      value={row.startTime}
                      onChange={(e) => updateShift(row.localId, { startTime: e.target.value })}
                      className={`${inputClass} min-w-0 ${timesInvalid ? 'border-[#E11D48]' : ''}`}
                    />
                    <input
                      type="time"
                      aria-label={t('plans.workSchedule.shiftEndLabel', lang)}
                      value={row.endTime}
                      onChange={(e) => updateShift(row.localId, { endTime: e.target.value })}
                      className={`${inputClass} min-w-0 ${timesInvalid ? 'border-[#E11D48]' : ''}`}
                    />
                    <button
                      onClick={() => removeShiftRow(row.localId)}
                      disabled={shifts.length <= 1}
                      aria-label={t('plans.workSchedule.removeShift', lang)}
                      className="col-span-2 justify-self-end w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-colors disabled:opacity-30 disabled:cursor-not-allowed sm:col-span-1 sm:justify-self-auto"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add to Calendar */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addShiftsToCalendar}
              onChange={(e) => setAddShiftsToCalendar(e.target.checked)}
              className="w-4 h-4 rounded border-[#D1D5DB] text-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB]"
            />
            <span className="text-sm text-[#1A1F36]">{t('plans.workSchedule.addToCalendarLabel', lang)}</span>
          </label>

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
            disabled={!isValidPlanTitle(title) || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('plans.workSchedule.submit', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
