import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Plus,
  Droplets,
  BookOpen,
  Moon,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  Apple,
  PersonStanding,
  X,
  Check,
  Pencil,
  Pause,
  Play,
  Trash2,
  Settings2,
} from 'lucide-react'
import { WEEK_DAYS } from '@/data/habitsData'
import type { Habit, HabitStatus, HabitCategory } from '@/data/habitsData'
import {
  getAllHabits,
  addHabit,
  updateHabit,
  toggleToday,
  setStatus,
  deleteHabit,
  subscribeHabits,
  TODAY_INDEX,
} from '@/lib/habitsStore'

const ICON_MAP: Record<Habit['icon'], React.ReactNode> = {
  droplet:    <Droplets size={18} strokeWidth={2} />,
  run:        <PersonStanding size={18} strokeWidth={2} />,
  book:       <BookOpen size={18} strokeWidth={2} />,
  meditation: <span style={{ fontSize: 17 }}>🧘</span>,
  apple:      <Apple size={18} strokeWidth={2} />,
  moon:       <Moon size={18} strokeWidth={2} />,
}

const ICON_OPTIONS: { id: Habit['icon']; label: string; node: React.ReactNode }[] = [
  { id: 'droplet',    label: 'Vesi',      node: <Droplets size={18} /> },
  { id: 'run',        label: 'Jooks',     node: <PersonStanding size={18} /> },
  { id: 'book',       label: 'Lugemine', node: <BookOpen size={18} /> },
  { id: 'meditation', label: 'Meditatsioon', node: <span style={{ fontSize: 17 }}>🧘</span> },
  { id: 'apple',      label: 'Toit',      node: <Apple size={18} /> },
  { id: 'moon',       label: 'Uni',       node: <Moon size={18} /> },
]

const COLOR_OPTIONS = [
  { color: '#6F5AE8', bg: '#EDE9FB' },
  { color: '#16A34A', bg: '#DCFCE7' },
  { color: '#2563EB', bg: '#DBEAFE' },
  { color: '#CA8A04', bg: '#FEF9C3' },
  { color: '#0D9488', bg: '#CCFBF1' },
  { color: '#DC2626', bg: '#FEE2E2' },
  { color: '#F97316', bg: '#FFF0E6' },
  { color: '#64748B', bg: '#F1F5F9' },
]

const CATEGORY_OPTIONS: HabitCategory[] = ['Isiklik', 'Tervis', 'Töö', 'Kool']

const STATUS_LABEL: Record<HabitStatus, string> = {
  active: 'Aktiivne',
  paused: 'Pausil',
  completed: 'Lõpetatud',
}

function DayDot({ done, color }: { done: boolean | null; color: string }) {
  if (done === null) {
    return <span className="text-xs text-[#CBD5E1] leading-none select-none">–</span>
  }
  return (
    <div
      className="w-4 h-4 rounded-full"
      style={{ background: done ? color : '#E2E8F0' }}
    />
  )
}

function computeWeekTotals(habits: Habit[]) {
  const activeHabits = habits.filter((h) => h.status === 'active')
  const total = activeHabits.length
  return WEEK_DAYS.map((_, i) => {
    const done = activeHabits.filter((h) => h.weekDays[i] === true).length
    return { done, total }
  })
}

interface HabitForm {
  title: string
  description: string
  category: HabitCategory
  icon: Habit['icon']
  iconColor: string
  iconBg: string
  goalPerDay: number
  recurrence: 'daily' | 'weekdays' | 'custom'
  customDays: boolean[]
}

