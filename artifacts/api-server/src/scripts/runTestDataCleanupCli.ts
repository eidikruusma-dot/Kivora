/**
 * runTestDataCleanupCli.ts — the actual CLI entry point for
 * testDataCleanup.ts.
 *
 * Kept as a separate, tiny file for the same reason as every other tool
 * in this project (runFullAccountBackupCli.ts, runFirestoreOnlyBackupCli.ts,
 * runDataCleanupDryRun.ts): testDataCleanup.ts only DEFINES and EXPORTS
 * main() so it stays side-effect-free and safely importable by its own
 * unit tests; this file is what actually calls main() and sets the
 * process exit code. See runFullAccountBackupCli.ts's doc comment for
 * exactly why that split exists and what bug it prevents (a compiled-but-
 * never-executed script).
 *
 * Usage (from artifacts/api-server):
 *
 *   EXPECTED_UID=<uid> EXPECTED_PROJECT_ID=<project-id> CLEANUP_MODE=dry-run \
 *     npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/scripts/runTestDataCleanupCli.ts --outfile=.tmp-runTestDataCleanupCli.mjs \
 *     && node .tmp-runTestDataCleanupCli.mjs
 *
 * CLEANUP_MODE defaults to "dry-run" (never deletes anything) if unset.
 * Setting it to "execute" additionally requires CONFIRMATION_PHRASE
 * (exactly "KUSTUTA KIVORA TESTANDMED") and BACKUP_ID — see
 * testDataCleanup.ts's own doc comment for the full safety contract.
 */

import { main } from "./testDataCleanup.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
