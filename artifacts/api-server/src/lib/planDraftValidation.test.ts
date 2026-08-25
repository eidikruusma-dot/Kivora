/**
 * Unit tests for sanitizePlanDraft (AI-assisted plan creation).
 *
 * Self-contained — imports from planDraftValidation.ts. Synthetic data only.
 * Compile and run:
 *
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/planDraftValidation.test.ts | node
 */

import { sanitizePlanDraft, normalizeSingleValidPlanPreview, PLAN_DRAFT_LIMITS, type PlanDraft } from "./planDraftValidation.js";

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

group("1. Valid menu generation — multiple checkable meal items, notes always stripped", () => {
  const raw = {
    title: "Weekly menu",
    type: "menu",
    items: [
      { label: "Monday – chicken pasta", note: "Ingredients:\n- 500g chicken\n- 400g pasta\n\nSteps:\n1. Boil pasta.\n2. Fry chicken." },
      { label: "Tuesday – vegetable soup", note: "Chop vegetables and simmer for 20 minutes." },
      { label: "Wednesday – salmon and rice" },
    ],
  };
  const draft = sanitizePlanDraft(raw);
  assert(draft !== null, "returns a draft");
  assert(draft?.title === "Weekly menu", "title preserved");
  assert(draft?.type === "menu", "type preserved");
  assert(draft?.items.length === 3, "all three items kept");
  assert(draft?.items[0].label === "Monday – chicken pasta", "item 1 label is the checkable item, not the whole plan");
  assert(draft?.items[0].note === undefined, "item 1's model-supplied recipe note is stripped, not carried through (no Recipes feature)");
  assert(draft?.items[2].note === undefined, "item without a note has no note field either");
});

group("2. Valid workout generation — separate exercises with instruction notes", () => {
  const raw = {
    title: "Leg day",
    type: "workout",
    items: [
      { label: "Squats – 3 × 12", note: "Keep your back straight and knees tracking over your toes.\nRest 60 seconds between sets." },
      { label: "Lunges – 3 × 10", note: "Step forward and lower until both knees form 90°." },
      { label: "Calf raises – 3 × 15" },
    ],
  };
  const draft = sanitizePlanDraft(raw);
  assert(draft?.items.length === 3, "each exercise is its own item");
  assert((draft?.items ?? []).every((i) => !i.label.toLowerCase().includes("leg day")), "no single item bundles the whole workout");
});

group("3. Multiline notes survive sanitization", () => {
  const note = "Line one\nLine two\n\nLine four after a blank line";
  const draft = sanitizePlanDraft({ title: "Study plan", type: "study", items: [{ label: "Read chapter 3", note }] });
  assert(draft?.items[0].note === note, "internal newlines preserved exactly");
});

group("4. Model-provided id/uid/done/createdAt/updatedAt never propagate", () => {
  const raw = {
    id: "plan-hacked",
    uid: "someone-elses-uid",
    title: "Cleaning plan",
    type: "cleaning",
    createdAt: 123,
    updatedAt: 456,
    items: [
      { id: "item-hacked", done: true, label: "Clean the kitchen counters", note: "Clear items off first, wipe the surfaces, then dry them." },
    ],
  };
  const draft = sanitizePlanDraft(raw) as (PlanDraft & Record<string, unknown>) | null;
  assert(draft !== undefined && draft !== null, "draft produced");
  assert((draft as Record<string, unknown>).id === undefined, "no top-level id field");
  assert((draft as Record<string, unknown>).uid === undefined, "no uid field");
  assert((draft as Record<string, unknown>).createdAt === undefined, "no createdAt field");
  assert((draft as Record<string, unknown>).updatedAt === undefined, "no updatedAt field");
  const item = draft?.items[0] as (typeof draft extends null ? never : PlanDraft["items"][number]) & Record<string, unknown>;
  assert(item.id === undefined, "item has no id field");
  assert(item.done === undefined, "item has no done field");
  assert(item.label === "Clean the kitchen counters", "label still comes through");
});

group("5. Invalid type falls back safely instead of rejecting the draft", () => {
  const draft = sanitizePlanDraft({ title: "Mystery plan", type: "not-a-real-type", items: [{ label: "Do a thing" }] });
  assert(draft?.type === "blank", "unknown type safely falls back to blank");
});

group("6. Invalid color falls back safely", () => {
  const draft = sanitizePlanDraft({ title: "Plan", type: "study", color: "#000000", items: [{ label: "Read" }] });
  assert(draft?.color === "#6F5AE8", "unrecognised color falls back to the first swatch");
});

