/**
 * linkSuggestions.ts
 *
 * Shared suggestion engine for cross-module link suggestions.
 * Reads current singleton state from all stores synchronously.
 * Call computeSuggestions() from any React component; re-run whenever
 * the relevant dependency arrays change.
 *
 * Scoring (0–1), used for ranking and for the "show suggestion" tier:
 *   • Word overlap between title/context tokens  — up to 0.55
 *   • Exact category/subject/folder match        — +0.30
 *   • Date proximity (within 14 days)            — +0.25
 *
 * Show suggestion: score ≥ SHOW_SUGGESTION_THRESHOLD (0.30).
 *
 * High confidence (auto-link eligible) is a SEPARATE, stricter gate — see
 * computeIsHighConfidence() below. A high score from word overlap alone is
 * NOT enough: category/date can help a genuinely specific match clear the
 * score bar, but can never substitute for real textual evidence, and two
 * generic/filler words (WEAK_WORDS) are never treated as that evidence —
 * this holds regardless of how many items the user has (1, 2, 3, or
 * thousands): the gate is a fixed word list plus an exact-title check,
 * never a frequency statistic computed over the user's own (possibly
 * tiny) data, which would be meaningless with little data.
 */

import { getAllTasks } from '@/lib/tasksStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllEvents } from '@/lib/calendarStore'
import { getAllChats } from '@/lib/aiConversationsStore'
import { getAllSchoolTasks, getAllSchoolExams } from '@/lib/schoolStore'
import { getLinksForEntity } from '@/lib/entityLinksStore'
import type { EntityType, RelationType } from '@/types/entityLinks'
import { encodeSchoolId, decodeSchoolId } from '@/types/entityLinks'
import type { AppLang } from '@/lib/languageStore'

// ── Public types ──────────────────────────────────────────────────────────────

export interface LinkSuggestion {
  type: EntityType
  id: string
  title: string
  contextLabel?: string
  date?: string
  reason: string
  score: number
  /** true when safe to auto-link without confirmation — see computeIsHighConfidence() */
  isHighConfidence: boolean
  suggestedRelation: RelationType
}

// ── Stopwords ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  // Estonian
  'ja','on','ei','ka','aga','see','kõik','minu','oma','seda','olen','ning',
  'kui','nii','kes','mis','nende','tema','need','siis','selle','seda','ette',
  'üks','kaks','kolm','pole','kuid','vaid','veel','juba','ning','ehk','aga',
  'kuna','alla','üle','enne','pärast','jätkub','oma','meie','teie','nii',
  // English
  'the','and','or','is','it','in','at','of','to','a','an','for','with','from',
  'this','that','are','was','not','be','has','have','my','me','i','you','we',
  'can','will','do','did','but','if','then','than','also','just','so','up',
])

// ── Thresholds ────────────────────────────────────────────────────────────────
// Raised from 0.20: the weakest single-generic-word-only matches used to
// show up as "suggestions" too, adding noise with little chance of being
// genuinely useful. 0.30 still lets a single specific shared word, or a
// category+date coincidence, through for manual review — it only cuts the
// very weakest tier.
const SHOW_SUGGESTION_THRESHOLD = 0.30

// ── Weak / generic words ──────────────────────────────────────────────────────
// Words that are common filler across many unrelated tasks/notes/events and
// carry little distinguishing signal on their own — distinct from grammatical
// STOPWORDS. A shared match consisting ONLY of these words is never treated
// as strong evidence of a real relationship, no matter how rare that word
// happens to be in the user's current (possibly very small) dataset. This is
// a fixed list, not a statistic, so it behaves identically whether the user
// has 1 item or 10,000.
const WEAK_WORDS = new Set([
  // Estonian
  'kohtumine', 'tegevus', 'ülesanne', 'ülesanded', 'asi', 'asjad', 'teema',
  'plaan', 'plaanid', 'märkus', 'märkmed', 'info', 'projekt', 'päev', 'nädal',
  'kuu', 'aeg', 'kell', 'homme', 'täna', 'eile', 'varsti', 'hiljem', 'uus',
  'vana', 'tähtis', 'kiire',
  // English
  'meeting', 'task', 'tasks', 'thing', 'things', 'topic', 'plan', 'plans',
  'note', 'notes', 'info', 'project', 'day', 'week', 'month', 'time', 'clock',
  'tomorrow', 'today', 'yesterday', 'soon', 'later', 'new', 'old',
  'important', 'urgent',
])

