/**
 * KivoraAICard's three actions, verified structurally (same no-rendering-
 * harness precedent as the other dashboard structural tests):
 *
 *   - "Vestle AI-ga" / "Chat with AI" just navigates to /app/assistant —
 *     no AI call, no data written.
 *   - "Loo plaan" / "Create a plan" hands off via the SAME sessionStorage
 *     "kivora_ai_prompt" key SchoolPage already uses (no new mechanism),
 *     then navigates — the actual plan is only ever generated/saved later
 *     inside the existing, already-reviewed AIPlanGeneratorModal flow,
 *     which requires its own explicit user confirmation. Nothing here
 *     saves or mutates any user data.
 *   - "Küsi AI soovitust" is the ONLY place in this card that calls the
 *     real AI endpoint (fetchAIReply) — and only on explicit click, never
 *     on mount/automatically.
 *
 * Also verifies the free, local rule-based summary (dashboardSummary.ts)
 * and the real on-demand AI result are rendered under two DIFFERENT
 * labels, so the local summary is never presented as if it were an AI
 * recommendation.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/KivoraAICard.tsx'),
  'utf8',
)

describe('"Vestle AI-ga" — navigation only, no AI call', () => {
  it('handleChatClick only navigates to /app/assistant', () => {
    expect(CARD_SRC).toMatch(/const handleChatClick = \(\) => navigate\('\/app\/assistant'\)/)
  })

  it('is wired to the chat button via dash.ai.chatButton', () => {
    expect(CARD_SRC).toMatch(/onClick=\{handleChatClick\}[\s\S]{0,400}t\('dash\.ai\.chatButton', lang\)/)
  })
})

describe('"Loo plaan" — hands off to the existing AI Assistant plan flow, saves nothing itself', () => {
  it('reuses the exact sessionStorage key SchoolPage already uses for the same hand-off pattern', () => {
    expect(CARD_SRC).toMatch(/sessionStorage\.setItem\('kivora_ai_prompt', t\('dash\.ai\.planPrompt', lang\)\)/)
    expect(CARD_SRC).toMatch(/const handlePlanClick = \(\) => \{\s*\n\s*sessionStorage\.setItem\('kivora_ai_prompt'/)
  })

  it('navigates to /app/assistant right after setting the prompt (does not open/save anything itself)', () => {
    expect(CARD_SRC).toMatch(/sessionStorage\.setItem\('kivora_ai_prompt'[^\n]*\)\s*\n\s*navigate\('\/app\/assistant'\)/)
  })

  it('never imports or renders AIPlanGeneratorModal, nor calls any save/add-* store action directly — the actual save happens only inside the existing assistant flow', () => {
    expect(CARD_SRC).not.toMatch(/import .*AIPlanGeneratorModal/)
    expect(CARD_SRC).not.toMatch(/<AIPlanGeneratorModal/)
    expect(CARD_SRC).not.toMatch(/\baddTask\(|\baddCalendarEvent\(|\baddQuickNote\(|\baddPlan\(/)
  })
})

describe('"Küsi AI soovitust" — the ONLY real AI call in this card, and only on explicit click', () => {
  it('fetchAIReply is referenced exactly once in the whole file, inside handleAskAi', () => {
    const fetchCount = (CARD_SRC.match(/fetchAIReply\(/g) ?? []).length
    expect(fetchCount).toBe(1)
    expect(CARD_SRC).toMatch(/const handleAskAi = async \(\) => \{[\s\S]{0,900}fetchAIReply\(/)
  })

  it('is not called inside a useEffect / on mount — only from the button\'s onClick', () => {
    expect(CARD_SRC).not.toMatch(/useEffect\([^)]*\{[\s\S]{0,300}fetchAIReply/)
    expect(CARD_SRC).toMatch(/onClick=\{handleAskAi\}/)
  })

  it('handles the QUOTA_EXCEEDED code with the same shared translated message the AI Assistant chat uses (no duplicated/raw server text)', () => {
    expect(CARD_SRC).toMatch(/getAiErrorCode\(err\) === 'QUOTA_EXCEEDED'/)
    expect(CARD_SRC).toMatch(/t\('ai\.chat\.quotaExceeded', lang\)/)
    expect(CARD_SRC).toMatch(/t\('ai\.chat\.error', lang\)/)
  })

  it('the prompt explicitly asks for a short, personal, practical answer capped at 2-3 concrete sentences (both ET and EN)', () => {
    expect(CARD_SRC).toMatch(/lühike, personaalne ja praktiline soovitus[\s\S]{0,250}2-3 lühikese ja konkreetse lausega/)
    expect(CARD_SRC).toMatch(/short, personal and practical suggestion[\s\S]{0,250}2-3 short, concrete sentences/)
  })

  it('shows a disabled/loading state on the button while the request is in flight (prevents double-firing)', () => {
    expect(CARD_SRC).toMatch(/disabled=\{aiLoading\}/)
  })
})

describe('two distinct, never-conflated labels: free local summary vs. real on-demand AI suggestion', () => {
  it('shows dash.ai.summaryLabel ("Tänane ülevaade") by default, and only switches to dash.ai.suggestionLabel ("✨ Tänane soovitus") once a real AI result exists', () => {
    expect(CARD_SRC).toMatch(
      /\{aiSuggestion \? t\('dash\.ai\.suggestionLabel', lang\) : t\('dash\.ai\.summaryLabel', lang\)\}/,
    )
  })

  it('the default body text is the pure local computeDashboardSummary result, never a hardcoded/sample sentence', () => {
    expect(CARD_SRC).toMatch(/import \{ computeDashboardSummary \} from '@\/lib\/dashboardSummary'/)
    expect(CARD_SRC).toMatch(/aiSuggestion \?\? localSummary/)
  })
})