group("7. Valid color from the whitelist is preserved", () => {
  const draft = sanitizePlanDraft({ title: "Plan", type: "study", color: "#16A34A", items: [{ label: "Read" }] });
  assert(draft?.color === "#16A34A", "whitelisted color is kept as-is");
});

group("8. Invalid dates are dropped safely", () => {
  const draft = sanitizePlanDraft({
    title: "Plan",
    type: "study",
    startDate: "not-a-date",
    endDate: "2026-13-40",
    items: [{ label: "Read" }],
  });
  assert(draft?.startDate === undefined, "malformed startDate dropped");
  assert(draft?.endDate === undefined, "malformed endDate dropped");
});

group("9. Inverted date range is dropped safely (not rejected)", () => {
  const draft = sanitizePlanDraft({
    title: "Plan",
    type: "study",
    startDate: "2026-09-10",
    endDate: "2026-09-01",
    items: [{ label: "Read" }],
  });
  assert(draft !== null, "draft still produced");
  assert(draft?.startDate === undefined && draft?.endDate === undefined, "both dates dropped rather than one kept");
});

group("10. Valid date range is preserved", () => {
  const draft = sanitizePlanDraft({
    title: "Plan",
    type: "study",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    items: [{ label: "Read" }],
  });
  assert(draft?.startDate === "2026-09-01" && draft?.endDate === "2026-09-07", "valid range kept exactly");
});

group("11. Empty title is rejected", () => {
  assert(sanitizePlanDraft({ title: "", type: "study", items: [{ label: "Read" }] }) === null, "empty string title → null");
  assert(sanitizePlanDraft({ title: "   ", type: "study", items: [{ label: "Read" }] }) === null, "whitespace-only title → null");
  assert(sanitizePlanDraft({ type: "study", items: [{ label: "Read" }] }) === null, "missing title → null");
});

group("12. Empty items are filtered, not the whole draft rejected", () => {
  const draft = sanitizePlanDraft({
    title: "Plan",
    type: "study",
    items: [{ label: "" }, { label: "   " }, { label: "Read chapter 3" }, {}],
  });
  assert(draft?.items.length === 1, "only the one valid item survives");
  assert(draft?.items[0].label === "Read chapter 3", "the valid item is the one kept");
});

group("13. A completely empty generated plan is rejected, not silently accepted", () => {
  assert(sanitizePlanDraft({ title: "Plan", type: "study", items: [] }) === null, "zero items → null");
  assert(sanitizePlanDraft({ title: "Plan", type: "study", items: [{ label: "" }, {}] }) === null, "all items invalid → null");
  assert(sanitizePlanDraft({ title: "Plan", type: "study" }) === null, "missing items array → null");
});

group("14. Excessive title/label/note lengths are clamped, not rejected", () => {
  const longTitle = "A".repeat(500);
  const longLabel = "B".repeat(500);
  const longNote = "C".repeat(5000);
  const draft = sanitizePlanDraft({ title: longTitle, type: "study", items: [{ label: longLabel, note: longNote }] });
  assert(draft?.title.length === PLAN_DRAFT_LIMITS.maxTitleLength, "title clamped to maxTitleLength");
  assert(draft?.items[0].label.length === PLAN_DRAFT_LIMITS.maxLabelLength, "label clamped to maxLabelLength");
  assert(draft?.items[0].note?.length === PLAN_DRAFT_LIMITS.maxNoteLength, "note clamped to maxNoteLength");
});

group("15. Excessive item count is capped at maxItems", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ label: `Item ${i}` }));
  const draft = sanitizePlanDraft({ title: "Big plan", type: "study", items });
  assert(draft?.items.length === PLAN_DRAFT_LIMITS.maxItems, `capped at ${PLAN_DRAFT_LIMITS.maxItems} items`);
});

group("16. Unknown/extra fields are discarded", () => {
  const draft = sanitizePlanDraft({
    title: "Plan",
    type: "study",
    items: [{ label: "Read", extraField: "should not survive" }],
    somethingRandom: 42,
  }) as (PlanDraft & Record<string, unknown>) | null;
  assert((draft as Record<string, unknown>).somethingRandom === undefined, "top-level unknown field discarded");
  assert((draft?.items[0] as unknown as Record<string, unknown>).extraField === undefined, "item-level unknown field discarded");
});

