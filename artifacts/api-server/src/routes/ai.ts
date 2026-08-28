import { Router } from "express";
import OpenAI from "openai";
import { normalizeSingleValidPlanPreview } from "../lib/planDraftValidation.js";
import { validateChatRequest } from "../lib/validateChatRequest.js";
import { evaluateFinishReason } from "../lib/evaluateFinishReason.js";
import { buildChatMessages } from "../lib/buildChatMessages.js";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

router.post("/ai/chat", async (req, res) => {
  try {
    const { context, lang, localDate } = req.body as {
      context?: string;
      lang?: string;
      localDate?: string;
    };

    const validation = validateChatRequest(req.body as { messages?: unknown; mode?: unknown; context?: unknown });
    if (!validation.ok) {
      // Diagnostic logging only — never message contents.
      console.log(`[ai/chat] validation rejected code=${validation.code} status=${validation.status}`);
      res.status(validation.status).json({ error: validation.error, code: validation.code });
      return;
    }
    const { mode, messages } = validation;

    // Opt-in, sanitized diagnostic for boundary C ("did the server receive
    // what the browser sent"): logs only the context's section headers
    // (e.g. "### Plaanid (3)") — never any task/plan/note/goal title or
    // content. Off by default; enable per-deploy with AI_CONTEXT_DEBUG=1.
    if (process.env["AI_CONTEXT_DEBUG"] === "1" && context) {
      const sectionHeaders = context.match(/^### .+$/gm) ?? [];
      console.log(`[ai/chat] AI_CONTEXT_DEBUG contextLength=${context.length} sections=${JSON.stringify(sectionHeaders)}`);
    }

    // Resolve current date — prefer client-supplied local date (YYYY-MM-DD), fall back to server UTC date
    let todayDate: Date;
    if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      const [y, m, d] = localDate.split("-").map(Number);
      todayDate = new Date(y, m - 1, d);
    } else {
      todayDate = new Date();
    }
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const todayStr = fmtDate(todayDate);
    const tomorrowStr = fmtDate(tomorrowDate);
    const yesterdayStr = fmtDate(yesterdayDate);

    const resolvedLang: "et" | "en" = lang === "en" ? "en" : "et";

    // Message ordering (stable instructions → conversation history →
    // CURRENT_KIVORA_STATE → current turn) lives in buildChatMessages.ts,
    // as a pure function — see its doc comment for why CURRENT_KIVORA_STATE
    // is placed after history rather than before it, and
    // buildChatMessages.test.ts for the payload-order regression coverage.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: buildChatMessages({
        lang: resolvedLang,
        mode,
        today: todayStr,
        tomorrow: tomorrowStr,
        yesterday: yesterdayStr,
        context,
        messages,
      }),
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });

    const finishReason = completion.choices[0]?.finish_reason;
    const { rejectRequest, discardActions } = evaluateFinishReason(mode, finishReason);

    // Safe diagnostic logging only: mode, finish_reason, outcome status/code.
    // Never the prompt, the reply, generated plan content, or any personal data.
    console.log(
      `[ai/chat] mode=${mode} finish_reason=${finishReason ?? "null"} status=${rejectRequest ? 422 : 200}`,
    );

    if (rejectRequest) {
      res.status(422).json({
        error: "The AI response was incomplete. Please try again.",
        code: "PLAN_GENERATION_INCOMPLETE",
      });
      return;
    }

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { reply?: string; actions?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw, actions: [] };
    }

    // Server-side constraint on preview_plan_creation: the model's JSON is
    // untrusted, so its data is run through the same sanitizer the client
    // will independently re-run before showing or saving it. A malformed
    // plan draft is dropped here rather than forwarded to the client, and
    // at most one valid preview_plan_creation action ever survives — see
    // normalizeSingleValidPlanPreview's doc comment for the exact rule.
    // discardActions (a non-"stop" chat-mode finish) drops every action —
    // a truncated/filtered completion must never be allowed to execute a write.
    const rawActions = discardActions ? [] : Array.isArray(parsed.actions) ? parsed.actions : [];
    const actions = normalizeSingleValidPlanPreview(rawActions);

    res.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : raw,
      actions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tundmatu viga.";
    res.status(500).json({ error: message });
  }
});

export default router;
