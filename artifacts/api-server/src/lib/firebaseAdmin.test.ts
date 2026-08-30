/**
 * Unit tests for firebaseAdmin.ts — the Firebase Admin initialization
 * module used to verify /api/ai request tokens, and (from the
 * getFirebaseAdminFirestore step of the AI quota architecture) to expose
 * a trusted server-side Firestore accessor for a future usage-quota
 * transaction.
 *
 * No real Firebase project/network access is used or required — but
 * groups 9-11 below DO need a value that PASSES firebase-admin's local
 * cert()/private-key PARSING (a real RSA private key structure), since
 * that parsing happens synchronously at initializeApp() time, before any
 * network call. generateSyntheticPrivateKeyPem() below generates one
 * on the fly with Node's own crypto module — it is not a real credential
 * and is never sent anywhere; it only needs to be well-formed PEM so
 * initializeApp() doesn't throw "Failed to parse private key" before the
 * behavior these tests actually check (single shared app, no duplicate
 * app, Auth/Firestore both backed by it) can be observed. This never
 * contacts Firebase's servers: getAuth()/getFirestore() construct local
 * service clients lazily and only make network calls when a token is
 * actually verified or a Firestore document is actually read/written,
 * neither of which happens in these tests.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/firebaseAdmin.test.ts | node
 */

import { generateKeyPairSync } from "node:crypto";
import { getApps } from "firebase-admin/app";
import {
  normalizePrivateKey,
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
} from "./firebaseAdmin.js";

function generateSyntheticPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  return privateKey;
}

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

const ENV_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  try {
    for (const key of ENV_KEYS) {
      if (key in overrides) {
        const v = overrides[key];
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

group("1. normalizePrivateKey: supports Render keys with escaped \\n", () => {
  const escaped = "-----BEGIN PRIVATE KEY-----\\nSYNTHETIC-LINE-ONE\\nSYNTHETIC-LINE-TWO\\n-----END PRIVATE KEY-----\\n";
  const result = normalizePrivateKey(escaped);
  assert(!result.includes("\\n"), "no escaped \\\\n sequences remain");
  assert(result.includes("\n"), "real newline characters are present");
  assert(result.split("\n").length === 5, "splits into the expected number of real lines");
});

group("2. normalizePrivateKey: supports keys that already contain real newlines", () => {
  const real = "-----BEGIN PRIVATE KEY-----\nSYNTHETIC-LINE-ONE\n-----END PRIVATE KEY-----\n";
  const result = normalizePrivateKey(real);
  assert(result === real, "a key with real newlines and no \\\\n substring is returned unchanged");
});

group("3. normalizePrivateKey: never throws on synthetic/malformed input", () => {
  assert(normalizePrivateKey("") === "", "empty string handled");
  assert(normalizePrivateKey("no-newlines-at-all") === "no-newlines-at-all", "plain string handled");
});

group("4. getFirebaseAdminAuth: fails closed with a clear error when FIREBASE_PROJECT_ID is missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: "synthetic@example.com", FIREBASE_PRIVATE_KEY: "synthetic-key" },
    () => {
      let threw = false;
      let message = "";
      try {
        getFirebaseAdminAuth();
      } catch (err) {
        threw = true;
        message = err instanceof Error ? err.message : String(err);
      }
      assert(threw, "throws rather than returning a usable Auth instance");
      assert(message.includes("FIREBASE_PROJECT_ID"), "error names the specific missing variable");
      assert(message.toLowerCase().includes("configuration"), "error is clearly identified as a configuration problem");
    },
  );
});

group("5. getFirebaseAdminAuth: fails closed when FIREBASE_CLIENT_EMAIL is missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: "synthetic-project", FIREBASE_CLIENT_EMAIL: undefined, FIREBASE_PRIVATE_KEY: "synthetic-key" },
    () => {
      let message = "";
      try {
        getFirebaseAdminAuth();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      assert(message.includes("FIREBASE_CLIENT_EMAIL"), "error names the specific missing variable");
    },
  );
});

group("6. getFirebaseAdminAuth: fails closed when FIREBASE_PRIVATE_KEY is missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: "synthetic-project", FIREBASE_CLIENT_EMAIL: "synthetic@example.com", FIREBASE_PRIVATE_KEY: undefined },
    () => {
      let message = "";
      try {
        getFirebaseAdminAuth();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      assert(message.includes("FIREBASE_PRIVATE_KEY"), "error names the specific missing variable");
    },
  );
});

group("7. getFirebaseAdminAuth: fails closed when all three variables are missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: undefined, FIREBASE_PRIVATE_KEY: undefined },
    () => {
      let threw = false;
      try {
        getFirebaseAdminAuth();
      } catch {
        threw = true;
      }
      assert(threw, "throws when every required variable is absent");
    },
  );
});

