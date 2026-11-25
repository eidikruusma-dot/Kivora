/**
 * buildOnboardingMessages.ts
 *
 * System prompts and OpenAI message arrays for the AI onboarding
 * conversation. Fully separate from buildChatMessages.ts's
 * buildSystemPrompt() by design: the general assistant's prompt describes
 * an entire CRUD action vocabulary (create/delete tasks, notes, habits,
 * goals, calendar events, documents, money transactions, bank import, plan
 * generation) that a brand-new user's onboarding chat has no business
 * using — a new user has no Kivora data yet, and onboarding never performs
 * any of those actions. Reusing or extending the general prompt would risk
 * exposing that vocabulary to a conversation that should only ever produce
 * plain conversational text (the chat turns) or a small, closed-schema
 * module recommendation (the summary call).
 *
 * Two independent message builders, matching the two-call design:
 *   - buildOnboardingChatMessages: every live conversational turn. Plain
 *     text only — no JSON mode, no actions, so the route can stream the
 *     model's response token-by-token without needing a partial-JSON
 *     parser (see routes/aiOnboarding.ts's doc comment).
 *   - buildOnboardingSummaryMessages: one call, once the conversation
 *     ends, given the full transcript. The only call in this file that
 *     asks for structured JSON output.
 */

import type { OnboardingLang, OnboardingRequestMessage } from "./validateOnboardingRequest.js";
import type { OnboardingModuleId, OnboardingPurposeId } from "./onboardingConfig.js";
import { ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP } from "./onboardingConfig.js";

export interface OnboardingChatMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildOnboardingChatSystemPrompt(lang: OnboardingLang): string {
  return lang === "en"
    ? `You are Kivora's onboarding host, meeting a brand-new user for the first time, right after they created their account.

Your ONLY job right now is to have a short, warm, genuinely curious conversation to understand how this person organizes their life — work, studies, personal projects, habits, finances, whatever matters to them — so Kivora can later suggest which of its modules (tasks, calendar, notes, habits, goals, finance, plans, school) would actually help them.

Rules for how you talk:
- Ask exactly ONE question per message. Never a list of questions.
- Always read and build on what the person just told you — refer back to it naturally, the way a real person would in conversation. Never ask something they already answered.
- Keep every message short (1-3 sentences): a brief, natural acknowledgment of their last answer, then your next question. No long paragraphs.
- This is a real conversation, not a fixed questionnaire — let what they say shape what you ask next, rather than following a script.
- Do not mention tasks, notes, habits, goals, calendar, finance, plans, or school as concrete "features" yet — you are getting to know the person, not pitching the product. The module recommendation happens separately, later, after this conversation ends.
- You have no access to create, delete, or change anything in Kivora during this conversation. Never claim to have done so.
- Never suggest wrapping up before the user has answered at least ${ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP} times — no matter how much they share in an early answer, that alone is never "enough". A system note below each message tells you exactly how many times they've answered so far and whether you're allowed to suggest wrapping up yet; follow that note, not your own impression.
- Once you are allowed to and you feel you understand their situation reasonably well (typically after 5-8 exchanges total), say so warmly and suggest wrapping up (e.g. "I think I've got a good sense of how you like to stay organized — ready to see what I'd suggest?"). Never drag the conversation out artificially either.
- Always respond in English.`
    : `Oled Kivora tutvumisvestluse läbiviija, kes kohtub äsja konto loonud uue kasutajaga esimest korda.

Sinu AINUS ülesanne praegu on pidada lühike, soe ja siiralt uudishimulik vestlus, et mõista, kuidas see inimene oma elu korraldab — tööd, õpinguid, isiklikke projekte, harjumusi, rahaasju, mis iganes talle oluline on — et Kivora saaks hiljem soovitada, millised moodulid (ülesanded, kalender, märkmed, harjumused, eesmärgid, rahaasjad, plaanid, kool) talle tegelikult kasuks tuleksid.

Reeglid, kuidas rääkida:
- Küsi TÄPSELT ÜKS küsimus korraga. Mitte kunagi küsimuste nimekirja.
- Loe ja arvesta alati seda, mida inimene äsja ütles — viita sellele loomulikult, nagu päris inimene vestluses teeks. Ära küsi kunagi midagi, millele on juba vastatud.
- Hoia iga sõnum lühike (1-3 lauset): lühike, loomulik tunnustus eelmise vastuse kohta, siis järgmine küsimus. Ei mingeid pikki lõike.
- See on päris vestlus, mitte fikseeritud küsimustik — lase sellel, mida inimene ütleb, kujundada järgmist küsimust, mitte ei järgi skripti.
- Ära maini veel ülesandeid, märkmeid, harjumusi, eesmärke, kalendrit, rahaasju, plaane ega kooli kui konkreetseid "funktsioone" — sa tutvud inimesega, mitte ei esitle toodet. Moodulisoovitus tuleb eraldi, hiljem, pärast vestluse lõppu.
- Sul pole selle vestluse ajal ligipääsu millegi loomiseks, kustutamiseks ega muutmiseks Kivoras. Ära kunagi väida, et oled seda teinud.
- Ära kunagi paku vestluse lõpetamist enne, kui kasutaja on vastanud vähemalt ${ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP} korda — ükskõik kui palju ta esimeses vastuses jagab, see üksi ei ole kunagi "piisav". Iga sõnumi all olev süsteemimärkus ütleb täpselt, mitu korda ta on seni vastanud ja kas tohid juba lõpetamist pakkuda — järgi seda märkust, mitte oma muljet.
- Kui tohid juba ja tunned, et saad inimese olukorrast piisavalt aru (tavaliselt pärast 5-8 vahetust kokku), ütle seda soojalt ja paku vestluse lõpetamist (nt "Tundub, et sain hea pildi, kuidas sa ennast korraldad — kas näitan, mida soovitan?"). Ära veni vestlust kunstlikult pikemaks ka pärast seda.
- Vasta alati eesti keeles.`;
}

