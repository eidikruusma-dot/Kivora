/**
 * Unit tests for requireFirebaseAuth (POST /api/ai/* Firebase ID token
 * gate).
 *
 * No real Firebase credentials or tokens are used — verifyIdToken is
 * always a hand-written fake, injected via requireFirebaseAuth's optional
 * 4th parameter (Express itself only ever calls it with 3 arguments, so
 * production behavior always uses the real getFirebaseAdminAuth).
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/middleware/requireFirebaseAuth.test.ts | node
 */

import { extractBearerToken, verifyBearerToken, requireFirebaseAuth } from "./requireFirebaseAuth.js";
import type { Request, Response, NextFunction } from "express";
import type { Auth } from "firebase-admin/auth";

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

// ── Fakes ────────────────────────────────────────────────────────────────────

function fakeReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

function fakeRes(): Response & { statusCode?: number; jsonBody?: unknown } {
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: undefined as number | undefined,
    jsonBody: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.jsonBody = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; jsonBody?: unknown };
}

function fakeNext(): { next: NextFunction; calls: number } {
  const state = { calls: 0 };
  const next: NextFunction = () => {
    state.calls++;
  };
  return { next, calls: state.calls } as unknown as { next: NextFunction; calls: number };
}

// A tiny call counter wrapper since fakeNext()'s returned `calls` is a snapshot, not live.
function makeNextSpy() {
  let calls = 0;
  const next: NextFunction = (() => {
    calls++;
  }) as NextFunction;
  return { next, count: () => calls };
}

function fakeAuthResolving(decoded: { uid: string; email?: string; owner?: unknown }): Pick<Auth, "verifyIdToken"> {
  return {
    verifyIdToken: (async () => decoded) as unknown as Auth["verifyIdToken"],
  };
}

function fakeAuthRejecting(errMessage: string): Pick<Auth, "verifyIdToken"> {
  return {
    verifyIdToken: (async () => {
      throw new Error(errMessage);
    }) as unknown as Auth["verifyIdToken"],
  };
}

// ── extractBearerToken ─────────────────────────────────────────────────────

await group("1. extractBearerToken: missing/malformed header", () => {
  assert(extractBearerToken(undefined) === null, "missing header → null");
  assert(extractBearerToken("") === null, "empty header → null");
  assert(extractBearerToken("Basic dXNlcjpwYXNz") === null, "wrong scheme (Basic) → null");
  assert(extractBearerToken("Bearer") === null, "\"Bearer\" with no trailing space/token → null");
  assert(extractBearerToken("Bearer ") === null, "\"Bearer \" with nothing after → null");
  assert(extractBearerToken("Bearer    ") === null, "\"Bearer\" followed by only whitespace → null");
});

await group("2. extractBearerToken: valid header", () => {
  assert(extractBearerToken("Bearer synthetic-token-123") === "synthetic-token-123", "extracts the token");
  assert(extractBearerToken("Bearer  synthetic-token-123  ") === "synthetic-token-123", "trims surrounding whitespace");
});

// ── verifyBearerToken ───────────────────────────────────────────────────────

await group("3. verifyBearerToken: valid token resolves to ok:true with the decoded user", async () => {
  const auth = fakeAuthResolving({ uid: "synthetic-uid-1", email: "synthetic@example.com" });
  const result = await verifyBearerToken(auth, "synthetic-token");
  assert(result.ok === true, "result is ok");
  if (result.ok) {
    assert(result.user.uid === "synthetic-uid-1", "uid carried through");
    assert(result.user.email === "synthetic@example.com", "email carried through");
    assert(result.user.owner === false, "owner defaults to false when the claim is absent");
  }
});

await group("4. verifyBearerToken: invalid/expired/revoked/disabled all resolve to ok:false", async () => {
  for (const errMessage of [
    "Firebase ID token has invalid signature.",
    "Firebase ID token has expired.",
    "Firebase ID token has been revoked.",
    "The user record has been disabled.",
  ]) {
    const auth = fakeAuthRejecting(errMessage);
    const result = await verifyBearerToken(auth, "synthetic-token");
    assert(result.ok === false, `"${errMessage}" → ok:false`);
  }
});

await group("5. verifyBearerToken: calls verifyIdToken with the token and checkRevoked=true", async () => {
  let capturedArgs: unknown[] = [];
  const auth: Pick<Auth, "verifyIdToken"> = {
    verifyIdToken: (async (...args: unknown[]) => {
      capturedArgs = args;
      return { uid: "u1" };
    }) as unknown as Auth["verifyIdToken"],
  };
  await verifyBearerToken(auth, "synthetic-token-xyz");
  assert(capturedArgs[0] === "synthetic-token-xyz", "called with the exact token");
  assert(capturedArgs[1] === true, "called with checkRevoked = true (so revoked tokens/disabled users are checked)");
});

// ── owner custom claim — sourced only from the verified decoded token ───────

