/**
 * featureFlags.ts
 *
 * Central switches for optional Kivora modules. Every place that shows,
 * routes to, or initializes data for a flagged module must read the flag
 * from here — never maintain a separate local copy of the decision, so
 * flipping one value here is the single source of truth everywhere.
 */

/**
 * Controls the Raha (finance) module: sidebar/mobile navigation, the
 * onboarding and settings module-selection lists, the /app/finance route,
 * the money data store's Firestore listeners (transactions, bills,
 * monthlyBudgets), and the AI assistant's bank-statement import action.
 * Set to true to re-enable the module everywhere at once.
 */
export const MONEY_MODULE_ENABLED = false;
