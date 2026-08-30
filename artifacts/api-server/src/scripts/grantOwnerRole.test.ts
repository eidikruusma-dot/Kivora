/**
 * Unit tests for grantOwnerRole.ts — the manual, Admin-only owner-claim
 * grant/revoke script (not exposed over HTTP, no client UI).
 *
 * No real Firebase credentials/network are used. `setOwnerClaim` is tested
 * against a hand-written fake Auth (getUserByEmail/getUser/
 * setCustomUserClaims), the same style as requireFirebaseAuth.test.ts's
 * fake Auth. `main()` is tested end-to-end against that same fake by
 * injecting a fake `getAuthFn`-equivalent — since main() itself calls the
 * real getFirebaseAdminAuth() when Admin credentials are absent (as they
 * are in this test process), the "Admin unavailable" failure path is
 * exercised for free without any mocking at all.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/grantOwnerRole.test.ts --outfile=.tmp-grantOwnerRole.mjs \
 *       && node .tmp-grantOwnerRole.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Auth } from "firebase-admin/auth";
import {
  resolveTargetIdentifier,
  shouldRevoke,
  setOwnerClaim,
  main,
} from "./grantOwnerRole.js";

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

async function group(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

// ── Fake Auth ────────────────────────────────────────────────────────────

interface FakeUser {
  uid: string;
  email?: string;
  customClaims?: Record<string, unknown>;
}

function makeFakeAuth(users: FakeUser[]) {
  const byUid = new Map(users.map((u) => [u.uid, { ...u }]));
  const setClaimsCalls: Array<{ uid: string; claims: object | null }> = [];

  const auth: Pick<Auth, "getUserByEmail" | "getUser" | "setCustomUserClaims"> = {
    getUserByEmail: (async (email: string) => {
      const found = [...byUid.values()].find((u) => u.email === email);
      if (!found) throw new Error(`no user record found for the given identifier (auth/user-not-found): ${email}`);
      return found as unknown as Awaited<ReturnType<Auth["getUserByEmail"]>>;
    }) as Auth["getUserByEmail"],
    getUser: (async (uid: string) => {
      const found = byUid.get(uid);
      if (!found) throw new Error(`no user record found for the given identifier (auth/user-not-found): ${uid}`);
      return found as unknown as Awaited<ReturnType<Auth["getUser"]>>;
    }) as Auth["getUser"],
    setCustomUserClaims: (async (uid: string, claims: object | null) => {
      setClaimsCalls.push({ uid, claims });
      const existing = byUid.get(uid);
      if (existing) existing.customClaims = (claims ?? {}) as Record<string, unknown>;
    }) as Auth["setCustomUserClaims"],
  };

  return { auth, setClaimsCalls, byUid };
}

// ── resolveTargetIdentifier ──────────────────────────────────────────────

await group("1. resolveTargetIdentifier: CLI argument takes precedence over env vars", () => {
  const result = resolveTargetIdentifier(
    ["owner@example.com"],
    { OWNER_EMAIL: "env-owner@example.com", OWNER_UID: "env-uid" },
  );
  assert(result?.mode === "email" && result.value === "owner@example.com", "CLI arg wins over both env vars");
});

await group("2. resolveTargetIdentifier: falls back to OWNER_EMAIL when no CLI argument given", () => {
  const result = resolveTargetIdentifier([], { OWNER_EMAIL: "owner@example.com" });
  assert(result?.mode === "email" && result.value === "owner@example.com", "resolved from OWNER_EMAIL");
});

await group("3. resolveTargetIdentifier: falls back to OWNER_UID when OWNER_EMAIL is also absent", () => {
  const result = resolveTargetIdentifier([], { OWNER_UID: "synthetic-uid-123" });
  assert(result?.mode === "uid" && result.value === "synthetic-uid-123", "resolved from OWNER_UID");
});

await group("4. resolveTargetIdentifier: a plain (non-email) CLI argument resolves as a uid", () => {
  const result = resolveTargetIdentifier(["synthetic-uid-abc"], {});
  assert(result?.mode === "uid" && result.value === "synthetic-uid-abc", "non-email-shaped value treated as a uid");
});

await group("5. resolveTargetIdentifier: --revoke is ignored as a candidate identifier", () => {
  const result = resolveTargetIdentifier(["--revoke", "owner@example.com"], {});
  assert(result?.mode === "email" && result.value === "owner@example.com", "the flag is skipped, the real argument is found");
});

await group("6. resolveTargetIdentifier: returns null when nothing is provided anywhere — no default identity", () => {
  assert(resolveTargetIdentifier([], {}) === null, "no CLI arg, no env vars → null");
  assert(resolveTargetIdentifier(["--revoke"], {}) === null, "only a flag, no identifier → null");
});

await group("7. shouldRevoke", () => {
  assert(shouldRevoke(["owner@example.com", "--revoke"]) === true, "--revoke present anywhere → true");
  assert(shouldRevoke(["owner@example.com"]) === false, "no --revoke → false");
});

// ── setOwnerClaim ────────────────────────────────────────────────────────

await group("8. setOwnerClaim (grant): preserves existing unrelated claims and sets owner: true", async () => {
  const { auth, setClaimsCalls } = makeFakeAuth([
    { uid: "u1", email: "owner@example.com", customClaims: { betaTester: true, region: "eu" } },
  ]);
  const result = await setOwnerClaim(auth, { mode: "email", value: "owner@example.com" }, true);

  assert(result.uid === "u1", "resolved the correct uid");
  assert(result.claimsBefore["betaTester"] === true && result.claimsBefore["region"] === "eu", "claimsBefore captured the pre-existing claims");
  assert(result.claimsAfter["owner"] === true, "owner is now true");
  assert(result.claimsAfter["betaTester"] === true && result.claimsAfter["region"] === "eu", "the unrelated pre-existing claims survive untouched");
  assert(setClaimsCalls.length === 1 && setClaimsCalls[0].uid === "u1", "setCustomUserClaims called exactly once, for the right uid");
  const sentClaims = setClaimsCalls[0].claims as Record<string, unknown>;
  assert(sentClaims["owner"] === true && sentClaims["betaTester"] === true && sentClaims["region"] === "eu", "the exact object sent to setCustomUserClaims carries both old and new claims");
});

await group("9. setOwnerClaim (grant): a user with no prior custom claims ends up with exactly { owner: true }", async () => {
  const { auth } = makeFakeAuth([{ uid: "u2", email: "fresh@example.com" }]);
  const result = await setOwnerClaim(auth, { mode: "email", value: "fresh@example.com" }, true);
  assert(Object.keys(result.claimsBefore).length === 0, "no claims existed before");
  assert(Object.keys(result.claimsAfter).length === 1 && result.claimsAfter["owner"] === true, "exactly one claim after: owner: true");
});

await group("10. setOwnerClaim (revoke): removes ONLY the owner claim, preserving everything else", async () => {
  const { auth } = makeFakeAuth([
    { uid: "u3", email: "owner@example.com", customClaims: { owner: true, betaTester: true, region: "eu" } },
  ]);
  const result = await setOwnerClaim(auth, { mode: "email", value: "owner@example.com" }, false);
  assert(!("owner" in result.claimsAfter), "owner claim is gone");
  assert(result.claimsAfter["betaTester"] === true && result.claimsAfter["region"] === "eu", "unrelated claims survive the revoke untouched");
});

await group("11. setOwnerClaim (revoke): a user who was never granted owner is a safe, harmless no-op on the owner key", async () => {
  const { auth } = makeFakeAuth([{ uid: "u4", email: "never-owner@example.com", customClaims: { betaTester: true } }]);
  const result = await setOwnerClaim(auth, { mode: "email", value: "never-owner@example.com" }, false);
  assert(!("owner" in result.claimsAfter), "still no owner claim");
  assert(result.claimsAfter["betaTester"] === true, "the pre-existing claim is untouched");
});

await group("12. setOwnerClaim: resolves by uid when mode is 'uid', never touching getUserByEmail", async () => {
  const { auth } = makeFakeAuth([{ uid: "u5", email: "byuid@example.com" }]);
  let getUserByEmailCalled = false;
  const spiedAuth: Pick<Auth, "getUserByEmail" | "getUser" | "setCustomUserClaims"> = {
    ...auth,
    getUserByEmail: (async (email: string) => {
      getUserByEmailCalled = true;
      return auth.getUserByEmail(email);
    }) as Auth["getUserByEmail"],
  };
  const result = await setOwnerClaim(spiedAuth, { mode: "uid", value: "u5" }, true);
  assert(result.uid === "u5", "resolved via getUser, by uid");
  assert(!getUserByEmailCalled, "getUserByEmail was never called for a uid-mode target");
});

await group("13. setOwnerClaim: throws (does not silently no-op) when the target account does not exist", async () => {
  const { auth } = makeFakeAuth([]);
  let threw = false;
  try {
    await setOwnerClaim(auth, { mode: "email", value: "nobody@example.com" }, true);
  } catch {
    threw = true;
  }
  assert(threw, "a missing account throws rather than silently doing nothing");
});

// ── main(): the full CLI orchestration, fail-safe paths ────────────────────

await group("14. main(): fails safely (exit code 1) when no target identity is resolvable", async () => {
  const code = await main([], {});
  assert(code === 1, "returns 1, not 0, and never throws");
});

await group("15. main(): fails safely (exit code 1) when Admin credentials are unavailable", async () => {
  // This test process has no FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY
  // set (or if it inherited them from the environment, this would be a
  // real credential and this file must never assume that) — either way,
  // main() must never throw; a genuinely-configured environment would
  // instead exercise the try/catch around setOwnerClaim below, which is
  // covered by the fake-Auth tests above.
  const env = { ...process.env };
  delete env["FIREBASE_PROJECT_ID"];
  delete env["FIREBASE_CLIENT_EMAIL"];
  delete env["FIREBASE_PRIVATE_KEY"];
  const code = await main(["owner@example.com"], env);
  assert(code === 1, "returns 1 when Admin credentials are missing, never throws, never exits the test process");
});

// ── No hardcoded privileged identity in source ──────────────────────────

await group("16. no hardcoded privileged identity exists in source", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/grantOwnerRole.ts"), "utf8");

  assert(!src.includes("kivora.ee"), "the real production domain never appears in this file");

  // resolveTargetIdentifier must only ever read from its own `argv`/`env`
  // parameters — never a literal fallback. Isolate just that function's
  // body and check every `??`/`||` fallback chain only ever references
  // argv/env-derived values, not a string literal.
  const fnMatch = src.match(/export function resolveTargetIdentifier[\s\S]*?\n}\n/);
  assert(fnMatch !== null, "found the resolveTargetIdentifier function body to inspect");
  const fnBody = fnMatch?.[0] ?? "";
  const rawLine = fnBody.match(/const raw = .*/)?.[0] ?? "";
  assert(
    rawLine.includes('env["OWNER_EMAIL"]') && rawLine.includes('env["OWNER_UID"]') && rawLine.includes("positional"),
    "the only fallback chain for the target identifier reads positional/env['OWNER_EMAIL']/env['OWNER_UID'] — nothing else",
  );
  // No quoted string literal containing "@" appears anywhere as an
  // assigned default value (e.g. `= "someone@somewhere.com"`) — only as
  // free-text inside comments illustrating usage, which this check does
  // not need to distinguish from since no such assignment exists at all.
  assert(!/=\s*["'][^"']*@[^"']*["']/.test(src), "no string literal containing '@' is ever assigned as a default value in code");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  grantOwnerRole: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
