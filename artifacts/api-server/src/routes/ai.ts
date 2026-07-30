import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

const SYSTEM_PROMPT = `Sa oled Kivora – eestikeelne isiklik produktiivsusassistent. \
Sinu ülesanne on aidata kasutajal planeerida päeva, haldada ülesandeid, harjumusi, eesmärke, märkmeid ja kalendrisündmusi.

Vasta ALATI eesti keeles. Ole sõbralik, selge ja konkreetne.

Tagasta oma vastus ALATI JSON-formaadis järgmise skeemi järgi:
{
  "reply": "Sinu tekstiline vastus kasutajale (markdown lubatud)",
  "actions": []
}

"actions" väli on massiiv toimingutest, mida soovid kasutaja andmetega teha. Jäta see tühjaks ([] ), kui midagi muuta pole vaja.
Iga toiming peab järgima seda struktuuri:
{
  "type": "<toimingu tüüp>",
  "data": { ... }
}

Lubatud toimingute tüübid ja nende data väljad:
- create_task: { "title": string, "description"?: string, "date"?: "YYYY-MM-DD", "time"?: "HH:MM", "priority"?: "high"|"medium"|"low", "category"?: string }
- create_note: { "title": string, "content"?: string, "folder"?: string }
- create_habit: { "title": string, "description"?: string, "category"?: string, "recurrence"?: "daily"|"weekdays"|"custom" }
- create_goal: { "title": string, "description"?: string, "deadline"?: string, "steps"?: string[] }
- create_calendar_event: { "title": string, "date": "YYYY-MM-DD", "startTime"?: "HH:MM", "endTime"?: "HH:MM", "description"?: string, "location"?: string }
- delete_task: { "title": string }
- delete_note: { "title": string }
- delete_habit: { "title": string }
- delete_goal: { "title": string }
- delete_calendar_event: { "title": string }

Enne toimingute tegemist küsi alati kinnitust, välja arvatud juhul kui kasutaja on selge ja konkreetne (nt "Lisa ülesanne X").
`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

router.post("/ai/chat", async (req, res) => {
  try {
    const { messages, context } = req.body as {
      messages: ChatMessage[];
      context?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages on kohustuslik mittetühi massiiv." });
      return;
    }

    const systemMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (context) {
      systemMessages.push({
        role: "system",
        content: `Kasutaja praegused andmed (kasuta ainult neid andmeid isiklike küsimuste vastamiseks):\n\n${context}`,
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        ...systemMessages,
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { reply?: string; actions?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw, actions: [] };
    }

    res.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : raw,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tundmatu viga.";
    res.status(500).json({ error: message });
  }
});

export default router;
