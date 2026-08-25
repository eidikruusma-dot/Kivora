/**
 * Firebase Admin SDK initialization — used solely to verify the Firebase ID
 * tokens attached to /api/ai requests (see middleware/requireFirebaseAuth.ts).
 *
 * Uses explicit Render environment credentials, never projectId-only
 * initialization and never an assumed Google Cloud/Application Default
 * Credentials environment:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * No credential, private key, token, or secret value is ever logged here.
 */

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

const REQUIRED_ENV_VARS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

function readRequiredEnv(name: RequiredEnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Firebase Admin configuration error: missing required environment variable "${name}". ` +
        "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY before this " +
        "server can verify authentication — there is no fallback that accepts an unverified token.",
    );
  }
  return value;
}

/**
 * Render (and most hosting platforms) store a multi-line PEM private key as
 * a single environment variable using literal "\n" escape sequences rather
 * than real newline characters. The PEM parser inside firebase-admin's
 * cert() requires actual newlines, so both forms are normalized to that.
 * A key that already contains real newlines (no "\n" substring) is
 * returned unchanged.
 */
export function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

let cachedAuth: Auth | null = null;

/**
 * Returns the Firebase Admin Auth instance, initializing the underlying
 * Firebase Admin app exactly once (getApps()/initializeApp() guard against
 * a duplicate-app error on repeated calls; cachedAuth avoids repeating the
 * env var + cert() work after the first successful call).
 *
 * Deliberately lazy — NOT run at module import time. A missing/invalid
 * environment variable throws here, on first use, which
 * requireFirebaseAuth turns into a 401 for the specific request that
 * triggered it. This keeps a Firebase Admin misconfiguration from crashing
 * the whole process (and therefore unrelated routes — health, contact,
 * support, feedback, push — that never call this function) while still
 * failing closed: every call either returns a real, verifiable Auth
 * instance or throws — there is no third path that silently returns
 * something that accepts a token without verifying it.
 */
export function getFirebaseAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;

  const projectId = readRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(readRequiredEnv("FIREBASE_PRIVATE_KEY"));

  const app: App =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

  cachedAuth = getAuth(app);
  return cachedAuth;
}
