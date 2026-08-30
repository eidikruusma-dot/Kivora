/**
 * runGrantOwnerRole.ts — the actual CLI entry point for grantOwnerRole.ts.
 *
 * Kept as a separate, tiny file (rather than a top-level call inside
 * grantOwnerRole.ts itself) so grantOwnerRole.ts has zero side effects on
 * import and can be safely unit-tested — see grantOwnerRole.ts's doc
 * comment for why an import.meta.url-based "am I the entry module?" check
 * does not work reliably under this repo's per-file esbuild test bundling.
 *
 * Usage (from artifacts/api-server):
 *
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runGrantOwnerRole.ts --outfile=.tmp-runGrantOwnerRole.mjs \
 *       && OWNER_EMAIL=owner@example.com node .tmp-runGrantOwnerRole.mjs
 *
 * or pass the identity as a CLI argument instead of an env var:
 *
 *   node .tmp-runGrantOwnerRole.mjs owner@example.com
 *
 * Add --revoke to remove the claim instead of granting it:
 *
 *   node .tmp-runGrantOwnerRole.mjs owner@example.com --revoke
 *
 * Requires the same FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY Admin credentials as the rest of this server.
 */

import { main } from "./grantOwnerRole.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
