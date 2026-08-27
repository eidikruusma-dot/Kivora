import { useState, useRef, useEffect } from 'react'
import { useIsDark, darkBg, darkText } from '@/lib/themeColors'
import { useLocation } from 'react-router-dom'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { toast } from 'sonner'
import {
  Plus,
  User,
  Briefcase,
  GraduationCap,
  HeartPulse,
  DollarSign,
  Home,
  Users,
  Plane,
  BookOpen,
  Trophy,
  Lightbulb,
  Target,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  X,
  Check,
  Pencil,
  Pause,
  Play,
  Trash2,
  Calendar,
  CheckCircle2,
  PlusCircle,
  Trash,
  Loader2,
} from 'lucide-react'
import type { Goal, GoalStatus } from '@/data/goalsData'
import { useGoals, useGoalsLoading, addGoal, updateGoal, deleteGoal as deleteGoalStore, toggleStep, addStep, deleteStep } from '@/lib/goalsStore'
import LinkedItemsPanel from '@/components/links/LinkedItemsPanel'
import { removeLinksForEntity } from '@/lib/entityLinksStore'
import PostSaveLinkSuggestionsDialog from '@/components/links/PostSaveLinkSuggestionsDialog'
import AutoLinkToast from '@/components/links/AutoLinkToast'
import { runAutomaticLinking, type AutoLinkResult } from '@/lib/automaticLinking'

const ICON_MAP: Record<Goal['icon'], React.ReactNode> = {
  personal: <User size={18} strokeWidth={2} />,
  career:   <Briefcase size={18} strokeWidth={2} />,
  learning: <GraduationCap size={18} strokeWidth={2} />,
  health:   <HeartPulse size={18} strokeWidth={2} />,
  money:    <DollarSign size={18} strokeWidth={2} />,
  home:     <Home size={18} strokeWidth={2} />,
  family:   <Users size={18} strokeWidth={2} />,
  travel:   <Plane size={18} strokeWidth={2} />,
  reading:  <BookOpen size={18} strokeWidth={2} />,
  sport:    <Trophy size={18} strokeWidth={2} />,
  project:  <Lightbulb size={18} strokeWidth={2} />,
  other:    <Target size={18} strokeWidth={2} />,
}

const DEADLINE_ICON: Record<string, React.ReactNode> = {
  learning: <GraduationCap size={14} strokeWidth={2} />,
  reading:  <BookOpen size={14} strokeWidth={2} />,
  sport:    <Trophy size={14} strokeWidth={2} />,
}

function makeStatusStyle(lang: AppLang): Record<GoalStatus, { label: string; bg: string; color: string }> {
  return {
    active:    { label: t('goals.status.active', lang),    bg: '#DCFCE7', color: '#16A34A' },
    paused:    { label: t('goals.status.paused', lang),    bg: '#FEF9C3', color: '#CA8A04' },
    completed: { label: t('goals.status.done', lang),      bg: '#E2E8F0', color: '#64748B' },
    expired:   { label: t('goals.status.expired', lang),   bg: '#FEE2E2', color: '#DC2626' },
  }
}



