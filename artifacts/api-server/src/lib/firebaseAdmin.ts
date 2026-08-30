/**
 * Firebase Admin SDK initialization — a single Admin app shared by every
 * Admin service this server uses:
 *   - Auth, to verify the Firebase ID tokens attached to /api/ai requests
 *     (see middleware/requireFirebaseAuth.ts).
 *   - Firestore, for server-trusted reads/writes the client must never be
 *     able to perform itself (e.g. the future AI usage-quota counter —
 *     not yet implemented; this module only exposes the accessor).
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
import { getFirestore, type Firestore } from "firebase-admin/firestore";

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

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: Firestore | null = null;

/**
 * Returns the single shared Firebase Admin app, initializing it exactly
 * once (getApps()/initializeApp() guard against a duplicate-app error on
 * repeated calls; cachedApp avoids repeating the env var + cert() work
 * after the first successful call). Every Admin service accessor
 * (getFirebaseAdminAuth, getFirebaseAdminFirestore, and any future one)
 * calls this instead of initializing its own app, so the process only
 * ever holds one Admin app no matter how many services it uses.
 *
 * Deliberately lazy — NOT run at module import time. A missing/invalid
 * environment variable throws here, on first use, which lets each
 * accessor's caller decide how to fail (requireFirebaseAuth turns it into
 * a 401 for the specific request that triggered it). This keeps a Firebase
 * Admin misconfiguration from crashing the whole process (and therefore
 * unrelated routes — health, contact, support, feedback, push — that never
 * call this function) while still failing closed: every call either
 * returns a real Admin app or throws — there is no third path that
 * silently returns something unusable.
 */
function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;

  const projectId = readRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(readRequiredEnv("FIREBASE_PRIVATE_KEY"));

  cachedApp =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

  return cachedApp;
}

/**
 * Returns the Firebase Admin Auth instance, backed by the single shared
 * Admin app (see getFirebaseAdminApp). Every call either returns a real,
 * verifiable Auth instance or throws — there is no third path that
 * silently returns something that accepts a token without verifying it.
 */
export function getFirebaseAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseAdminApp());
  return cachedAuth;
}

/**
 * Returns the Firebase Admin Firestore instance, backed by the SAME shared
 * Admin app as getFirebaseAdminAuth (see getFirebaseAdminApp) — calling
 * both never creates a second Admin app. Not yet used in production; this
 * is the accessor a future server-trusted usage/quota read-modify-write
 * will call, since only Admin SDK access (never the client SDK) can be
 * trusted to enforce a limit the signed-in user cannot influence.
 *
 * Same failure contract as getFirebaseAdminAuth: missing/misconfigured
 * credentials throw here rather than returning something that silently
 * behaves as if unconfigured.
 */
export function getFirebaseAdminFirestore(): Firestore {
  if (cachedFirestore) return cachedFirestore;
  cachedFirestore = getFirestore(getFirebaseAdminApp());
  return cachedFirestore;
}
