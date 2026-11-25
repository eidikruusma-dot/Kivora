/**
 * normalizeOnboardingSummary.ts — sanitizes the model's raw JSON output
 * from POST /api/ai/onboarding/summary before it ever reaches a client.
 *
 * Same trust posture as planDraftValidation.ts's normalizeSingleValidPlanPreview:
 * the model's JSON is untrusted input, never forwarded as-is. In
 * particular, recommendedModules and recommendedPurposes are always
 * clamped to their caller-supplied allowlists (ONBOARDING_MODULE_IDS /
 * ONBOARDING_PURPOSE_IDS, each already filtered for MONEY_MODULE_ENABLED
 * by the route — see onboardingConfig.ts) — a hallucinated or out-of-date
 * id can never reach the client, let alone get written to Firestore.
 */

import type { OnboardingModuleId, OnboardingPurposeId } from "./onboardingConfig.js";

export interface OnboardingSummary {
  profileSummary: string;
  recommendedPurposes: OnboardingPurposeId[];
  recommendedModules: OnboardingModuleId[];
}

const MAX_PROFILE_SUMMARY_LENGTH = 1_000;

/** Shared by both id arrays below — same filter/allowlist/de-duplicate shape either way. */
function sanitizeIdArray<T extends string>(raw: unknown, allowedIds: T[]): T[] {
  const rawArray = Array.isArray(raw) ? raw : [];
  const allowedSet = new Set<string>(allowedIds);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of rawArray) {
    if (typeof candidate !== "string") continue;
    if (!allowedSet.has(candidate)) continue; // not a real/currently-allowed id — dropped, never surfaced
    if (seen.has(candidate)) continue; // de-duplicate
    seen.add(candidate);
    result.push(candidate as T);
  }
  return result;
}

/**
 * Returns a sanitized OnboardingSummary, or null if `raw` is fundamentally
 * unusable (not an object at all). A null result means the route must
 * fall back to an explicit "couldn't summarize" response — manual setup
 * must always remain available (see the onboarding plan's requirement
 * that quota exhaustion or an unusable AI response never blocks manual
 * module selection), never a fabricated recommendation.
 */
export function normalizeOnboardingSummary(
  raw: unknown,
  allowedModuleIds: OnboardingModuleId[],
  allowedPurposeIds: OnboardingPurposeId[],
): OnboardingSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  const profileSummary =
    typeof obj.profileSummary === "string"
      ? obj.profileSummary.trim().slice(0, MAX_PROFILE_SUMMARY_LENGTH)
      : "";

  const recommendedPurposes = sanitizeIdArray(obj.recommendedPurposes, allowedPurposeIds);
  const recommendedModules = sanitizeIdArray(obj.recommendedModules, allowedModuleIds);

  return { profileSummary, recommendedPurposes, recommendedModules };
}
