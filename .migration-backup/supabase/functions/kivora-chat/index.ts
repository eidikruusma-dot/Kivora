import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Sa oled Kivora AI assistent. Aitad kasutajal planeerida päeva, koostada ja prioriseerida ülesandeid, kirjutada märkmeid, seada eesmärke ning parandada produktiivsust. Vasta kasutaja keeles. Ole toetav, praktiline ja selge.

OLULINE: Sinule on antud kasutaja tegelikud Kivora andmed allpool olevas kontekstis. Kui kasutaja küsib oma andmete kohta (eesmärgid, ülesanded, kalender, harjumused, märkmed), vasta AINULT sellel kontekstil. Ära kunagi vasta selliste küsimuste kohta oma üldiste teadmiste põhjal. Kui mõnes moodulis pole andmeid, teata: "Praegu ei ole selles moodulis ühtegi kirjet."

Kui kasutaja palub sul midagi luua (ülesanne, märge, harjumus, eesmärk või kalendrisündmus), kasuta vastavat tööriista (function call). Pärast toimingu loomist vasta kasutajale lühidalt, mis tehti.

VASTUSE VORMINDAMISE REEGLID (Markdown):
Ära tagasta enam suuri tekstiplokke. Kasuta Markdownit. Vastus peab olema kiiresti loetav ka telefonis. Reeglid:
- Kasuta H2 pealkirjad (##) sektsioonide jaoks.
- Kasuta paks kiri (**) tähtsate pealkirjadele ja olulistele sõnadele.
- Jäta tühi rida iga sektsiooni vahel.
- Kasuta loetelusid iga tegevuse jaoks.
- Päevaplaanis: üks ajavahemik ühe rea kohta (nummerdatud loetelu).
- Mitme AI actioni kinnitamisel: üks kirje ühe rea kohta, iga rida algab märgiga "✓".
- Analüüsi puhul: nummerdatud loetelu.
- Soovituste puhul: täpploend.
- Kui vastus on lühike ja sisaldab ainult ühte mõtet, võib see jääda tavaliseks lõiguks.
- Ära lisa loetelu dekoratsiooniks – kasuta seda ainult siis, kui vastuses on päriselt mitu eraldi punkti.

Näited:

Mitme toimingu kinnitamine:
## Tehtud toimingud
- ✓ Kalendrisündmus **„Koosolek”** lisatud kell 18.00
- ✓ Ülesanne **„Kontrolli AI”** loodud
- ✓ Märge **„Ideed”** salvestatud
- ✓ Harjumus **„Joo vett”** lisatud

Päevaplaan:
## Päevaplaan
1. 08.00–09.00 – hommikurutiin
2. 09.00–10.30 – matemaatika õppimine
3. 11.00–12.00 – ülesannete täitmine

Analüüs:
## Kõige olulisemad tegevused
1. Lõpeta kõrge prioriteediga ülesanne.
2. Tee eesmärgi järgmine samm.
3. Jäta kalendrisse puhkeaeg.

Soovitused:
## Soovitused
- Kirjuta essee, kuna selle tähtaeg on homme.
- Alusta presentatsiooni ettevalmistust.
- Võta aega hommikuvõimlemiseks.

Jätka kasutaja keeles vastamist.`;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const TOOLS = [
  {
    type: "function",
    name: "create_task",
    description: "Loob uue ülesande Kivora ülesannete nimekirja.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Ülesande pealkiri" },
        description: { type: "string", description: "Ülesande kirjeldus (valikuline)" },
        time: { type: "string", description: "Kellaaeg formaadis HH:MM (valikuline)" },
        date: { type: "string", description: "Kuupäev formaadis YYYY-MM-DD (valikuline, vaikimisi täna)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "create_note",
    description: "Loob uue märke Kivora märkmete hulka.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Märke pealkiri" },
        content: { type: "string", description: "Märke sisu" },
        folder: { type: "string", enum: ["Isiklik", "Kool", "Töö", "Kodu", "Ideed", "Päevik"], description: "Märke kaust (valikuline)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "create_habit",
    description: "Loob uue harjumuse Kivora harjumuste nimekirja.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Harjumuse pealkiri" },
        description: { type: "string", description: "Harjumuse kirjeldus (valikuline)" },
        category: { type: "string", enum: ["Isiklik", "Tervis", "Töö", "Kool"], description: "Harjumuse kategooria (valikuline)" },
        recurrence: { type: "string", enum: ["daily", "weekdays", "custom"], description: "Korduvus (valikuline, vaikimisi daily)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "create_goal",
    description: "Loob uue eesmärgi Kivora eesmärkide nimekirja.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Eesmärgi pealkiri" },
        description: { type: "string", description: "Eesmärgi kirjeldus (valikuline)" },
        deadline: { type: "string", description: "Tähtaeg tekstina, nt '30. aprill 2026' (valikuline)" },
        steps: { type: "array", items: { type: "string" }, description: "Eesmärgi sammud (valikuline)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "Loob uue sündmuse Kivora kalendrisse.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Sündmuse pealkiri" },
        startTime: { type: "string", description: "Algusaeg formaadis HH:MM" },
        endTime: { type: "string", description: "Lõpuaeg formaadis HH:MM (valikuline)" },
        date: { type: "string", description: "Kuupäev formaadis YYYY-MM-DD (valikuline, vaikimisi täna)" },
        location: { type: "string", description: "Asukoht (valikuline)" },
        description: { type: "string", description: "Kirjeldus (valikuline)" },
      },
      required: ["title", "startTime"],
    },
  },
  {
    type: "function",
    name: "delete_task",
    description: "Kustutab ülesande Kivora ülesannete nimekirjast. Kasuta pealkirja, et leida õige ülesanne.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kustutatava ülesande pealkiri (täpne vaste)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_note",
    description: "Kustutab märke Kivora märkmete hulgast. Kasuta pealkirja, et leida õige märge.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kustutatava märke pealkiri (täpne vaste)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_habit",
    description: "Kustutab harjumuse Kivora harjumuste nimekirjast. Kasuta pealkirja, et leida õige harjumus.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kustutatava harjumuse pealkiri (täpne vaste)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_goal",
    description: "Kustutab eesmärgi Kivora eesmärkide nimekirjast. Kasuta pealkirja, et leida õige eesmärk.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kustutatava eesmärgi pealkiri (täpne vaste)" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_calendar_event",
    description: "Kustutab sündmuse Kivora kalendrist. Kasuta pealkirja, et leida õige sündmus.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kustutatava sündmuse pealkiri (täpne vaste)" },
      },
      required: ["title"],
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Sõnumid puuduvad." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API võti pole seadistatud." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemContent = context
      ? `${SYSTEM_PROMPT}\n\n=== KASUTAJA KIVORA ANDMED ===\n${context}`
      : SYSTEM_PROMPT;

    const openaiMessages = [
      { role: "system", content: systemContent },
      ...messages.map((m: ChatMsg) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: openaiMessages,
        tools: TOOLS,
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `OpenAI päring ebaõnnestus (${response.status}).` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();

    // Extract text reply
    const outputText =
      data.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text ??
      data.output_text ??
      "";

    // Extract function calls from the output array
    const actions: { type: string; data: Record<string, unknown> }[] = [];
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "function_call" && item.name && item.arguments) {
          try {
            const args = JSON.parse(item.arguments);
            actions.push({ type: item.name, data: args });
          } catch { /* skip malformed */ }
        }
      }
    }

    if (!outputText && actions.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI ei tagastanud vastust." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ reply: outputText, actions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Serveri viga. Proovi hiljem uuesti." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