await group("5b. verifyBearerToken: owner claim resolution", async () => {
  const trueClaim = await verifyBearerToken(
    fakeAuthResolving({ uid: "u-owner", owner: true }),
    "t",
  );
  assert(trueClaim.ok === true && trueClaim.user.owner === true, "owner: true claim → user.owner === true");

  const falseClaim = await verifyBearerToken(
    fakeAuthResolving({ uid: "u-not-owner", owner: false }),
    "t",
  );
  assert(falseClaim.ok === true && falseClaim.user.owner === false, "owner: false claim → user.owner === false");

  const missingClaim = await verifyBearerToken(
    fakeAuthResolving({ uid: "u-no-claim" }),
    "t",
  );
  assert(missingClaim.ok === true && missingClaim.user.owner === false, "missing owner claim → user.owner === false");

  // Custom claims are not restricted to booleans by Firestore/Firebase — a
  // stray truthy non-boolean value (a string, a number) must never be
  // treated as "owner" via loose truthiness. Only the literal boolean true
  // counts.
  for (const nonBooleanTruthy of ["true", 1, "yes", {}]) {
    const result = await verifyBearerToken(
      fakeAuthResolving({ uid: "u-weird-claim", owner: nonBooleanTruthy }),
      "t",
    );
    assert(
      result.ok === true && result.user.owner === false,
      `owner: ${JSON.stringify(nonBooleanTruthy)} (truthy, not literal true) → user.owner === false`,
    );
  }
});

// ── requireFirebaseAuth (the Express middleware itself) ─────────────────────

await group("6. requireFirebaseAuth: missing Authorization header → 401 AUTH_REQUIRED, next never called", async () => {
  const req = fakeReq(undefined);
  const res = fakeRes();
  const spy = makeNextSpy();
  await requireFirebaseAuth(req, res, spy.next);
  assert(res.statusCode === 401, "status 401");
  assert(JSON.stringify(res.jsonBody) === JSON.stringify({ error: "Authentication required", code: "AUTH_REQUIRED" }), "exact AUTH_REQUIRED body");
  assert(spy.count() === 0, "next() never called");
});

await group("7. requireFirebaseAuth: malformed Bearer header → 401 AUTH_REQUIRED, next never called", async () => {
  for (const header of ["Basic abc", "Bearer", "Bearer ", "token abc123"]) {
    const req = fakeReq(header);
    const res = fakeRes();
    const spy = makeNextSpy();
    await requireFirebaseAuth(req, res, spy.next);
    assert(res.statusCode === 401 && (res.jsonBody as { code?: string })?.code === "AUTH_REQUIRED", `"${header}" → 401 AUTH_REQUIRED`);
    assert(spy.count() === 0, `"${header}" → next() never called`);
  }
});