group("8. No credential value ever appears in a thrown error message", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: "synthetic@example.com", FIREBASE_PRIVATE_KEY: "SYNTHETIC_SECRET_VALUE_MUST_NOT_LEAK" },
    () => {
      let message = "";
      try {
        getFirebaseAdminAuth();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      assert(!message.includes("SYNTHETIC_SECRET_VALUE_MUST_NOT_LEAK"), "the (synthetic) private key value never appears in the error");
    },
  );
});

// ── getFirebaseAdminFirestore: same fail-closed contract as Auth ───────────
// Must run BEFORE any successful initialization below — once
// getFirebaseAdminApp() succeeds once, the app is cached for the rest of
// this process, so a "missing credentials" case can only be observed
// while no prior call in this file has yet succeeded.

group("9. getFirebaseAdminFirestore: fails closed with a clear error when FIREBASE_PROJECT_ID is missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: "synthetic@example.com", FIREBASE_PRIVATE_KEY: "synthetic-key" },
    () => {
      let threw = false;
      let message = "";
      try {
        getFirebaseAdminFirestore();
      } catch (err) {
        threw = true;
        message = err instanceof Error ? err.message : String(err);
      }
      assert(threw, "throws rather than returning a usable Firestore instance");
      assert(message.includes("FIREBASE_PROJECT_ID"), "error names the specific missing variable");
      assert(message.toLowerCase().includes("configuration"), "error is clearly identified as a configuration problem");
    },
  );
});

group("10. getFirebaseAdminFirestore: fails closed when all three variables are missing", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: undefined, FIREBASE_PRIVATE_KEY: undefined },
    () => {
      let threw = false;
      try {
        getFirebaseAdminFirestore();
      } catch {
        threw = true;
      }
      assert(threw, "throws when every required variable is absent");
    },
  );
});

group("11. No app is left behind by a failed getFirebaseAdminFirestore/getFirebaseAdminAuth call", () => {
  assert(getApps().length === 0, "no Admin app exists yet — every prior call in this file failed before initializeApp() ran");
});

// ── Successful initialization: shared app, no duplicates ───────────────────
// From here on, a real (synthetic, never-transmitted) RSA private key is
// used so initializeApp()'s local PEM parsing succeeds and an actual App
// object is created — still with zero network calls (see file header).

group("12. getFirebaseAdminAuth and getFirebaseAdminFirestore share the SAME underlying Admin app — no duplicate app is created", () => {
  withEnv(
    {
      FIREBASE_PROJECT_ID: "synthetic-project",
      FIREBASE_CLIENT_EMAIL: "synthetic@example.com",
      FIREBASE_PRIVATE_KEY: generateSyntheticPrivateKeyPem(),
    },
    () => {
      assert(getApps().length === 0, "sanity check: no app exists before the first successful call");

      const auth = getFirebaseAdminAuth();
      assert(getApps().length === 1, "exactly one Admin app exists after getFirebaseAdminAuth()'s first call");
      assert(!!auth, "getFirebaseAdminAuth() returns a truthy Auth instance");

      const firestore = getFirebaseAdminFirestore();
      // getApps().length staying at 1 across both calls IS the proof they
      // share one app: initializeApp() throws if a second unnamed app is
      // ever constructed, so both calls only succeeded because
      // getFirebaseAdminApp()'s getApps()[0] ?? initializeApp(...) guard
      // returned the identical cached app both times.
      assert(getApps().length === 1, "still exactly one Admin app after getFirebaseAdminFirestore() — no second app was created");
      assert(!!firestore, "getFirebaseAdminFirestore() returns a truthy Firestore instance");
      assert((auth as unknown as { app: unknown }).app === getApps()[0], "the Auth instance is backed by that one shared Admin app");
    },
  );
});

group("13. repeated calls return the exact same cached instances, not a new one each time", () => {
  const auth1 = getFirebaseAdminAuth();
  const auth2 = getFirebaseAdminAuth();
  assert(auth1 === auth2, "getFirebaseAdminAuth() returns the identical cached Auth instance on a second call");

  const firestore1 = getFirebaseAdminFirestore();
  const firestore2 = getFirebaseAdminFirestore();
  assert(firestore1 === firestore2, "getFirebaseAdminFirestore() returns the identical cached Firestore instance on a second call");

  assert(getApps().length === 1, "still exactly one Admin app after all repeated calls");
});

group("14. once an app is cached, calling either accessor again ignores now-missing env vars (proves the cache is used, not re-read env)", () => {
  withEnv(
    { FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: undefined, FIREBASE_PRIVATE_KEY: undefined },
    () => {
      let threwAuth = false;
      let threwFirestore = false;
      try {
        getFirebaseAdminAuth();
      } catch {
        threwAuth = true;
      }
      try {
        getFirebaseAdminFirestore();
      } catch {
        threwFirestore = true;
      }
      assert(!threwAuth, "getFirebaseAdminAuth() still succeeds from cache even with env vars now unset");
      assert(!threwFirestore, "getFirebaseAdminFirestore() still succeeds from cache even with env vars now unset");
    },
  );
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  firebaseAdmin: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
