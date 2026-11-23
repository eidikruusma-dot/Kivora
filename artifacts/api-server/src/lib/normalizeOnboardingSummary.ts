/**
 * normalizeOnboardingSummary.ts — sanitizes the model's raw JSON output
 * from POST /api/ai/onboarding/summary before it ever reaches a client.
 *
 * Same trust posture as planDraftValidation.ts's normalizeSingleValidPlanPreview:
 * the model's JSON is untrusted input, never forwarded as-is. In
 * particular, recommendedModules is always clamped to the caller-supplied
 * allowlist (ONBOARDING_MODULE_IDS, itself already filtered for
 * MONEY_MODULE_ENABLED by the route — see onboardingConfig.ts) — a
 * hallucinated or out-of-date module id can never reach the client, let
 * alone get written to Firestore.
 */

import type { OnboardingModuleId } from "./onboardingConfig.js";

export interface OnboardingSummary {
  profileSummary: string;
  recommendedModules: OnboardingModuleId[];
}

const MAX_PROFILE_SUMMARY_LENGTH = 1_000;

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
): OnboardingSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  const profileSummary =
    typeof obj.profileSummary === "string"
      ? obj.profileSummary.trim().slice(0, MAX_PROFILE_SUMMARY_LENGTH)
      : "";

  const rawModules = Array.isArray(obj.recommendedModules) ? obj.recommendedModules : [];
  const allowedSet = new Set<string>(allowedModuleIds);
  const seen = new Set<string>();
  const recommendedModules: OnboardingModuleId[] = [];
  for (const candidate of rawModules) {
    if (typeof candidate !== "string") continue;
    if (!allowedSet.has(candidate)) continue; // not a real/currently-allowed module id — dropped, never surfaced
    if (seen.has(candidate)) continue; // de-duplicate
    seen.add(candidate);
    recommendedModules.push(candidate as OnboardingModuleId);
  }

  return { profileSummary, recommendedModules };
}
