import { useState, useRef, useEffect } from 'react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { executeActions, type AIAction } from '@/lib/aiActions'
import { buildAIContext } from '@/lib/aiContextBuilder'
import MarkdownReply from '@/components/ai/MarkdownReply'
import {
  Sparkles,
  Send,
  Calendar,
  CheckSquare,
  Target,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  MessageCircle,
  Check,
  LayoutList,
  Lightbulb,
  BarChart2,
  Heart,
  MoreHorizontal,
  ArrowLeft,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'

type Role = 'user' | 'assistant'
interface ChatMessage {
  id: string
  role: Role
  content: string
  time: string
  pending?: boolean
  error?: boolean
}
interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  pinned: boolean
  createdAt: number
  updatedAt: number
  iconColor: string
  iconBg: string
}





const CHAT_PALETTE = [
  { iconColor: '#6F5AE8', iconBg: '#EDE9FB' },
  { iconColor: '#16A34A', iconBg: '#DCFCE7' },
  { iconColor: '#CA8A04', iconBg: '#FEF9C3' },
  { iconColor: '#DC2626', iconBg: '#FEE2E2' },
]

function nowTime(lang: string) {
  const locale = lang === 'en' ? 'en-GB' : 'et-EE'
  return new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

// ── Real API call via Supabase Edge Function ─────────────────────────
// Swap this single function if the backend changes. It accepts the full
// conversation history and returns the assistant's reply text.
interface AIResponse {
  reply: string
  actions: AIAction[]
}

async function fetchAIReply(history: { role: 'user' | 'assistant'; content: string }[]): Promise<AIResponse> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, context: buildAIContext() }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status}).`)
  }
  const data = await res.json()
  if (!data.reply && (!data.actions || data.actions.length === 0)) throw new Error('AI returned no reply.')
  return { reply: data.reply || '', actions: data.actions || [] }
}

const STORAGE_KEY = 'kivora_chats_v1'

export default function AIAssistantPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const QUICK_ACTIONS_LANG = [
    { label: t('ai.quick.planDay',        lang), icon: <Calendar size={14} strokeWidth={2} /> },
    { label: t('ai.quick.prioritize',     lang), icon: <LayoutList size={14} strokeWidth={2} /> },
    { label: t('ai.quick.analyzeHabits',  lang), icon: <TrendingUp size={14} strokeWidth={2} /> },
    { label: t('ai.quick.motivate',       lang), icon: <Lightbulb size={14} strokeWidth={2} /> },
  ]

  const SUGGESTED_LANG = [
    { icon: <Calendar size={20} strokeWidth={1.8} />, iconBg: '#EDE9FB', iconColor: '#6F5AE8',
      title: t('ai.suggested.plan.title',       lang), desc: t('ai.suggested.plan.desc',       lang) },
    { icon: <CheckSquare size={20} strokeWidth={1.8} />, iconBg: '#DCFCE7', iconColor: '#16A34A',
      title: t('ai.suggested.prioritize.title', lang), desc: t('ai.suggested.prioritize.desc', lang) },
    { icon: <Target size={20} strokeWidth={1.8} />, iconBg: '#FEE2E2', iconColor: '#DC2626',
      title: t('ai.suggested.goals.title',      lang), desc: t('ai.suggested.goals.desc',      lang) },
    { icon: <TrendingUp size={20} strokeWidth={1.8} />, iconBg: '#EDE9FB', iconColor: '#6F5AE8',
      title: t('ai.suggested.habits.title',     lang), desc: t('ai.suggested.habits.desc',     lang) },
  ]

  const AI_CAPABILITIES_LANG = [
    { icon: <Sparkles size={16} strokeWidth={1.8} />, iconBg: '#EDE9FB', iconColor: '#6F5AE8',
      title: t('ai.cap.smart.title',      lang), desc: t('ai.cap.smart.desc',      lang) },
    { icon: <CheckSquare size={16} strokeWidth={1.8} />, iconBg: '#DCFCE7', iconColor: '#16A34A',
      title: t('ai.cap.plan.title',       lang), desc: t('ai.cap.plan.desc',       lang) },
    { icon: <BarChart2 size={16} strokeWidth={1.8} />, iconBg: '#FEE2E2', iconColor: '#DC2626',
      title: t('ai.cap.analysis.title',   lang), desc: t('ai.cap.analysis.desc',   lang) },
    { icon: <Heart size={16} strokeWidth={1.8} />, iconBg: '#FEF9C3', iconColor: '#CA8A04',
      title: t('ai.cap.motivation.title', lang), desc: t('ai.cap.motivation.desc', lang) },
  ]

  const STATS_LANG = [
    { key: 'chats', label: t('ai.stat.chats', lang), iconBg: '#EDE9FB', iconColor: '#6F5AE8', icon: <MessageCircle size={16} strokeWidth={1.8} /> },
    { key: 'tasks', label: t('ai.stat.tasks', lang), iconBg: '#DCFCE7', iconColor: '#16A34A', icon: <CheckSquare size={16} strokeWidth={1.8} />    },
    { key: 'goals', label: t('ai.stat.goals', lang), iconBg: '#FEF9C3', iconColor: '#CA8A04', icon: <Target size={16} strokeWidth={1.8} />         },
  ]

  const [input, setInput] = useState('')
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) as Chat[] : []
    } catch { return [] }
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeChat = chats.find((c) => c.id === activeId) ?? null

  // Persist chats to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)) } catch { /* ignore */ }
  }, [chats])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeChat?.messages.length, activeId])

  useEffect(() => {
    const close = () => setMenuOpenId(null)
    if (menuOpenId) window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpenId])

  // Auto-start a chat when arriving from Kool with a pending prompt
  useEffect(() => {
    const prompt = sessionStorage.getItem('kivora_ai_prompt')
    if (prompt) {
      sessionStorage.removeItem('kivora_ai_prompt')
      startNewChat(prompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createChat(firstMessage: string | null): Promise<Chat> {
    const palette = CHAT_PALETTE[chats.length % CHAT_PALETTE.length]
    const id = uid()
    const title = firstMessage ? firstMessage.slice(0, 48) : t('ai.newChat', lang)
    const messages: ChatMessage[] = []
    if (firstMessage) {
      messages.push({ id: uid(), role: 'user', content: firstMessage, time: nowTime(lang) })
      messages.push({ id: uid(), role: 'assistant', content: '', time: nowTime(lang), pending: true })
    }
    const chat: Chat = { id, title, messages, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), ...palette }
    if (firstMessage) {
      setLoading(true)
      const history = messages.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content }))
      fetchAIReply(history).then((res) => {
        const results = executeActions(res.actions)
        const actionSummary = results.filter((r) => r.success).map((r) => r.message).join(' ')
        const finalReply = [actionSummary, res.reply].filter(Boolean).join('\n\n')
        setChats((prev) => prev.map((c) => (c.id === id ? {
          ...c,
          updatedAt: Date.now(),
          messages: c.messages.map((m) => m.id === messages[1].id ? { ...m, content: finalReply, pending: false } : m),
        } : c)))
      }).catch(() => {
        setChats((prev) => prev.map((c) => (c.id === id ? {
          ...c,
          messages: c.messages.map((m) => m.id === messages[1].id ? { ...m, content: t('ai.chat.error', lang), pending: false, error: true } : m),
        } : c)))
      }).finally(() => setLoading(false))
    }
    return chat
  }

  async function startNewChat(prefilled: string | null = null) {
    const chat = await createChat(prefilled)
    setChats((prev) => [chat, ...prev])
    setActiveId(chat.id)
    setInput('')
  }

  function openChat(id: string) {
    setActiveId(id)
    setMenuOpenId(null)
  }

  function backToList() {
    setActiveId(null)
  }

  function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    if (!activeChat) {
      startNewChat(trimmed)
      return
    }

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed, time: nowTime(lang) }
    const aiMsgId = uid()
    const aiMsg: ChatMessage = { id: aiMsgId, role: 'assistant', content: '', time: nowTime(lang), pending: true }
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? { ...c, messages: [...c.messages, userMsg, aiMsg], title: c.messages.length === 0 ? trimmed.slice(0, 48) : c.title, updatedAt: Date.now() }
          : c
      )
    )
    setInput('')

    // Build conversation history from all non-pending messages plus the new user message
    const fullHistory = [...activeChat.messages.filter((m) => !m.pending && !m.error), userMsg].map((m) => ({ role: m.role, content: m.content }))
    setLoading(true)
    fetchAIReply(fullHistory).then((res) => {
      const results = executeActions(res.actions)
      const actionSummary = results.filter((r) => r.success).map((r) => r.message).join(' ')
      const finalReply = [actionSummary, res.reply].filter(Boolean).join('\n\n')
      setChats((prev) => prev.map((c) => (c.id === activeChat.id ? {
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) => m.id === aiMsgId ? { ...m, content: finalReply, pending: false } : m),
      } : c)))
    }).catch(() => {
      setChats((prev) => prev.map((c) => (c.id === activeChat.id ? {
        ...c,
        messages: c.messages.map((m) => m.id === aiMsgId ? { ...m, content: t('ai.chat.error', lang), pending: false, error: true } : m),
      } : c)))
    }).finally(() => setLoading(false))
  }

  function handleSend() {
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && input.trim()) handleSend()
    }
  }

  function startRename(id: string, current: string) {
    setRenamingId(id)
    setRenameValue(current)
    setMenuOpenId(null)
  }

  function commitRename() {
    if (!renamingId) return
    const v = renameValue.trim()
    if (v) {
      setChats((prev) => prev.map((c) => (c.id === renamingId ? { ...c, title: v, updatedAt: Date.now() } : c)))
    }
    setRenamingId(null)
    setRenameValue('')
  }

  function togglePin(id: string) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)))
    setMenuOpenId(null)
  }

  function deleteChat(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(null)
    setMenuOpenId(null)
  }

  function formatChatTime(c: Chat): string {
    const diff = Date.now() - c.updatedAt
    const locale = lang === 'en' ? 'en-GB' : 'et-EE'
    if (diff < 86400_000) return `${t('ai.time.today', lang)}, ${new Date(c.updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
    if (diff < 2 * 86400_000) return t('ai.time.yesterday', lang)
    return new Date(c.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const sortedChats = [...chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

        {activeChat ? (
          /* ── Active chat view ── */
          <div className="flex flex-col bg-white rounded-2xl border border-[#ECECF2] overflow-hidden h-[calc(100vh-7rem)] min-h-[480px]">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECECF2]">
              <button
                onClick={backToList}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: activeChat.iconBg, color: activeChat.iconColor }}
              >
                <MessageCircle size={15} strokeWidth={1.8} />
              </div>
              <p className="flex-1 text-sm font-semibold text-[#1A1F36] truncate">{activeChat.title}</p>
              {activeChat.pinned && <Pin size={14} className="text-[#6F5AE8]" />}
              <div className="relative">
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(menuOpenId === activeChat.id ? null : activeChat.id)
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpenId === activeChat.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg py-1 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startRename(activeChat.id, activeChat.title)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                    >
                      <Pencil size={13} /> {t('ai.menu.rename', lang)}
                    </button>
                    <button
                      onClick={() => togglePin(activeChat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                    >
                      {activeChat.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      {activeChat.pinned ? t('ai.menu.unpin', lang) : t('ai.menu.pin', lang)}
                    </button>
                    <button
                      onClick={() => deleteChat(activeChat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={13} /> {t('ai.menu.delete', lang)}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-4">
              {activeChat.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-sm text-[#94A3B8]">
                  <Sparkles size={28} className="mb-3 text-[#6F5AE8]" />
                  {t('ai.chat.startPrompt', lang)}
                </div>
              )}
              {activeChat.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#6F5AE8] text-white rounded-br-md'
                        : 'bg-[#F4F4F8] text-[#1A1F36] rounded-bl-md'
                    }`}
                  >
                    {m.pending ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <>
                        {m.role === 'assistant' && !m.error ? (
                          <MarkdownReply content={m.content} />
                        ) : (
                          <span className={m.error ? 'text-[#DC2626]' : ''}>{m.content}</span>
                        )}
                        <span className={`block text-[10px] mt-1 ${m.role === 'user' ? 'text-white/60' : 'text-[#94A3B8]'}`}>
                          {m.time}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-3 bg-white border-t border-[#ECECF2] px-4 py-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('ai.chat.placeholder', lang)}
                className="flex-1 text-sm text-[#1A1F36] placeholder:text-[#94A3B8] bg-transparent outline-none"
              />
              <button
                className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors text-white disabled:opacity-40"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <Send size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Hero card */}
            <div className="bg-[#F2EFFD] rounded-2xl border border-[#DDD8F8] p-7">
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center mb-5 text-[#6F5AE8]">
                <Sparkles size={20} strokeWidth={2} />
              </div>

              <h1 className="text-2xl font-bold text-[#1A1F36] mb-1">{t('ai.heroTitle', lang)}</h1>
              <p className="text-sm text-[#64748B] mb-6">
                {t('ai.heroSubtitle', lang)}
              </p>

              {/* Input */}
              <div className="flex items-center gap-3 bg-white rounded-xl border border-[#DDD8F8] px-4 py-3 shadow-sm">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('ai.input.placeholder2', lang)}
                  className="flex-1 text-sm text-[#1A1F36] placeholder:text-[#94A3B8] bg-transparent outline-none"
                />
                <button
                  className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors text-white disabled:opacity-40"
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  <Send size={15} strokeWidth={2.2} />
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {QUICK_ACTIONS_LANG.map((qa) => (
                  <button
                    key={qa.label}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white border border-[#DDD8F8] text-xs font-medium text-[#1A1F36] transition-colors"
                    onClick={() => startNewChat(qa.label)}
                  >
                    <span className="text-[#6F5AE8]">{qa.icon}</span>
                    {qa.label}
                  </button>
                ))}
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 hover:bg-white border border-[#DDD8F8] text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
                  onClick={() => startNewChat(null)}
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </div>

            {/* Soovitatud tegevused */}
            <section>
              <h2 className="text-base font-semibold text-[#1A1F36] mb-3">{t('ai.suggestions.title', lang)}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {SUGGESTED_LANG.map((item) => (
                  <button
                    key={item.title}
                    className="bg-white rounded-2xl border border-[#ECECF2] p-4 text-left hover:border-[#6F5AE8]/30 hover:shadow-md transition-all group"
                    onClick={() => startNewChat(item.desc)}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: item.iconBg, color: item.iconColor }}
                    >
                      {item.icon}
                    </div>
                    <p className="text-sm font-semibold text-[#1A1F36] mb-1">{item.title}</p>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">{item.desc}</p>
                    <div className="flex justify-end mt-3">
                      <ChevronRight size={15} className="text-[#94A3B8] group-hover:text-[#6F5AE8] transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Hiljutised vestlused */}
            <section>
              <h2 className="text-base font-semibold text-[#1A1F36] mb-3">{t('ai.history.title', lang)}</h2>
              <div className="flex flex-col gap-2">
                {sortedChats.length === 0 && (
                  <div className="bg-white rounded-xl border border-[#ECECF2] px-4 py-6 text-center text-sm text-[#94A3B8]">
                    {t('ai.history.empty', lang)}
                  </div>
                )}
                {sortedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="relative flex items-center gap-4 bg-white rounded-xl border border-[#ECECF2] px-4 py-3.5 hover:border-[#6F5AE8]/30 hover:shadow-sm transition-all group"
                  >
                    <button
                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                      onClick={() => openChat(chat.id)}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: chat.iconBg, color: chat.iconColor }}
                      >
                        <MessageCircle size={16} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1F36] truncate">{chat.title}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{formatChatTime(chat)}</p>
                      </div>
                      {chat.pinned && <Pin size={13} className="text-[#6F5AE8] flex-shrink-0" />}
                      <ChevronRight size={15} className="text-[#94A3B8] flex-shrink-0 group-hover:text-[#6F5AE8] transition-colors" />
                    </button>
                    <div className="relative flex-shrink-0">
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(menuOpenId === chat.id ? null : chat.id)
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menuOpenId === chat.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg py-1 z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renamingId === chat.id ? (
                            <div className="px-3 py-2 flex items-center gap-2">
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
                                className="flex-1 text-xs text-[#1A1F36] bg-[#F4F4F8] rounded-md px-2 py-1.5 outline-none"
                              />
                              <button
                                onClick={commitRename}
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-[#6F5AE8] text-white"
                              >
                                <Check size={13} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => startRename(chat.id, chat.title)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                              >
                                <Pencil size={13} /> {t('ai.menu.rename', lang)}
                              </button>
                              <button
                                onClick={() => togglePin(chat.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                              >
                                {chat.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                                {chat.pinned ? t('ai.menu.unpin', lang) : t('ai.menu.pin', lang)}
                              </button>
                              <button
                                onClick={() => deleteChat(chat.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                              >
                                <Trash2 size={13} /> {t('ai.menu.delete', lang)}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">

        {/* AI võimalused */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('ai.capabilities.title', lang)}</h3>
          <div className="flex flex-col gap-4">
            {AI_CAPABILITIES_LANG.map((cap) => (
              <div key={cap.title} className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: cap.iconBg, color: cap.iconColor }}
                >
                  {cap.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1A1F36]">{cap.title}</p>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-0.5">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sinu statistika */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">{t('ai.stats.title', lang)}</h3>
          <div className="flex flex-col gap-3">
            {STATS_LANG.map((stat) => {
              const value =
                stat.key === 'chats' ? chats.length :
                stat.key === 'tasks' ? chats.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user' && /ülesann|prioriseeri|task|priorit/i.test(m.content)).length, 0) :
                chats.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user' && /eesmärk|eesmärke|goal|goals/i.test(m.content)).length, 0)
              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: stat.iconBg, color: stat.iconColor }}
                  >
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#1A1F36] leading-none">{value}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">{stat.label}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}