group("17. Non-object / malformed input is rejected", () => {
  assert(sanitizePlanDraft(null) === null, "null → null");
  assert(sanitizePlanDraft(undefined) === null, "undefined → null");
  assert(sanitizePlanDraft("a string") === null, "string → null");
  assert(sanitizePlanDraft(42) === null, "number → null");
  assert(sanitizePlanDraft([]) === null, "array (no title) → null");
});

group("18. Estonian and English content both sanitize identically", () => {
  const et = sanitizePlanDraft({
    title: "Õppeplaan",
    type: "study",
    items: [{ label: "Loe peatükk 3", note: "Kirjuta välja viis olulisemat mõistet.\nMärgi ära raskemad kohad." }],
  });
  const en = sanitizePlanDraft({
    title: "Study plan",
    type: "study",
    items: [{ label: "Read chapter 3", note: "Write down the five most important concepts.\nNote down the hardest parts." }],
  });
  assert(et !== null && en !== null, "both languages produce a draft");
  assert(!!et?.items[0].note?.includes("mõistet"), "Estonian note content preserved");
  assert(!!en?.items[0].note?.includes("concepts"), "English note content preserved");
});

group("19. Menu items never carry a note, even when the model supplies one", () => {
  const draft = sanitizePlanDraft({
    title: "Weekly menu",
    type: "menu",
    items: [
      { label: "Monday – chicken pasta", note: "Ingredients:\n- 500g chicken\n- 400g pasta\n\nSteps:\n1. Boil pasta.\n2. Fry chicken." },
      { label: "Tuesday – soup", note: "Chop vegetables and simmer for 20 minutes." },
    ],
  });
  assert(draft !== null, "draft still produced");
  assert(draft!.items.length === 2, "both items kept (label alone is enough)");
  for (const item of draft!.items) {
    assert(!("note" in item), "no note field on a menu item");
  }
});

group("20. Recipe/ingredient/preparation text supplied by the model cannot survive sanitization for a menu draft", () => {
  const draft = sanitizePlanDraft({
    title: "Menu",
    type: "menu",
    items: [{ label: "Chicken and rice", note: "Ingredients: 500g chicken, 300g rice. Preparation: boil rice, fry chicken, combine." }],
  });
  const serialized = JSON.stringify(draft);
  assert(!serialized.includes("Ingredients"), "the word 'Ingredients' from the model's note does not survive into the draft");
  assert(!serialized.includes("Preparation"), "the word 'Preparation' from the model's note does not survive into the draft");
});

group("21. Non-menu types keep their notes as before (workout/study/cleaning/selfcare unaffected)", () => {
  const workout = sanitizePlanDraft({
    title: "Leg day",
    type: "workout",
    items: [{ label: "Squats – 3 × 12", note: "Keep your back straight.\nRest 60 seconds between sets." }],
  });
  assert(workout!.items[0].note === "Keep your back straight.\nRest 60 seconds between sets.", "workout note (sets/reps/rest guidance) preserved");

  const study = sanitizePlanDraft({ title: "Study", type: "study", items: [{ label: "Read chapter 3", note: "Write down five concepts." }] });
  assert(study!.items[0].note === "Write down five concepts.", "study note preserved");
});

group("22. Flexible (non-weekday) and weekday-style menu labels are both accepted unchanged", () => {
  const flexible = sanitizePlanDraft({
    title: "Flexible menu",
    type: "menu",
    items: [{ label: "Kana-riisiroog – umbes 2 päevaks" }, { label: "Chicken and rice – approximately 2 days" }],
  });
  assert(flexible!.items[0].label === "Kana-riisiroog – umbes 2 päevaks", "flexible, non-weekday, multi-day label preserved (ET)");
  assert(flexible!.items[1].label === "Chicken and rice – approximately 2 days", "flexible, non-weekday, multi-day label preserved (EN)");

  const weekday = sanitizePlanDraft({
    title: "Weekly menu",
    type: "menu",
    items: [{ label: "Esmaspäev – kanapasta" }, { label: "Monday – chicken pasta" }],
  });
  assert(weekday!.items[0].label === "Esmaspäev – kanapasta", "weekday-style label preserved when explicitly requested (ET)");
  assert(weekday!.items[1].label === "Monday – chicken pasta", "weekday-style label preserved when explicitly requested (EN)");
});