await group("8. requireFirebaseAuth: invalid token → 401 AUTH_INVALID, next never called", async () => {
  const req = fakeReq("Bearer synthetic-invalid-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = () => fakeAuthRejecting("Firebase ID token has invalid signature.");
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(res.statusCode === 401, "status 401");
  assert(JSON.stringify(res.jsonBody) === JSON.stringify({ error: "Invalid authentication token", code: "AUTH_INVALID" }), "exact AUTH_INVALID body");
  assert(spy.count() === 0, "next() never called");
});

await group("9. requireFirebaseAuth: expired token → 401 AUTH_INVALID, next never called", async () => {
  const req = fakeReq("Bearer synthetic-expired-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = () => fakeAuthRejecting("Firebase ID token has expired.");
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(res.statusCode === 401 && (res.jsonBody as { code?: string })?.code === "AUTH_INVALID", "401 AUTH_INVALID");
  assert(spy.count() === 0, "next() never called");
});

await group("10. requireFirebaseAuth: revoked/disabled-user token → 401 AUTH_INVALID, next never called", async () => {
  for (const errMessage of ["Firebase ID token has been revoked.", "The user record has been disabled."]) {
    const req = fakeReq("Bearer synthetic-revoked-or-disabled-token");
    const res = fakeRes();
    const spy = makeNextSpy();
    const getAuthFn = () => fakeAuthRejecting(errMessage);
    await requireFirebaseAuth(req, res, spy.next, getAuthFn);
    assert(res.statusCode === 401 && (res.jsonBody as { code?: string })?.code === "AUTH_INVALID", `"${errMessage}" → 401 AUTH_INVALID`);
    assert(spy.count() === 0, `"${errMessage}" → next() never called`);
  }
});

await group("11. requireFirebaseAuth: valid token → next() called exactly once, res.locals.authUser set, no error response", async () => {
  const req = fakeReq("Bearer synthetic-valid-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = () => fakeAuthResolving({ uid: "synthetic-uid-42", email: "user@example.com" });
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(spy.count() === 1, "next() called exactly once");
  assert(res.statusCode === undefined, "no error status was ever set");
  assert(res.jsonBody === undefined, "no error body was ever sent");
  assert((res.locals["authUser"] as { uid?: string })?.uid === "synthetic-uid-42", "res.locals.authUser.uid set correctly");
  assert((res.locals["authUser"] as { email?: string })?.email === "user@example.com", "res.locals.authUser.email set correctly");
  assert((res.locals["authUser"] as { owner?: boolean })?.owner === false, "res.locals.authUser.owner defaults to false with no claim");
});

await group("11b. requireFirebaseAuth: owner claim on the verified token flows through to res.locals.authUser.owner", async () => {
  const req = fakeReq("Bearer synthetic-owner-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = () => fakeAuthResolving({ uid: "synthetic-owner-uid", owner: true });
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(spy.count() === 1, "next() called exactly once");
  assert((res.locals["authUser"] as { owner?: boolean })?.owner === true, "res.locals.authUser.owner === true when the verified token carries owner: true");
});

// ── No client-request field can influence res.locals.authUser.owner ────────
// requireFirebaseAuth reads req.headers.authorization for the bearer token
// and nothing else off the request — owner is derived exclusively from
// what the (faked, in this test) verifyIdToken call returns. This proves a
// req.body/req.query/extra-header claim of ownership is never even looked
// at, regardless of what verifyIdToken actually decodes.
await group("11c. no client-supplied request field can set or influence owner", async () => {
  const req = {
    headers: { authorization: "Bearer synthetic-valid-token" },
    // Every plausible spoofing attempt a caller might try — none of these
    // are ever read by requireFirebaseAuth/verifyBearerToken.
    body: { owner: true, role: "owner", isOwner: true, admin: true },
    query: { owner: "true" },
  } as unknown as Request;
  const res = fakeRes();
  const spy = makeNextSpy();
  // The verified token itself carries no owner claim — if requireFirebaseAuth
  // read anything from req.body/req.query instead, this would wrongly
  // resolve to owner: true.
  const getAuthFn = () => fakeAuthResolving({ uid: "synthetic-uid-spoof-attempt" });
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(
    (res.locals["authUser"] as { owner?: boolean })?.owner === false,
    "req.body/req.query claiming ownership has zero effect — owner stays false",
  );
});

await group("12. requireFirebaseAuth: verifyIdToken is called with the exact token and checkRevoked=true", async () => {
  let capturedArgs: unknown[] = [];
  const req = fakeReq("Bearer synthetic-capture-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = (): Pick<Auth, "verifyIdToken"> => ({
    verifyIdToken: (async (...args: unknown[]) => {
      capturedArgs = args;
      return { uid: "u" };
    }) as unknown as Auth["verifyIdToken"],
  });
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(capturedArgs[0] === "synthetic-capture-token", "verifyIdToken called with the exact bearer token");
  assert(capturedArgs[1] === true, "verifyIdToken called with checkRevoked = true");
});

await group("13. requireFirebaseAuth: a getAuthFn failure (e.g. missing env vars) fails closed as 401 AUTH_INVALID, never lets the request through", async () => {
  const req = fakeReq("Bearer synthetic-token");
  const res = fakeRes();
  const spy = makeNextSpy();
  const getAuthFn = (): Pick<Auth, "verifyIdToken"> => {
    throw new Error("Firebase Admin configuration error: missing required environment variable \"FIREBASE_PROJECT_ID\".");
  };
  await requireFirebaseAuth(req, res, spy.next, getAuthFn);
  assert(res.statusCode === 401 && (res.jsonBody as { code?: string })?.code === "AUTH_INVALID", "401 AUTH_INVALID, not a crash and not a pass-through");
  assert(spy.count() === 0, "next() never called — no downstream handler, upload parser, or OpenAI call can run");
});

// ── "no protected route handler / upload parser / OpenAI function runs after a failure" ──
// Directly implied by every "next() never called" assertion above (6,7,8,9,10,13):
// Express only invokes the next middleware/route handler when next() is called,
// so a middleware that never calls it makes it structurally impossible for
// anything downstream — the route handler, multer's multipart parser, or an
// openai.* call inside it — to run.

// ── No token/credential leakage into logs ───────────────────────────────────

await group("14. no token or credential ever appears in a console log call", async () => {
  const SECRET_TOKEN = "synthetic-super-secret-token-should-never-be-logged";
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
  console.warn = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
  try {
    // Failure path
    await requireFirebaseAuth(fakeReq(`Bearer ${SECRET_TOKEN}`), fakeRes(), makeNextSpy().next, () => fakeAuthRejecting("invalid"));
    // Success path
    await requireFirebaseAuth(
      fakeReq(`Bearer ${SECRET_TOKEN}`),
      fakeRes(),
      makeNextSpy().next,
      () => fakeAuthResolving({ uid: "u1", email: "user@example.com" }),
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
  const leaked = captured.some((line) => line.includes(SECRET_TOKEN));
  assert(!leaked, "the synthetic token never appears in any console.log/error/warn call");
  assert(captured.length === 0, "requireFirebaseAuth itself performs no logging at all, on any path");
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  requireFirebaseAuth: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
