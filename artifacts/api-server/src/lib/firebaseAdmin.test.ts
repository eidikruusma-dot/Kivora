/**
 * Unit tests for firebaseAdmin.ts — the Firebase Admin initialization
 * module used to verify /api/ai request tokens.
 *
 * No real Firebase credentials are used or required. These tests only
 * prove: (1) the private-key newline normalization logic, and (2) that
 * missing environment variables fail closed with a clear error rather than
 * silently returning something usable.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/lib/firebaseAdmin.test.ts | node
 */

import { normalizePrivateKey, getFirebaseAdminAuth } from "./firebaseAdmin.js";

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

console.log(`\n${"═".repeat(48)}`);
console.log(`  firebaseAdmin: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