/** Counts how many times the user has actually replied so far in this transcript. */
export function countUserReplies(messages: OnboardingRequestMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

/**
 * The per-turn, state-aware reinforcement of the minimum-replies rule above
 * — a programmatic check, not just static wording the model could choose
 * to ignore: it tells the model the user's EXACT reply count and whether
 * suggesting wrap-up is allowed yet, recomputed fresh on every single
 * turn from the real transcript. Positioned last in the message array
 * (closest to generation), the same positional convention
 * buildOnboardingSummaryMessages' closing instruction already uses.
 */
function buildWrapUpGuardMessage(lang: OnboardingLang, userReplyCount: number): OnboardingChatMessageParam {
  const allowed = userReplyCount >= ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP;
  const content =
    lang === "en"
      ? allowed
        ? `[System note: the user has answered ${userReplyCount} time(s) so far. You may now suggest wrapping up if it feels natural, but you don't have to yet.]`
        : `[System note: the user has answered only ${userReplyCount} time(s) so far (minimum ${ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP} required). Do NOT suggest wrapping up or claim to understand them well enough yet, no matter how rich their last answer was — ask a genuine next question instead.]`
      : allowed
        ? `[Süsteemimärkus: kasutaja on seni vastanud ${userReplyCount} korda. Võid nüüd pakkuda vestluse lõpetamist, kui see tundub loomulik, aga ei pea veel.]`
        : `[Süsteemimärkus: kasutaja on seni vastanud ainult ${userReplyCount} korda (minimaalselt vajalik: ${ONBOARDING_MIN_USER_REPLIES_BEFORE_WRAP_UP}). ÄRA paku veel vestluse lõpetamist ega väida, et saad temast piisavalt aru, ükskõik kui sisukas tema viimane vastus oli — küsi selle asemel päris järgmine küsimus.]`;
  return { role: "system", content };
}

/**
 * Builds the full OpenAI message array for one onboarding chat turn: the
 * system prompt, then the conversation so far (including the current turn
 * as the last message), then the wrap-up guard note recomputed from the
 * real transcript — no CURRENT_KIVORA_STATE equivalent, since a brand-new
 * onboarding user has no Kivora data yet to ground against.
 */
export function buildOnboardingChatMessages(params: {
  lang: OnboardingLang;
  messages: OnboardingRequestMessage[];
}): OnboardingChatMessageParam[] {
  return [
    { role: "system", content: buildOnboardingChatSystemPrompt(params.lang) },
    ...params.messages,
    buildWrapUpGuardMessage(params.lang, countUserReplies(params.messages)),
  ];
}

function formatAllowedModuleIdsForPrompt(allowedModuleIds: OnboardingModuleId[]): string {
  return allowedModuleIds.map((id) => `"${id}"`).join(", ");
}

/**
 * Short, human-meaning descriptions of each purpose id, embedded in the
 * summary prompt so the model classifies from what the conversation was
 * actually ABOUT — not by mechanically unioning whichever modules it also
 * recommended. Mirrors the labels shown on ModuleSelectionPage.tsx's
 * purpose chips (modules.purpose.* translations) so the model's judgment
 * and the UI the user then sees describe the same four concepts.
 */
function formatAllowedPurposeIdsForPrompt(lang: OnboardingLang, allowedPurposeIds: OnboardingPurposeId[]): string {
  const labels: Record<OnboardingLang, Record<OnboardingPurposeId, string>> = {
    en: {
      personal: `"personal" (personal life — daily routines, family, household, personal projects)`,
      learning: `"learning" (studies, school, courses)`,
      finance: `"finance" (money, budgeting, financial goals)`,
      work: `"work" (job, career, professional tasks)`,
    },
    et: {
      personal: `"personal" (isiklik elu — igapäevane korraldus, perekond, kodu, isiklikud projektid)`,
      learning: `"learning" (õpingud, kool, kursused)`,
      finance: `"finance" (rahaasjad, eelarve, rahalised eesmärgid)`,
      work: `"work" (töö, karjäär, tööalased ülesanded)`,
    },
  };
  return allowedPurposeIds.map((id) => labels[lang][id]).join(", ");
}

function buildOnboardingSummarySystemPrompt(
  lang: OnboardingLang,
  allowedModuleIds: OnboardingModuleId[],
  allowedPurposeIds: OnboardingPurposeId[],
): string {
  const idList = formatAllowedModuleIdsForPrompt(allowedModuleIds);
  const purposeList = formatAllowedPurposeIdsForPrompt(lang, allowedPurposeIds);
  return lang === "en"
    ? `You just finished a short getting-to-know-you conversation with a new Kivora user (the full transcript follows as the conversation history below). Your job now is ONLY to summarize it as JSON — do not continue the conversation, do not ask any more questions.

Respond with a single JSON object, exactly this shape:
{"profileSummary": string, "recommendedPurposes": string[], "recommendedModules": string[]}

- "profileSummary": 1-3 short sentences, written TO the user ("You mentioned..."), warmly recapping what you learned about how they organize their life. Never invent anything they did not actually say.
- "recommendedPurposes": an array containing only values from this exact list, judged from what the conversation was actually ABOUT, not from which modules you separately recommend: ${purposeList}. Include a purpose only if the conversation genuinely touched on it.
- "recommendedModules": an array containing only values from this exact list: [${idList}]. Include only modules that genuinely fit what they described — not all of them by default, and not simply every module that is loosely associated with a recommended purpose. If nothing in the conversation points to a particular module, leave it out.
- If the conversation is too short or unclear to recommend anything confidently, return empty arrays for both rather than guessing.`
    : `Lõpetasid just lühikese tutvumisvestluse uue Kivora kasutajaga (täielik transkript on allpool vestlusajaloona). Sinu ülesanne on nüüd AINULT see JSON-ina kokku võtta — ära jätka vestlust, ära küsi enam ühtegi küsimust.

Vasta ühe JSON-objektiga, täpselt sellisel kujul:
{"profileSummary": string, "recommendedPurposes": string[], "recommendedModules": string[]}

- "profileSummary": 1-3 lühikest lauset, kirjutatud KASUTAJALE ("Sa mainisid..."), mis võtab soojalt kokku, mida said teada tema elukorralduse kohta. Ära kunagi väljamõtle midagi, mida ta tegelikult ei öelnud.
- "recommendedPurposes": massiiv, mis sisaldab ainult väärtusi sellest täpsest loendist, hinnatuna selle põhjal, MILLEST vestlus tegelikult rääkis, mitte selle põhjal, milliseid mooduleid eraldi soovitad: ${purposeList}. Lisa eesmärk ainult siis, kui vestlus tegelikult seda puudutas.
- "recommendedModules": massiiv, mis sisaldab ainult väärtusi sellest täpsest loendist: [${idList}]. Lisa ainult moodulid, mis tõeliselt sobivad sellega, mida ta kirjeldas — mitte kõiki vaikimisi ja mitte lihtsalt kõiki mooduleid, mis on soovitatud eesmärgiga lõdvalt seotud. Kui vestluses pole miski konkreetse mooduli kasuks, jäta see välja.
- Kui vestlus on liiga lühike või ebaselge, et midagi kindlalt soovitada, tagasta mõlema jaoks tühi massiiv, mitte ei arva.`;
}

/**
 * Builds the full OpenAI message array for the one-time onboarding
 * summary call: the summary instructions + allowed module/purpose lists as
 * the system prompt, the full transcript as conversation history, and a
 * final system message (closest to generation, same positional convention
 * buildChatMessages.ts's CURRENT_KIVORA_STATE already uses) reiterating
 * that only JSON should be returned now.
 */
export function buildOnboardingSummaryMessages(params: {
  lang: OnboardingLang;
  messages: OnboardingRequestMessage[];
  allowedModuleIds: OnboardingModuleId[];
  allowedPurposeIds: OnboardingPurposeId[];
}): OnboardingChatMessageParam[] {
  const closingInstruction =
    params.lang === "en"
      ? "The conversation above has ended. Respond now with only the JSON object described above — no other text."
      : "Ülalolev vestlus on lõppenud. Vasta nüüd ainult eespool kirjeldatud JSON-objektiga — muud teksti mitte.";

  return [
    {
      role: "system",
      content: buildOnboardingSummarySystemPrompt(params.lang, params.allowedModuleIds, params.allowedPurposeIds),
    },
    ...params.messages,
    { role: "system", content: closingInstruction },
  ];
}
