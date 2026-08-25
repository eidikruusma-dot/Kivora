/**
 * Shared plan-draft type and sanitizer for AI-assisted plan creation
 * (the `preview_plan_creation` chat action).
 *
 * This project and artifacts/planner-app are deployed independently and
 * planner-app does not depend on any shared workspace package that both
 * could import, so this file is intentionally MIRRORED — not imported —
 * in:
 *   artifacts/planner-app/src/lib/planDraftValidation.ts
 * Keep the limits, types, and sanitizePlanDraft() logic in both files in
 * sync by hand when either changes.
 *
 * sanitizePlanDraft() is the ONLY place untrusted plan data (model output,
 * or here, the raw JSON action.data) is turned into a PlanDraft. It never
 * reads or propagates id/uid/done/createdAt/updatedAt — those are assigned
 * exclusively by trusted frontend code at save time.
 */

export type PlanDraftType = "menu" | "workout" | "study" | "cleaning" | "selfcare" | "blank";

const VALID_PLAN_TYPES: PlanDraftType[] = ["menu", "workout", "study", "cleaning", "selfcare", "blank"];

// Keep in sync with artifacts/planner-app/src/components/plans/PlanFormModal.tsx PLAN_COLOR_SWATCHES.
const VALID_PLAN_COLORS = [
  "#6F5AE8",
  "#16A34A",
  "#2563EB",
  "#CA8A04",
  "#0D9488",
  "#DC2626",
  "#F97316",
  "#64748B",
];
const DEFAULT_PLAN_COLOR = VALID_PLAN_COLORS[0];
const DEFAULT_PLAN_TYPE: PlanDraftType = "blank";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hard limits sized to comfortably fit within the existing, unmodified
 * `max_tokens: 2048` budget on the shared /api/ai/chat completion call.
 */
export const PLAN_DRAFT_LIMITS = {
  maxPromptLength: 500,
  maxTitleLength: 80,
  maxLabelLength: 100,
  maxNoteLength: 1000,
  maxItems: 14,
} as const;

export interface PlanDraftItem {
  label: string;
  note?: string;
}

export interface PlanDraft {
  title: string;
  type: PlanDraftType;
  color: string;
  startDate?: string;
  endDate?: string;
  items: PlanDraftItem[];
}

function isValidPlanDateRangeStr(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return true;
  return endDate >= startDate;
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

/**
 * Validates and coerces an untrusted plan draft (model JSON, or a
 * client-submitted echo of it) into a safe PlanDraft, or null if the draft
 * is unusable. Unknown fields are discarded by construction — only the
 * fields read below are ever copied out of `raw`.
 */
export function sanitizePlanDraft(raw: unknown): PlanDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const title = sanitizeString(data.title, PLAN_DRAFT_LIMITS.maxTitleLength);
  if (!title) return null; // reject an empty title outright

  const type: PlanDraftType = VALID_PLAN_TYPES.includes(data.type as PlanDraftType)
    ? (data.type as PlanDraftType)
    : DEFAULT_PLAN_TYPE;

  const color =
    typeof data.color === "string" && VALID_PLAN_COLORS.includes(data.color)
      ? data.color
      : DEFAULT_PLAN_COLOR;

  let startDate =
    typeof data.startDate === "string" && ISO_DATE_RE.test(data.startDate) ? data.startDate : undefined;
  let endDate =
    typeof data.endDate === "string" && ISO_DATE_RE.test(data.endDate) ? data.endDate : undefined;
  if (startDate && endDate && !isValidPlanDateRangeStr(startDate, endDate)) {
    // Safe fallback: drop an invalid range rather than reject the whole draft.
    startDate = undefined;
    endDate = undefined;
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: PlanDraftItem[] = [];
  for (const rawItem of rawItems.slice(0, PLAN_DRAFT_LIMITS.maxItems)) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const itemData = rawItem as Record<string, unknown>;
    const label = sanitizeString(itemData.label, PLAN_DRAFT_LIMITS.maxLabelLength);
    if (!label) continue; // filter out invalid/empty items
    // Menu items never carry a note — there is no Recipes feature, and a
    // menu item's note is exactly where a model could smuggle a recipe /
    // ingredient list / preparation instructions despite the prompt telling
    // it not to. Enforced here deterministically, not just requested in the
    // prompt, so it holds no matter what the model actually returns.
    if (type === "menu") {
      items.push({ label });
      continue;
    }
    const note = sanitizeString(itemData.note, PLAN_DRAFT_LIMITS.maxNoteLength);
    items.push(note ? { label, note } : { label });
  }

  if (items.length === 0) return null; // never accept a completely empty generated plan

  return {
    title,
    type,
    color,
    ...(startDate && endDate ? { startDate, endDate } : {}),
    items,
  };
}

/**
 * Normalizes a raw actions array (still-untrusted, straight from the
 * model's parsed JSON) so that AT MOST ONE preview_plan_creation action
 * ever survives — every other action passes through unchanged.
 *
 * Rule: the FIRST preview_plan_creation action (in array order) whose data
 * sanitizes to a usable draft wins; every other preview_plan_creation
 * action — before or after it, itself valid or invalid — is discarded.
 * (An invalid one earlier in the array does not block a valid one later —
 * "first valid" is scanned left to right and stops at the first success.)
 * This is the server-side half of the same guarantee re-applied
 * independently, client-side, in aiActions.ts's executeActionsAsync.
 */
export function normalizeSingleValidPlanPreview(rawActions: unknown[]): unknown[] {
  let planPreviewEmitted = false;
  return rawActions.flatMap((a) => {
    if (a && typeof a === "object" && (a as Record<string, unknown>).type === "preview_plan_creation") {
      if (planPreviewEmitted) return [];
      const sanitized = sanitizePlanDraft((a as Record<string, unknown>).data);
      if (!sanitized) return [];
      planPreviewEmitted = true;
      return [{ type: "preview_plan_creation", data: sanitized }];
    }
    return [a];
  });
}
