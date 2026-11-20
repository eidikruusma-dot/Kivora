/**
 * runDataCleanupDryRun.ts — the actual CLI entry point for
 * dataCleanupDryRun.ts.
 *
 * Kept as a separate, tiny file (rather than a top-level call inside
 * dataCleanupDryRun.ts itself) so that file has zero side effects on
 * import and can be safely unit-tested — see dataCleanupDryRun.ts's own
 * doc comment, and runGrantOwnerRole.ts for why an import.meta.url-based
 * "am I the entry module?" check does not work reliably under this repo's
 * per-file esbuild test bundling.
 *
 * This is READ-ONLY: it never deletes, writes, or modifies anything in
 * Firestore, Storage, or Firebase Authentication. See dataCleanupDryRun.ts's
 * own doc comment for the exact guarantee and its automated test.
 *
 * Usage (from artifacts/api-server):
 *
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runDataCleanupDryRun.ts --outfile=.tmp-runDataCleanupDryRun.mjs \
 *       && OWNER_EMAIL=you@example.com node .tmp-runDataCleanupDryRun.mjs
 *
 * or pass the account as a CLI argument instead of an env var:
 *
 *   node .tmp-runDataCleanupDryRun.mjs you@example.com
 *
 * Requires the same FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY Admin credentials as the rest of this server, and
 * optionally FIREBASE_STORAGE_BUCKET if the project's default Storage
 * bucket cannot be resolved automatically.
 */

import { main } from "./dataCleanupDryRun.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