function makeColorOptions(lang: AppLang) {
  return [
    { name: t('goals.color.green',  lang), barColor: '#22C55E', iconBg: '#DCFCE7', iconColor: '#16A34A' },
    { name: t('goals.color.purple', lang), barColor: '#6F5AE8', iconBg: '#EDE9FB', iconColor: '#6F5AE8' },
    { name: t('goals.color.red',    lang), barColor: '#EF4444', iconBg: '#FEE2E2', iconColor: '#DC2626' },
    { name: t('goals.color.orange', lang), barColor: '#F97316', iconBg: '#FFEDD5', iconColor: '#EA580C' },
    { name: t('goals.color.blue',   lang), barColor: '#3B82F6', iconBg: '#DBEAFE', iconColor: '#2563EB' },
    { name: t('goals.color.yellow', lang), barColor: '#EAB308', iconBg: '#FEF9C3', iconColor: '#CA8A04' },
  ]
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 w-full rounded-full bg-[#F1F0EB] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

interface NewGoalForm {
  title: string
  description: string
  icon: Goal['icon']
  deadline: string
  colorIndex: number
  status: GoalStatus
  stepsText: string
}

const emptyForm: NewGoalForm = {
  title: '',
  description: '',
  icon: 'other',
  deadline: '',
  colorIndex: 0,
  status: 'active',
  stepsText: '',
}

export default function GoalsPage() {
  const goals = useGoals()
  const goalsLoading = useGoalsLoading()
  const [saving, setSaving] = useState(false)
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const isDark = useIsDark()
  const STATUS_STYLE: Record<GoalStatus, { label: string; bg: string; color: string }> = {
    active:    { label: t('goals.status.active',  lang), bg: isDark ? '#0D2418' : '#DCFCE7', color: isDark ? '#4ADE80' : '#16A34A' },
    paused:    { label: t('goals.status.paused',  lang), bg: isDark ? '#1F1507' : '#FEF9C3', color: isDark ? '#FCD34D' : '#CA8A04' },
    completed: { label: t('goals.status.done',    lang), bg: isDark ? '#1A2332' : '#E2E8F0', color: isDark ? '#8B9EB5' : '#64748B' },
    expired:   { label: t('goals.status.expired', lang), bg: isDark ? '#200A0A' : '#FEE2E2', color: isDark ? '#F87171' : '#DC2626' },
  }

  const ICON_OPTIONS_LANG: { value: Goal['icon']; label: string }[] = [
    { value: 'personal', label: t('goalIcon.personal', lang) },
    { value: 'career',   label: t('goalIcon.career', lang) },
    { value: 'learning', label: t('goalIcon.learning', lang) },
    { value: 'health',   label: t('goalIcon.health', lang) },
    { value: 'money',    label: t('goalIcon.money', lang) },
    { value: 'home',     label: t('goalIcon.home', lang) },
    { value: 'family',   label: t('goalIcon.family', lang) },
    { value: 'travel',   label: t('goalIcon.travel', lang) },
    { value: 'reading',  label: t('goalIcon.reading', lang) },
    { value: 'sport',    label: t('goalIcon.sport', lang) },
    { value: 'project',  label: t('goalIcon.project', lang) },
    { value: 'other',    label: t('goalIcon.other', lang) },
  ]

  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all')

  const [showAddModal, setShowAddModal] = useState(false)
  const [postSave, setPostSave] = useState<{ type: 'goal'; id: string } | null>(null)
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null)
  const [form, setForm] = useState<NewGoalForm>(emptyForm)
  const [formError, setFormError] = useState('')

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuUp, setMenuUp] = useState(false)
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null)
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null)
  const [newStepText, setNewStepText] = useState('')

  const location = useLocation()

  // Reset to default view whenever the user navigates to Goals
  useEffect(() => {
    setFilter('all')
    setShowAddModal(false)
    setDetailGoal(null)
    setEditGoal(null)
    setDeleteGoal(null)
    setMenuOpenId(null)
  }, [location.key])

  // Deep-link: open specific goal navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId
    if (!openId) return
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')
    const goal = goals.find(g => g.id === openId)
    if (goal) setDetailGoal(goal)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: open the create-goal form when navigated here with an
  // explicit signal (e.g. the "Minu päev" dashboard's empty-state CTA).
  // The signal is consumed once and cleared from history state so a
  // refresh, Back navigation, or later normal navigation to this page
  // never reopens the modal on its own.
  useEffect(() => {
    const openCreate = (location.state as { openCreate?: boolean } | null)?.openCreate
    if (!openCreate) return
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')
    openCreateModal()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuOpenId && menuRefs.current[menuOpenId] && !menuRefs.current[menuOpenId]!.contains(target)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const activeCount    = goals.filter((g) => g.status === 'active').length
  const pausedCount    = goals.filter((g) => g.status === 'paused').length
  const completedCount = goals.filter((g) => g.status === 'completed').length

  const filtered = goals.filter((g) => {
    if (filter === 'active')    return g.status === 'active'
    if (filter === 'paused')    return g.status === 'paused'
    if (filter === 'completed') return g.status === 'completed'
    return true
  })

  const total = goals.length
  const segments = [
    { label: t('goals.segment.active',    lang), count: activeCount,    color: '#22C55E' },
    { label: t('goals.segment.paused',    lang), count: pausedCount,    color: '#FBBF24' },
    { label: t('goals.segment.completed', lang), count: completedCount, color: '#94A3B8' },
  ]
  const circumference = 97.4
  let offset = 0

  const longest = goals
    .filter((g) => g.status === 'active')
    .reduce<Goal | null>((best, g) => {
      const pct = (g.progressValue / g.progressMax) * 100
      if (!best || pct > (best.progressValue / best.progressMax) * 100) return g
      return best
    }, null)

  // Keep detailGoal in sync with store
  useEffect(() => {
    if (detailGoal) {
      const updated = goals.find((g) => g.id === detailGoal.id)
      if (updated && updated !== detailGoal) setDetailGoal(updated)
      if (!updated) setDetailGoal(null)
    }
  }, [goals, detailGoal])

  const openCreateModal = () => {
    setForm(emptyForm)
    setFormError('')
    setShowAddModal(true)
  }

  const handleAddGoal = async () => {
    if (!form.title.trim()) {
      setFormError(t('goals.modal.error', lang))
      return
    }
    setSaving(true)
    try {
      const color = makeColorOptions(lang)[form.colorIndex]
      const stepLines = form.stepsText.split('\n').map((s) => s.trim()).filter(Boolean)
      const steps = stepLines.length > 0
        ? stepLines.map((title, i) => ({ id: `s${Date.now()}-${i}`, title, done: false }))
        : [{ id: `s${Date.now()}`, title: t('goals.defaultStep', lang), done: false }]
      const newGoal: Goal = {
        id: `g${Date.now()}`,
        title: form.title.trim(),
        description: form.description.trim() || t('goals.descMissing', lang),
        iconBg: color.iconBg,
        iconColor: color.iconColor,
        icon: form.icon,
        status: form.status,
        progressType: 'fraction',
        progressValue: 0,
        progressMax: steps.length,
        deadline: form.deadline || t('goals.deadlineUndefined', lang),
        deadlineShort: form.deadline || '',
        barColor: color.barColor,
        steps,
      }
      addGoal(newGoal)
      toast.success(lang === 'et' ? 'Eesmärk lisatud' : 'Goal added')
      setPostSave({ type: 'goal', id: newGoal.id })
      runAutomaticLinking('goal', newGoal.id, lang, {
        title: newGoal.title,
        description: newGoal.description,
      }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) })
      setShowAddModal(false)
      setForm(emptyForm)
      setFormError('')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = (id: string, status: GoalStatus) => {
    updateGoal(id, { status })
    setMenuOpenId(null)
  }

  const handleDeleteGoal = () => {
    if (!deleteGoal) return
    removeLinksForEntity('goal', deleteGoal.id)
    deleteGoalStore(deleteGoal.id)
    toast.success(lang === 'et' ? 'Eesmärk kustutatud' : 'Goal deleted')
    setDeleteGoal(null)
    setMenuOpenId(null)
  }

  const handleSaveEdit = async () => {
    if (!editGoal) return
    setSaving(true)
    try {
      updateGoal(editGoal.id, editGoal)
      toast.success(lang === 'et' ? 'Eesmärk uuendatud' : 'Goal updated')
      setEditGoal(null)
      setMenuOpenId(null)
    } finally {
      setSaving(false)
    }
  }

  const handleAddStep = () => {
    if (!detailGoal || !newStepText.trim()) return
    addStep(detailGoal.id, newStepText.trim())
    setNewStepText('')
  }

  const openMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (menuOpenId === id) {
      setMenuOpenId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setMenuUp(spaceBelow < 200)
    setMenuOpenId(id)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36]">{t('goals.title', lang)}</h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              {t('goals.subtitle', lang).replace('{n}', String(goals.length)).replace('{active}', String(activeCount))}
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            onClick={openCreateModal}
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('goals.add', lang)}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#ECECF2] w-fit">
          {([
            { key: 'all',       label: t('goals.filter.all',    lang).replace('{n}', String(goals.length))    },
            { key: 'active',    label: t('goals.filter.active', lang).replace('{active}', String(activeCount)) },
            { key: 'paused',    label: t('goals.filter.paused', lang).replace('{n}', String(pausedCount))     },
            { key: 'completed', label: t('goals.filter.done',   lang).replace('{n}', String(completedCount)) },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-[#EDE9FB] text-[#6F5AE8]'
                  : 'text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Goals list */}
        <div className="flex flex-col gap-4">
          {filtered.map((goal) => {
            const pct = Math.round((goal.progressValue / goal.progressMax) * 100)
            const status = STATUS_STYLE[goal.status]
            return (
              <div
                key={goal.id}
                onClick={() => setDetailGoal(goal)}
                className="bg-white rounded-2xl border border-[#ECECF2] p-5 hover:border-[#6F5AE8]/30 cursor-pointer kv-card"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: isDark ? darkBg(goal.iconBg) : goal.iconBg, color: isDark ? darkText(goal.iconColor) : goal.iconColor }}
                  >
                    {ICON_MAP[goal.icon]}
                  </div>

                  {/* Title + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-[#1A1F36]">{goal.title}</h3>
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: status.bg, color: status.color }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1">{goal.description}</p>

                    {/* Progress */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar value={goal.progressValue} max={goal.progressMax} color={goal.barColor} />
                      </div>
                      <span className="text-xs font-semibold text-[#1A1F36] w-14 text-right">
                        {goal.progressValue}/{goal.progressMax} · {pct}%
                      </span>
                    </div>

                    {/* Deadline */}
                    <div className="flex items-center gap-1.5 mt-2.5 text-xs text-[#94A3B8]">
                      <Calendar size={12} />
                      <span>{goal.deadline}</span>
                    </div>
                  </div>

                  {/* More menu — management only */}
                  <div className="relative flex-shrink-0" ref={(el) => { menuRefs.current[goal.id] = el }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => openMenu(e, goal.id)}
                      aria-label={lang === 'et' ? 'Eesmärgi valikud' : 'Goal options'}
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {menuOpenId === goal.id && (
                      <div className={`absolute right-0 ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'} w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg z-20 py-1`}>
                        <button
                          onClick={() => { setEditGoal({ ...goal }); setMenuOpenId(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#F8F7F4] transition-colors text-left"
                        >
                          <Pencil size={14} className="text-[#94A3B8]" /> {t('goals.menu.edit', lang)}
                        </button>
                        {goal.status === 'active' && (
                          <button
                            onClick={() => handleStatusChange(goal.id, 'paused')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#F8F7F4] transition-colors text-left"
                          >
                            <Pause size={14} className="text-[#94A3B8]" /> {t('goals.menu.pause', lang)}
                          </button>
                        )}
                        {goal.status === 'paused' && (
                          <button
                            onClick={() => handleStatusChange(goal.id, 'active')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#F8F7F4] transition-colors text-left"
                          >
                            <Play size={14} className="text-[#94A3B8]" /> {t('goals.menu.resume', lang)}
                          </button>
                        )}
                        {goal.status === 'completed' && (
                          <button
                            onClick={() => handleStatusChange(goal.id, 'active')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#F8F7F4] transition-colors text-left"
                          >
                            <Play size={14} className="text-[#94A3B8]" /> {t('goals.menu.resume', lang)}
                          </button>
                        )}
                        <div className="my-1 border-t border-[#F4F4F0]" />
                        <button
                          onClick={() => { setDeleteGoal(goal); setMenuOpenId(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#E11D48] hover:bg-[#FEF2F2] transition-colors text-left"
                        >
                          <Trash2 size={14} /> {t('goals.menu.delete', lang)}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-[#ECECF2] flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center">
                <Target size={20} className="text-[#94A3B8]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1F36]">{t('goals.empty.title', lang)}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{t('goals.empty.body', lang)}</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
              >
                <Plus size={14} />
                {lang === 'et' ? 'Lisa eesmärk' : 'Add goal'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">

        {/* Ülevaade */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('goals.overview.title', lang)}</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F1F0EB" strokeWidth="3.5" className="kv-chart-track" />
                {segments.map((seg) => {
                  const fraction = seg.count / Math.max(total, 1)
                  const dash = fraction * circumference
                  const circle = (
                    <circle
                      key={seg.label}
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke={seg.color} strokeWidth="3.5"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                    />
                  )
                  offset += dash
                  return circle
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-[#1A1F36]">{total}</span>
                <span className="text-[10px] text-[#94A3B8] -mt-0.5">{t('goals.title', lang).toLowerCase()}</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              {segments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                    <span className="text-[#64748B]">{seg.label}</span>
                  </div>
                  <span className="font-semibold text-[#1A1F36]">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pikim seeria */}
        {longest && (
          <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
            <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('goals.longestStreak.title', lang)}</h3>
            <button
              onClick={() => setDetailGoal(longest)}
              className="w-full flex items-center gap-3 group"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: longest.iconBg }}>
                <Trophy size={22} style={{ color: longest.iconColor }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-lg font-bold text-[#1A1F36]">
                  {Math.round((longest.progressValue / longest.progressMax) * 100)}%
                </p>
                <p className="text-xs text-[#64748B] truncate">{longest.title}</p>
              </div>
              <ChevronRight size={16} className="text-[#94A3B8] flex-shrink-0 group-hover:text-[#6F5AE8] transition-colors" />
            </button>
          </div>
        )}

        {/* Järgmised tähtajad — derived from real user goals */}
        {goals.filter(g => g.status === 'active' && g.deadline).length > 0 && (
          <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
            <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('goals.upcoming.title', lang)}</h3>
            <div className="flex flex-col gap-3">
              {goals
                .filter(g => g.status === 'active' && g.deadline)
                .slice(0, 3)
                .map((goal) => (
                  <div key={goal.id} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isDark ? darkBg(goal.iconBg) : goal.iconBg, color: isDark ? darkText(goal.iconColor) : goal.iconColor }}
                    >
                      {ICON_MAP[goal.icon]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1A1F36] truncate">{goal.title}</p>
                      <p className="text-[11px] text-[#94A3B8]">{goal.deadlineShort}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* AI placeholder — no real AI yet */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.8} className="text-[#6F5AE8] flex-shrink-0" />
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {lang === 'et' ? 'Personaliseeritud nõuanded tulemas' : 'Personalized insights coming soon'}
            </h3>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {lang === 'et'
              ? 'Kivora õpib sinu harjumusi, ülesandeid, eesmärke ja rutiine. Personaliseeritud soovitused ilmuvad automaatselt, kui piisavalt andmeid on kogutud.'
              : 'Kivora is learning about your habits, tasks, goals and routines. Personalized recommendations will appear automatically once enough information has been collected.'}
          </p>
        </div>
      </aside>

      {/* ── Add Goal modal ────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-goal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
              <h2 id="add-goal-title" className="text-base font-semibold text-[#1A1F36]">{t('goals.modal.addTitle', lang)}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <label htmlFor="goal-add-title" className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.nameLabel', lang)} *</label>
                <input
                  id="goal-add-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => { setForm({ ...form, title: e.target.value }); setFormError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAddGoal() }}
                  placeholder={t('goals.modal.namePlaceholder', lang)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                />
                {formError && <p className="text-xs text-[#E11D48] mt-1">{formError}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.descLabel', lang)}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t('goals.modal.descPlaceholder', lang)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.categoryLabel', lang)}</label>
                  <select
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value as Goal['icon'] })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors bg-white"
                  >
                    {ICON_OPTIONS_LANG.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.deadlineLabel', lang)}</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.colorLabel', lang)}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {makeColorOptions(lang).map((c, i) => (
                    <button
                      key={c.name}
                      onClick={() => setForm({ ...form, colorIndex: i })}
                      className={`w-8 h-8 rounded-full transition-all ${form.colorIndex === i ? 'ring-2 ring-offset-2 ring-[#1A1F36]' : 'goals-color-inactive'}`}
                      style={{ background: c.barColor }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.statusLabel', lang)}</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm({ ...form, status: 'active' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.status === 'active' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F8F7F4] text-[#64748B] hover:text-[#1A1F36]'}`}
                  >
                    {t('goals.status.active', lang)}
                  </button>
                  <button
                    onClick={() => setForm({ ...form, status: 'paused' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.status === 'paused' ? 'bg-[#FEF9C3] text-[#CA8A04]' : 'bg-[#F8F7F4] text-[#64748B] hover:text-[#1A1F36]'}`}
                  >
                    {t('goals.status.paused', lang)}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.stepsLabel', lang)}</label>
                <textarea
                  value={form.stepsText}
                  onChange={(e) => setForm({ ...form, stepsText: e.target.value })}
                  placeholder={t('goals.modal.stepsPlaceholder', lang)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={() => { setShowAddModal(false); setForm(emptyForm); setFormError('') }}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('goals.modal.cancel', lang)}
              </button>
              <button
                onClick={handleAddGoal}
                disabled={!form.title.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {t('goals.modal.save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Goal modal (properties only) ─────────────────────────── */}
      {editGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setEditGoal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-goal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl">
              <h2 id="edit-goal-title" className="text-base font-semibold text-[#1A1F36]">{t('goals.modal.editTitle', lang)}</h2>
              <button
                onClick={() => setEditGoal(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.nameLabel', lang)}</label>
                <input
                  type="text"
                  value={editGoal.title}
                  onChange={(e) => setEditGoal({ ...editGoal, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.descLabel', lang)}</label>
                <textarea
                  value={editGoal.description}
                  onChange={(e) => setEditGoal({ ...editGoal, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.categoryLabel', lang)}</label>
                  <select
                    value={editGoal.icon}
                    onChange={(e) => setEditGoal({ ...editGoal, icon: e.target.value as Goal['icon'] })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors bg-white"
                  >
                    {ICON_OPTIONS_LANG.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.deadlineLabel', lang)}</label>
                  <input
                    type="text"
                    value={editGoal.deadline}
                    onChange={(e) => setEditGoal({ ...editGoal, deadline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-2 block">{t('goals.modal.colorLabel', lang)}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {makeColorOptions(lang).map((c, i) => {
                    const matchIdx = makeColorOptions(lang).findIndex((co) => co.barColor === editGoal.barColor)
                    return (
                      <button
                        key={c.name}
                        onClick={() => setEditGoal({ ...editGoal, barColor: c.barColor, iconBg: c.iconBg, iconColor: c.iconColor })}
                        className={`w-8 h-8 rounded-full transition-all ${matchIdx === i ? 'ring-2 ring-offset-2 ring-[#1A1F36]' : 'goals-color-inactive'}`}
                        style={{ background: c.barColor }}
                        title={c.name}
                      />
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1 block">{t('goals.modal.statusLabel', lang)}</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditGoal({ ...editGoal, status: 'active' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editGoal.status === 'active' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F8F7F4] text-[#64748B] hover:text-[#1A1F36]'}`}
                  >
                    {t('goals.status.active', lang)}
                  </button>
                  <button
                    onClick={() => setEditGoal({ ...editGoal, status: 'paused' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editGoal.status === 'paused' ? 'bg-[#FEF9C3] text-[#CA8A04]' : 'bg-[#F8F7F4] text-[#64748B] hover:text-[#1A1F36]'}`}
                  >
                    {t('goals.status.paused', lang)}
                  </button>
                  <button
                    onClick={() => setEditGoal({ ...editGoal, status: 'completed' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editGoal.status === 'completed' ? 'bg-[#E2E8F0] text-[#64748B]' : 'bg-[#F8F7F4] text-[#64748B] hover:text-[#1A1F36]'}`}
                  >
                    {t('goals.status.done', lang)}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={() => setEditGoal(null)}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t('goals.modal.cancel', lang)}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editGoal?.title.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {t('goals.modal.save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Goal Detail View (workbench) ──────────────────────────────── */}
      {detailGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setDetailGoal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-goal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDetailGoal(null)}
                  aria-label="Back"
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isDark ? darkBg(detailGoal.iconBg) : detailGoal.iconBg, color: isDark ? darkText(detailGoal.iconColor) : detailGoal.iconColor }}
                >
                  {ICON_MAP[detailGoal.icon]}
                </div>
                <div>
                  <h2 id="detail-goal-title" className="text-base font-semibold text-[#1A1F36]">{detailGoal.title}</h2>
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: STATUS_STYLE[detailGoal.status].bg, color: STATUS_STYLE[detailGoal.status].color }}
                  >
                    {STATUS_STYLE[detailGoal.status].label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailGoal(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5">
              {/* Description */}
              <div>
                <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">{t('goals.detail.descLabel', lang)}</p>
                <p className="text-sm text-[#374151] leading-relaxed">{detailGoal.description}</p>
              </div>

              {/* Deadline + AI */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F8F7F4] rounded-xl p-3">
                  <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">{t('goals.detail.deadline', lang)}</p>
                  <div className="flex items-center gap-1.5 text-sm text-[#1A1F36] font-medium">
                    <Calendar size={14} className="text-[#94A3B8]" />
                    {detailGoal.deadline}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-[#6F5AE8]/10 to-[#7C6BF0]/10 rounded-xl p-3">
                  <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">{t('goals.ai.title', lang)}</p>
                  <p className="text-xs text-[#374151] leading-relaxed">
                    {detailGoal.steps.filter((s) => s.done).length >= detailGoal.steps.length / 2
                      ? t('goals.detail.aiHalf', lang)
                      : t('goals.detail.aiStart', lang)}
                  </p>
                </div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide">{t('goals.detail.progress', lang)}</p>
                  <span className="text-sm font-semibold text-[#1A1F36]">
                    {detailGoal.progressValue} / {detailGoal.progressMax} · {Math.round((detailGoal.progressValue / detailGoal.progressMax) * 100)}%
                  </span>
                </div>
                <ProgressBar value={detailGoal.progressValue} max={detailGoal.progressMax} color={detailGoal.barColor} />
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide">{t('goals.detail.steps', lang)}</p>
                  <span className="text-xs text-[#64748B]">
                    {detailGoal.steps.filter((s) => s.done).length} / {detailGoal.steps.length}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {detailGoal.steps.map((step) => (
                    <div
                      key={step.id}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F7F4] transition-colors"
                    >
                      <button
                        onClick={() => toggleStep(detailGoal.id, step.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          step.done
                            ? 'bg-[#6F5AE8] border-[#6F5AE8]'
                            : 'border-[#D1D5DB] hover:border-[#6F5AE8]'
                        }`}
                      >
                        {step.done && <Check size={12} className="text-white" strokeWidth={3} />}
                      </button>
                      <span className={`flex-1 text-sm ${step.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                        {step.title}
                      </span>
                      <button
                        onClick={() => deleteStep(detailGoal.id, step.id)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#E11D48] transition-all"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add step */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={newStepText}
                    onChange={(e) => setNewStepText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep() }}
                    placeholder={t('goals.detail.addStep', lang)}
                    className="flex-1 px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] transition-colors"
                  />
                  <button
                    onClick={handleAddStep}
                    className="w-9 h-9 rounded-lg bg-[#6F5AE8] text-white flex items-center justify-center hover:bg-[#5B48D8] transition-colors flex-shrink-0"
                  >
                    <PlusCircle size={16} />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F8F7F4] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-[#1A1F36]">{detailGoal.steps.length}</p>
                  <p className="text-[11px] text-[#94A3B8]">{t('goals.detail.stepsTotal', lang)}</p>
                </div>
                <div className="bg-[#F8F7F4] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-[#16A34A]">{detailGoal.steps.filter((s) => s.done).length}</p>
                  <p className="text-[11px] text-[#94A3B8]">{t('goals.detail.stepsDone', lang)}</p>
                </div>
                <div className="bg-[#F8F7F4] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-[#F97316]">{detailGoal.steps.filter((s) => !s.done).length}</p>
                  <p className="text-[11px] text-[#94A3B8]">{t('goals.detail.stepsLeft', lang)}</p>
                </div>
              </div>

              <LinkedItemsPanel
                type="goal"
                entityId={detailGoal.id}
                lang={lang}
                className="py-1"
              />

              {/* Mark completed button */}
              {detailGoal.status !== 'completed' && (
                <button
                  onClick={() => { updateGoal(detailGoal.id, { status: 'completed' }); }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors shadow-sm"
                >
                  <CheckCircle2 size={16} />
                  {t('goals.detail.markDone', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      {deleteGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setDeleteGoal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-goal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#F4F4F0]">
              <h2 id="delete-goal-title" className="text-base font-semibold text-[#1A1F36]">{t('goals.deleteConfirm.title', lang)}</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-[#64748B]">{t('goals.deleteConfirm.body', lang).replace('{title}', deleteGoal.title)}</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={() => setDeleteGoal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                {t('goals.deleteConfirm.cancel', lang)}
              </button>
              <button
                onClick={handleDeleteGoal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm"
              >
                {t('goals.deleteConfirm.confirm', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {postSave && (
        <PostSaveLinkSuggestionsDialog
          type={postSave.type}
          entityId={postSave.id}
          lang={lang}
          onClose={() => setPostSave(null)}
        />
      )}
      {autoLink && (
        <AutoLinkToast
          linkIds={autoLink.linkIds}
          calendarEventId={autoLink.calendarEventId}
          lang={lang}
          onClose={() => setAutoLink(null)}
        />
      )}
    </div>
  )
}
