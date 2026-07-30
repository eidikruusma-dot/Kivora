import { useState, useEffect } from 'react'
import { X, ArrowRight, Check, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGoals, toggleStep, updateGoal } from '@/lib/goalsStore'
import type { Goal, GoalStatus } from '@/data/goalsData'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

interface Props {
  goalId: string | null
  onClose: () => void
}

function getStatusOptions(lang: AppLang): { value: GoalStatus; label: string; bg: string; text: string }[] {
  return [
    { value: 'active',    label: t('goals.status.active',  lang), bg: '#DCFCE7', text: '#16A34A' },
    { value: 'paused',    label: t('goals.status.paused',  lang), bg: '#FEF9C3', text: '#CA8A04' },
    { value: 'completed', label: t('goals.status.done',    lang), bg: '#E2E8F0', text: '#64748B' },
  ]
}

export default function GoalDetailModal({ goalId, onClose }: Props) {
  const navigate = useNavigate()
  const goals = useGoals()
  const goal: Goal | undefined = goals.find((g) => g.id === goalId)

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editStatus, setEditStatus] = useState<GoalStatus>('active')

  if (!goalId) return null
  if (!goal) return null

  const statusOptions = getStatusOptions(lang)
  const pct = Math.round((goal.progressValue / Math.max(goal.progressMax, 1)) * 100)
  const doneCnt = goal.steps.filter((s) => s.done).length
  const totalCnt = goal.steps.length

  const openEdit = () => {
    setEditTitle(goal.title)
    setEditDesc(goal.description)
    setEditDeadline(goal.deadline)
    setEditStatus(goal.status)
    setEditing(true)
  }

  const handleSaveEdit = () => {
    updateGoal(goal.id, {
      title: editTitle.trim() || goal.title,
      description: editDesc,
      deadline: editDeadline.trim() || goal.deadline,
      status: editStatus,
    })
    setEditing(false)
  }

  const handleGoToGoals = () => {
    onClose()
    navigate('/app/goals')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 pt-5 pb-4"
          style={{ borderBottom: `3px solid ${goal.barColor ?? '#6F5AE8'}` }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-base font-semibold text-[#1A1F36] leading-snug">{goal.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Status badge */}
              {(() => {
                const s = statusOptions.find((o) => o.value === goal.status)
                return s ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.text }}>
                    {s.label}
                  </span>
                ) : null
              })()}
              {/* Deadline */}
              {goal.deadline && (
                <span className="text-xs text-[#94A3B8]">📅 {goal.deadline}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#64748B]">{t('dash.goal.progress', lang)}</span>
              <span className="text-xs font-bold" style={{ color: goal.barColor ?? '#6F5AE8' }}>
                {pct}% · {doneCnt}/{totalCnt}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#F1F0EB] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: goal.barColor ?? '#6F5AE8' }}
              />
            </div>
          </div>

          {/* Description (detail mode) */}
          {!editing && goal.description && (
            <p className="text-sm text-[#64748B] leading-relaxed">{goal.description}</p>
          )}

          {/* Steps */}
          {totalCnt > 0 && (
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-2">{t('dash.goal.steps', lang)}</p>
              <div className="flex flex-col gap-1.5">
                {goal.steps.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => toggleStep(goal.id, step.id)}
                    className="flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 hover:bg-[#F8F7F4] transition-colors group"
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                      step.done
                        ? 'bg-[#6F5AE8] border-[#6F5AE8] border'
                        : 'border border-[#D1D5DB] bg-white group-hover:border-[#6F5AE8]'
                    }`}>
                      {step.done && <Check size={10} className="text-white" />}
                    </div>
                    <span className={`text-sm ${step.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                      {step.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Inline edit form ────────────────────────── */}
          {editing && (
            <div className="flex flex-col gap-3 border-t border-[#ECECF2] pt-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">{t('dash.goal.fieldName', lang)}</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">{t('dash.goal.fieldDesc', lang)}</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">{t('dash.goal.fieldDeadline', lang)}</label>
                <input
                  type="text"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  placeholder={t('dash.goal.placeholder', lang)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('dash.goal.fieldStatus', lang)}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {statusOptions.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setEditStatus(s.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={editStatus === s.value
                        ? { background: s.bg, color: s.text }
                        : { background: '#F8F7F4', color: '#64748B' }
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#ECECF2]">
          {/* Navigate to full Goals page */}
          <button
            onClick={handleGoToGoals}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors"
            title={t('dash.goal.open', lang)}
          >
            <ArrowRight size={14} />
          </button>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {t('cal.action.cancel', lang)}
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors"
                >
                  {t('dash.goal.save', lang)}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {t('cal.action.close', lang)}
                </button>
                <button
                  onClick={openEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors"
                >
                  <Pencil size={13} />
                  {t('cal.action.edit', lang)}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
