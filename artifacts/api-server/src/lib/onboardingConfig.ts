/**
 * onboardingConfig.ts — shared constants for the AI onboarding conversation
 * (POST /api/ai/onboarding/chat and /api/ai/onboarding/summary).
 *
 * Two values here deliberately MIRROR frontend constants rather than being
 * imported from them: this monorepo has no shared package between
 * artifacts/planner-app and artifacts/api-server (each is an independent
 * deploy), so every other cross-cutting constant in this codebase (module
 * ids, feature flags) is already duplicated the same way. Keep these two
 * in sync by hand with their frontend counterparts:
 *
 *   - ONBOARDING_MODULE_IDS  ↔ artifacts/planner-app/src/lib/modulesStore.ts's ALL_MODULE_IDS
 *   - ONBOARDING_MONEY_MODULE_ENABLED ↔ artifacts/planner-app/src/lib/featureFlags.ts's MONEY_MODULE_ENABLED
 */

export type OnboardingModuleId =
  | "calendar"
  | "tasks"
  | "notes"
  | "habits"
  | "goals"
  | "finance"
  | "plans"
  | "school"
  | "assistant";

export const ONBOARDING_MODULE_IDS: OnboardingModuleId[] = [
  "calendar", "tasks", "notes", "habits", "goals", "finance", "plans", "school", "assistant",
];

/** Mirrors featureFlags.ts's MONEY_MODULE_ENABLED — currently off everywhere. */
export const ONBOARDING_MONEY_MODULE_ENABLED = false;

/**
 * Returns the module ids the model is allowed to recommend right now —
 * ONBOARDING_MODULE_IDS minus "finance" while the money module is globally
 * disabled. Takes moneyModuleEnabled as a parameter (rather than reading
 * the constant above directly) so callers — and tests — can exercise both
 * states without module-level monkeypatching.
 */
export function allowedOnboardingModuleIds(moneyModuleEnabled: boolean): OnboardingModuleId[] {
  return moneyModuleEnabled
    ? ONBOARDING_MODULE_IDS
    : ONBOARDING_MODULE_IDS.filter((id) => id !== "finance");
}

/**
 * Hard server-side cap on an onboarding conversation's wall-clock length.
 * The client reports when it started (see validateOnboardingRequest.ts);
 * once this many ms have elapsed, POST /api/ai/onboarding/chat stops
 * accepting new conversational turns — the client must move straight to
 * /api/ai/onboarding/summary instead. This is a courtesy/UX limit based on
 * a client-reported timestamp, not a security boundary: a client could
 * misreport its own start time, but the only thing that buys it is a
 * longer onboarding chat with itself, bounded in any case by the separate,
 * server-trusted daily AI request quota (aiQuotaGate.ts).
 */
export const ONBOARDING_TIME_LIMIT_MS = 10 * 60 * 1000;
