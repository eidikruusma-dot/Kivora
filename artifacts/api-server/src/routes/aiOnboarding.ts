/**
 * routes/aiOnboarding.ts — the AI onboarding conversation's two endpoints:
 *
 *   POST /api/ai/onboarding/chat      Server-Sent Events (SSE) stream, one
 *                                      per conversational turn. Plain text
 *                                      only — no JSON mode, no actions.
 *   POST /api/ai/onboarding/summary   Ordinary JSON response, called once
 *                                      when the conversation ends. Returns
 *                                      the structured module recommendation.
 *
 * Deliberately a NEW, separate router rather than new branches inside
 * routes/ai.ts — POST /api/ai/chat's existing request/response shape,
 * validation, prompt-building and tests are completely untouched by this
 * feature (see validateOnboardingRequest.ts's and
 * buildOnboardingMessages.ts's doc comments for the same reasoning).
 * Mounted under the existing aiBoundary in routes/index.ts, so it inherits
 * requireFirebaseAuth exactly like ai.ts and aiUpload.ts do, with zero
 * changes to that file's existing lines for the other two routers.
 *
 * Why /chat streams plain text instead of JSON: see
 * buildOnboardingMessages.ts's doc comment — OpenAI's JSON-mode output
 * can't be safely streamed token-by-token to a chat UI without a partial-
 * JSON parser (a fragment like {"repl is not meaningful to show a user).
 * Splitting into "stream freeform text for the live chat" / "one JSON call
 * for the final structured result" avoids that complexity entirely while
 * still giving genuine, non-simulated token-by-token streaming during the
 * actual conversation.
 */

import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { validateOnboardingChatRequest, validateOnboardingSummaryRequest } from "../lib/validateOnboardingRequest.js";
import { buildOnboardingChatMessages, buildOnboardingSummaryMessages } from "../lib/buildOnboardingMessages.js";
import { normalizeOnboardingSummary } from "../lib/normalizeOnboardingSummary.js";
import {
  allowedOnboardingModuleIds,
  allowedOnboardingPurposeIds,
  ONBOARDING_MONEY_MODULE_ENABLED,
} from "../lib/onboardingConfig.js";
import { enforceAiQuota } from "../lib/aiQuotaGate.js";
import { refundAiQuotaUnit } from "../lib/aiQuota.js";
import type { AuthenticatedUser } from "../middleware/requireFirebaseAuth.js";
import { logOnboardingChatStage } from "../lib/onboardingStageLog.js";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

/** One SSE event: `event: <name>` + a single JSON-encoded `data:` line. */
function writeSseEvent(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post("/ai/onboarding/chat", async (req: Request, res: Response) => {
  const requestStartedAtMs = Date.now();
  let chunkCount = 0;
  try {
    const validation = validateOnboardingChatRequest(
      req.body as { messages?: unknown; lang?: unknown; startedAt?: unknown },
    );
    if (!validation.ok) {
      // Diagnostic logging only — never message contents.
      console.log(`[ai/onboarding/chat] validation rejected code=${validation.code} status=${validation.status}`);
      res.status(validation.status).json({ error: validation.error, code: validation.code });
      return;
    }
    const { lang, messages } = validation;
    logOnboardingChatStage("request accepted", { msgCount: messages.length });

    // Quota check happens BEFORE any SSE header is sent, so a 401/429 here
    // is still a plain JSON response — the same shape every other gated
    // AI route returns, easy for the client to branch on uniformly.
    const { proceed } = await enforceAiQuota(res, "ai/onboarding/chat");
    if (!proceed) return;
    logOnboardingChatStage("quota ok", { t: Date.now() - requestStartedAtMs });
    // Set by requireFirebaseAuth before this handler ever runs (see the
    // aiBoundary in routes/index.ts) — guaranteed present once enforceAiQuota
    // has returned proceed:true. Kept for the refund calls below: a request
    // that consumed a quota unit but then delivered nothing of value (the
    // OpenAI call never started, or produced zero chunks before erroring)
    // gives that unit back — see aiQuota.ts's refundAiQuotaUnit doc comment.
    const authUser = res.locals["authUser"] as AuthenticatedUser;

    // Aborts the upstream OpenAI request the moment the browser tab closes
    // or navigates away mid-stream, so a user leaving mid-sentence doesn't
    // keep burning tokens for a response nobody will ever read.
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let stream: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    try {
      logOnboardingChatStage("calling OpenAI", { t: Date.now() - requestStartedAtMs });
      stream = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: buildOnboardingChatMessages({ lang, messages }),
          max_tokens: 400,
          stream: true,
        },
        { signal: controller.signal },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start the AI response.";
      console.log(`[ai/onboarding/chat] stream start failed: ${message}`);
      // The OpenAI call never even started — the user got nothing for the
      // quota unit enforceAiQuota already consumed above. Give it back.
      await refundAiQuotaUnit({ uid: authUser.uid, owner: authUser.owner });
      writeSseEvent(res, "error", { error: "AI_STREAM_START_FAILED" });
      res.end();
      return;
    }

    try {
      // `stream` here is always the async-iterable Stream<ChatCompletionChunk>
      // (not a plain ChatCompletion) because `stream: true` selects that
      // overload of openai.chat.completions.create — TypeScript can't see
      // this through the shared `ReturnType` above, so the cast documents
      // what's structurally guaranteed by the call just made.
      for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
        chunkCount++;
        if (chunkCount === 1) {
          logOnboardingChatStage("first chunk received", { t: Date.now() - requestStartedAtMs });
        }
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) writeSseEvent(res, "delta", { content: delta });
        if (choice?.finish_reason) {
          writeSseEvent(res, "done", { finishReason: choice.finish_reason });
        }
      }
    } catch (err: unknown) {
      // A client-initiated abort lands here too (fetch/AbortController
      // reject the in-flight request) — res.writableEnded will already be
      // true in that case, so writeSseEvent's own guard makes this a no-op.
      const message = err instanceof Error ? err.message : "The AI response was interrupted.";
      console.log(`[ai/onboarding/chat] stream interrupted: ${message}`);
      // Only refund when NOTHING of value was delivered: a request that
      // streamed at least one real chunk genuinely called OpenAI at real
      // cost, so that one still counts, even though it ended early.
      if (chunkCount === 0) {
        await refundAiQuotaUnit({ uid: authUser.uid, owner: authUser.owner });
      }
      writeSseEvent(res, "error", { error: "AI_STREAM_INTERRUPTED" });
    } finally {
      logOnboardingChatStage("stream ended", { totalChunks: chunkCount, t: Date.now() - requestStartedAtMs });
      if (!res.writableEnded) res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tundmatu viga.";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else if (!res.writableEnded) {
      writeSseEvent(res, "error", { error: "AI_STREAM_INTERRUPTED" });
      res.end();
    }
  }
});