/** Normalizes a title for exact-match comparison: lowercase, trimmed, collapsed whitespace, no trailing punctuation. */
function normalizeTitle(title: string | undefined): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
}

/** True when two titles are identical (or differ only in case/whitespace/trailing punctuation). */
function isExactTitleMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  return na.length >= 3 && na === nb
}

/**
 * The auto-link gate. Exported (not just used internally) so it can be
 * unit-tested directly against the exact score/word combinations that
 * matter, independent of the store-reading machinery in
 * computeSuggestions() — including with a tiny or empty candidate pool,
 * where a frequency-based "rarity" statistic would be meaningless.
 *
 * `candidateType` + `fromType` gate out calendar candidates for task/school
 * sources specifically, to avoid a duplicate `scheduled` link alongside the
 * one automaticLinking.ts's dedicated step already creates for those two
 * types — see the module doc comment. Every other type pairing is
 * unaffected: calendar suggestions are still computed and still shown for
 * manual linking either way (this gate only decides automatic linking).
 */
export function computeIsHighConfidence(params: {
  sharedWords: string[]
  totalScore: number
  srcTitle: string | undefined
  candidateTitle: string | undefined
  candidateType: EntityType
  fromType: EntityType
}): boolean {
  const { sharedWords, totalScore, srcTitle, candidateTitle, candidateType, fromType } = params

  if (candidateType === 'calendar' && (fromType === 'task' || fromType === 'school')) {
    return false
  }

  if (isExactTitleMatch(srcTitle, candidateTitle)) return true

  const specificSharedCount = sharedWords.filter((w) => !WEAK_WORDS.has(w)).length
  return specificSharedCount >= 2 && totalScore >= 0.65
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function tokenize(text: string | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zäöüõšžа-я0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function wordOverlapScore(srcWords: string[], candidateWords: string[]): { score: number; shared: string[] } {
  const srcSet = new Set(srcWords)
  const shared = candidateWords.filter((w) => srcSet.has(w))
  const unique = [...new Set(shared)]
  let score = 0
  if (unique.length >= 3) score = 0.55
  else if (unique.length === 2) score = 0.40
  else if (unique.length === 1) score = 0.22
  return { score, shared: unique }
}

function dateDiffDays(a?: string, b?: string): number | null {
  if (!a || !b) return null
  // Handle display strings like "30. aprill 2026" — skip those
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  return diff / (1000 * 60 * 60 * 24)
}

function dateProximityScore(dayDiff: number | null): number {
  if (dayDiff === null) return 0
  if (dayDiff <= 3) return 0.25
  if (dayDiff <= 7) return 0.20
  if (dayDiff <= 14) return 0.10
  return 0
}

function suggestRelation(candidateType: EntityType): RelationType {
  if (candidateType === 'calendar') return 'scheduled'
  if (candidateType === 'goal') return 'supports'
  if (candidateType === 'habit') return 'supports'
  return 'related'
}

// ── Reason string ─────────────────────────────────────────────────────────────

function buildReason(
  sharedWords: string[],
  categoryMatch: boolean,
  categoryValue: string | undefined,
  dayDiff: number | null,
  lang: AppLang,
): string {
  if (categoryMatch && categoryValue) {
    return lang === 'en'
      ? `Same category: ${categoryValue}`
      : `Sama kategooria: ${categoryValue}`
  }
  if (sharedWords.length >= 2) {
    const shown = sharedWords.slice(0, 2).join(', ')
    return lang === 'en'
      ? `Common keywords: "${shown}"`
      : `Ühised märksõnad: "${shown}"`
  }
  if (sharedWords.length === 1) {
    return lang === 'en'
      ? `Keyword match: "${sharedWords[0]}"`
      : `Märksõna: "${sharedWords[0]}"`
  }
  if (dayDiff !== null && dayDiff <= 7) {
    return lang === 'en' ? 'Same time period' : 'Sama ajavahemik'
  }
  if (dayDiff !== null && dayDiff <= 14) {
    return lang === 'en' ? 'Near same date' : 'Lähedane kuupäev'
  }
  return lang === 'en' ? 'Possibly related' : 'Võimalik seos'
}

// ── Source signals ────────────────────────────────────────────────────────────

export interface SourceSignals {
  title: string
  description?: string
  category?: string
  date?: string
}

function getSourceSignals(type: EntityType, id: string): SourceSignals {
  switch (type) {
    case 'task': {
      const x = getAllTasks().find((t) => t.id === id)
      return x ? { title: x.title, description: x.description, category: x.category, date: x.date } : { title: '' }
    }
    case 'note': {
      const x = getAllNotes().find((n) => n.id === id)
      return x ? { title: x.title, description: x.preview, category: x.folder } : { title: '' }
    }
    case 'goal': {
      const x = getAllGoals().find((g) => g.id === id)
      return x ? { title: x.title, description: x.description } : { title: '' }
    }
    case 'habit': {
      const x = getAllHabits().find((h) => h.id === id)
      return x ? { title: x.title, description: x.description, category: x.category } : { title: '' }
    }
    case 'calendar': {
      const x = getAllEvents().find((e) => e.id === id)
      return x ? { title: x.title, description: x.description, date: x.date } : { title: '' }
    }
    case 'ai': {
      const x = getAllChats().find((c) => c.id === id)
      return x ? { title: x.title } : { title: '' }
    }
    case 'school': {
      const decoded = decodeSchoolId(id)
      if (!decoded) return { title: '' }
      if (decoded.kind === 'task') {
        const x = getAllSchoolTasks().find((t) => String(t.id) === decoded.rawId)
        return x ? { title: x.title, category: x.subject, date: x.deadline } : { title: '' }
      }
      if (decoded.kind === 'exam') {
        const x = getAllSchoolExams().find((e) => String(e.id) === decoded.rawId)
        return x ? { title: x.title, category: x.subject, date: x.date } : { title: '' }
      }
      return { title: '' }
    }
    default:
      return { title: '' }
  }
}

// ── Candidate list builder ────────────────────────────────────────────────────

interface Candidate {
  type: EntityType
  id: string
  title: string
  contextLabel?: string
  date?: string
  category?: string
  description?: string
}

function gatherCandidates(fromType: EntityType): Candidate[] {
  const out: Candidate[] = []

  if (fromType !== 'task')
    getAllTasks().forEach((t) => out.push({
      type: 'task', id: t.id, title: t.title,
      contextLabel: t.category, date: t.date,
      category: t.category, description: t.description,
    }))

  if (fromType !== 'note')
    getAllNotes().forEach((n) => out.push({
      type: 'note', id: n.id, title: n.title,
      contextLabel: n.folder, category: n.folder, description: n.preview,
    }))

  if (fromType !== 'goal')
    getAllGoals().forEach((g) => out.push({
      type: 'goal', id: g.id, title: g.title,
      contextLabel: g.status, description: g.description,
    }))

  if (fromType !== 'habit')
    getAllHabits().forEach((h) => out.push({
      type: 'habit', id: h.id, title: h.title,
      contextLabel: h.category, category: h.category, description: h.description,
    }))

  if (fromType !== 'calendar')
    getAllEvents().forEach((e) => out.push({
      type: 'calendar', id: e.id, title: e.title, date: e.date,
      description: e.description,
    }))

  if (fromType !== 'ai')
    getAllChats().forEach((c) => out.push({
      type: 'ai', id: c.id, title: c.title,
    }))

  if (fromType !== 'school') {
    getAllSchoolTasks().forEach((s) => out.push({
      type: 'school', id: encodeSchoolId('task', s.id),
      title: s.title, contextLabel: s.subject, date: s.deadline, category: s.subject,
    }))
    getAllSchoolExams().forEach((s) => out.push({
      type: 'school', id: encodeSchoolId('exam', s.id),
      title: s.title, contextLabel: s.subject, date: s.date, category: s.subject,
    }))
  }

  return out
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute ranked link suggestions for an entity.
 *
 * @param fromType       - source entity type
 * @param fromId         - source entity ID
 * @param lang           - UI language for reason strings
 * @param dismissed      - set of "type:id" strings to skip (from localStorage)
 * @param sourceOverride - when provided, use these signals instead of looking up
 *                         the entity from its store. Pass this immediately after
 *                         a save so the function does not depend on onSnapshot
 *                         having fired yet.
 * @returns up to 5 suggestions ranked by score descending
 */
export function computeSuggestions(
  fromType: EntityType,
  fromId: string,
  lang: AppLang,
  dismissed: Set<string>,
  sourceOverride?: SourceSignals,
): LinkSuggestion[] {
  // Build exclusion set from existing links
  const existingLinks = getLinksForEntity(fromType, fromId)
  const exclude = new Set<string>()
  exclude.add(`${fromType}:${fromId}`)
  for (const l of existingLinks) {
    const isFrom = l.fromType === fromType && l.fromId === fromId
    if (isFrom) exclude.add(`${l.toType}:${l.toId}`)
    else exclude.add(`${l.fromType}:${l.fromId}`)
  }

  // Extract signals from source — prefer caller-supplied override to avoid
  // onSnapshot timing issues when called immediately after a save.
  const src = sourceOverride ?? getSourceSignals(fromType, fromId)
  const srcTitleWords = tokenize(src.title)
  const srcContextWords = tokenize([src.category, src.description].filter(Boolean).join(' '))
  const srcAllWords = [...new Set([...srcTitleWords, ...srcContextWords])]

  const results: LinkSuggestion[] = []

  for (const c of gatherCandidates(fromType)) {
    const key = `${c.type}:${c.id}`
    if (exclude.has(key) || dismissed.has(key)) continue

    const cTitleWords = tokenize(c.title)
    const cContextWords = tokenize([c.contextLabel, c.category, c.description].filter(Boolean).join(' '))
    const cAllWords = [...new Set([...cTitleWords, ...cContextWords])]

    const { score: overlapScore, shared: sharedWords } = wordOverlapScore(srcAllWords, cAllWords)

    const catMatch =
      !!src.category &&
      !!c.category &&
      src.category.toLowerCase() === c.category.toLowerCase()
    const catScore = catMatch ? 0.30 : 0

    const dayDiff = dateDiffDays(src.date, c.date)
    const dateScore = dateProximityScore(dayDiff)

    const totalScore = Math.min(1.0, overlapScore + catScore + dateScore)
    if (totalScore < SHOW_SUGGESTION_THRESHOLD) continue

    const isHighConfidence = computeIsHighConfidence({
      sharedWords,
      totalScore,
      srcTitle: src.title,
      candidateTitle: c.title,
      candidateType: c.type,
      fromType,
    })

    results.push({
      type: c.type,
      id: c.id,
      title: c.title,
      contextLabel: c.contextLabel,
      date: c.date,
      reason: buildReason(sharedWords, catMatch, c.category, dayDiff, lang),
      score: totalScore,
      isHighConfidence,
      suggestedRelation: suggestRelation(c.type),
    })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 5)
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_PREFIX = 'kv-link-dismissed'

export function loadDismissed(type: EntityType, entityId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}:${type}:${entityId}`)
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function saveDismissed(type: EntityType, entityId: string, dismissed: Set<string>): void {
  try {
    localStorage.setItem(
      `${LS_PREFIX}:${type}:${entityId}`,
      JSON.stringify([...dismissed]),
    )
  } catch {
    // ignore quota errors
  }
}