group("23. normalizeSingleValidPlanPreview: two preview_plan_creation actions produce exactly one preview", () => {
  const raw = [
    { type: "preview_plan_creation", data: { title: "First", type: "study", items: [{ label: "Read" }] } },
    { type: "preview_plan_creation", data: { title: "Second", type: "workout", items: [{ label: "Squats" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one action survives");
  assert(result[0].data.title === "First", "the FIRST valid preview wins, not the last");
});

group("24. normalizeSingleValidPlanPreview: two previews plus a non-preview action → only one preview survives (the non-preview action is this function's concern only for preview de-duplication — full batch isolation is aiActions.ts's job, tested separately)", () => {
  const raw = [
    { type: "preview_plan_creation", data: { title: "First", type: "study", items: [{ label: "Read" }] } },
    { type: "create_task", data: { title: "Passed through unchanged by THIS function" } },
    { type: "preview_plan_creation", data: { title: "Second", type: "workout", items: [{ label: "Squats" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw);
  const previewCount = result.filter((a) => (a as { type: string }).type === "preview_plan_creation").length;
  assert(previewCount === 1, "at most one preview_plan_creation action survives, even with a non-preview action interleaved");
  assert(result.length === 2, "the non-preview action itself is untouched by this function (it only de-duplicates previews) — total is 2, not 3");
});

group("25. normalizeSingleValidPlanPreview: an invalid first preview followed by a valid second preview → the valid one is kept (documented rule: first VALID, scanned left to right)", () => {
  const raw = [
    { type: "preview_plan_creation", data: { title: "", type: "study", items: [{ label: "Read" }] } }, // invalid: empty title
    { type: "preview_plan_creation", data: { title: "Valid one", type: "workout", items: [{ label: "Squats" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one valid preview survives");
  assert(result[0].data.title === "Valid one", "the second (valid) preview is kept since the first was invalid");
});

group("26. normalizeSingleValidPlanPreview: all previews invalid → none survive (not silently accepted)", () => {
  const raw = [
    { type: "preview_plan_creation", data: { title: "", type: "study", items: [] } },
    { type: "preview_plan_creation", data: { type: "study", items: [{ label: "" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw);
  assert(result.length === 0, "zero actions survive when every preview_plan_creation candidate is invalid");
});

group("27. normalizeSingleValidPlanPreview: a batch with no preview_plan_creation at all is untouched", () => {
  const raw = [{ type: "create_task", data: { title: "A normal task" } }];
  const result = normalizeSingleValidPlanPreview(raw);
  assert(result.length === 1 && (result[0] as { type: string }).type === "create_task", "non-preview actions pass through unchanged");
});

// ── Production defect: outer action type is a plan category (e.g. "workout") ─
// Root cause: the model placed the PlanDraft's own `type` field into the
// OUTER action.type instead of the canonical literal "preview_plan_creation".
// Observed in production: [ai/chat actions] mode=chat finish_reason=stop
// rawCount=1 rawTypes=["workout"] normalizedCount=1 normalizedTypes=["workout"]

group('28. outer type "workout" + nested data WITHOUT inner type → canonical preview', () => {
  const raw = [
    {
      type: "workout",
      data: { title: "Leg day", items: [{ label: "Squats – 3 × 12", note: "Keep your back straight." }] },
    },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one action survives");
  assert(result[0].type === "preview_plan_creation", "outer type canonicalized to the literal preview_plan_creation");
  assert(result[0].data.type === "workout", "inner draft type forced from the observed outer type");
  assert(result[0].data.title === "Leg day", "title reconstructed from data");
});

group('29. outer type "workout" + valid nested data (already has inner type "workout") → canonical preview', () => {
  const raw = [
    {
      type: "workout",
      data: { title: "Leg day", type: "workout", items: [{ label: "Squats – 3 × 12" }] },
    },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one action survives");
  assert(result[0].type === "preview_plan_creation", "outer type canonicalized");
  assert(result[0].data.type === "workout", "inner type preserved (attempt 1: data sanitized as-is already succeeds)");
});

group('30. flattened workout action (title/items directly on the action, no "data" at all) → canonical preview', () => {
  const raw = [
    { type: "workout", title: "Leg day", items: [{ label: "Squats – 3 × 12", note: "Form cue." }] },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one action survives — reconstructed from the flattened action object itself");
  assert(result[0].type === "preview_plan_creation", "outer type canonicalized");
  assert(result[0].data.title === "Leg day", "title recovered from the flattened action");
  assert(result[0].data.items[0].label === "Squats – 3 × 12", "items recovered from the flattened action");
});

group('31. outer type "menu" — same three reconstruction paths, and menu notes are still stripped after canonicalization', () => {
  const withoutInnerType = normalizeSingleValidPlanPreview([
    { type: "menu", data: { title: "Weekly menu", items: [{ label: "Monday – chicken pasta", note: "Ingredients: chicken, pasta." }] } },
  ]) as { type: string; data: PlanDraft }[];
  assert(withoutInnerType[0]?.type === "preview_plan_creation", "menu: reconstructed from data without inner type");
  assert(withoutInnerType[0]?.data.type === "menu", "menu: inner type forced correctly");
  assert(withoutInnerType[0]?.data.items[0].note === undefined, "menu: note still stripped by sanitizePlanDraft even after canonicalization");

  const flattened = normalizeSingleValidPlanPreview([
    { type: "menu", title: "Weekly menu", items: [{ label: "Monday – chicken pasta" }] },
  ]) as { type: string; data: PlanDraft }[];
  assert(flattened[0]?.type === "preview_plan_creation", "menu: reconstructed from a flattened action");
});

group('32. outer type "study" — same three reconstruction paths', () => {
  const asIs = normalizeSingleValidPlanPreview([
    { type: "study", data: { title: "Study plan", type: "study", items: [{ label: "Read chapter 3" }] } },
  ]) as { type: string; data: PlanDraft }[];
  assert(asIs[0]?.type === "preview_plan_creation", "study: data sanitized as-is (already has correct inner type)");

  const withoutInnerType = normalizeSingleValidPlanPreview([
    { type: "study", data: { title: "Study plan", items: [{ label: "Read chapter 3" }] } },
  ]) as { type: string; data: PlanDraft }[];
  assert(withoutInnerType[0]?.type === "preview_plan_creation", "study: reconstructed with type forced from outer");
  assert(withoutInnerType[0]?.data.type === "study", "study: inner type forced correctly");

  const flattened = normalizeSingleValidPlanPreview([
    { type: "study", title: "Study plan", items: [{ label: "Read chapter 3" }] },
  ]) as { type: string; data: PlanDraft }[];
  assert(flattened[0]?.type === "preview_plan_creation", "study: reconstructed from a flattened action");
});

group("33. an unrelated outer type is never converted, even if it superficially resembles a plan action", () => {
  const cases = [
    { type: "create_task", data: { title: "A task" } },
    { type: "create_plan", data: { title: "Should NOT be aliased — not one of the six PlanDraftType values", items: [{ label: "x" }] } },
    { type: "generate_plan", data: { title: "Should also NOT be aliased", items: [{ label: "x" }] } },
    { type: "plan_creation", data: { title: "Also not a recognized alias", items: [{ label: "x" }] } },
  ];
  for (const c of cases) {
    const result = normalizeSingleValidPlanPreview([c]) as { type: string }[];
    assert(result.length === 1 && result[0].type === c.type, `"${c.type}" passes through completely untouched — no guessed aliases`);
  }
});

group("34. an invalid draft (unreconstructable) is never converted — passed through unchanged, not silently dropped or faked", () => {
  const raw = [{ type: "workout", data: { items: [] } }]; // no title anywhere, empty items — every reconstruction attempt fails
  const result = normalizeSingleValidPlanPreview(raw) as { type: string }[];
  assert(result.length === 1, "the action still survives (untouched)");
  assert(result[0].type === "workout", "outer type is left exactly as the model sent it — never canonicalized from invalid data");
});

group("35. two valid plan actions (both outer-type-as-category) still produce only one preview", () => {
  const raw = [
    { type: "workout", data: { title: "First", items: [{ label: "Squats" }] } },
    { type: "study", data: { title: "Second", items: [{ label: "Read" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one preview survives");
  assert(result[0].data.title === "First", "the first valid one wins");
});

group("36. a mix of the canonical literal type and a category-outer-type action still produces only one preview", () => {
  const raw = [
    { type: "workout", data: { title: "Category-typed first", items: [{ label: "Squats" }] } },
    { type: "preview_plan_creation", data: { title: "Canonical second", type: "study", items: [{ label: "Read" }] } },
  ];
  const result = normalizeSingleValidPlanPreview(raw) as { type: string; data: PlanDraft }[];
  assert(result.length === 1, "exactly one preview survives across the two forms");
  assert(result[0].data.title === "Category-typed first", "first-in-array-order wins regardless of which form it took");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(48)}`);
console.log(`  planDraftValidation: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