router.post("/ai/onboarding/summary", async (req: Request, res: Response) => {
  try {
    const validation = validateOnboardingSummaryRequest(
      req.body as { messages?: unknown; lang?: unknown },
    );
    if (!validation.ok) {
      console.log(`[ai/onboarding/summary] validation rejected code=${validation.code} status=${validation.status}`);
      res.status(validation.status).json({ error: validation.error, code: validation.code });
      return;
    }
    const { lang, messages } = validation;

    // Same gate, same accounting model as every other AI-cost-generating
    // route (see aiQuotaGate.ts) — one quota unit for this call, exactly
    // like the chat endpoint above. A user who ran out of quota mid-
    // conversation never reaches this far in the first place; this covers
    // the case where quota runs out between the last chat turn and the
    // wrap-up call itself.
    const { proceed } = await enforceAiQuota(res, "ai/onboarding/summary");
    if (!proceed) return;
    // See the chat route's identical comment — present once enforceAiQuota
    // has returned proceed:true, used below to refund the quota unit if
    // this call ends up delivering nothing usable.
    const authUser = res.locals["authUser"] as AuthenticatedUser;

    const allowedModuleIds = allowedOnboardingModuleIds(ONBOARDING_MONEY_MODULE_ENABLED);
    const allowedPurposeIds = allowedOnboardingPurposeIds(ONBOARDING_MONEY_MODULE_ENABLED);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: buildOnboardingSummaryMessages({ lang, messages, allowedModuleIds, allowedPurposeIds }),
      response_format: { type: "json_object" },
      max_tokens: 512,
    });

    const finishReason = completion.choices[0]?.finish_reason;
    console.log(`[ai/onboarding/summary] finish_reason=${finishReason ?? "null"}`);

    // Unlike mode "chat" in routes/ai.ts, there is no reply text to fall
    // back to here — the whole point of this call IS the structured JSON,
    // so a non-"stop" finish (truncated/filtered) must reject outright
    // rather than risk parsing a cut-off object.
    if (finishReason !== "stop") {
      await refundAiQuotaUnit({ uid: authUser.uid, owner: authUser.owner });
      res.status(422).json({
        error: "The AI summary was incomplete. Please set up modules manually instead.",
        code: "ONBOARDING_SUMMARY_INCOMPLETE",
      });
      return;
    }

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const summary = normalizeOnboardingSummary(parsed, allowedModuleIds, allowedPurposeIds);
    if (!summary) {
      await refundAiQuotaUnit({ uid: authUser.uid, owner: authUser.owner });
      res.status(422).json({
        error: "Could not generate a summary. Please set up modules manually instead.",
        code: "ONBOARDING_SUMMARY_UNUSABLE",
      });
      return;
    }

    res.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tundmatu viga.";
    // A technical failure here (e.g. the OpenAI call itself throwing)
    // delivered nothing — refund if a quota unit was actually consumed
    // (authUser only exists once enforceAiQuota has returned proceed:true;
    // a failure before that point never touched quota in the first place).
    const authUser = res.locals["authUser"] as AuthenticatedUser | undefined;
    if (authUser) await refundAiQuotaUnit({ uid: authUser.uid, owner: authUser.owner });
    res.status(500).json({ error: message });
  }
});

export default router;
