/**
 * grantOwnerRole.ts — one-off, manual, Admin-only tooling to grant (or
 * revoke) the `owner` Firebase Auth custom claim on exactly one account.
 *
 * This is the ONLY way `owner: true` is ever set: it is a custom claim on
 * the Firebase ID token, verified server-side by requireFirebaseAuth.ts
 * via the Admin SDK's verifyIdToken() — the client can never set or
 * influence it (see requireFirebaseAuth.ts's doc comment). Nothing in this
 * repository exposes this over HTTP/Express, and no client UI reads or
 * writes it.
 *
 * ── No hardcoded identity ────────────────────────────────────────────────
 * This file contains no email address, uid, or any other privileged
 * identity literal. The target account is resolved EXCLUSIVELY from a CLI
 * argument or the OWNER_EMAIL/OWNER_UID environment variables (see
 * resolveTargetIdentifier below) — there is no default/fallback identity
 * baked into source.
 *
 * ── How this is actually run ─────────────────────────────────────────────
 * This file exports only pure, side-effect-free functions plus main()
 * (which itself performs no top-level side effects on import — it must be
 * explicitly called) so it is safe to import from a test file with zero
 * risk of accidentally granting/revoking anything. The actual CLI
 * entry point is the separate runGrantOwnerRole.ts, which is what a human
 * runs directly:
 *
 *   cd artifacts/api-server
 *   OWNER_EMAIL=owner@example.com npx esbuild --bundle --platform=node \
 *       --format=esm --packages=external src/scripts/runGrantOwnerRole.ts \
 *       --outfile=.tmp-runGrantOwnerRole.mjs && node .tmp-runGrantOwnerRole.mjs
 *
 * or, equivalently, passing the identity as a CLI argument instead of an
 * env var:
 *
 *   node .tmp-runGrantOwnerRole.mjs owner@example.com
 *
 * Add --revoke to remove the claim instead of granting it:
 *
 *   node .tmp-runGrantOwnerRole.mjs owner@example.com --revoke
 *
 * (This file itself is deliberately NOT gated by an import.meta.url-based
 * "am I the entry module" check: this repo's test convention bundles every
 * *.test.ts file into its own standalone esbuild output, which collapses
 * every imported module's import.meta.url into that one output's URL — an
 * entry check here could not reliably tell "run directly" apart from
 * "imported by a test bundle", and would risk firing during a test run.
 * Splitting the real work into pure functions + an explicit main(), with
 * the actual invocation living in a separate file, sidesteps that
 * entirely.)
 *
 * Requires the same Admin credentials every other Admin operation in this
 * server uses (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 * FIREBASE_PRIVATE_KEY) via getFirebaseAdminAuth() — fails the same way
 * (a clear thrown error) if they are missing or invalid.
 */

import type { Auth } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";

// ── Target resolution — CLI argument or environment variable only ─────────

export interface ResolvedTarget {
  /** Whether `value` should be looked up via getUserByEmail or getUser. */
  mode: "email" | "uid";
  value: string;
}

const EMAIL_LIKE = /.+@.+\..+/;

/**
 * Resolves which account to operate on. Precedence: the first non-flag CLI
 * argument, then OWNER_EMAIL, then OWNER_UID. Returns null when none of
 * these are present — callers must fail safely (never fall back to a
 * default identity) when this happens.
 *
 * `argv` is expected to be the script's own arguments (e.g.
 * process.argv.slice(2)), NOT the full process.argv array.
 */
export function resolveTargetIdentifier(
  argv: string[],
  env: NodeJS.ProcessEnv,
): ResolvedTarget | null {
  const positional = argv.find((arg) => !arg.startsWith("--"));
  const raw = positional ?? env["OWNER_EMAIL"] ?? env["OWNER_UID"];
  if (!raw || raw.trim() === "") return null;

  const value = raw.trim();
  return { mode: EMAIL_LIKE.test(value) ? "email" : "uid", value };
}

/** True when --revoke is present anywhere in argv. */
export function shouldRevoke(argv: string[]): boolean {
  return argv.includes("--revoke");
}

// ── Core operation — testable against a fake Auth ──────────────────────────

type OwnerClaimAuth = Pick<Auth, "getUserByEmail" | "getUser" | "setCustomUserClaims">;

export interface OwnerClaimChangeResult {
  uid: string;
  email?: string;
  /** The account's custom claims exactly as they were before this call. */
  claimsBefore: Record<string, unknown>;
  /** The account's custom claims exactly as they are after this call. */
  claimsAfter: Record<string, unknown>;
}

/**
 * Grants or revokes the `owner` claim on exactly the resolved account,
 * preserving every OTHER existing custom claim untouched — this is a
 * merge/unset of one key, never a wholesale replacement of the account's
 * claims. Throws (never silently no-ops) when the account cannot be
 * found or the Admin SDK call itself fails — the caller (main() below)
 * is responsible for turning that into a clear, non-zero-exit failure.
 */
export async function setOwnerClaim(
  auth: OwnerClaimAuth,
  target: ResolvedTarget,
  grant: boolean,
): Promise<OwnerClaimChangeResult> {
  const user =
    target.mode === "email"
      ? await auth.getUserByEmail(target.value)
      : await auth.getUser(target.value);

  const claimsBefore: Record<string, unknown> = { ...(user.customClaims ?? {}) };

  const claimsAfter: Record<string, unknown> = grant
    ? { ...claimsBefore, owner: true }
    : Object.fromEntries(Object.entries(claimsBefore).filter(([key]) => key !== "owner"));

  await auth.setCustomUserClaims(user.uid, claimsAfter);

  return { uid: user.uid, email: user.email, claimsBefore, claimsAfter };
}

// ── CLI orchestration — no top-level side effects; must be called explicitly ─

/**
 * Runs the full grant/revoke flow against real argv/env and prints a
 * clear result to stdout/stderr. Returns a process exit code (0 success,
 * 1 failure) rather than calling process.exit() itself, so it stays
 * unit-testable (a test can call main() and inspect the returned code
 * without the test process itself exiting).
 *
 * Fails safely (returns 1, never throws, never grants/revokes anything)
 * when: no target identity was resolvable, Admin credentials are
 * unavailable/misconfigured, the target account does not exist, or the
 * Admin SDK call itself fails for any other reason.
 */
export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const revoke = shouldRevoke(argv);
  const target = resolveTargetIdentifier(argv, env);

  if (!target) {
    console.error(
      "No target account specified. Provide one of:\n" +
        "  - a CLI argument: node runGrantOwnerRole.mjs <email-or-uid> [--revoke]\n" +
        "  - the OWNER_EMAIL environment variable\n" +
        "  - the OWNER_UID environment variable\n" +
        "Refusing to guess — there is no default owner identity.",
    );
    return 1;
  }

  let auth: OwnerClaimAuth;
  try {
    auth = getFirebaseAdminAuth();
  } catch (err) {
    console.error(
      `Firebase Admin is unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  try {
    const result = await setOwnerClaim(auth, target, !revoke);
    console.log(
      `${revoke ? "Revoked" : "Granted"} owner claim.\n` +
        `  uid:   ${result.uid}\n` +
        `  email: ${result.email ?? "(no email on this account)"}\n` +
        `  claims before: ${JSON.stringify(result.claimsBefore)}\n` +
        `  claims after:  ${JSON.stringify(result.claimsAfter)}`,
    );
    return 0;
  } catch (err) {
    console.error(
      `Failed to ${revoke ? "revoke" : "grant"} the owner claim for ` +
        `${target.mode}="${target.value}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