const EMPTY_FORM: HabitForm = {
  title: '',
  description: '',
  category: 'Isiklik',
  icon: 'droplet',
  iconColor: '#6F5AE8',
  iconBg: '#EDE9FB',
  goalPerDay: 1,
  recurrence: 'daily',
  customDays: [true, true, true, true, true, false, false],
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>(getAllHabits())
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all')

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HabitForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  // Manage modal
  const [manageOpen, setManageOpen] = useState(false)

  // AI recommendation modal
  const [recommendOpen, setRecommendOpen] = useState(false)

  // Action menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuUp, setMenuUp] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    return subscribeHabits(() => {
      setHabits(getAllHabits())
    })
  }, [])

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpenId) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuOpenId && menuRefs.current[menuOpenId] && !menuRefs.current[menuOpenId]!.contains(target)) {
        setMenuOpenId(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenId(null)
        setModalOpen(false)
        setManageOpen(false)
        setRecommendOpen(false)
        setDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpenId])

  const activeCount    = habits.filter((h) => h.status === 'active').length
  const pausedCount    = habits.filter((h) => h.status === 'paused').length
  const completedCount = habits.filter((h) => h.status === 'completed').length

  const filtered = habits.filter((h) => {
    if (filter === 'active')    return h.status === 'active'
    if (filter === 'paused')    return h.status === 'paused'
    if (filter === 'completed') return h.status === 'completed'
    return true
  })

  const displayed = filtered

  const weekTotals = computeWeekTotals(habits)
  const weekDone  = weekTotals.reduce((s, d) => s + d.done, 0)
  const weekTotal = weekTotals.reduce((s, d) => s + d.total, 0)
  const pct       = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0

  const longestStreak = habits.reduce<Habit | null>((best, h) => {
    if (!best || h.streak > best.streak) return h
    return best
  }, null)

  const suurepärane = habits.filter((h) => h.status === 'active' && h.streak >= 10).length
  const hea         = habits.filter((h) => h.status === 'active' && h.streak >= 5 && h.streak < 10).length
  const vajab       = habits.filter((h) => h.status === 'active' && h.streak < 5).length

  const circumference = 97.4
  const suurOff  = 0
  const heaOff   = (suurepärane / Math.max(activeCount, 1)) * circumference
  const vajabOff = heaOff + (hea / Math.max(activeCount, 1)) * circumference

  // Modal handlers
  const openCreateModal = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEditModal = (habit: Habit) => {
    setEditingId(habit.id)
    const recurrence: HabitForm['recurrence'] =
      habit.weekDays.every((d) => d === true) ? 'daily'
      : habit.weekDays.slice(0, 5).every((d) => d === true) && habit.weekDays.slice(5).every((d) => d !== true) ? 'weekdays'
      : 'custom'
    setForm({
      title: habit.title,
      description: habit.description,
      category: habit.category,
      icon: habit.icon,
      iconColor: habit.iconColor,
      iconBg: habit.iconBg,
      goalPerDay: 1,
      recurrence,
      customDays: habit.weekDays.map((d) => d === true),
    })
    setFormError('')
    setMenuOpenId(null)
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!form.title.trim()) {
      setFormError('Harjumuse nimi on kohustuslik.')
      return
    }
    if (editingId) {
      updateHabit(editingId, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        icon: form.icon,
        iconColor: form.iconColor,
        iconBg: form.iconBg,
      })
    } else {
      addHabit({
        title: form.title,
        description: form.description,
        category: form.category,
        icon: form.icon,
        iconColor: form.iconColor,
        iconBg: form.iconBg,
        recurrence: form.recurrence,
        customDays: form.customDays,
      })
    }
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingId(null)
  }

  const handleCancelForm = () => {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingId(null)
  }

  const handleToggleToday = (id: string) => {
    toggleToday(id)
    setMenuOpenId(null)
  }

  const handlePause = (id: string) => {
    setStatus(id, 'paused')
    setMenuOpenId(null)
  }

  const handleResume = (id: string) => {
    setStatus(id, 'active')
    setMenuOpenId(null)
  }

  const handleDelete = (id: string) => {
    deleteHabit(id)
    setDeleteId(null)
    setMenuOpenId(null)
  }

  // Static, extensible AI recommendation. Computed from current habits so it
  // stays meaningful as the underlying data changes. Replace `recommendation`
  // with a real AI-driven generator later without touching the modal.
  const recommendation = useMemo(() => {
    const target = habits.find((h) => h.title.toLowerCase() === 'treeni') || habits[0]
    const weekDone = target ? target.weekDays.filter((d) => d === true).length : 0
    const weekTotal = target ? target.weekDays.filter((d) => d !== null).length : 7
    return {
      habitId: target?.id ?? null,
      habitTitle: target?.title ?? 'Treeni',
      summary: 'Trenn vajab sel nädalal veidi rohkem tähelepanu.',
      reason: `Viimase nädala põhjal oled selle harjumuse täitnud ${weekDone} päeval ${Math.max(weekTotal, 1)}-st.`,
      tips: [
        'Lisa sellele harjumusele meeldetuletus.',
        'Planeeri treening kindlale kellaajale.',
        'Alusta väiksema eesmärgiga, et säilitada järjepidevus.',
      ],
    }
  }, [habits])

  const handleOpenRecommendation = () => {
    setRecommendOpen(true)
  }

  const handleOpenHabitFromRecommendation = () => {
    setRecommendOpen(false)
    const target = habits.find((h) => h.id === recommendation.habitId)
    if (target) openEditModal(target)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">
      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36]">Harjumused</h1>
            <p className="text-sm text-[#64748B] mt-0.5">{habits.length} harjumust · {activeCount} aktiivset</p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            onClick={openCreateModal}
          >
            <Plus size={16} strokeWidth={2.5} />
            Lisa harjumus
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#ECECF2] w-fit">
          {([
            { key: 'all',       label: `Kõik (${habits.length})` },
            { key: 'active',    label: `Aktiivsed (${activeCount})` },
            { key: 'paused',    label: `Pausil (${pausedCount})` },
            { key: 'completed', label: `Lõpetatud (${completedCount})` },
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

        {/* Week view card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2">
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] transition-colors">
              <ChevronLeft size={16} />
            </button>

            <div className="flex-1 grid grid-cols-7 gap-1">
              {WEEK_DAYS.map((wd, i) => {
                const { done, total } = weekTotals[i]
                const isPast     = i < 2
                const isToday    = i === 1
                const hasData    = total > 0
                const fullDone   = done === total && total > 0
                const partDone   = done > 0 && done < total
                const progress   = total > 0 ? done / total : 0

                return (
                  <div
                    key={wd.short}
                    className={`flex flex-col items-center gap-2 py-3 px-1 rounded-xl transition-colors ${
                      isToday ? 'bg-[#F5F3FF] border border-[#C4B5FD]' : isPast ? 'bg-[#FAFAF8]' : ''
                    }`}
                  >
                    <span className="text-xs font-semibold text-[#1A1F36]">{wd.short}</span>
                    <span className="text-[10px] text-[#94A3B8]">{wd.date}</span>

                    {/* Circle indicator */}
                    {hasData && (isPast || isToday) ? (
                      <div className="relative w-9 h-9">
                        {fullDone ? (
                          <div className="w-9 h-9 rounded-full bg-[#6F5AE8] flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        ) : partDone ? (
                          <>
                            <svg className="w-9 h-9 -rotate-90 absolute inset-0" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                              <circle cx="18" cy="18" r="15" fill="none" stroke="#6F5AE8" strokeWidth="3"
                                strokeDasharray={`${progress * 94.2} ${94.2 - progress * 94.2}`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-[#6F5AE8]">{Math.round(progress * 100)}%</span>
                            </div>
                          </>
                        ) : (
                          <div className="w-9 h-9 rounded-full border-2 border-[#E2E8F0]" />
                        )}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full border-2 border-dashed border-[#E2E8F0]" />
                    )}

                    <span className="text-[11px] text-[#64748B] font-medium">
                      {(isPast || isToday) && total > 0 ? `${done}/${total}` : `0/${total}`}
                    </span>
                  </div>
                )
              })}
            </div>

            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Habits list */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden">
          {displayed.map((habit, idx) => {
            const isDoneToday = habit.weekDays[TODAY_INDEX] === true
            return (
              <div
                key={habit.id}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAF8] transition-colors group ${
                  idx !== displayed.length - 1 ? 'border-b border-[#F0F0F0]' : ''
                }`}
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: habit.iconBg, color: habit.iconColor }}
                >
                  {ICON_MAP[habit.icon]}
                </div>

                {/* Title + description */}
                <div className="min-w-0 w-44 flex-shrink-0">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">{habit.title}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{habit.description}</p>
                </div>

                {/* Streak */}
                <div className="flex-shrink-0 w-24 text-center">
                  {habit.status === 'paused' ? (
                    <>
                      <p className="text-sm font-bold text-[#94A3B8]">–</p>
                      <p className="text-xs text-[#94A3B8]">pausil</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-[#1A1F36]">{habit.streak}</p>
                      <p className="text-xs text-[#94A3B8]">päeva järjest</p>
                    </>
                  )}
                </div>

                {/* Week dots */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {WEEK_DAYS.map((wd) => (
                      <span key={wd.short} className="w-4 text-center text-[10px] text-[#94A3B8] font-medium">{wd.short}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {habit.weekDays.map((done, i) => (
                      <div key={i} className="w-4 flex items-center justify-center">
                        <DayDot done={done} color={habit.iconColor} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* More menu */}
                <div className="relative flex-shrink-0" ref={(el) => { menuRefs.current[habit.id] = el }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (menuOpenId === habit.id) {
                        setMenuOpenId(null)
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const spaceBelow = window.innerHeight - rect.bottom
                        setMenuUp(spaceBelow < 220)
                        setMenuOpenId(habit.id)
                      }
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical size={15} />
                  </button>

                  {menuOpenId === habit.id && (
                    <div className={`absolute right-0 ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'} w-48 bg-white rounded-xl border border-[#ECECF2] shadow-lg z-20 py-1`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleToday(habit.id)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        {isDoneToday ? <><X size={14} /> Tühista tänane täitmine</> : <><Check size={14} /> Märgi tänaseks tehtuks</>}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(habit)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Pencil size={14} /> Muuda
                      </button>
                      {habit.status === 'paused' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleResume(habit.id)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                        >
                          <Play size={14} /> Taasta
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePause(habit.id)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                        >
                          <Pause size={14} /> Pane pausile
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteId(habit.id)
                          setMenuOpenId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                      >
                        <Trash2 size={14} /> Kustuta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {displayed.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-[#1A1F36]">Harjumusi ei leitud</p>
              <p className="text-xs text-[#94A3B8] mt-1">Proovi teist filtrit või lisa uus harjumus.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">

        {/* Ülevaade */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Ülevaade</h3>
          <div className="flex items-center gap-4">
            {/* Donut */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F1F0EB" strokeWidth="3.5" />
                {/* Suurepärane */}
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#4ADE80" strokeWidth="3.5"
                  strokeDasharray={`${(suurepärane / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-suurOff} strokeLinecap="round"
                />
                {/* Hea */}
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#3B82F6" strokeWidth="3.5"
                  strokeDasharray={`${(hea / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-heaOff} strokeLinecap="round"
                />
                {/* Vajab */}
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#FDE68A" strokeWidth="3.5"
                  strokeDasharray={`${(vajab / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-vajabOff} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold text-[#1A1F36]">{pct}%</span>
                <span className="text-[9px] text-[#94A3B8] -mt-0.5">edukus</span>
              </div>
            </div>

            {/* Legend + stats */}
            <div className="flex-1 flex flex-col gap-2">
              {[
                { label: 'Suurepärane', sub: '(80%+)',  color: '#4ADE80', count: suurepärane },
                { label: 'Hea',         sub: '(50-79%)', color: '#3B82F6', count: hea },
                { label: 'Vajab tööd',  sub: '(<50%)',  color: '#FDE68A', count: vajab },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                    <span className="text-[#64748B]">{row.label}</span>
                    <span className="text-[#94A3B8]">{row.sub}</span>
                  </div>
                  <span className="font-semibold text-[#1A1F36]">{row.count}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-[#F4F4F0]">
                <p className="text-xs font-semibold text-[#1A1F36]">See nädal: {weekDone}/{weekTotal}</p>
                <p className="text-[10px] text-[#94A3B8]">Kõikide harjumuste keskmine</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pikim seeria */}
        {longestStreak && longestStreak.streak > 0 && (
          <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
            <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Pikim seeria</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#FEF9C3] flex items-center justify-center flex-shrink-0">
                <Trophy size={22} style={{ color: '#CA8A04' }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-[#1A1F36]">{longestStreak.streak} päeva</p>
                <p className="text-xs text-[#64748B]">{longestStreak.title}</p>
                <p className="text-xs text-[#94A3B8]">{longestStreak.category}</p>
              </div>
              <ChevronRight size={16} className="text-[#94A3B8] flex-shrink-0" />
            </div>
          </div>
        )}

        {/* Harjumused breakdown */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Harjumused</h3>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Aktiivsed',  count: activeCount,    color: '#4ADE80' },
              { label: 'Pausil',     count: pausedCount,    color: '#FDE68A' },
              { label: 'Lõpetatud', count: completedCount,  color: '#CBD5E1' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                  <span className="text-[#64748B]">{row.label}</span>
                </div>
                <span className="font-semibold text-[#1A1F36]">{row.count}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setManageOpen(true)}
            className="mt-3 pt-3 border-t border-[#F4F4F0] w-full flex items-center justify-between text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
          >
            Halda harjumusi
            <ChevronRight size={14} />
          </button>
        </div>

        {/* AI suggestion */}
        <div className="bg-gradient-to-br from-[#6F5AE8] to-[#7C6BF0] rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} strokeWidth={2} />
            <h3 className="text-sm font-semibold">AI soovitus</h3>
          </div>
          <p className="text-sm leading-relaxed text-white/90 mb-4">
            Sul läheb hästi! Proovi keskenduda harjumusele „Treeni", et tõsta oma üldist edukuse protsenti.
          </p>
          <button
            onClick={handleOpenRecommendation}
            className="w-full py-2 bg-white/20 hover:bg-white/30 transition-colors rounded-xl text-sm font-medium text-white"
          >
            Vaata soovitust
          </button>
        </div>
      </aside>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={handleCancelForm}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-[#1A1F36]">
                {editingId ? 'Muuda harjumust' : 'Lisa harjumus'}
              </h2>
              <button
                onClick={handleCancelForm}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  Harjumuse nimi <span className="text-[#E11D48]">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value })
                    setFormError('')
                  }}
                  placeholder="nt. Joo vett"
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kirjeldus</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="nt. 8 klaasi päevas"
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kategooria</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setForm({ ...form, category: cat })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.category === cat
                          ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]/30'
                          : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Ikoon</label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setForm({ ...form, icon: opt.id })}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        form.icon === opt.id
                          ? 'bg-[#EDE9FB] border border-[#6F5AE8]/30'
                          : 'bg-white border border-[#ECECF2] hover:bg-[#F8F7F4]'
                      }`}
                      style={form.icon === opt.id ? { color: form.iconColor } : { color: '#64748B' }}
                    >
                      {opt.node}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Värv</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.color}
                      onClick={() => setForm({ ...form, iconColor: c.color, iconBg: c.bg })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        form.iconColor === c.color ? 'ring-2 ring-offset-2 ring-[#1A1F36] scale-110' : 'hover:scale-110'
                      }`}
                      style={{ background: c.color }}
                    />
                  ))}
                </div>
              </div>

              {/* Goal per day */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Eesmärk päevas</label>
                <input
                  type="number"
                  min={1}
                  value={form.goalPerDay}
                  onChange={(e) => setForm({ ...form, goalPerDay: Math.max(1, Number(e.target.value)) })}
                  className="w-24 px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Recurrence */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kordus</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'daily',    label: 'Iga päev' },
                    { key: 'weekdays', label: 'Tööpäeviti' },
                    { key: 'custom',   label: 'Kindlad nädalapäevad' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setForm({ ...form, recurrence: opt.key })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.recurrence === opt.key
                          ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]/30'
                          : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {form.recurrence === 'custom' && (
                  <div className="flex gap-1.5 mt-2">
                    {WEEK_DAYS.map((wd, i) => (
                      <button
                        key={wd.short}
                        onClick={() => {
                          const next = [...form.customDays]
                          next[i] = !next[i]
                          setForm({ ...form, customDays: next })
                        }}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          form.customDays[i]
                            ? 'bg-[#6F5AE8] text-white'
                            : 'bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4]'
                        }`}
                      >
                        {wd.short}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {formError && <p className="text-sm text-[#E11D48]">{formError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] sticky bottom-0 bg-white">
              <button
                onClick={handleCancelForm}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                Tühista
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm"
              >
                Salvesta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage modal */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setManageOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Settings2 size={16} className="text-[#6F5AE8]" />
                <h2 className="text-base font-semibold text-[#1A1F36]">Halda harjumusi</h2>
              </div>
              <button
                onClick={() => setManageOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-2">
              {habits.map((habit) => (
                <div key={habit.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#ECECF2] hover:bg-[#FAFAF8] transition-colors">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: habit.iconBg, color: habit.iconColor }}
                  >
                    {ICON_MAP[habit.icon]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1F36] truncate">{habit.title}</p>
                    <p className="text-xs text-[#94A3B8]">{STATUS_LABEL[habit.status]}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(habit)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#6F5AE8] transition-colors"
                      title="Muuda"
                    >
                      <Pencil size={14} />
                    </button>
                    {habit.status === 'paused' ? (
                      <button
                        onClick={() => handleResume(habit.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#16A34A] transition-colors"
                        title="Jätka"
                      >
                        <Play size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePause(habit.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#CA8A04] transition-colors"
                        title="Pane pausile"
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteId(habit.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#E11D48] transition-colors"
                      title="Kustuta"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {habits.length === 0 && (
                <p className="text-sm text-[#94A3B8] py-6 text-center">Harjumusi pole.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setDeleteId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-3">
                <Trash2 size={20} className="text-[#E11D48]" />
              </div>
              <h3 className="text-base font-semibold text-[#1A1F36] mb-1">Kustuta harjumus?</h3>
              <p className="text-sm text-[#64748B]">Seda tegevust ei saa tagasi võtta.</p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                Tühista
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm"
              >
                Kustuta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI recommendation modal */}
      {recommendOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setRecommendOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0]">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <h2 className="text-base font-semibold text-[#1A1F36]">AI soovitus</h2>
              </div>
              <button
                onClick={() => setRecommendOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">Harjumus</p>
                <p className="text-sm font-semibold text-[#1A1F36]">{recommendation.habitTitle}</p>
                <p className="text-sm text-[#64748B] leading-relaxed mt-1">{recommendation.summary}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">Põhjendus</p>
                <p className="text-sm text-[#374151] leading-relaxed">{recommendation.reason}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-2">Soovitused</p>
                <ul className="flex flex-col gap-2">
                  {recommendation.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#374151] leading-relaxed">
                      <Check size={14} className="text-[#6F5AE8] mt-0.5 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={() => setRecommendOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                Sulge
              </button>
              <button
                onClick={handleOpenHabitFromRecommendation}
                disabled={!recommendation.habitId}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ava harjumus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
