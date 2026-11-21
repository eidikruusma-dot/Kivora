/**
 * runFullAccountRemovalCli.ts — the actual CLI entry point for
 * fullAccountRemoval.ts.
 *
 * Kept as a separate, tiny file for the same reason as every other tool
 * in this project (runTestDataCleanupCli.ts, runFullAccountBackupCli.ts):
 * fullAccountRemoval.ts only DEFINES and EXPORTS main() so it stays
 * side-effect-free and safely importable by its own unit tests; this
 * file is what actually calls main() and sets the process exit code.
 *
 * Usage (from artifacts/api-server):
 *
 *   EXPECTED_UID=<uid> EXPECTED_PROJECT_ID=<project-id> CLEANUP_MODE=dry-run \
 *     npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/scripts/runFullAccountRemovalCli.ts --outfile=.tmp-runFullAccountRemovalCli.mjs \
 *     && node .tmp-runFullAccountRemovalCli.mjs
 *
 * CLEANUP_MODE defaults to "dry-run" (never deletes anything) if unset.
 * Setting it to "execute" additionally requires CONFIRMATION_PHRASE
 * (exactly "KUSTUTA KIVORA VANA KONTO TÄIELIKULT") and BACKUP_ID — see
 * fullAccountRemoval.ts's own doc comment for the full safety contract.
 * This file never calls Firebase Authentication's delete-user operation
 * — that remains a separate, later, manually-approved step.
 */

import { main } from "./fullAccountRemoval.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
